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
