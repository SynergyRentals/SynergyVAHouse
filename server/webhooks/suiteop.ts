import type { Express } from 'express';
import { storage } from '../storage';
import { mapSuiteOpEventToTask } from '../services/mappers';
import { startSLATimer } from '../services/sla';
import crypto from 'crypto';

export async function setupSuiteOpWebhooks(app: Express) {
  app.post('/webhooks/suiteop', async (req, res) => {
    try {
      // Verify HMAC signature
      const signature = req.headers['x-suiteop-signature'] as string;
      const secret = process.env.WEBHOOK_SUITEOP_SECRET;
      
      if (secret && signature) {
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(req.body))
          .digest('hex');
        
        if (signature !== `sha256=${expectedSignature}`) {
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }
      
      const payload = req.body as any;
      console.log('SuiteOp webhook received:', payload.type);
      
      // Map event to task based on type
      switch (payload.type) {
        case 'task.created':
          await handleTaskCreated(payload);
          break;
        case 'task.updated':
          await handleTaskUpdated(payload);
          break;
        default:
          console.log('Unknown SuiteOp event type:', payload.type);
      }
      
      res.json({ status: 'processed' });
    } catch (error) {
      console.error('Error processing SuiteOp webhook:', error);
      res.status(500).json({ error: 'Processing failed' });
    }
  });
}

async function handleTaskCreated(payload: any) {
  try {
    const taskData = mapSuiteOpEventToTask(payload);
    
    if (!taskData) {
      console.log('Could not map SuiteOp task to our task');
      return;
    }
    
    const task = await storage.createTask({
      ...taskData,
      type: 'reactive',
      status: 'OPEN',
      sourceKind: 'suiteop',
      sourceId: payload.task?.id || payload.id,
      sourceUrl: payload.task?.url || payload.url
    });
    
    // Start SLA timer if category has playbook
    const playbook = await storage.getPlaybook(taskData.category);
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
  } catch (error) {
    console.error('Error handling SuiteOp task.created:', error);
  }
}

async function handleTaskUpdated(payload: any) {
  try {
    const sourceId = payload.task?.id || payload.id;
    const tasks = await storage.getTasks({ sourceId });
    
    if (tasks.length === 0) {
      console.log('No matching task found for SuiteOp update');
      return;
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
  } catch (error) {
    console.error('Error handling SuiteOp task.updated:', error);
  }
}
