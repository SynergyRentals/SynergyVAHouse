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
          priority: 3,
          assigneeId: user.id,
          createdBy: user.slackId || undefined,
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

  // /followup command - create or manage individual follow-up
  app.command('/followup', async ({ command, ack, respond }) => {
    await ack();
    
    try {
      const user = await storage.getUserBySlackId(command.user_id);
      if (!user) {
        await respond('User not found in system.');
        return;
      }

      const text = command.text.trim();
      
      if (text.startsWith('complete ')) {
        // Complete a follow-up: /followup complete TASK_ID
        const taskId = text.replace('complete ', '').trim();
        const task = await storage.getTask(taskId);
        
        if (!task || task.category !== 'follow_up') {
          await respond('Follow-up task not found.');
          return;
        }
        
        if (task.assigneeId !== user.id) {
          await respond('You can only complete your own follow-ups.');
          return;
        }
        
        await storage.updateTask(taskId, { status: 'DONE' });
        await storage.createAudit({
          entity: 'task',
          entityId: taskId,
          action: 'followup_completed_via_command',
          actorId: user.id
        });
        
        await respond(`✅ Follow-up completed: *${task.title}*`);
      } else if (text === 'list' || text === '') {
        // List user's follow-ups: /followup or /followup list
        const followUps = await storage.getTasks({
          category: 'follow_up',
          status: ['OPEN', 'IN_PROGRESS'],
          assigneeId: user.id
        });
        
        if (followUps.length === 0) {
          await respond('You have no active follow-ups. 🎉');
          return;
        }
        
        const followUpList = followUps.map(task => {
          const dueText = task.dueAt ? 
            `📅 Due: ${new Date(task.dueAt).toLocaleString()}` : '📅 No due date';
          return `• *${task.title}* (ID: ${task.id})\n  ${dueText}\n  <${task.sourceUrl}|View original>`;
        }).join('\n\n');
        
        await respond(`📋 Your active follow-ups (${followUps.length}):\n\n${followUpList}`);
      } else {
        await respond(
          'Usage:\n' +
          '• `/followup` or `/followup list` - List your active follow-ups\n' +
          '• `/followup complete TASK_ID` - Mark a follow-up as complete'
        );
      }
    } catch (error) {
      console.error('Error in /followup command:', error);
      await respond('❌ Failed to process follow-up command. Please try again.');
    }
  });
  
  // /followups command - bulk management and team view
  app.command('/followups', async ({ command, ack, respond }) => {
    await ack();
    
    try {
      const user = await storage.getUserBySlackId(command.user_id);
      if (!user) {
        await respond('User not found in system.');
        return;
      }

      const text = command.text.trim();
      
      if (text === 'team' || text === 'all') {
        // Show all team follow-ups (requires admin/manager role)
        const allFollowUps = await storage.getTasks({
          category: 'follow_up',
          status: ['OPEN', 'IN_PROGRESS']
        });
        
        if (allFollowUps.length === 0) {
          await respond('No active follow-ups in the team. 🎉');
          return;
        }
        
        // Group by assignee
        const groupedFollowUps: { [key: string]: any[] } = {};
        for (const task of allFollowUps) {
          const assignee = task.assigneeId ? await storage.getUser(task.assigneeId) : null;
          const assigneeName = assignee?.name || 'Unassigned';
          
          if (!groupedFollowUps[assigneeName]) {
            groupedFollowUps[assigneeName] = [];
          }
          groupedFollowUps[assigneeName].push(task);
        }
        
        const teamSummary = Object.entries(groupedFollowUps).map(([assigneeName, tasks]) => {
          const overdue = tasks.filter(t => t.dueAt && new Date(t.dueAt) < new Date()).length;
          const dueToday = tasks.filter(t => {
            if (!t.dueAt) return false;
            const due = new Date(t.dueAt);
            const today = new Date();
            return due.toDateString() === today.toDateString();
          }).length;
          
          const status = overdue > 0 ? '🚨' : dueToday > 0 ? '⚠️' : '✅';
          return `${status} *${assigneeName}*: ${tasks.length} active (${overdue} overdue, ${dueToday} due today)`;
        }).join('\n');
        
        await respond(`📊 Team Follow-ups Summary:\n\n${teamSummary}\n\nTotal: ${allFollowUps.length} active follow-ups`);
      } else if (text === 'overdue') {
        // Show user's overdue follow-ups
        const overdue = await storage.getTasks({
          category: 'follow_up',
          status: ['OPEN', 'IN_PROGRESS'],
          assigneeId: user.id
        });
        
        const overdueFiltered = overdue.filter(task => {
          return task.dueAt && new Date(task.dueAt) < new Date();
        });
        
        if (overdueFiltered.length === 0) {
          await respond('You have no overdue follow-ups! 🎉');
          return;
        }
        
        const overdueList = overdueFiltered.map(task => {
          const overdueDays = Math.ceil((new Date().getTime() - new Date(task.dueAt!).getTime()) / (1000 * 60 * 60 * 24));
          return `🚨 *${task.title}* (ID: ${task.id})\n  📅 ${overdueDays} day(s) overdue\n  <${task.sourceUrl}|View original>`;
        }).join('\n\n');
        
        await respond(`🚨 Your overdue follow-ups (${overdueFiltered.length}):\n\n${overdueList}`);
      } else {
        await respond(
          'Usage:\n' +
          '• `/followups` - Show your follow-ups summary\n' +
          '• `/followups team` - Show team follow-ups summary\n' +
          '• `/followups overdue` - Show your overdue follow-ups'
        );
      }
    } catch (error) {
      console.error('Error in /followups command:', error);
      await respond('❌ Failed to process follow-ups command. Please try again.');
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
          ...(task.evidence as any || {}),
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

  // /followup command for manual follow-up creation
  app.command('/followup', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      const user = await storage.getUserBySlackId(command.user_id);
      if (!user) {
        await respond('User not found in system.');
        return;
      }

      const text = command.text.trim();
      
      if (!text) {
        // Show follow-up creation modal
        await client.views.open({
          trigger_id: command.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'create_followup_modal',
            title: {
              type: 'plain_text',
              text: 'Create Follow-up'
            },
            blocks: [
              {
                type: 'input',
                block_id: 'promise_block',
                element: {
                  type: 'plain_text_input',
                  action_id: 'promise_input',
                  multiline: true,
                  placeholder: {
                    type: 'plain_text',
                    text: 'What commitment was made?'
                  }
                },
                label: {
                  type: 'plain_text',
                  text: 'Promise/Commitment'
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
                    text: 'Who made the commitment?'
                  }
                },
                label: {
                  type: 'plain_text',
                  text: 'Assignee'
                }
              },
              {
                type: 'input',
                block_id: 'due_date_block',
                element: {
                  type: 'datetimepicker',
                  action_id: 'due_date_picker',
                  initial_date_time: Math.floor((Date.now() + 4 * 60 * 60 * 1000) / 1000)
                },
                label: {
                  type: 'plain_text',
                  text: 'Due Date & Time'
                }
              }
            ],
            submit: {
              type: 'plain_text',
              text: 'Create Follow-up'
            }
          }
        });
      } else {
        // Quick follow-up creation with text parsing
        const parts = text.split(' | ');
        if (parts.length >= 2) {
          const [promiseText, timeText] = parts;
          
          // Basic time parsing for quick creation
          const dueDate = parseQuickTime(timeText.trim());
          
          const task = await storage.createTask({
            type: 'follow_up',
            title: `Follow-up: ${promiseText.trim()}`,
            category: 'follow_up',
            status: 'OPEN',
            priority: 3,
            assigneeId: user.id,
            dueAt: dueDate,
            sourceKind: 'slack',
            sourceId: command.channel_id,
            playbookKey: 'follow_up_v1',
            followUpMetadata: {
              promiseText: promiseText.trim(),
              createdManually: true,
              channelId: command.channel_id,
              participants: [user.slackId]
            },
            createdBy: user.slackId || undefined
          });

          await respond(`✅ Follow-up created: *${promiseText.trim()}*\nDue: ${dueDate.toLocaleString()}\nTask ID: ${task.id}`);
        } else {
          await respond('Usage: `/followup [promise text] | [time]`\nExample: `/followup Check on refund status | tomorrow 2pm`\n\nOr use `/followup` without text to open the full creation form.');
        }
      }
    } catch (error) {
      console.error('Error in /followup command:', error);
      await respond('❌ Failed to create follow-up. Please try again.');
    }
  });

  // /followups command to list active follow-ups
  app.command('/followups', async ({ command, ack, respond }) => {
    await ack();
    
    try {
      const user = await storage.getUserBySlackId(command.user_id);
      if (!user) {
        await respond('User not found in system.');
        return;
      }

      const followUps = await storage.getTasks({
        category: 'follow_up',
        assigneeId: user.id,
        status: ['OPEN', 'IN_PROGRESS']
      });

      if (followUps.length === 0) {
        await respond('📋 You have no active follow-ups. Great job staying on top of things!');
        return;
      }

      const followUpList = followUps.map(task => {
        const metadata = task.followUpMetadata as any || {};
        const dueText = task.dueAt ? new Date(task.dueAt).toLocaleString() : 'No due date';
        const overdueText = task.dueAt && new Date(task.dueAt) < new Date() ? ' ⚠️ OVERDUE' : '';
        
        return `• *${metadata.promiseText || task.title}*\n  Due: ${dueText}${overdueText}\n  ID: ${task.id}`;
      }).join('\n\n');

      await respond(`📋 *Your Active Follow-ups* (${followUps.length})\n\n${followUpList}\n\nUse \`/done [ID]\` to mark complete.`);
    } catch (error) {
      console.error('Error in /followups command:', error);
      await respond('❌ Failed to retrieve follow-ups. Please try again.');
    }
  });
}

// Helper function for quick time parsing
function parseQuickTime(timeText: string): Date {
  const now = new Date();
  const text = timeText.toLowerCase();
  
  if (text.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow
    return tomorrow;
  }
  
  if (text.includes('today') || text.includes('later')) {
    return new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours from now
  }
  
  if (text.includes('hour')) {
    const match = text.match(/(\d+)\s*hour/);
    const hours = match ? parseInt(match[1]) : 2;
    return new Date(now.getTime() + hours * 60 * 60 * 1000);
  }
  
  if (text.includes('week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek;
  }
  
  // Default: 4 hours from now
  return new Date(now.getTime() + 4 * 60 * 60 * 1000);
}
