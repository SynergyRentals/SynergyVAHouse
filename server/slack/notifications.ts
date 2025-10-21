/**
 * Slack Notifications Service
 * Handles all Slack message notifications for task assignments and workload changes
 */

import { app as slackApp } from './bolt';

/**
 * Send a notification to a VA when a task is assigned to them
 */
export async function sendTaskAssignmentNotification(
  slackUserId: string,
  task: any
): Promise<void> {
  try {
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🎯 New Task Assigned to You",
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Task:*\n${task.title}`
          },
          {
            type: "mrkdwn",
            text: `*Priority:*\n${task.priority || 'Normal'}`
          },
          {
            type: "mrkdwn",
            text: `*Status:*\n${task.status || 'OPEN'}`
          },
          {
            type: "mrkdwn",
            text: `*Type:*\n${task.type || 'Task'}`
          }
        ]
      }
    ];

    // Add description if present
    if (task.description) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Description:*\n${task.description.substring(0, 200)}${task.description.length > 200 ? '...' : ''}`
        }
      });
    }

    // Add due date if present
    if (task.dueAt) {
      const dueDate = new Date(task.dueAt);
      const now = new Date();
      const hoursUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));

      let dueEmoji = "📅";
      if (hoursUntilDue < 0) dueEmoji = "🔴";
      else if (hoursUntilDue < 4) dueEmoji = "🟠";
      else if (hoursUntilDue < 24) dueEmoji = "🟡";

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${dueEmoji} *Due:* ${dueDate.toLocaleString()}`
        }
      });
    }

    // Add SLA if present
    if (task.slaAt) {
      const slaDate = new Date(task.slaAt);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⏱️ *SLA:* ${slaDate.toLocaleString()}`
        }
      });
    }

    // Add action buttons
    const appBaseUrl = process.env.APP_BASE_URL || 'https://synergyvahouse.replit.app';
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Task",
            emoji: true
          },
          style: "primary",
          url: `${appBaseUrl}/tasks`,
          action_id: "view_task"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Start Working",
            emoji: true
          },
          value: task.id,
          action_id: "start_task"
        }
      ]
    });

    // Send the message
    await slackApp.client.chat.postMessage({
      channel: slackUserId,
      text: `🎯 New task assigned: ${task.title}`,
      blocks
    });

    console.log(`[Slack Notification] ✅ Sent task assignment notification to ${slackUserId} for task ${task.id}`);
  } catch (error) {
    console.error('[Slack Notification] ❌ Failed to send task assignment notification:', error);
    // Don't throw - we don't want notification failures to break task assignment
  }
}

/**
 * Send a notification when tasks are rebalanced
 */
export async function sendWorkloadRebalanceNotification(
  slackUserId: string,
  reassignedTasks: Array<{ title: string; id: string; priority?: string }>
): Promise<void> {
  try {
    const taskList = reassignedTasks
      .slice(0, 10) // Limit to 10 tasks to avoid message being too long
      .map(t => {
        const priorityEmoji = t.priority === 'HIGH' ? '🔴' : t.priority === 'MEDIUM' ? '🟡' : '🟢';
        return `${priorityEmoji} ${t.title}`;
      })
      .join('\n');

    const moreTasksText = reassignedTasks.length > 10
      ? `\n\n_...and ${reassignedTasks.length - 10} more tasks_`
      : '';

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "⚖️ Workload Rebalanced",
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${reassignedTasks.length} task${reassignedTasks.length !== 1 ? 's have' : ' has'} been reassigned to you* to balance the team's workload.\n\n${taskList}${moreTasksText}`
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "💡 These tasks were automatically reassigned to optimize team capacity and ensure balanced workload distribution."
          }
        ]
      }
    ];

    const appBaseUrl = process.env.APP_BASE_URL || 'https://synergyvahouse.replit.app';
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View My Tasks",
            emoji: true
          },
          style: "primary",
          url: `${appBaseUrl}/tasks`,
          action_id: "view_my_tasks"
        }
      ]
    });

    await slackApp.client.chat.postMessage({
      channel: slackUserId,
      text: `⚖️ ${reassignedTasks.length} task${reassignedTasks.length !== 1 ? 's' : ''} reassigned to you for workload balance`,
      blocks
    });

    console.log(`[Slack Notification] ✅ Sent workload rebalance notification to ${slackUserId} for ${reassignedTasks.length} tasks`);
  } catch (error) {
    console.error('[Slack Notification] ❌ Failed to send workload rebalance notification:', error);
    // Don't throw - we don't want notification failures to break rebalancing
  }
}

/**
 * Send a notification when a task is unassigned
 */
export async function sendTaskUnassignmentNotification(
  slackUserId: string,
  task: any,
  reason?: string
): Promise<void> {
  try {
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📤 Task Unassigned",
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Task:* ${task.title}\n\nThis task has been unassigned from you${reason ? ` - ${reason}` : '.'}`
        }
      }
    ];

    await slackApp.client.chat.postMessage({
      channel: slackUserId,
      text: `📤 Task unassigned: ${task.title}`,
      blocks
    });

    console.log(`[Slack Notification] ✅ Sent task unassignment notification to ${slackUserId} for task ${task.id}`);
  } catch (error) {
    console.error('[Slack Notification] ❌ Failed to send task unassignment notification:', error);
  }
}

/**
 * Send a notification about capacity status to manager
 */
export async function sendCapacityAlertToManager(
  managerSlackId: string,
  alertType: 'overload' | 'underutilized',
  vaDetails: Array<{ name: string; taskCount: number }>
): Promise<void> {
  try {
    const emoji = alertType === 'overload' ? '🚨' : 'ℹ️';
    const title = alertType === 'overload' ? 'Team Overload Alert' : 'Team Underutilization Notice';
    const description = alertType === 'overload'
      ? 'The following VAs have exceeded their recommended task capacity:'
      : 'The following VAs have available capacity:';

    const vaList = vaDetails
      .map(va => `• *${va.name}*: ${va.taskCount} tasks`)
      .join('\n');

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} ${title}`,
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${description}\n\n${vaList}`
        }
      }
    ];

    if (alertType === 'overload') {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "💡 *Recommendation:* Consider running workload rebalancing or assigning new tasks to underutilized VAs."
        }
      });
    }

    await slackApp.client.chat.postMessage({
      channel: managerSlackId,
      text: `${emoji} ${title}: ${vaDetails.length} VA${vaDetails.length !== 1 ? 's' : ''} affected`,
      blocks
    });

    console.log(`[Slack Notification] ✅ Sent capacity alert to manager ${managerSlackId}`);
  } catch (error) {
    console.error('[Slack Notification] ❌ Failed to send capacity alert:', error);
  }
}
