import type { App } from '@slack/bolt';
import { storage } from '../storage';

export function setupAppHome(app: App) {
  app.event('app_home_opened', async ({ event, client }) => {
    try {
      const user = await storage.getUserBySlackId(event.user);
      if (!user) return;

      const isManager = user.role.toLowerCase().includes('lead') || user.role.toLowerCase().includes('manager');
      
      if (isManager) {
        await renderManagerView(client, event.user);
      } else {
        await renderVAView(client, event.user, user);
      }
    } catch (error) {
      console.error('Error rendering app home:', error);
    }
  });
}

async function renderVAView(client: any, userId: string, user: any) {
  const tasks = await storage.getTasksForUser(user.id);
  const now = new Date();
  
  const todayTasks = tasks.filter(task => 
    task.dueAt && new Date(task.dueAt).toDateString() === now.toDateString()
  );
  
  const overdueTasks = tasks.filter(task => 
    task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < now
  );
  
  const slaBreachTasks = tasks.filter(task => 
    task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < now
  );
  
  const blockedTasks = tasks.filter(task => task.status === 'BLOCKED');
  
  const completedToday = tasks.filter(task => 
    task.status === 'DONE' && 
    task.updatedAt && 
    new Date(task.updatedAt).toDateString() === now.toDateString()
  );

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🏠 ${user.name} Dashboard`
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Today's Tasks:* ${todayTasks.length}`
        },
        {
          type: 'mrkdwn',
          text: `*Overdue:* ${overdueTasks.length}`
        },
        {
          type: 'mrkdwn',
          text: `*Blocked:* ${blockedTasks.length}`
        },
        {
          type: 'mrkdwn',
          text: `*Completed Today:* ${completedToday.length}`
        }
      ]
    }
  ];

  if (slaBreachTasks.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🚨 *SLA Breaches:* ${slaBreachTasks.length} task(s) require immediate attention`
      }
    });
  }

  // Add today's tasks
  if (todayTasks.length > 0) {
    blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: "📋 Today's Tasks"
        }
      }
    );

    todayTasks.slice(0, 5).forEach(task => {
      const statusEmoji = getStatusEmoji(task.status);
      const slaStatus = task.slaAt && new Date(task.slaAt) < now ? '🚨' : 
                      task.slaAt && (new Date(task.slaAt).getTime() - now.getTime()) < 5 * 60 * 1000 ? '⚠️' : '';
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${statusEmoji} *${task.title}*\n${task.category} ${slaStatus}`
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View'
          },
          action_id: 'view_task',
          value: task.id
        }
      });
    });
  }

  // Add next steps
  blocks.push(
    {
      type: 'divider'
    },
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: "🎯 Next 3 Steps"
      }
    }
  );

  const nextSteps = generateNextSteps(tasks);
  nextSteps.forEach((step, index) => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${index + 1}. *${step.title}*\n${step.description}`
      }
    });
  });

  await client.views.publish({
    user_id: userId,
    view: {
      type: 'home',
      blocks
    }
  });
}

async function renderManagerView(client: any, userId: string) {
  const allUsers = await storage.getAllUsers();
  const allTasks = await storage.getTasks();
  
  const userStats = allUsers.map(user => {
    const userTasks = allTasks.filter(task => task.assigneeId === user.id);
    const overdue = userTasks.filter(task => 
      task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < new Date()
    ).length;
    const slaBreaches = userTasks.filter(task => 
      task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < new Date()
    ).length;
    
    return {
      user,
      total: userTasks.length,
      overdue,
      slaBreaches,
      rag: slaBreaches > 0 ? '🔴' : overdue > 0 ? '🟡' : '🟢'
    };
  });

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Manager Dashboard'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Team Performance Overview*'
      }
    }
  ];

  userStats.forEach(stat => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${stat.rag} *${stat.user.name}*\nTasks: ${stat.total} | Overdue: ${stat.overdue} | SLA Breaches: ${stat.slaBreaches}`
      }
    });
  });

  // Add SLA summary
  const totalSLABreaches = userStats.reduce((sum, stat) => sum + stat.slaBreaches, 0);
  const totalOverdue = userStats.reduce((sum, stat) => sum + stat.overdue, 0);
  
  blocks.push(
    {
      type: 'divider'
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total SLA Breaches:* ${totalSLABreaches}`
        },
        {
          type: 'mrkdwn',
          text: `*Total Overdue:* ${totalOverdue}`
        }
      ]
    }
  );

  await client.views.publish({
    user_id: userId,
    view: {
      type: 'home',
      blocks
    }
  });
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'OPEN': return '🔵';
    case 'IN_PROGRESS': return '🟡';
    case 'WAITING': return '🟠';
    case 'BLOCKED': return '🔴';
    case 'DONE': return '✅';
    default: return '⚪';
  }
}

function generateNextSteps(tasks: any[]): Array<{ title: string; description: string }> {
  const steps = [];
  
  // Find SLA breach tasks
  const slaBreaches = tasks.filter(task => 
    task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < new Date()
  );
  
  if (slaBreaches.length > 0) {
    steps.push({
      title: 'Address SLA Breaches',
      description: `Complete ${slaBreaches.length} overdue task(s) to restore SLA compliance`
    });
  }
  
  // Find tasks missing evidence
  const missingEvidence = tasks.filter(task => 
    task.status === 'IN_PROGRESS' && (!task.evidence || Object.keys(task.evidence).length === 0)
  );
  
  if (missingEvidence.length > 0) {
    steps.push({
      title: 'Update Task Evidence',
      description: `Add required documentation to ${missingEvidence.length} in-progress task(s)`
    });
  }
  
  // Find blocked tasks
  const blockedTasks = tasks.filter(task => task.status === 'BLOCKED');
  
  if (blockedTasks.length > 0) {
    steps.push({
      title: 'Resolve Blocked Tasks',
      description: `Follow up on ${blockedTasks.length} blocked task(s) to unblock progress`
    });
  }
  
  // Default suggestions if no issues
  if (steps.length === 0) {
    steps.push(
      {
        title: 'Review Daily Checklist',
        description: 'Complete any remaining items on today\'s operational checklist'
      },
      {
        title: 'Check for New Escalations',
        description: 'Monitor #triage channel for any new issues requiring attention'
      },
      {
        title: 'Update Project Status',
        description: 'Ensure all project tasks have current status and progress notes'
      }
    );
  }
  
  return steps.slice(0, 3);
}
