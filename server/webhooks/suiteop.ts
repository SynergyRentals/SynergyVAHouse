import type { Express } from 'express';
import { storage } from '../storage';
import { mapSuiteOpEventToTask } from '../services/mappers';
import { startSLATimer } from '../services/sla';
import crypto from 'crypto';

export async function setupSuiteOpWebhooks(app: Express) {
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

async function handleTaskCreated(payload: any) {
  try {
    const taskData = await mapSuiteOpEventToTask(payload);
    
    if (!taskData) {
      console.log('Could not map SuiteOp task to our task');
      return;
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
    const playbook = await storage.getPlaybook(taskData.category);
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
