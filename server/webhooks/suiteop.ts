import type { Express } from 'express';
import { storage } from '../storage';
import { mapSuiteOpEventToTask } from '../services/mappers';
import { startSLATimer } from '../services/sla';
import crypto from 'crypto';
import { db } from '../db';
import { webhookEvents } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

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

export async function setupSuiteOpWebhooks(app: Express) {
  /**
   * @openapi
   * /webhooks/suiteop:
   *   post:
   *     tags:
   *       - Webhooks
   *     summary: SuiteOp webhook endpoint
   *     description: |
   *       Receives webhook events from SuiteOp for task creation and updates.
   *
   *       Supported event types:
   *       - `task.created` - Creates a new reactive task from SuiteOp
   *       - `task.updated` - Updates an existing task status
   *
   *       Security:
   *       - HMAC-SHA256 signature verification via X-SuiteOp-Signature header
   *       - Idempotency via event ID tracking (prevents duplicate processing)
   *       - Event ID extraction: X-Event-ID header > body.id > body.event_id > SHA256 hash
   *
   *       Features:
   *       - Automatic Definition of Done (DoD) schema population from playbooks
   *       - SLA timer initialization when playbook is available
   *       - Audit logging for all events
   *       - Status mapping: completed → DONE, in_progress → IN_PROGRESS, cancelled → BLOCKED
   *     security:
   *       - webhookSignature: []
   *     parameters:
   *       - in: header
   *         name: X-SuiteOp-Signature
   *         required: true
   *         schema:
   *           type: string
   *           example: "sha256=a1b2c3d4e5f6..."
   *         description: HMAC-SHA256 signature of the request body
   *       - in: header
   *         name: X-Event-ID
   *         required: false
   *         schema:
   *           type: string
   *         description: Optional unique event identifier for idempotency
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [task.created, task.updated]
   *                 description: Event type
   *               id:
   *                 type: string
   *                 description: Event ID (used for idempotency if X-Event-ID not provided)
   *               event_id:
   *                 type: string
   *                 description: Alternative event ID field
   *               task:
   *                 type: object
   *                 description: Task data
   *                 properties:
   *                   id:
   *                     type: string
   *                     description: SuiteOp task ID
   *                   title:
   *                     type: string
   *                     description: Task title
   *                   description:
   *                     type: string
   *                     description: Task description
   *                   status:
   *                     type: string
   *                     enum: [pending, in_progress, completed, cancelled]
   *                     description: Task status
   *                   priority:
   *                     type: integer
   *                     minimum: 1
   *                     maximum: 5
   *                     description: Task priority (1=highest, 5=lowest)
   *                   url:
   *                     type: string
   *                     format: uri
   *                     description: Link to task in SuiteOp
   *                   category:
   *                     type: string
   *                     description: Task category/type
   *           examples:
   *             task_created:
   *               summary: Task Created Event
   *               value:
   *                 type: "task.created"
   *                 id: "evt_123456789"
   *                 task:
   *                   id: "task_987654321"
   *                   title: "Process refund request"
   *                   description: "Customer requested refund for order #12345"
   *                   status: "pending"
   *                   priority: 2
   *                   category: "refund"
   *                   url: "https://app.suiteop.com/tasks/987654321"
   *             task_updated:
   *               summary: Task Updated Event
   *               value:
   *                 type: "task.updated"
   *                 id: "evt_123456790"
   *                 task:
   *                   id: "task_987654321"
   *                   status: "completed"
   *     responses:
   *       200:
   *         description: Webhook processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   enum: [processed, duplicate]
   *                   description: Processing status
   *                 taskId:
   *                   type: string
   *                   format: uuid
   *                   description: ID of created/updated task (if applicable)
   *                 eventId:
   *                   type: string
   *                   description: Event ID (only present for duplicate events)
   *                 message:
   *                   type: string
   *                   description: Human-readable message (only for duplicates)
   *                 processedAt:
   *                   type: string
   *                   format: date-time
   *                   description: When event was originally processed (only for duplicates)
   *             examples:
   *               processed:
   *                 summary: Successfully Processed
   *                 value:
   *                   status: "processed"
   *                   taskId: "550e8400-e29b-41d4-a716-446655440000"
   *               duplicate:
   *                 summary: Duplicate Event
   *                 value:
   *                   status: "duplicate"
   *                   message: "Event already processed"
   *                   eventId: "evt_123456789"
   *                   processedAt: "2025-10-22T12:00:00Z"
   *                   taskId: "550e8400-e29b-41d4-a716-446655440000"
   *       400:
   *         description: Invalid JSON payload
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: "Invalid JSON payload"
   *       401:
   *         description: Invalid or missing HMAC signature
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: "Invalid signature"
   *       500:
   *         description: Internal server error during processing
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: "Processing failed"
   */
  app.post('/webhooks/suiteop', async (req, res) => {
    try {
      // Parse raw body for HMAC verification
      const rawBody = req.body as Buffer;
      const bodyString = rawBody.toString('utf8');
      
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
          console.error('HMAC verification failed for SuiteOp webhook');
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
        
        console.log('SuiteOp webhook HMAC verified successfully');
      } else if (secret) {
        console.warn('SuiteOp webhook received without signature, but secret is configured');
      }
      
      // Parse JSON payload
      let payload: any;
      try {
        payload = JSON.parse(bodyString);
      } catch (error) {
        console.error('Invalid JSON in SuiteOp webhook:', error);
        res.status(400).json({ error: 'Invalid JSON payload' });
        return;
      }

      console.log('SuiteOp webhook received:', payload.type, 'ID:', payload.id || payload.task?.id);

      // Idempotency check
      const eventId = extractEventId(req.headers, payload);
      const source = 'suiteop';

      console.log(`[Idempotency Check] source=${source} eventId=${eventId}`);

      try {
        // Check if this event has already been processed
        const existingEvent = await db.query.webhookEvents.findFirst({
          where: and(
            eq(webhookEvents.eventId, eventId),
            eq(webhookEvents.source, source)
          )
        });

        if (existingEvent) {
          console.log(`[Idempotency] Duplicate webhook blocked: ${eventId} from ${source}`);

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
        console.error(`[Idempotency Error] Failed to check idempotency:`, idempotencyError);
        // On error, fail open (allow processing) to prevent blocking legitimate webhooks
      }
      
      // Map event to task based on type
      let taskId: string | undefined;
      switch (payload.type) {
        case 'task.created':
          taskId = await handleTaskCreated(payload);
          break;
        case 'task.updated':
          taskId = await handleTaskUpdated(payload);
          break;
        default:
          console.log('Unknown SuiteOp event type:', payload.type);
      }

      // Record webhook event for idempotency
      try {
        await db.insert(webhookEvents).values({
          eventId,
          source,
          requestBody: payload,
          taskId: taskId || null
        });
        console.log(`[Idempotency] Recorded webhook event: ${eventId}`);
      } catch (recordError) {
        console.error(`[Idempotency Error] Failed to record webhook event:`, recordError);
        // Don't fail the webhook - recording failure shouldn't break processing
      }

      res.json({ status: 'processed', taskId });
    } catch (error) {
      console.error('Error processing SuiteOp webhook:', error);
      
      // Create audit entry for failed webhook
      try {
        await storage.createAudit({
          entity: 'webhook',
          entityId: 'suiteop',
          action: 'processing_failed',
          data: { 
            error: error instanceof Error ? error.message : 'Unknown error',
            headers: req.headers,
            url: req.url
          }
        });
      } catch (auditError) {
        console.error('Failed to create audit entry for webhook error:', auditError);
      }
      
      res.status(500).json({ error: 'Processing failed' });
    }
  });
}

