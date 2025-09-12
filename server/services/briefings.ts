import { storage } from '../storage';
import { getSlackApp } from '../slack/bolt';

export async function sendDailyVABriefings() {
  try {
    const users = await storage.getAllUsers();
    const vaUsers = users.filter(user => 
      !user.role.toLowerCase().includes('lead') && 
      !user.role.toLowerCase().includes('manager')
    );
    
    for (const user of vaUsers) {
      await sendVABrief(user, 'AM');
    }
  } catch (error) {
    console.error('Error sending daily VA briefings:', error);
  }
}

export async function sendPMVABriefings() {
  try {
    const users = await storage.getAllUsers();
    const vaUsers = users.filter(user => 
      !user.role.toLowerCase().includes('lead') && 
      !user.role.toLowerCase().includes('manager')
    );
    
    for (const user of vaUsers) {
      await sendVABrief(user, 'PM');
    }
  } catch (error) {
    console.error('Error sending PM VA briefings:', error);
  }
}

async function sendVABrief(user: any, timeOfDay: 'AM' | 'PM') {
  try {
    const tasks = await storage.getTasksForUser(user.id);
    const now = new Date();
    const today = now.toDateString();
    
    const todayTasks = tasks.filter(task => 
      task.dueAt && new Date(task.dueAt).toDateString() === today
    );
    
    const overdueTasks = tasks.filter(task => 
      task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < now
    );
    
    const slaBreaches = tasks.filter(task => 
      task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < now
    );
    
    const blockedTasks = tasks.filter(task => task.status === 'BLOCKED');
    
    const completedToday = tasks.filter(task => 
      task.status === 'DONE' && 
      task.updatedAt && 
      new Date(task.updatedAt).toDateString() === today
    );
    
    const reactiveQueue = tasks.filter(task => 
      task.type === 'reactive' && 
      task.status === 'OPEN'
    );
    
    let briefContent: any[];
    
    if (timeOfDay === 'AM') {
      briefContent = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🌅 Good Morning, ${user.name}!`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Your Daily Brief*'
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
              text: `*Reactive Queue:* ${reactiveQueue.length}`
            }
          ]
        }
      ];
      
      if (slaBreaches.length > 0) {
        briefContent.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🚨 *URGENT:* ${slaBreaches.length} SLA breach(es) require immediate attention!`
          }
        });
      }
      
      if (overdueTasks.length > 0) {
        briefContent.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📋 *Priority Tasks:*\n${overdueTasks.slice(0, 3).map(task => `• ${task.title}`).join('\n')}`
          }
        });
      }
    } else {
      // PM Brief
      briefContent = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🌆 End of Day Summary, ${user.name}`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Completed Today:* ${completedToday.length}`
            },
            {
              type: 'mrkdwn',
              text: `*Still Open:* ${todayTasks.filter(t => t.status !== 'DONE').length}`
            },
            {
              type: 'mrkdwn',
              text: `*Missed Today:* ${overdueTasks.length}`
            },
            {
              type: 'mrkdwn',
              text: `*Evidence Outstanding:* ${getTasksMissingEvidence(tasks).length}`
            }
          ]
        }
      ];
      
      if (completedToday.length > 0) {
        briefContent.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Completed Tasks:*\n${completedToday.slice(0, 3).map(task => `• ${task.title}`).join('\n')}`
          }
        });
      }
    }
    
    const slackApp = getSlackApp();
    if (slackApp) {
      await slackApp.client.chat.postMessage({
        channel: user.slackId,
        blocks: briefContent
      });
    }
    
    console.log(`${timeOfDay} brief sent to ${user.name}`);
  } catch (error) {
    console.error(`Error sending ${timeOfDay} brief to ${user.name}:`, error);
  }
}

