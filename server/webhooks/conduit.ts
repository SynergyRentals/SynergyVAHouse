import type { Express } from 'express';
import { storage } from '../storage';
import { mapConduitEventToTask } from '../services/mappers';
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

export async function setupConduitWebhooks(app: Express) {
  /**
   * @openapi
   * /webhooks/conduit:
   *   post:
   *     tags:
   *       - Webhooks
   *     summary: Conduit webhook endpoint
   *     description: |
   *       Receives webhook events from Conduit for task creation and updates.
   *
   *       Supported event types:
   *       - `escalation.created` - Creates a new reactive task with SLA timer (10 minutes)
   *       - `task.created` - Creates a new reactive task from Conduit
   *       - `task.updated` - Updates an existing task status
   *       - `ai.help_requested` - Creates a task from AI help request (starts in WAITING status)
   *
   *       Security:
   *       - HMAC-SHA256 signature verification via X-Conduit-Signature header
   *       - Idempotency via event ID tracking (prevents duplicate processing)
   *       - Event ID extraction: X-Event-ID header > body.id > body.event_id > SHA256 hash
   *
   *       Features:
   *       - Automatic Definition of Done (DoD) schema population from playbooks
   *       - SLA timer initialization for escalations
   *       - Audit logging for all events
   *       - Status mapping: resolved → DONE, in_progress → IN_PROGRESS
   *     security:
   *       - webhookSignature: []
   *     parameters:
   *       - in: header
   *         name: X-Conduit-Signature
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
   *                 enum: [escalation.created, task.created, task.updated, ai.help_requested]
   *                 description: Event type
   *               id:
   *                 type: string
   *                 description: Event ID (used for idempotency if X-Event-ID not provided)
   *               event_id:
   *                 type: string
   *                 description: Alternative event ID field
   *               escalation:
   *                 type: object
   *                 description: Escalation data (for escalation.created events)
   *                 properties:
   *                   id:
   *                     type: string
   *                   url:
   *                     type: string
   *                     format: uri
   *                   title:
   *                     type: string
   *                   description:
   *                     type: string
   *                   priority:
   *                     type: integer
   *                     minimum: 1
   *                     maximum: 5
   *               task:
   *                 type: object
   *                 description: Task data (for task.* events)
   *                 properties:
   *                   id:
   *                     type: string
   *                   title:
   *                     type: string
   *                   status:
   *                     type: string
   *                     enum: [open, in_progress, resolved]
   *                   priority:
   *                     type: integer
   *               request:
   *                 type: object
   *                 description: AI help request data
   *                 properties:
   *                   id:
   *                     type: string
   *                   question:
   *                     type: string
   *           examples:
   *             escalation_created:
   *               summary: Escalation Created Event
   *               value:
   *                 type: "escalation.created"
   *                 id: "esc_123456"
   *                 escalation:
   *                   id: "esc_123456"
   *                   url: "https://app.conduit.com/escalations/123456"
   *                   title: "Customer Issue: Payment Failed"
   *                   description: "Customer unable to process payment"
   *                   priority: 1
   *                   category: "payment"
   *             task_created:
   *               summary: Task Created Event
   *               value:
   *                 type: "task.created"
   *                 id: "task_789012"
   *                 task:
   *                   id: "task_789012"
   *                   title: "Review customer feedback"
   *                   status: "open"
   *                   priority: 3
   *             task_updated:
   *               summary: Task Updated Event
   *               value:
   *                 type: "task.updated"
   *                 id: "task_789012"
   *                 task:
   *                   id: "task_789012"
   *                   status: "resolved"
   *             ai_help_requested:
   *               summary: AI Help Requested Event
   *               value:
   *                 type: "ai.help_requested"
   *                 id: "req_345678"
   *                 request:
   *                   id: "req_345678"
   *                   question: "How do I handle refund requests?"
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
   *                   eventId: "esc_123456"
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
  app.post('/webhooks/conduit', async (req, res) => {
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
          console.error('HMAC verification failed for Conduit webhook');
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
        
        console.log('Conduit webhook HMAC verified successfully');
      } else if (secret) {
        console.warn('Conduit webhook received without signature, but secret is configured');
      }
      
      // Parse JSON payload
      let payload: any;
      try {
        payload = JSON.parse(bodyString);
      } catch (error) {
        console.error('Invalid JSON in Conduit webhook:', error);
        res.status(400).json({ error: 'Invalid JSON payload' });
        return;
      }

      console.log('Conduit webhook received:', payload.type, 'ID:', payload.id || payload.escalation?.id);

      // Idempotency check
      const eventId = extractEventId(req.headers, payload);
      const source = 'conduit';

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
        case 'escalation.created':
          taskId = await handleEscalationCreated(payload);
          break;
        case 'task.created':
          taskId = await handleTaskCreated(payload);
          break;
        case 'task.updated':
          taskId = await handleTaskUpdated(payload);
          break;
        case 'ai.help_requested':
          taskId = await handleAIHelpRequested(payload);
          break;
        default:
          console.log('Unknown Conduit event type:', payload.type);
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
      console.error('Error processing Conduit webhook:', error);
      
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
        console.error('Failed to create audit entry for webhook error:', auditError);
      }
      
      res.status(500).json({ error: 'Processing failed' });
    }
  });
}

async function handleEscalationCreated(payload: any): Promise<string | undefined> {
  try {
    const taskData = await mapConduitEventToTask(payload);

    if (!taskData) {
      console.log('Could not map Conduit escalation to task');
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
        console.log(`[Webhook DoD] Populated DoD schema for Conduit escalation:`, finalTaskData.dodSchema);
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

    console.log(`Created task ${task.id} from Conduit escalation`);
    return task.id;
  } catch (error) {
    console.error('Error handling Conduit escalation:', error);
    return undefined;
  }
}

async function handleTaskCreated(payload: any): Promise<string | undefined> {
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
        console.log(`[Webhook DoD] Populated DoD schema for Conduit task:`, finalTaskData.dodSchema);
      }
    }

    const task = await storage.createTask(finalTaskData);

    console.log(`Created task ${task.id} from Conduit task.created`);
    return task.id;
  } catch (error) {
    console.error('Error handling Conduit task.created:', error);
    return undefined;
  }
}

async function handleTaskUpdated(payload: any): Promise<string | undefined> {
  try {
    const sourceId = payload.task?.id || payload.id;
    const tasks = await storage.getTasks({ sourceId });

    if (tasks.length === 0) {
      console.log('No matching task found for Conduit update');
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
    }

    console.log(`Updated task ${task.id} from Conduit`);
    return task.id;
  } catch (error) {
    console.error('Error handling Conduit task.updated:', error);
    return undefined;
  }
}

async function handleAIHelpRequested(payload: any): Promise<string | undefined> {
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
        console.log(`[Webhook DoD] Populated DoD schema for Conduit AI help:`, finalTaskData.dodSchema);
      }
    }

    const task = await storage.createTask(finalTaskData);

    await storage.createAudit({
      entity: 'task',
      entityId: task.id,
      action: 'created_from_ai_help_request',
      data: { conduitPayload: payload }
    });

    console.log(`Created AI help task ${task.id} from Conduit`);
    return task.id;
  } catch (error) {
    console.error('Error handling Conduit AI help request:', error);
    return undefined;
  }
}
