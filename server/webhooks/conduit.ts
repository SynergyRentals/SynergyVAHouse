import type { Express } from 'express';
import { storage } from '../storage';
import { mapConduitEventToTask } from '../services/mappers';
import { startSLATimer } from '../services/sla';
import crypto from 'crypto';
import { db } from '../db';
import { webhookEvents } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import log from '../logger';
import { getCorrelationId } from '../middleware/correlationId';

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

export async function setupConduitWebhooks(app: Express) {
  app.post('/webhooks/conduit', async (req, res) => {
    const correlationId = getCorrelationId(req);
    try {
      // Parse raw body for HMAC verification
      const rawBody = req.body as Buffer;
      const bodyString = rawBody.toString('utf8');

      // Verify HMAC signature
      const signature = req.headers['x-conduit-signature'] as string;
      const secret = process.env.WEBHOOK_CONDUIT_SECRET;

      if (secret && signature) {
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(bodyString)
          .digest('hex');

        const providedSignature = signature.startsWith('sha256=') ? signature.slice(7) : signature;

        if (providedSignature !== expectedSignature) {
          log.error('Conduit webhook: HMAC verification failed', { correlationId });
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }

        log.debug('Conduit webhook: HMAC verified successfully', { correlationId });
      } else if (secret) {
        log.warn('Conduit webhook: Received without signature, but secret is configured', { correlationId });
      }

      // Parse JSON payload
      let payload: any;
      try {
        payload = JSON.parse(bodyString);
      } catch (error) {
        log.error('Conduit webhook: Invalid JSON payload', { correlationId, error });
        res.status(400).json({ error: 'Invalid JSON payload' });
        return;
      }

      log.webhook('received', {
        correlationId,
        webhookId: payload.id || payload.escalation?.id,
        type: payload.type,
        source: 'conduit'
      });

      // Idempotency check
      const eventId = extractEventId(req.headers, payload);
      const source = 'conduit';

      log.debug('Conduit webhook: Idempotency check', { correlationId, eventId, source });

      try {
        // Check if this event has already been processed
        const existingEvent = await db.query.webhookEvents.findFirst({
          where: and(
            eq(webhookEvents.eventId, eventId),
            eq(webhookEvents.source, source)
          )
        });

        if (existingEvent) {
          log.info('Conduit webhook: Duplicate event blocked', {
            correlationId,
            eventId,
            source,
            taskId: existingEvent.taskId,
            processedAt: existingEvent.processedAt
          });

          // Return success (200) to prevent retries, but indicate it's a duplicate
          res.status(200).json({
            status: 'duplicate',
            message: 'Event already processed',
            eventId,
            processedAt: existingEvent.processedAt,
            taskId: existingEvent.taskId
          });
          return;
        }
      } catch (idempotencyError) {
        log.error('Conduit webhook: Idempotency check failed', { correlationId, eventId, error: idempotencyError });
        // On error, fail open (allow processing) to prevent blocking legitimate webhooks
      }
      
      // Map event to task based on type
      let taskId: string | undefined;
      switch (payload.type) {
        case 'escalation.created':
          taskId = await handleEscalationCreated(payload, correlationId);
          break;
        case 'task.created':
          taskId = await handleTaskCreated(payload, correlationId);
          break;
        case 'task.updated':
          taskId = await handleTaskUpdated(payload, correlationId);
          break;
        case 'ai.help_requested':
          taskId = await handleAIHelpRequested(payload, correlationId);
          break;
        default:
          log.warn('Conduit webhook: Unknown event type', { correlationId, eventType: payload.type });
      }

      // Record webhook event for idempotency
      try {
        await db.insert(webhookEvents).values({
          eventId,
          source,
          requestBody: payload,
          taskId: taskId || null
        });
        log.debug('Conduit webhook: Recorded event for idempotency', { correlationId, eventId, taskId });
      } catch (recordError) {
        log.error('Conduit webhook: Failed to record event', { correlationId, eventId, error: recordError });
        // Don't fail the webhook - recording failure shouldn't break processing
      }

      res.json({ status: 'processed', taskId });
    } catch (error) {
      log.error('Conduit webhook: Processing failed', { correlationId, error });

      // Create audit entry for failed webhook
      try {
        await storage.createAudit({
          entity: 'webhook',
          entityId: 'conduit',
          action: 'processing_failed',
          data: {
            error: error instanceof Error ? error.message : 'Unknown error',
            headers: req.headers,
            url: req.url
          }
        });
      } catch (auditError) {
        log.error('Conduit webhook: Failed to create audit entry', { correlationId, error: auditError });
      }

      res.status(500).json({ error: 'Processing failed' });
    }
  });
}

