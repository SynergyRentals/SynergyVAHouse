import type { Express } from 'express';
import { storage } from '../storage';
import { mapSuiteOpEventToTask } from '../services/mappers';
import { startSLATimer } from '../services/sla';
import crypto from 'crypto';
import { db } from '../db';
import { webhookEvents, failedWebhooks } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import {
  WebhookError,
  WebhookValidationError,
  WebhookProcessingError,
  WebhookDatabaseError,
  WebhookAuthenticationError,
  wrapDatabaseOperation,
  wrapProcessingOperation,
  logWebhookError,
  formatErrorResponse,
  type WebhookErrorContext
} from './errors';

/**
 * Generates a deterministic event ID from webhook body if not provided
 */
function generateEventId(body: any): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(body));
  return hash.digest('hex');
}

/**
 * Extracts event ID from various webhook formats
 */
function extractEventId(headers: any, body: any): string {
  // Priority 1: X-Event-ID header
  const headerEventId = headers['x-event-id'];
  if (headerEventId && typeof headerEventId === 'string') {
    return headerEventId;
  }

  // Priority 2: Body id field
  if (body?.id) {
    return String(body.id);
  }

  // Priority 3: Body event_id field
  if (body?.event_id) {
    return String(body.event_id);
  }

  // Fallback: Generate deterministic ID from body
  return generateEventId(body);
}

/**
 * Log failed webhook to database for debugging and potential replay
 */
async function logFailedWebhook(
  error: WebhookError,
  eventId: string,
  source: string,
  webhookType: string | undefined,
  requestHeaders: any,
  requestBody: any
) {
  try {
    await db.insert(failedWebhooks).values({
      eventId,
      source,
      webhookType,
      errorType: error.name,
      errorMessage: error.message,
      statusCode: error.statusCode,
      correlationId: error.correlationId,
      retryable: error.retryable,
      retryCount: 0,
      requestHeaders,
      requestBody,
      errorContext: error.context,
      errorStack: error.stack || null,
      lastRetryAt: null,
      replayedAt: null,
      replayedBy: null,
      replaySuccess: null,
      replayTaskId: null
    });
    console.log(`[Failed Webhook] Logged to database: ${error.correlationId}`);
  } catch (dbError) {
    console.error('[Failed Webhook] Could not log to database:', dbError);
  }
}

