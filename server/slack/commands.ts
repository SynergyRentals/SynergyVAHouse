import type { App } from '@slack/bolt';
import { storage } from '../storage';
import { startSLATimer } from '../services/sla';

export function setupCommands(app: App) {
  // /task command
  app.command('/task', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      const user = await storage.getUserBySlackId(command.user_id);
      if (!user) {
        await respond('User not found in system. Please contact administrator.');
        return;
      }

      // Parse command text for quick task creation
      const text = command.text.trim();
      
      if (text) {
        // Quick task creation
        const task = await storage.createTask({
          type: 'reactive',
          title: text,
          category: 'manual',
          status: 'OPEN',
          assigneeId: user.id,
          createdBy: user.slackId,
          sourceKind: 'slack',
          sourceId: command.channel_id,
        });

        await respond(`✅ Task created: *${task.title}* (ID: ${task.id})`);
      } else {
        // Show task creation modal
        await client.views.open({
          trigger_id: command.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'create_task_modal',
            title: {
              type: 'plain_text',
              text: 'Create Task'
            },
            blocks: [
              {
                type: 'input',
                block_id: 'title_block',
                element: {
                  type: 'plain_text_input',
                  action_id: 'title_input',
                  placeholder: {
                    type: 'plain_text',
                    text: 'Enter task title...'
                  }
                },
                label: {
                  type: 'plain_text',
                  text: 'Task Title'
                }
              },
              {
                type: 'input',
                block_id: 'category_block',
                element: {
                  type: 'static_select',
                  action_id: 'category_select',
                  placeholder: {
                    type: 'plain_text',
                    text: 'Select category...'
                  },
                  options: [
                    {
                      text: { type: 'plain_text', text: 'Reservation Refund' },
                      value: 'reservations.refund_request'
                    },
                    {
                      text: { type: 'plain_text', text: 'Reservation Cancellation' },
                      value: 'reservations.cancellation_request'
                    },
                    {
                      text: { type: 'plain_text', text: 'Guest Messaging' },
                      value: 'guest.messaging_known_answer'
                    },
                    {
                      text: { type: 'plain_text', text: 'Smart Lock Issue' },
                      value: 'access.smart_lock_issue'
                    },
                    {
                      text: { type: 'plain_text', text: 'WiFi Issue' },
                      value: 'internet.wifi_issue'
                    },
                    {
                      text: { type: 'plain_text', text: 'Cleaning Issue' },
                      value: 'cleaning.issue'
                    },
                    {
                      text: { type: 'plain_text', text: 'Maintenance Issue' },
                      value: 'maintenance.issue'
                    },
                    {
                      text: { type: 'plain_text', text: 'OTA Listing Fix' },
                      value: 'ota.listing_fix'
                    },
                    {
                      text: { type: 'plain_text', text: 'Inventory Restock' },
                      value: 'inventory.restock'
                    }
                  ]
                },
                label: {
                  type: 'plain_text',
                  text: 'Category'
                }
              }
            ],
            submit: {
              type: 'plain_text',
              text: 'Create'
            }
          }
        });
      }
    } catch (error) {
      console.error('Error in /task command:', error);
      await respond('❌ Failed to create task. Please try again.');
    }
  });

  // /done command
  app.command('/done', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      const user = await storage.getUserBySlackId(command.user_id);
      if (!user) {
        await respond('User not found in system.');
        return;
      }

      const taskId = command.text.trim();
      if (!taskId) {
        await respond('Please provide a task ID: `/done TASK_ID`');
        return;
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        await respond('Task not found.');
        return;
      }

      if (task.assigneeId !== user.id) {
        await respond('You can only complete tasks assigned to you.');
        return;
      }

      // Check if playbook requires DoD
      const playbook = task.playbookKey ? await storage.getPlaybook(task.playbookKey) : null;
      const requiresDoD = playbook?.content && (playbook.content as any).definition_of_done;

      if (requiresDoD) {
        // Open DoD modal
        await client.views.open({
          trigger_id: command.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'complete_task_modal',
            private_metadata: taskId,
            title: {
              type: 'plain_text',
              text: 'Complete Task'
            },
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*${task.title}*\n\nThis task requires evidence before completion.`
                }
              }
              // DoD fields would be dynamically added based on playbook
            ],
            submit: {
              type: 'plain_text',
              text: 'Complete'
            }
          }
        });
      } else {
        // Simple completion
        await storage.updateTask(taskId, { status: 'DONE' });
        await storage.createAudit({
          entity: 'task',
          entityId: taskId,
          action: 'completed',
          actorId: user.id
        });
        
        await respond(`✅ Task completed: *${task.title}*`);
      }
    } catch (error) {
      console.error('Error in /done command:', error);
      await respond('❌ Failed to complete task. Please try again.');
    }
  });

  // /brief command
  app.command('/brief', async ({ command, ack, respond }) => {
    await ack();
    
    try {
      const user = await storage.getUserBySlackId(command.user_id);
      if (!user) {
        await respond('User not found in system.');
        return;
      }

      const tasks = await storage.getTasksForUser(user.id);
      const now = new Date();
      
      const todayTasks = tasks.filter(task => 
        task.dueAt && new Date(task.dueAt).toDateString() === now.toDateString()
      );
      
      const overdueTasks = tasks.filter(task => 
        task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < now
      );
      
      const completedToday = tasks.filter(task => 
        task.status === 'DONE' && 
        task.updatedAt && 
        new Date(task.updatedAt).toDateString() === now.toDateString()
      );

      const briefText = `
📋 *Daily Brief for ${user.name}*

*Today's Tasks:* ${todayTasks.length}
*Overdue:* ${overdueTasks.length}
*Completed Today:* ${completedToday.length}

${overdueTasks.length > 0 ? '🚨 *Priority: Address overdue tasks first*' : '✅ *All tasks are on track*'}
      `.trim();

      await respond(briefText);
    } catch (error) {
      console.error('Error in /brief command:', error);
      await respond('❌ Failed to generate brief. Please try again.');
    }
  });

  // /blocker command
  app.command('/blocker', async ({ command, ack, respond }) => {
    await ack();
    
    try {
      const user = await storage.getUserBySlackId(command.user_id);
      if (!user) {
        await respond('User not found in system.');
        return;
      }

      const parts = command.text.trim().split(' ');
      const taskId = parts[0];
      const reason = parts.slice(1).join(' ');

      if (!taskId || !reason) {
        await respond('Usage: `/blocker TASK_ID reason for blocking`');
        return;
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        await respond('Task not found.');
        return;
      }

      await storage.updateTask(taskId, { 
        status: 'BLOCKED',
        evidence: { 
          ...task.evidence, 
          blocker: { reason, reportedAt: new Date(), reportedBy: user.slackId } 
        }
      });

      await storage.createAudit({
        entity: 'task',
        entityId: taskId,
        action: 'blocked',
        actorId: user.id,
        data: { reason }
      });

      await respond(`🚫 Task blocked: *${task.title}*\nReason: ${reason}`);
    } catch (error) {
      console.error('Error in /blocker command:', error);
      await respond('❌ Failed to block task. Please try again.');
    }
  });

  // /handoff command
  app.command('/handoff', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      const user = await storage.getUserBySlackId(command.user_id);
      if (!user) {
        await respond('User not found in system.');
        return;
      }

      const parts = command.text.trim().split(' ');
      const taskId = parts[0];
      const targetUser = parts[1]; // @username

      if (!taskId || !targetUser) {
        await respond('Usage: `/handoff TASK_ID @username`');
        return;
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        await respond('Task not found.');
        return;
      }

      if (task.assigneeId !== user.id) {
        await respond('You can only handoff tasks assigned to you.');
        return;
      }

      const targetUserInfo = await storage.getUserBySlackId(targetUser.replace('@', ''));
      if (!targetUserInfo) {
        await respond('Target user not found in system.');
        return;
      }

      await storage.updateTask(taskId, { assigneeId: targetUserInfo.id });
      
      await storage.createAudit({
        entity: 'task',
        entityId: taskId,
        action: 'handoff',
        actorId: user.id,
        data: { fromUser: user.id, toUser: targetUserInfo.id }
      });

      await respond(`↗️ Task handed off: *${task.title}* → ${targetUser}`);
    } catch (error) {
      console.error('Error in /handoff command:', error);
      await respond('❌ Failed to handoff task. Please try again.');
    }
  });
}