async function handleTaskCreated(payload: any): Promise<string | undefined> {
  try {
    const taskData = await mapSuiteOpEventToTask(payload);

    if (!taskData) {
      console.log('Could not map SuiteOp task to our task');
      return undefined;
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

    // Get playbook and extract DoD schema
    const playbook = await storage.getPlaybook(taskData.playbookKey);
    if (playbook) {
      const playbookContent = typeof playbook.content === 'string' ?
        JSON.parse(playbook.content) : playbook.content;

      if (playbookContent.definition_of_done) {
        finalTaskData.dodSchema = playbookContent.definition_of_done;
        console.log(`[Webhook DoD] Populated DoD schema for SuiteOp task:`, finalTaskData.dodSchema);
      }
    }

    const task = await storage.createTask(finalTaskData);

    // Start SLA timer if category has playbook
    if (playbook) {
      await startSLATimer(task.id, playbook);
    }

    await storage.createAudit({
      entity: 'task',
      entityId: task.id,
      action: 'created_from_suiteop',
      data: { suiteOpPayload: payload }
    });

    console.log(`Created task ${task.id} from SuiteOp`);
    return task.id;
  } catch (error) {
    console.error('Error handling SuiteOp task.created:', error);
    return undefined;
  }
}

async function handleTaskUpdated(payload: any): Promise<string | undefined> {
  try {
    const sourceId = payload.task?.id || payload.id;
    const tasks = await storage.getTasks({ sourceId });

    if (tasks.length === 0) {
      console.log('No matching task found for SuiteOp update');
      return undefined;
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
      await storage.updateTask(task.id, updates);

      await storage.createAudit({
        entity: 'task',
        entityId: task.id,
        action: 'updated_from_suiteop',
        data: { suiteOpPayload: payload, updates }
      });
    }

    console.log(`Updated task ${task.id} from SuiteOp`);
    return task.id;
  } catch (error) {
    console.error('Error handling SuiteOp task.updated:', error);
    return undefined;
  }
}
