import type { App } from '@slack/bolt';
import { storage } from '../storage';
import { inferAssigneeFromMessage } from '../services/mappers';
import { startSLATimer } from '../services/sla';

export function setupModals(app: App) {
  // Create task modal submission
  app.view('create_task_modal', async ({ ack, body, view, client }) => {
    await ack();
    
    try {
      const values = view.state.values;
      const title = values.title_block.title_input.value;
      const category = values.category_block.category_select.selected_option?.value;
      
      const user = await storage.getUserBySlackId(body.user.id);
      if (!user) return;
      
      const task = await storage.createTask({
        type: 'reactive',
        title: title || 'Untitled task',
        category: category || 'general',
        status: 'OPEN',
        assigneeId: user.id,
        createdBy: user.slackId,
        sourceKind: 'slack'
      });

      // Start SLA timer if category has playbook
      if (category) {
        const playbook = await storage.getPlaybook(category);
        if (playbook) {
          await startSLATimer(task.id, playbook);
        }
      }

      await storage.createAudit({
        entity: 'task',
        entityId: task.id,
        action: 'created',
        actorId: user.id
      });

      // Send confirmation
      await client.chat.postMessage({
        channel: body.user.id,
        text: `✅ Task created: *${task.title}* (ID: ${task.id})`
      });
    } catch (error) {
      console.error('Error creating task from modal:', error);
    }
  });

  // Create task from message modal submission
  app.view('create_task_from_message_modal', async ({ ack, body, view, client }) => {
    await ack();
    
    try {
      const values = view.state.values;
      const metadata = JSON.parse(view.private_metadata || '{}');
      
      const title = values.title_block.title_input.value;
      const category = values.category_block.category_select.selected_option?.value;
      const assigneeSlackId = values.assignee_block.assignee_select.selected_user;
      
      const creator = await storage.getUserBySlackId(body.user.id);
      const assignee = assigneeSlackId ? await storage.getUserBySlackId(assigneeSlackId) : null;
      
      if (!creator) return;
      
      const task = await storage.createTask({
        type: 'reactive',
        title: title || 'Task from message',
        category: category || 'general',
        status: 'OPEN',
        assigneeId: assignee?.id || creator.id,
        createdBy: creator.slackId,
        sourceKind: 'slack',
        sourceId: metadata.channelId,
        sourceUrl: metadata.sourceUrl
      });

      // Start SLA timer
      if (category) {
        const playbook = await storage.getPlaybook(category);
        if (playbook) {
          await startSLATimer(task.id, playbook);
        }
      }

      await storage.createAudit({
        entity: 'task',
        entityId: task.id,
        action: 'created_from_message',
        actorId: creator.id,
        data: { sourceUrl: metadata.sourceUrl }
      });

      // Notify assignee if different from creator
      if (assignee && assignee.id !== creator.id) {
        await client.chat.postMessage({
          channel: assignee.slackId,
          text: `📋 New task assigned to you: *${task.title}*\nCreated from: ${metadata.sourceUrl}`
        });
      }

      // Confirm to creator
      await client.chat.postMessage({
        channel: creator.slackId,
        text: `✅ Task created from message: *${task.title}*\nAssigned to: ${assignee?.name || 'yourself'}`
      });
    } catch (error) {
      console.error('Error creating task from message modal:', error);
    }
  });

  // Complete task with DoD modal
  app.view('complete_task_modal', async ({ ack, body, view, client }) => {
    await ack();
    
    try {
      const taskId = view.private_metadata;
      const values = view.state.values;
      
      const task = await storage.getTask(taskId);
      if (!task) return;
      
      const user = await storage.getUserBySlackId(body.user.id);
      if (!user || task.assigneeId !== user.id) return;
      
      // Extract evidence from form (this would be more complex based on playbook requirements)
      const evidence = {
        completedAt: new Date(),
        completedBy: user.slackId,
        // Additional fields would be extracted based on DoD requirements
      };
      
      await storage.updateTask(taskId, { 
        status: 'DONE',
        evidence: { ...task.evidence, ...evidence }
      });
      
      await storage.createAudit({
        entity: 'task',
        entityId: taskId,
        action: 'completed_with_evidence',
        actorId: user.id,
        data: { evidence }
      });
      
      await client.chat.postMessage({
        channel: user.slackId,
        text: `✅ Task completed with evidence: *${task.title}*`
      });
    } catch (error) {
      console.error('Error completing task with DoD:', error);
    }
  });

  // Block task modal
  app.view('block_task_modal', async ({ ack, body, view, client }) => {
    await ack();
    
    try {
      const taskId = view.private_metadata;
      const values = view.state.values;
      const reason = values.reason_block.reason_input.value;
      
      const task = await storage.getTask(taskId);
      if (!task) return;
      
      const user = await storage.getUserBySlackId(body.user.id);
      if (!user) return;
      
      await storage.updateTask(taskId, { 
        status: 'BLOCKED',
        evidence: { 
          ...task.evidence, 
          blocker: { 
            reason, 
            reportedAt: new Date(), 
            reportedBy: user.slackId 
          } 
        }
      });
      
      await storage.createAudit({
        entity: 'task',
        entityId: taskId,
        action: 'blocked',
        actorId: user.id,
        data: { reason }
      });
      
      // Notify manager about blocked task
      const managerSlackId = process.env.MANAGER_SLACK_ID;
      if (managerSlackId) {
        await client.chat.postMessage({
          channel: managerSlackId,
          text: `🚫 Task blocked by ${user.name}: *${task.title}*\nReason: ${reason}`
        });
      }
      
      await client.chat.postMessage({
        channel: user.slackId,
        text: `🚫 Task blocked: *${task.title}*`
      });
    } catch (error) {
      console.error('Error blocking task:', error);
    }
  });
}