async function handleEscalationCreated(payload: any, correlationId: string): Promise<string | undefined> {
  try {
    const taskData = await mapConduitEventToTask(payload);

    if (!taskData) {
      log.warn('Conduit webhook: Could not map escalation to task', { correlationId });
      return undefined;
    }

    // Populate DoD schema from playbook
    let finalTaskData = {
      ...taskData,
      type: 'reactive',
      status: 'OPEN',
      sourceKind: 'conduit',
      sourceId: payload.escalation?.id || payload.id,
      sourceUrl: payload.escalation?.url || payload.url
    };

    // Get playbook and extract DoD schema
    const playbook = await storage.getPlaybook(taskData.playbookKey);
    if (playbook) {
      const playbookContent = typeof playbook.content === 'string' ?
        JSON.parse(playbook.content) : playbook.content;

      if (playbookContent.definition_of_done) {
        finalTaskData.dodSchema = playbookContent.definition_of_done;
        log.debug('Conduit webhook: Populated DoD schema for escalation', {
          correlationId,
          dodSchema: finalTaskData.dodSchema
        });
      }
    }

    const task = await storage.createTask(finalTaskData);

    // Start SLA timer (10 minutes for escalations)
    if (playbook) {
      await startSLATimer(task.id, playbook);
    }

    await storage.createAudit({
      entity: 'task',
      entityId: task.id,
      action: 'created_from_conduit_escalation',
      data: { conduitPayload: payload }
    });

    log.info('Conduit webhook: Created task from escalation', {
      correlationId,
      taskId: task.id,
      sourceId: finalTaskData.sourceId
    });
    return task.id;
  } catch (error) {
    log.error('Conduit webhook: Error handling escalation', { correlationId, error });
    return undefined;
  }
}

async function handleTaskCreated(payload: any, correlationId: string): Promise<string | undefined> {
  try {
    const taskData = await mapConduitEventToTask(payload);

    if (!taskData) return undefined;

    // Populate DoD schema from playbook
    let finalTaskData = {
      ...taskData,
      type: 'reactive',
      status: 'OPEN',
      sourceKind: 'conduit',
      sourceId: payload.task?.id || payload.id
    };

    // Get playbook and extract DoD schema
    const playbook = await storage.getPlaybook(taskData.playbookKey);
    if (playbook) {
      const playbookContent = typeof playbook.content === 'string' ?
        JSON.parse(playbook.content) : playbook.content;

      if (playbookContent.definition_of_done) {
        finalTaskData.dodSchema = playbookContent.definition_of_done;
        log.debug('Conduit webhook: Populated DoD schema for task', {
          correlationId,
          dodSchema: finalTaskData.dodSchema
        });
      }
    }

    const task = await storage.createTask(finalTaskData);

    log.info('Conduit webhook: Created task from task.created event', {
      correlationId,
      taskId: task.id,
      sourceId: finalTaskData.sourceId
    });
    return task.id;
  } catch (error) {
    log.error('Conduit webhook: Error handling task.created', { correlationId, error });
    return undefined;
  }
}

async function handleTaskUpdated(payload: any, correlationId: string): Promise<string | undefined> {
  try {
    const sourceId = payload.task?.id || payload.id;
    const tasks = await storage.getTasks({ sourceId });

    if (tasks.length === 0) {
      log.warn('Conduit webhook: No matching task found for update', { correlationId, sourceId });
      return undefined;
    }

    const task = tasks[0];
    const updates: any = {};

    // Map Conduit status to our status
    if (payload.task?.status === 'resolved') {
      updates.status = 'DONE';
    } else if (payload.task?.status === 'in_progress') {
      updates.status = 'IN_PROGRESS';
    }

    if (Object.keys(updates).length > 0) {
      await storage.updateTask(task.id, updates);

      await storage.createAudit({
        entity: 'task',
        entityId: task.id,
        action: 'updated_from_conduit',
        data: { conduitPayload: payload, updates }
      });

      log.info('Conduit webhook: Updated task from task.updated event', {
        correlationId,
        taskId: task.id,
        sourceId,
        updates
      });
    }

    return task.id;
  } catch (error) {
    log.error('Conduit webhook: Error handling task.updated', { correlationId, error });
    return undefined;
  }
}

async function handleAIHelpRequested(payload: any, correlationId: string): Promise<string | undefined> {
  try {
    const taskData = await mapConduitEventToTask(payload);

    if (!taskData) return undefined;

    // Populate DoD schema from playbook
    let finalTaskData = {
      ...taskData,
      type: 'reactive',
      status: 'WAITING', // AI help requests start as waiting
      sourceKind: 'conduit',
      sourceId: payload.request?.id || payload.id
    };

    // Get playbook and extract DoD schema
    const playbook = await storage.getPlaybook(taskData.playbookKey);
    if (playbook) {
      const playbookContent = typeof playbook.content === 'string' ?
        JSON.parse(playbook.content) : playbook.content;

      if (playbookContent.definition_of_done) {
        finalTaskData.dodSchema = playbookContent.definition_of_done;
        log.debug('Conduit webhook: Populated DoD schema for AI help request', {
          correlationId,
          dodSchema: finalTaskData.dodSchema
        });
      }
    }

    const task = await storage.createTask(finalTaskData);

    await storage.createAudit({
      entity: 'task',
      entityId: task.id,
      action: 'created_from_ai_help_request',
      data: { conduitPayload: payload }
    });

    log.info('Conduit webhook: Created AI help task', {
      correlationId,
      taskId: task.id,
      sourceId: finalTaskData.sourceId
    });
    return task.id;
  } catch (error) {
    log.error('Conduit webhook: Error handling AI help request', { correlationId, error });
    return undefined;
  }
}