export async function sendManagerDigest() {
  try {
    const managerSlackId = process.env.MANAGER_SLACK_ID;
    if (!managerSlackId) return;
    
    const users = await storage.getAllUsers();
    const allTasks = await storage.getTasks();
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Calculate metrics
    const totalTasks = allTasks.length;
    const completedLast24h = allTasks.filter(task => 
      task.status === 'DONE' && 
      task.updatedAt && 
      new Date(task.updatedAt) > last24h
    ).length;
    
    const slaBreaches24h = allTasks.filter(task => 
      task.slaAt && 
      new Date(task.slaAt) > last24h && 
      new Date(task.slaAt) < now &&
      task.status !== 'DONE'
    ).length;
    
    const slaBreaches7d = allTasks.filter(task => 
      task.slaAt && 
      new Date(task.slaAt) > last7d && 
      new Date(task.slaAt) < now &&
      task.status !== 'DONE'
    ).length;
    
    const openTasks = allTasks.filter(task => task.status !== 'DONE').length;
    
    // Team performance
    const teamStats = users.map(user => {
      const userTasks = allTasks.filter(task => task.assigneeId === user.id);
      const userOverdue = userTasks.filter(task => 
        task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < now
      ).length;
      const userSLABreaches = userTasks.filter(task => 
        task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < now
      ).length;
      
      return {
        user,
        total: userTasks.length,
        overdue: userOverdue,
        slaBreaches: userSLABreaches,
        rag: userSLABreaches > 0 ? '🔴' : userOverdue > 2 ? '🟡' : '🟢'
      };
    });
    
    const digestContent = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Manager Daily Digest'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Daily Operations Summary*\n${new Date().toLocaleDateString()}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Completed (24h):* ${completedLast24h}`
          },
          {
            type: 'mrkdwn',
            text: `*Open Tasks:* ${openTasks}`
          },
          {
            type: 'mrkdwn',
            text: `*SLA Breaches (24h):* ${slaBreaches24h}`
          },
          {
            type: 'mrkdwn',
            text: `*SLA Breaches (7d):* ${slaBreaches7d}`
          }
        ]
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Team Performance (RAG Status)*'
        }
      }
    ];
    
    teamStats.forEach(stat => {
      digestContent.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${stat.rag} *${stat.user.name}*\nActive: ${stat.total} | Overdue: ${stat.overdue} | SLA Breaches: ${stat.slaBreaches}`
        }
      });
    });
    
    // Add weekly scorecard
    const weeklyScorecard = await generateWeeklyScorecard();
    digestContent.push(
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Weekly Scorecard*'
        }
      },
      {
        type: 'section',
        fields: weeklyScorecard.map(metric => ({
          type: 'mrkdwn',
          text: `*${metric.name}:* ${metric.value}`
        }))
      }
    );
    
    const slackApp = getSlackApp();
    if (slackApp) {
      await slackApp.client.chat.postMessage({
        channel: managerSlackId,
        blocks: digestContent
      });
    }
    
    console.log('Manager digest sent');
  } catch (error) {
    console.error('Error sending manager digest:', error);
  }
}

function getTasksMissingEvidence(tasks: any[]): any[] {
  return tasks.filter(task => 
    task.status === 'IN_PROGRESS' && 
    (!task.evidence || Object.keys(task.evidence).length === 0)
  );
}

async function generateWeeklyScorecard() {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const weekTasks = await storage.getTasks();
    const weeklyTasks = weekTasks.filter(task => 
      task.createdAt && new Date(task.createdAt) > weekAgo
    );
    
    const completedTasks = weeklyTasks.filter(task => task.status === 'DONE');
    const slaBreaches = weeklyTasks.filter(task => 
      task.slaAt && 
      new Date(task.slaAt) < now && 
      task.status !== 'DONE'
    );
    
    const firstResponseSLA = weeklyTasks.filter(task => 
      task.slaAt && task.status === 'DONE'
    ).length;
    
    const firstResponseSLAPercent = weeklyTasks.length > 0 ? 
      Math.round((firstResponseSLA / weeklyTasks.length) * 100) : 0;
    
    return [
      { name: 'Inbound Tasks', value: weeklyTasks.length },
      { name: 'Completed', value: completedTasks.length },
      { name: 'Open', value: weeklyTasks.length - completedTasks.length },
      { name: 'SLA First Response %', value: `${firstResponseSLAPercent}%` },
      { name: 'SLA Breaches', value: slaBreaches.length },
      { name: 'Completion Rate', value: `${Math.round((completedTasks.length / weeklyTasks.length) * 100)}%` }
    ];
  } catch (error) {
    console.error('Error generating weekly scorecard:', error);
    return [];
  }
}
