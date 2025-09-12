import type { App } from '@slack/bolt';
import { storage } from '../storage';
import { satisfyFollowUp } from '../services/followup';
import { identifyCriticalIssues } from '../services/metrics';

export function setupActions(app: App) {
  // Complete follow-up action
  app.action('complete_followup', async ({ action, ack, respond, body }) => {
    await ack();
    
    try {
      const taskId = (action as any).value;
      const userId = (body as any).user.id;
      
      const user = await storage.getUserBySlackId(userId);
      if (!user) {
        await respond({
          text: '❌ User not found in system.',
          replace_original: false
        });
        return;
      }
      
      const task = await storage.getTask(taskId);
      if (!task) {
        await respond({
          text: '❌ Task not found.',
          replace_original: false
        });
        return;
      }
      
      await satisfyFollowUp(taskId, `Marked complete by ${user.name} via Slack button`);
      
      await respond({
        text: '✅ Follow-up marked as complete!',
        replace_original: true
      });
      
      console.log(`Follow-up task ${taskId} completed by ${user.name} via button`);
    } catch (error) {
      console.error('Error completing follow-up:', error);
      await respond({
        text: '❌ Failed to complete follow-up. Please try again.',
        replace_original: false
      });
    }
  });
  
  // Extend follow-up deadline action
  app.action('extend_followup', async ({ action, ack, client, body }) => {
    await ack();
    
    try {
      const taskId = (action as any).value;
      
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'extend_followup_modal',
          private_metadata: taskId,
          title: {
            type: 'plain_text',
            text: 'Extend Follow-up Deadline'
          },
          blocks: [
            {
              type: 'input',
              block_id: 'extension_block',
              element: {
                type: 'static_select',
                action_id: 'extension_select',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select extension time...'
                },
                options: [
                  {
                    text: { type: 'plain_text', text: '1 hour' },
                    value: '1h'
                  },
                  {
                    text: { type: 'plain_text', text: '4 hours' },
                    value: '4h'
                  },
                  {
                    text: { type: 'plain_text', text: '1 day' },
                    value: '1d'
                  },
                  {
                    text: { type: 'plain_text', text: '3 days' },
                    value: '3d'
                  }
                ]
              },
              label: {
                type: 'plain_text',
                text: 'Extension Time'
              }
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Extend'
          }
        }
      });
    } catch (error) {
      console.error('Error opening extend follow-up modal:', error);
    }
  });
  
  // Take follow-up ownership action (for escalations)
  app.action('take_followup_ownership', async ({ action, ack, respond, body }) => {
    await ack();
    
    try {
      const taskId = (action as any).value;
      const userId = (body as any).user.id;
      
      const user = await storage.getUserBySlackId(userId);
      if (!user) {
        await respond({
          text: '❌ User not found in system.',
          replace_original: false
        });
        return;
      }
      
      const task = await storage.getTask(taskId);
      if (!task) {
        await respond({
          text: '❌ Task not found.',
          replace_original: false
        });
        return;
      }
      
      // Transfer ownership to the user who clicked the button
      await storage.updateTask(taskId, { 
        assigneeId: user.id,
        evidence: {
          ...task.evidence as any,
          ownershipTransferred: true,
          newOwnerId: user.id,
          transferredAt: new Date()
        }
      });
      
      await storage.createAudit({
        entity: 'task',
        entityId: taskId,
        action: 'followup_ownership_transferred',
        actorId: user.id,
        data: { 
          originalAssigneeId: task.assigneeId,
          newAssigneeId: user.id
        }
      });
      
      await respond({
        text: `✅ Follow-up ownership transferred to ${user.name}!`,
        replace_original: true
      });
      
      console.log(`Follow-up task ${taskId} ownership transferred to ${user.name}`);
    } catch (error) {
      console.error('Error transferring follow-up ownership:', error);
      await respond({
        text: '❌ Failed to transfer ownership. Please try again.',
        replace_original: false
      });
    }
  });

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

  // Complete follow-up action
  app.action('complete_followup', async ({ action, ack, body, client }) => {
    await ack();
    
    try {
      const taskId = (action as any).value;
      const user = await storage.getUserBySlackId((body as any).user.id);
      
      if (!user) return;
      
      const task = await storage.getTask(taskId);
      if (!task) {
        console.log(`Task ${taskId} not found`);
        return;
      }
      
      // Complete the follow-up
      await satisfyFollowUp(taskId, 'Marked complete via Slack');
      
      // Send confirmation to user
      await client.chat.postMessage({
        channel: user.slackId,
        text: `✅ Follow-up completed: "${task.title}"\n\nTask marked as done!`
      });
      
      console.log(`Follow-up ${taskId} completed by ${user.name}`);
    } catch (error) {
      console.error('Error in complete_followup action:', error);
    }
  });

  // Extend follow-up deadline action
  app.action('extend_followup', async ({ action, ack, body, client }) => {
    await ack();
    
    try {
      const taskId = (action as any).value;
      const trigger_id = (body as any).trigger_id;
      
      // Open modal for deadline extension
      await client.views.open({
        trigger_id,
        view: {
          type: 'modal',
          callback_id: 'extend_followup_modal',
          private_metadata: taskId,
          title: {
            type: 'plain_text',
            text: 'Extend Deadline'
          },
          blocks: [
            {
              type: 'input',
              block_id: 'new_due_date_block',
              element: {
                type: 'datetimepicker',
                action_id: 'new_due_date_picker',
                initial_date_time: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000) // Tomorrow
              },
              label: {
                type: 'plain_text',
                text: 'New Due Date & Time'
              }
            },
            {
              type: 'input',
              block_id: 'reason_block',
              element: {
                type: 'plain_text_input',
                action_id: 'reason_input',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: 'Why is this deadline being extended? (optional)'
                }
              },
              label: {
                type: 'plain_text',
                text: 'Reason (Optional)'
              },
              optional: true
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Extend Deadline'
          }
        }
      });
    } catch (error) {
      console.error('Error in extend_followup action:', error);
    }
  });

  // Take follow-up ownership action
  app.action('take_followup_ownership', async ({ action, ack, body, client }) => {
    await ack();
    
    try {
      const taskId = (action as any).value;
      const user = await storage.getUserBySlackId((body as any).user.id);
      
      if (!user) return;
      
      const task = await storage.getTask(taskId);
      if (!task) return;
      
      // Transfer ownership
      await storage.updateTask(taskId, { 
        assigneeId: user.id,
        evidence: {
          ...task.evidence as any,
          ownershipTaken: true,
          takenBy: user.slackId,
          takenAt: new Date()
        }
      });
      
      await storage.createAudit({
        entity: 'task',
        entityId: taskId,
        action: 'followup_ownership_taken',
        actorId: user.id,
        data: { previousAssignee: task.assigneeId }
      });
      
      // Notify original assignee
      if (task.assigneeId) {
        const originalAssignee = await storage.getUser(task.assigneeId);
        if (originalAssignee) {
          await client.chat.postMessage({
            channel: originalAssignee.slackId,
            text: `📋 <@${user.slackId}> has taken ownership of your overdue follow-up: "${task.title}"`
          });
        }
      }
      
      // Confirm to new owner
      await client.chat.postMessage({
        channel: user.slackId,
        text: `✅ You've taken ownership of follow-up: "${task.title}"\n\nTask is now assigned to you.`
      });
      
      console.log(`Follow-up ${taskId} ownership taken by ${user.name}`);
    } catch (error) {
      console.error('Error in take_followup_ownership action:', error);
    }
  });

  // Handle deadline extension modal submission
  app.view('extend_followup_modal', async ({ ack, body, view, client }) => {
    await ack();
    
    try {
      const taskId = view.private_metadata;
      const values = view.state.values;
      const newDueDateTimestamp = values.new_due_date_block.new_due_date_picker.selected_date_time;
      const reason = values.reason_block?.reason_input?.value || 'No reason provided';
      
      const user = await storage.getUserBySlackId(body.user.id);
      if (!user) return;
      
      if (!newDueDateTimestamp) {
        console.error('No due date timestamp provided');
        return;
      }
      
      const newDueDate = new Date(newDueDateTimestamp * 1000);
      
      // Update task with new due date
      await storage.updateTask(taskId, { dueAt: newDueDate });
      
      await client.chat.postMessage({
        channel: user.slackId,
        text: `✅ Follow-up deadline extended\n\n*New Due Date:* ${newDueDate.toLocaleString()}\n*Reason:* ${reason}`
      });
      
      console.log(`Follow-up ${taskId} deadline extended by ${user.name}`);
    } catch (error) {
      console.error('Error extending follow-up deadline:', error);
    }
  });

  // Review critical issue action
  app.action('review_critical_issue', async ({ action, ack, client, body }) => {
    await ack();
    
    try {
      const issueType = (action as any).value;
      const user = await storage.getUserBySlackId((body as any).user.id);
      
      if (!user) return;
      
      // Get critical issues for this type
      const allTasks = await storage.getTasks();
      const criticalIssues = await identifyCriticalIssues(allTasks, new Date());
      const issue = criticalIssues.find(i => i.type === issueType);
      
      if (!issue) {
        await client.chat.postMessage({
          channel: user.slackId,
          text: '❌ Critical issue not found or may have been resolved.'
        });
        return;
      }
      
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚨 Critical Issue Review: ${issue.type.replace('_', ' ').toUpperCase()}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Severity:* ${issue.severity}\n*Count:* ${issue.count} tasks\n*Description:* ${issue.description}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Affected Tasks:*'
          }
        }
      ];
      
      // Add task details
      for (const task of issue.tasks.slice(0, 5)) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• *${task.title}*\n  Status: ${task.status} | Category: ${task.category}\n  ${task.dueAt ? `Due: ${new Date(task.dueAt).toLocaleDateString()}` : 'No due date'}`
          }
        });
      }
      
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Critical Issue Details'
          },
          blocks
        }
      });
    } catch (error) {
      console.error('Error in review_critical_issue action:', error);
    }
  });

  // Approve AI suggestions action
  app.action('approve_ai_suggestions', async ({ action, ack, respond, body, client }) => {
    await ack();
    
    try {
      const suggestionId = (action as any).value;
      const userId = (body as any).user.id;
      
      const user = await storage.getUserBySlackId(userId);
      if (!user) {
        await respond({
          text: '❌ User not found in system.',
          replace_original: false
        });
        return;
      }
      
      const suggestion = await storage.getAISuggestion(suggestionId);
      if (!suggestion) {
        await respond({
          text: '❌ AI suggestion not found.',
          replace_original: false
        });
        return;
      }
      
      if (!suggestion.taskId) {
        await respond({
          text: '❌ AI suggestion is not linked to a task.',
          replace_original: false
        });
        return;
      }

      const task = await storage.getTask(suggestion.taskId);
      if (!task) {
        await respond({
          text: '❌ Task not found.',
          replace_original: false
        });
        return;
      }
      
      // Update suggestion status
      await storage.updateAISuggestion(suggestionId, {
        status: 'approved',
        approvedBy: user.id,
        approvedAt: new Date()
      });
      
      // Apply suggestions to task (use highest confidence suggestions)
      const suggestions = suggestion.suggestions as any;
      let updates: any = {};
      let appliedSuggestions: any = {};
      
      if (suggestions.categorySuggestions?.length > 0) {
        const topCategory = suggestions.categorySuggestions[0];
        updates.category = topCategory.category;
        appliedSuggestions.category = topCategory;
      }
      
      if (suggestions.playbookSuggestions?.length > 0) {
        const topPlaybook = suggestions.playbookSuggestions[0];
        updates.playbookKey = topPlaybook.playbookKey;
        appliedSuggestions.playbook = topPlaybook;
      }
      
      // Update task with applied suggestions
      if (Object.keys(updates).length > 0) {
        await storage.updateTask(suggestion.taskId!, updates);
        
        // Update suggestion with applied data
        await storage.updateAISuggestion(suggestionId, {
          appliedSuggestions,
          status: 'applied'
        });
      }
      
      // Create audit log
      await storage.createAudit({
        entity: 'ai_suggestions',
        entityId: suggestionId,
        action: 'ai_suggestions_approved',
        actorId: user.id,
        data: {
          taskId: task.id,
          appliedUpdates: updates,
          approvedBy: user.name
        }
      });
      
      await respond({
        text: `✅ AI suggestions approved and applied to task "${task.title}"!\n\nApplied changes:\n${Object.entries(updates).map(([key, value]) => `• ${key}: ${value}`).join('\n')}`,
        replace_original: true
      });
      
      console.log(`AI suggestions ${suggestionId} approved and applied by ${user.name}`);
    } catch (error) {
      console.error('Error approving AI suggestions:', error);
      await respond({
        text: '❌ Failed to approve AI suggestions. Please try again.',
        replace_original: false
      });
    }
  });

  // Reject AI suggestions action
  app.action('reject_ai_suggestions', async ({ action, ack, respond, body, client }) => {
    await ack();
    
    try {
      const suggestionId = (action as any).value;
      const userId = (body as any).user.id;
      
      const user = await storage.getUserBySlackId(userId);
      if (!user) {
        await respond({
          text: '❌ User not found in system.',
          replace_original: false
        });
        return;
      }
      
      const suggestion = await storage.getAISuggestion(suggestionId);
      if (!suggestion) {
        await respond({
          text: '❌ AI suggestion not found.',
          replace_original: false
        });
        return;
      }
      
      if (!suggestion.taskId) {
        await respond({
          text: '❌ AI suggestion is not linked to a task.',
          replace_original: false
        });
        return;
      }

      const task = await storage.getTask(suggestion.taskId);
      if (!task) {
        await respond({
          text: '❌ Task not found.',
          replace_original: false
        });
        return;
      }
      
      // Update suggestion status to rejected
      await storage.updateAISuggestion(suggestionId, {
        status: 'rejected',
        approvedBy: user.id,
        approvedAt: new Date()
      });
      
      // Create audit log
      await storage.createAudit({
        entity: 'ai_suggestions',
        entityId: suggestionId,
        action: 'ai_suggestions_rejected',
        actorId: user.id,
        data: {
          taskId: task.id,
          rejectedBy: user.name
        }
      });
      
      await respond({
        text: `❌ AI suggestions for task "${task.title}" have been rejected.\n\nThe task will need to be processed manually.`,
        replace_original: true
      });
      
      console.log(`AI suggestions ${suggestionId} rejected by ${user.name}`);
    } catch (error) {
      console.error('Error rejecting AI suggestions:', error);
      await respond({
        text: '❌ Failed to reject AI suggestions. Please try again.',
        replace_original: false
      });
    }
  });

  // View task details action (from AI suggestions)
  app.action('view_task_details', async ({ action, ack, client, body }) => {
    await ack();
    
    try {
      const taskId = (action as any).value;
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return;
      }

      const assignee = task.assigneeId ? await storage.getUser(task.assigneeId) : null;
      const suggestions = await storage.getAISuggestionsForTask(taskId);
      
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

      // Add AI suggestions history
      if (suggestions.length > 0) {
        blocks.push({
          type: 'divider'
        } as any);
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🤖 AI Suggestions (${suggestions.length}):*`
          }
        });
        
        suggestions.slice(0, 3).forEach(suggestion => {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `• ${suggestion.type} - ${suggestion.status} (${suggestion.confidence}% confidence)\n  ${suggestion.createdAt ? new Date(suggestion.createdAt).toLocaleDateString() : ''}`
            }
          });
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
      console.error('Error in view_task_details action:', error);
    }
  });
}
