import type { App } from '@slack/bolt';
import { storage } from '../storage';

export function setupActions(app: App) {
  // Message action for creating tasks
  app.action('create_task_from_message', async ({ body, ack, client }) => {
    await ack();
    
    try {
      const trigger_id = (body as any).trigger_id;
      const message = (body as any).message;
      const channel = (body as any).channel;
      
      await client.views.open({
        trigger_id,
        view: {
          type: 'modal',
          callback_id: 'create_task_from_message_modal',
          private_metadata: JSON.stringify({
            messageText: message.text,
            messageTs: message.ts,
            channelId: channel.id,
            sourceUrl: `https://slack.com/archives/${channel.id}/p${message.ts.replace('.', '')}`
          }),
          title: {
            type: 'plain_text',
            text: 'Create Task from Message'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Source Message:*\n> ${message.text?.substring(0, 200)}${message.text?.length > 200 ? '...' : ''}`
              }
            },
            {
              type: 'input',
              block_id: 'title_block',
              element: {
                type: 'plain_text_input',
                action_id: 'title_input',
                initial_value: message.text?.substring(0, 100) || 'Task from message',
                placeholder: {
                  type: 'plain_text',
                  text: 'Edit task title...'
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
                    text: { type: 'plain_text', text: 'Guest Messaging' },
                    value: 'guest.messaging_known_answer'
                  },
                  {
                    text: { type: 'plain_text', text: 'Smart Lock Issue' },
                    value: 'access.smart_lock_issue'
                  },
                  {
                    text: { type: 'plain_text', text: 'General Task' },
                    value: 'general'
                  }
                ]
              },
              label: {
                type: 'plain_text',
                text: 'Category'
              }
            },
            {
              type: 'input',
              block_id: 'assignee_block',
              element: {
                type: 'users_select',
                action_id: 'assignee_select',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select assignee...'
                }
              },
              label: {
                type: 'plain_text',
                text: 'Assign To'
              }
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Create Task'
          }
        }
      });
    } catch (error) {
      console.error('Error in create_task_from_message action:', error);
    }
  });

  // View task action
  app.action('view_task', async ({ action, ack, client, body }) => {
    await ack();
    
    try {
      const taskId = (action as any).value;
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return;
      }

      const assignee = task.assigneeId ? await storage.getUser(task.assigneeId) : null;
      const comments = await storage.getCommentsForTask(taskId);
      
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: task.title
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Status:* ${task.status}`
            },
            {
              type: 'mrkdwn',
              text: `*Category:* ${task.category}`
            },
            {
              type: 'mrkdwn',
              text: `*Assignee:* ${assignee?.name || 'Unassigned'}`
            },
            {
              type: 'mrkdwn',
              text: `*Due:* ${task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'No due date'}`
            }
          ]
        }
      ];

      if (task.sourceUrl) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Source:* <${task.sourceUrl}|View original message>`
          }
        });
      }

      if (task.slaAt) {
        const slaStatus = new Date(task.slaAt) < new Date() ? '🚨 BREACHED' : 
                         (new Date(task.slaAt).getTime() - new Date().getTime()) < 5 * 60 * 1000 ? '⚠️ Warning' : '✅ On track';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*SLA Status:* ${slaStatus}`
          }
        });
      }

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Task Details'
          },
          blocks
        }
      });
    } catch (error) {
      console.error('Error in view_task action:', error);
    }
  });

  // Complete task action
  app.action('complete_task', async ({ action, ack, respond }) => {
    await ack();
    
    try {
      const taskId = (action as any).value;
      await storage.updateTask(taskId, { status: 'DONE' });
      
      await respond({
        text: '✅ Task marked as complete',
        replace_original: false
      });
    } catch (error) {
      console.error('Error in complete_task action:', error);
    }
  });

  // Block task action
  app.action('block_task', async ({ action, ack, client, body }) => {
    await ack();
    
    try {
      const taskId = (action as any).value;
      
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'block_task_modal',
          private_metadata: taskId,
          title: {
            type: 'plain_text',
            text: 'Block Task'
          },
          blocks: [
            {
              type: 'input',
              block_id: 'reason_block',
              element: {
                type: 'plain_text_input',
                action_id: 'reason_input',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: 'Explain why this task is blocked...'
                }
              },
              label: {
                type: 'plain_text',
                text: 'Blocking Reason'
              }
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Block Task'
          }
        }
      });
    } catch (error) {
      console.error('Error in block_task action:', error);
    }
  });
}