export async function setupSuiteOpWebhooks(app: Express) {
  app.post('/webhooks/suiteop', async (req, res) => {
    const source = 'suiteop';
    let eventId: string | undefined;
    let payload: any;
    let webhookType: string | undefined;

    try {
      // Parse raw body for HMAC verification
      const rawBody = req.body as Buffer;
      const bodyString = rawBody.toString('utf8');

      // Parse JSON payload first to get event info
      try {
        payload = JSON.parse(bodyString);
        webhookType = payload.type;
        eventId = extractEventId(req.headers, payload);
      } catch (error) {
        const validationError = new WebhookValidationError(
          'Invalid JSON payload',
          {
            eventId: 'unknown',
            source,
            webhookType: 'unknown',
            originalError: error instanceof Error ? error.message : 'JSON parse error'
          }
        );
        logWebhookError(validationError);

        return res.status(validationError.statusCode).json(formatErrorResponse(validationError));
      }

      // Build error context for this webhook
      const errorContext: WebhookErrorContext = {
        eventId,
        source,
        webhookType,
        timestamp: new Date()
      };

      // Verify HMAC signature
      const signature = req.headers['x-suiteop-signature'] as string;
      const secret = process.env.WEBHOOK_SUITEOP_SECRET;

      if (secret && signature) {
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(bodyString)
          .digest('hex');

        const providedSignature = signature.startsWith('sha256=') ? signature.slice(7) : signature;

        if (providedSignature !== expectedSignature) {
          const authError = new WebhookAuthenticationError(
            'HMAC signature verification failed',
            errorContext
          );
          logWebhookError(authError);
          await logFailedWebhook(authError, eventId, source, webhookType, req.headers, payload);

          return res.status(authError.statusCode).json(formatErrorResponse(authError));
        }

        console.log('SuiteOp webhook HMAC verified successfully');
      } else if (secret) {
        console.warn('SuiteOp webhook received without signature, but secret is configured');
      }

      console.log('SuiteOp webhook received:', payload.type, 'ID:', payload.id || payload.task?.id);
      console.log(`[Idempotency Check] source=${source} eventId=${eventId}`);

      // Idempotency check - wrapped in database error handling
      const existingEvent = await wrapDatabaseOperation(
        async () => {
          return await db.query.webhookEvents.findFirst({
            where: and(
              eq(webhookEvents.eventId, eventId),
              eq(webhookEvents.source, source)
            )
          });
        },
        { ...errorContext, operation: 'idempotency_check' }
      );

      if (existingEvent) {
        console.log(`[Idempotency] Duplicate webhook blocked: ${eventId} from ${source}`);

        // Return success (200) to prevent retries, but indicate it's a duplicate
        return res.status(200).json({
          status: 'duplicate',
          message: 'Event already processed',
          eventId,
          processedAt: existingEvent.processedAt,
          taskId: existingEvent.taskId
        });
      }

      // Map event to task based on type - wrapped in processing error handling
      let taskId: string | undefined;
      switch (payload.type) {
        case 'task.created':
          taskId = await handleTaskCreated(payload, errorContext);
          break;
        case 'task.updated':
          taskId = await handleTaskUpdated(payload, errorContext);
          break;
        default:
          console.log('Unknown SuiteOp event type:', payload.type);
      }

      // Record webhook event for idempotency - wrapped in database error handling
      await wrapDatabaseOperation(
        async () => {
          await db.insert(webhookEvents).values({
            eventId,
            source,
            requestBody: payload,
            taskId: taskId || null
          });
          console.log(`[Idempotency] Recorded webhook event: ${eventId}`);
        },
        { ...errorContext, operation: 'record_event', taskId }
      );

      res.json({
        status: 'processed',
        taskId,
        eventId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Handle webhook-specific errors
      if (error instanceof WebhookError) {
        logWebhookError(error);

        // Log to failed webhooks table
        if (eventId) {
          await logFailedWebhook(error, eventId, source, webhookType, req.headers, payload);
        }

        // Create audit entry
        try {
          await storage.createAudit({
            entity: 'webhook',
            entityId: source,
            action: 'processing_failed',
            data: error.toLogFormat()
          });
        } catch (auditError) {
          console.error('Failed to create audit entry for webhook error:', auditError);
        }

        return res.status(error.statusCode).json(formatErrorResponse(error));
      }

      // Handle unexpected errors
      console.error('Unexpected error processing SuiteOp webhook:', error);

      const unexpectedError = new WebhookProcessingError(
        'An unexpected error occurred while processing webhook',
        {
          eventId: eventId || 'unknown',
          source,
          webhookType,
          originalError: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : String(error)
        }
      );

      logWebhookError(unexpectedError);

      if (eventId) {
        await logFailedWebhook(unexpectedError, eventId, source, webhookType, req.headers, payload);
      }

      try {
        await storage.createAudit({
          entity: 'webhook',
          entityId: source,
          action: 'processing_failed',
          data: unexpectedError.toLogFormat()
        });
      } catch (auditError) {
        console.error('Failed to create audit entry for webhook error:', auditError);
      }

      return res.status(unexpectedError.statusCode).json(formatErrorResponse(unexpectedError));
    }
  });
}

async function handleTaskCreated(payload: any, errorContext: WebhookErrorContext): Promise<string | undefined> {
  return wrapProcessingOperation(async () => {
    const taskData = await mapSuiteOpEventToTask(payload);

    if (!taskData) {
      throw new WebhookProcessingError(
        'Could not map SuiteOp task to internal task - missing required fields or invalid data',
        { ...errorContext, operation: 'map_task', payload }
      );
    }

    // Populate DoD schema from playbook
    let finalTaskData = {
      ...taskData,
      type: 'reactive',
      status: 'OPEN',
      sourceKind: 'suiteop',
      sourceId: payload.task?.id || payload.id,
      sourceUrl: payload.task?.url || payload.url
    };

    // Get playbook and extract DoD schema - wrap in DB operation
    const playbook = await wrapDatabaseOperation(
      async () => storage.getPlaybook(taskData.playbookKey),
      { ...errorContext, operation: 'get_playbook', playbookKey: taskData.playbookKey }
    );

    if (playbook) {
      const playbookContent = typeof playbook.content === 'string' ?
        JSON.parse(playbook.content) : playbook.content;

      if (playbookContent.definition_of_done) {
        finalTaskData.dodSchema = playbookContent.definition_of_done;
        console.log(`[Webhook DoD] Populated DoD schema for SuiteOp task:`, finalTaskData.dodSchema);
      }
    }

    // Create task - wrap in DB operation
    const task = await wrapDatabaseOperation(
      async () => storage.createTask(finalTaskData),
      { ...errorContext, operation: 'create_task', taskData: finalTaskData }
    );

    // Start SLA timer if category has playbook
    if (playbook) {
      await wrapProcessingOperation(
        async () => startSLATimer(task.id, playbook),
        { ...errorContext, operation: 'start_sla_timer', taskId: task.id }
      );
    }

    // Create audit entry - wrap in DB operation
    await wrapDatabaseOperation(
      async () => storage.createAudit({
        entity: 'task',
        entityId: task.id,
        action: 'created_from_suiteop',
        data: { suiteOpPayload: payload }
      }),
      { ...errorContext, operation: 'create_audit', taskId: task.id }
    );

    console.log(`Created task ${task.id} from SuiteOp`);
    return task.id;
  }, errorContext);
}

async function handleTaskUpdated(payload: any, errorContext: WebhookErrorContext): Promise<string | undefined> {
  return wrapProcessingOperation(async () => {
    const sourceId = payload.task?.id || payload.id;

    // Get tasks - wrap in DB operation
    const tasks = await wrapDatabaseOperation(
      async () => storage.getTasks({ sourceId }),
      { ...errorContext, operation: 'get_tasks', sourceId }
    );

    if (tasks.length === 0) {
      throw new WebhookProcessingError(
        `No matching task found for SuiteOp update with sourceId: ${sourceId}`,
        { ...errorContext, operation: 'find_task', sourceId }
      );
    }

    const task = tasks[0];
    const updates: any = {};

    // Map SuiteOp status to our status
    if (payload.task?.status === 'completed') {
      updates.status = 'DONE';
    } else if (payload.task?.status === 'in_progress') {
      updates.status = 'IN_PROGRESS';
    } else if (payload.task?.status === 'cancelled') {
      updates.status = 'BLOCKED';
    }

    if (Object.keys(updates).length > 0) {
      // Update task - wrap in DB operation
      await wrapDatabaseOperation(
        async () => storage.updateTask(task.id, updates),
        { ...errorContext, operation: 'update_task', taskId: task.id, updates }
      );

      // Create audit entry - wrap in DB operation
      await wrapDatabaseOperation(
        async () => storage.createAudit({
          entity: 'task',
          entityId: task.id,
          action: 'updated_from_suiteop',
          data: { suiteOpPayload: payload, updates }
        }),
        { ...errorContext, operation: 'create_audit', taskId: task.id }
      );
    }

    console.log(`Updated task ${task.id} from SuiteOp`);
    return task.id;
  }, errorContext);
}
