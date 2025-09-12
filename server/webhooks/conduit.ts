import type { Express } from 'express';
import { storage } from '../storage';
import { mapConduitEventToTask } from '../services/mappers';
import { startSLATimer } from '../services/sla';
import crypto from 'crypto';

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
      
      // Map event to task based on type
      switch (payload.type) {
        case 'escalation.created':
          await handleEscalationCreated(payload);
          break;
        case 'task.created':
          await handleTaskCreated(payload);
          break;
        case 'task.updated':
          await handleTaskUpdated(payload);
          break;
        case 'ai.help_requested':
          await handleAIHelpRequested(payload);
          break;
        default:
          console.log('Unknown Conduit event type:', payload.type);
      }
      
      res.json({ status: 'processed' });
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

async function handleEscalationCreated(payload: any) {
  try {
    const taskData = await mapConduitEventToTask(payload);
    
    if (!taskData) {
      console.log('Could not map Conduit escalation to task');
      return;
    }
    
    const task = await storage.createTask({
      ...taskData,
      type: 'reactive',
      status: 'OPEN',
      sourceKind: 'conduit',
      sourceId: payload.escalation?.id || payload.id,
      sourceUrl: payload.escalation?.url || payload.url
    });
    
    // Start SLA timer (10 minutes for escalations)
    const playbook = await storage.getPlaybook(taskData.category);
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
  } catch (error) {
    console.error('Error handling Conduit escalation:', error);
  }
}

async function handleTaskCreated(payload: any) {
  try {
    const taskData = await mapConduitEventToTask(payload);
    
    if (!taskData) return;
    
    const task = await storage.createTask({
      ...taskData,
      type: 'reactive',
      status: 'OPEN',
      sourceKind: 'conduit',
      sourceId: payload.task?.id || payload.id
    });
    
    console.log(`Created task ${task.id} from Conduit task.created`);
  } catch (error) {
    console.error('Error handling Conduit task.created:', error);
  }
}

async function handleTaskUpdated(payload: any) {
  try {
    const sourceId = payload.task?.id || payload.id;
    const tasks = await storage.getTasks({ sourceId });
    
    if (tasks.length === 0) {
      console.log('No matching task found for Conduit update');
      return;
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
  } catch (error) {
    console.error('Error handling Conduit task.updated:', error);
  }
}

async function handleAIHelpRequested(payload: any) {
  try {
    const taskData = await mapConduitEventToTask(payload);
    
    if (!taskData) return;
    
    const task = await storage.createTask({
      ...taskData,
      type: 'reactive',
      status: 'WAITING', // AI help requests start as waiting
      sourceKind: 'conduit',
      sourceId: payload.request?.id || payload.id
    });
    
    await storage.createAudit({
      entity: 'task',
      entityId: task.id,
      action: 'created_from_ai_help_request',
      data: { conduitPayload: payload }
    });
    
    console.log(`Created AI help task ${task.id} from Conduit`);
  } catch (error) {
    console.error('Error handling Conduit AI help request:', error);
  }
}
