import { storage } from '../storage';
import { getSlackApp } from '../slack/bolt';
import { generateBriefingData } from './metrics';
import type { User, Task } from '@shared/schema';

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

async function sendVABrief(user: User, timeOfDay: 'AM' | 'PM') {
  try {
    // Get comprehensive briefing data
    const briefingData = await generateBriefingData();
    if (!briefingData) {
      console.error('Failed to generate briefing data');
      return;
    }

    const userTasks = await storage.getTasksForUser(user.id);
    const now = new Date();
    const today = now.toDateString();
    
    // Calculate user-specific metrics
    const userMetrics = calculateUserMetrics(userTasks, now, today);
    
    // Get user-relevant critical issues
    const userCriticalIssues = briefingData.criticalIssues.filter((issue: any) => 
      issue.tasks.some((task: Task) => task.assigneeId === user.id)
    );
    
    // Get user success stories
    const userSuccessStories = briefingData.successStories.filter((story: any) => 
      story.tasks.some((task: Task) => task.assigneeId === user.id)
    );
    
    let briefContent: any[];
    
    if (timeOfDay === 'AM') {
      briefContent = await buildAMBriefing(user, userMetrics, briefingData, userCriticalIssues);
    } else {
      briefContent = await buildPMBriefing(user, userMetrics, briefingData, userSuccessStories);
    }
    
    const slackApp = getSlackApp();
    if (slackApp) {
      await slackApp.client.chat.postMessage({
        channel: user.slackId,
        blocks: briefContent
      });
    }
    
    console.log(`Enhanced ${timeOfDay} brief sent to ${user.name}`);
  } catch (error) {
    console.error(`Error sending ${timeOfDay} brief to ${user.name}:`, error);
  }
}

function calculateUserMetrics(userTasks: Task[], now: Date, today: string) {
  const todayTasks = userTasks.filter(task => 
    task.dueAt && new Date(task.dueAt).toDateString() === today
  );
  
  const overdueTasks = userTasks.filter(task => 
    task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < now
  );
  
  const slaBreaches = userTasks.filter(task => 
    task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < now
  );
  
  const blockedTasks = userTasks.filter(task => task.status === 'BLOCKED');
  
  const completedToday = userTasks.filter(task => 
    task.status === 'DONE' && 
    task.updatedAt && 
    new Date(task.updatedAt).toDateString() === today
  );
  
  const inProgressTasks = userTasks.filter(task => task.status === 'IN_PROGRESS');
  
  const followupTasks = userTasks.filter(task => 
    task.category === 'follow_up' && task.status !== 'DONE'
  );
  
  const overdueFollowups = followupTasks.filter(task => 
    task.dueAt && new Date(task.dueAt) < now
  );
  
  const missingEvidence = userTasks.filter(task => 
    task.status === 'IN_PROGRESS' && 
    task.playbookKey && 
    (!task.evidence || Object.keys(task.evidence).length === 0)
  );
  
  return {
    todayTasks,
    overdueTasks,
    slaBreaches,
    blockedTasks,
    completedToday,
    inProgressTasks,
    followupTasks,
    overdueFollowups,
    missingEvidence
  };
}

async function buildAMBriefing(user: User, userMetrics: any, briefingData: any, userCriticalIssues: any[]) {
  const blocks = [];
  
  // Header with personalized greeting
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `🌅 Good Morning, ${user.name}!`
    }
  });
  
  // Performance status card
  const performanceEmoji = userMetrics.slaBreaches.length > 0 ? '🔴' : 
                          userMetrics.overdueTasks.length > 2 ? '🟡' : '🟢';
  
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${performanceEmoji} *Your Performance Status* | ${briefingData.timestamp.toLocaleDateString()}`
    }
  });
  
  // Key metrics in a compact format
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Active Tasks:* ${userMetrics.todayTasks.length + userMetrics.inProgressTasks.length}`
      },
      {
        type: 'mrkdwn',
        text: `*Due Today:* ${userMetrics.todayTasks.length}`
      },
      {
        type: 'mrkdwn', 
        text: `*Overdue:* ${userMetrics.overdueTasks.length}`
      },
      {
        type: 'mrkdwn',
        text: `*Follow-ups:* ${userMetrics.followupTasks.length}`
      }
    ]
  });
  
  // Critical issues section
  if (userCriticalIssues.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '🚨 *URGENT - Immediate Action Required*'
      }
    });
    
    for (const issue of userCriticalIssues.slice(0, 2)) {
      const userIssues = issue.tasks.filter((task: Task) => task.assigneeId === user.id);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *${issue.description}*\n${userIssues.slice(0, 2).map((task: Task) => `  ◦ ${task.title}`).join('\n')}`
        }
      });
    }
  }
  
  // Priority tasks section
  if (userMetrics.overdueTasks.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '📋 *Priority Tasks - Focus Here First*'
      }
    });
    
    const priorityTasks = userMetrics.overdueTasks
      .sort((a: Task, b: Task) => (a.priority || 3) - (b.priority || 3))
      .slice(0, 3);
    
    for (const task of priorityTasks) {
      const daysOverdue = Math.ceil((Date.now() - new Date(task.dueAt!).getTime()) / (1000 * 60 * 60 * 24));
      const priorityEmoji = task.priority === 1 ? '🔥' : task.priority === 2 ? '⚡' : '📝';
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${priorityEmoji} *${task.title}*\n${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue | Category: ${task.category}`
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Task'
          },
          action_id: 'view_task',
          value: task.id
        }
      });
    }
  }
  
  // Team context section
  if (briefingData.trends.dailyCompletion.change !== 0) {
    blocks.push({ type: 'divider' });
    const trendEmoji = briefingData.trends.dailyCompletion.change > 0 ? '📈' : '📉';
    const trendText = briefingData.trends.dailyCompletion.change > 0 ? 'up' : 'down';
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${trendEmoji} *Team Update*\nDaily completions ${trendText} by ${Math.abs(briefingData.trends.dailyCompletion.change)} | SLA compliance at ${briefingData.today.slaCompliancePercent}%`
      }
    });
  }
  
  // Helpful reminders
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '💡 *Quick Reminders*\n• Use `/done TASK_ID` to complete tasks\n• Add evidence before marking high-priority tasks done\n• Escalate blocked tasks to your lead'
    }
  });
  
  return blocks;
}

async function buildPMBriefing(user: User, userMetrics: any, briefingData: any, userSuccessStories: any[]) {
  const blocks = [];
  
  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `🌆 End of Day Summary - ${user.name}`
    }
  });
  
  // Daily achievement summary
  const achievementEmoji = userMetrics.completedToday.length > 3 ? '🏆' : 
                          userMetrics.completedToday.length > 0 ? '✅' : '📋';
  
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${achievementEmoji} *Today's Accomplishments* | ${briefingData.timestamp.toLocaleDateString()}`
    }
  });
  
  // Performance metrics
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Completed:* ${userMetrics.completedToday.length}`
      },
      {
        type: 'mrkdwn',
        text: `*Still Active:* ${userMetrics.inProgressTasks.length}`
      },
      {
        type: 'mrkdwn',
        text: `*Overdue:* ${userMetrics.overdueTasks.length}`
      },
      {
        type: 'mrkdwn',
        text: `*Evidence Pending:* ${userMetrics.missingEvidence.length}`
      }
    ]
  });
  
  // Success stories
  if (userSuccessStories.length > 0 || userMetrics.completedToday.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '🎉 *Today\'s Wins*'
      }
    });
    
    // Show completed tasks
    if (userMetrics.completedToday.length > 0) {
      const topCompletions = userMetrics.completedToday
        .sort((a: Task, b: Task) => (a.priority || 3) - (b.priority || 3))
        .slice(0, 3);
      
      for (const task of topCompletions) {
        const priorityEmoji = task.priority === 1 ? '🔥' : task.priority === 2 ? '⚡' : '✅';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${priorityEmoji} *${task.title}*\nCategory: ${task.category}${task.evidence ? ' | Evidence provided' : ''}`
          }
        });
      }
    }
    
    // Show success stories
    if (userSuccessStories.length > 0) {
      for (const story of userSuccessStories.slice(0, 2)) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⭐ *Excellence Noted*\n${story.description}`
          }
        });
      }
    }
  }
  
  // Outstanding items for tomorrow
  if (userMetrics.overdueTasks.length > 0 || userMetrics.followupTasks.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '📋 *Tomorrow\'s Focus Areas*'
      }
    });
    
    // Overdue items
    if (userMetrics.overdueTasks.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚨 *${userMetrics.overdueTasks.length} Overdue Tasks*\n${userMetrics.overdueTasks.slice(0, 2).map((task: Task) => `• ${task.title}`).join('\n')}`
        }
      });
    }
    
    // Follow-ups
    if (userMetrics.overdueFollowups.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⏰ *${userMetrics.overdueFollowups.length} Overdue Follow-ups*\n${userMetrics.overdueFollowups.slice(0, 2).map((task: Task) => `• ${task.title}`).join('\n')}`
        }
      });
    }
  }
  
  // Team context
  blocks.push({ type: 'divider' });
  const teamSentiment = briefingData.today.slaCompliancePercent >= 90 ? 'Excellent' :
                       briefingData.today.slaCompliancePercent >= 80 ? 'Good' : 'Needs Focus';
  
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `📊 *Team Performance Today*\n${briefingData.today.completed} tasks completed | ${teamSentiment} SLA performance (${briefingData.today.slaCompliancePercent}%)`
    }
  });
  
  // Motivational close
  const motivationalMessages = [
    "Great work today! Rest well and we'll tackle tomorrow together. 💪",
    "Another day of progress! Your efforts make a difference. 🌟", 
    "Solid work today! Tomorrow brings new opportunities. 🚀",
    "Well done! Your dedication keeps our operations running smoothly. 🙌"
  ];
  
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)]
    }
  });
  
  return blocks;
}

export async function sendManagerDigest() {
  try {
    const managerSlackId = process.env.MANAGER_SLACK_ID;
    if (!managerSlackId) {
      console.log('MANAGER_SLACK_ID not configured, skipping manager digest');
      return;
    }
    
    // Get comprehensive briefing data
    const briefingData = await generateBriefingData();
    if (!briefingData) {
      console.error('Failed to generate briefing data for manager digest');
      return;
    }
    
    const digestContent = await buildManagerDigest(briefingData);
    
    const slackApp = getSlackApp();
    if (slackApp) {
      await slackApp.client.chat.postMessage({
        channel: managerSlackId,
        blocks: digestContent
      });
    }
    
    console.log('Enhanced manager digest sent');
  } catch (error) {
    console.error('Error sending manager digest:', error);
  }
}


async function buildManagerDigest(briefingData: any) {
  const blocks = [];
  
  // Header with executive summary
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `📊 Operations Command Center - ${briefingData.timestamp.toLocaleDateString()}`
    }
  });
  
  // Executive status overview
  const overallStatus = getOverallOperationalStatus(briefingData);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${overallStatus.emoji} *Operational Status: ${overallStatus.status}*\n${overallStatus.summary}`
    }
  });
  
  // Key performance indicators
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📈 Daily Performance Metrics*'
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Tasks Completed:* ${briefingData.today.completed}${getTrendIndicator(briefingData.trends.dailyCompletion.change)}`
        },
        {
          type: 'mrkdwn',
          text: `*SLA Compliance:* ${briefingData.today.slaCompliancePercent}%${getTrendIndicator(briefingData.trends.slaCompliance.change)}`
        },
        {
          type: 'mrkdwn',
          text: `*Avg Cycle Time:* ${briefingData.today.avgCycleTimeHours}h${getCycleTimeTrend(briefingData.trends.cycleTime.trend)}`
        },
        {
          type: 'mrkdwn',
          text: `*Active Tasks:* ${briefingData.today.created - briefingData.today.completed}`
        }
      ]
    }
  );
  
  // Critical issues section
  if (briefingData.criticalIssues.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '🚨 *Critical Issues Requiring Leadership Attention*'
        }
      }
    );
    
    for (const issue of briefingData.criticalIssues.slice(0, 3)) {
      const urgencyEmoji = issue.severity === 'critical' ? '🔥' : 
                          issue.severity === 'high' ? '⚠️' : '🟡';
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${urgencyEmoji} *${issue.type.replace('_', ' ').toUpperCase()}*\n${issue.description}`
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Review Details'
          },
          action_id: 'review_critical_issue',
          value: issue.type
        }
      });
    }
  }
  
  // Team performance analysis
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*💼 Team Performance Dashboard*'
      }
    }
  );
  
  // Show team performance in a organized way
  const sortedTeamPerf = briefingData.teamPerformance.slice(0, 5); // Top 5 for visibility
  for (const member of sortedTeamPerf) {
    const statusEmoji = member.stats.status === 'critical' ? '🔴' :
                       member.stats.status === 'warning' ? '🟡' : '🟢';
    
    const performanceSummary = generatePerformanceSummary(member.stats);
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji} *${member.user.name}* (${member.user.role})\n${performanceSummary}`
      }
    });
  }
  
  // Strategic insights and action items
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*💭 Strategic Insights & Action Items*'
      }
    }
  );
  
  const actionItems = generateActionItems(briefingData);
  for (const item of actionItems.slice(0, 4)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${item.priority === 'high' ? '💥' : '📁'} ${item.message}`
      }
    });
  }
  
  // Weekly trends summary
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📈 Weekly Trend Analysis*'
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Throughput:* ${briefingData.thisWeek.completed} tasks${getWeeklyTrendText(briefingData.trends.weeklyThroughput)}`
        },
        {
          type: 'mrkdwn',
          text: `*Quality:* ${briefingData.thisWeek.evidenceCompliancePercent}% evidence compliance`
        },
        {
          type: 'mrkdwn',
          text: `*Follow-ups:* ${briefingData.thisWeek.followupsCompleted}/${briefingData.thisWeek.followupsCreated} completed`
        },
        {
          type: 'mrkdwn',
          text: `*SLA Performance:* ${briefingData.thisWeek.slaCompliancePercent}% compliance`
        }
      ]
    }
  );
  
  // Success highlights
  if (briefingData.successStories.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🎆 Success Highlights*'
        }
      }
    );
    
    for (const story of briefingData.successStories.slice(0, 2)) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⭐ ${story.description}`
        }
      });
    }
  }
  
  // Footer with key insights
  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Generated at ${briefingData.timestamp.toLocaleTimeString()} CT | Next update: Tomorrow 9:00 AM`
        }
      ]
    }
  );
  
  return blocks;
}

function getOverallOperationalStatus(briefingData: any) {
  const criticalCount = briefingData.criticalIssues.filter((issue: any) => issue.severity === 'critical').length;
  const slaCompliance = briefingData.today.slaCompliancePercent;
  const completionRate = briefingData.today.completionRate;
  
  if (criticalCount > 0) {
    return {
      emoji: '🔴',
      status: 'CRITICAL',
      summary: `${criticalCount} critical issues requiring immediate attention. Escalation protocols activated.`
    };
  } else if (slaCompliance < 80 || completionRate < 60) {
    return {
      emoji: '🟡',
      status: 'ATTENTION NEEDED', 
      summary: 'Performance metrics below target. Review team capacity and priority alignment.'
    };
  } else if (slaCompliance >= 90 && completionRate >= 80) {
    return {
      emoji: '🟢',
      status: 'EXCELLENT',
      summary: 'Operations running smoothly. Team performing above benchmarks.'
    };
  } else {
    return {
      emoji: '🟢', 
      status: 'STABLE',
      summary: 'Normal operations. Monitoring ongoing performance metrics.'
    };
  }
}

function getTrendIndicator(change: number): string {
  if (change > 0) return ` 📈 (+${change})`;
  if (change < 0) return ` 📉 (${change})`;
  return ' 🟡 (=)';
}

function getCycleTimeTrend(trend: string): string {
  return trend === 'improving' ? ' 📈 ⬇️' : ' 🟡';
}

function generatePerformanceSummary(stats: any): string {
  const parts = [];
  parts.push(`Active: ${stats.totalActive}`);
  parts.push(`Completed: ${stats.completedToday}`);
  
  if (stats.overdue > 0) parts.push(`Overdue: ${stats.overdue}`);
  if (stats.slaBreaches > 0) parts.push(`SLA Breaches: ${stats.slaBreaches}`);
  
  if (stats.avgResponseTime > 0) {
    parts.push(`Avg Response: ${stats.avgResponseTime}h`);
  }
  
  return parts.join(' | ');
}

function generateActionItems(briefingData: any) {
  const items = [];
  
  // Critical issue actions
  const criticalIssues = briefingData.criticalIssues.filter((issue: any) => issue.severity === 'critical');
  if (criticalIssues.length > 0) {
    items.push({
      priority: 'high',
      message: `*Immediate escalation needed*: ${criticalIssues.length} critical issues requiring leadership intervention`
    });
  }
  
  // SLA compliance actions
  if (briefingData.today.slaCompliancePercent < 85) {
    items.push({
      priority: 'high',
      message: `*SLA Review Required*: Compliance at ${briefingData.today.slaCompliancePercent}% - investigate resource allocation and process bottlenecks`
    });
  }
  
  // Team performance actions
  const criticalTeamMembers = briefingData.teamPerformance.filter((member: any) => member.stats.status === 'critical');
  if (criticalTeamMembers.length > 0) {
    items.push({
      priority: 'medium', 
      message: `*Team Support Needed*: ${criticalTeamMembers.length} team members need assistance with workload or blocked items`
    });
  }
  
  // Trend-based actions
  if (briefingData.trends.dailyCompletion.change < -3) {
    items.push({
      priority: 'medium',
      message: `*Productivity Decline*: Daily completions down by ${Math.abs(briefingData.trends.dailyCompletion.change)} - review team capacity and priorities`
    });
  }
  
  // Positive reinforcement
  if (briefingData.today.slaCompliancePercent >= 95) {
    items.push({
      priority: 'low',
      message: `*Team Recognition*: Excellent SLA performance (${briefingData.today.slaCompliancePercent}%) - consider sharing success practices`
    });
  }
  
  return items.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return (priorityOrder[b.priority as keyof typeof priorityOrder] || 0) - 
           (priorityOrder[a.priority as keyof typeof priorityOrder] || 0);
  });
}

function getWeeklyTrendText(weeklyTrend: any): string {
  if (weeklyTrend.changePercent > 10) {
    return ` (📈 +${weeklyTrend.changePercent}% vs last week)`;
  } else if (weeklyTrend.changePercent < -10) {
    return ` (📉 ${weeklyTrend.changePercent}% vs last week)`;
  } else {
    return ` (🟡 ${weeklyTrend.changePercent >= 0 ? '+' : ''}${weeklyTrend.changePercent}% vs last week)`;
  }
}

// Weekly Manager Summary - Deep-dive strategic analysis
export async function sendWeeklyManagerSummary() {
  try {
    const managerSlackId = process.env.MANAGER_SLACK_ID;
    if (!managerSlackId) {
      console.log('MANAGER_SLACK_ID not configured, skipping weekly summary');
      return;
    }
    
    // Generate comprehensive weekly data
    const briefingData = await generateBriefingData();
    if (!briefingData) {
      console.error('Failed to generate briefing data for weekly summary');
      return;
    }
    
    // Generate weekly scorecard
    const weeklyScorecard = await generateWeeklyScorecard();
    
    const summaryContent = await buildWeeklyManagerSummary(briefingData, weeklyScorecard);
    
    const slackApp = getSlackApp();
    if (slackApp) {
      await slackApp.client.chat.postMessage({
        channel: managerSlackId,
        blocks: summaryContent
      });
    }
    
    console.log('Weekly manager summary sent');
  } catch (error) {
    console.error('Error sending weekly manager summary:', error);
  }
}

async function buildWeeklyManagerSummary(briefingData: any, weeklyScorecard: any) {
  const blocks = [];
  
  // Executive header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `📊 Weekly Operations Executive Summary`
    }
  });
  
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Week ending ${briefingData.timestamp.toLocaleDateString()}*\nComprehensive analysis of operational performance and strategic insights`
    }
  });
  
  // Executive Summary Card
  const weeklyStatus = getWeeklyExecutiveSummary(briefingData, weeklyScorecard);
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${weeklyStatus.emoji} *Executive Status: ${weeklyStatus.status}*\n${weeklyStatus.summary}`
      }
    }
  );
  
  // Key Performance Scorecard
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🏆 Weekly Performance Scorecard*'
      }
    }
  );
  
  if (weeklyScorecard && weeklyScorecard.inboundTasks !== undefined) {
    const scorecardBlocks = buildScorecardSection(weeklyScorecard, briefingData);
    blocks.push(...scorecardBlocks);
  } else {
    // Fallback to briefingData metrics
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Inbound Tasks:* ${briefingData.thisWeek.created}`
        },
        {
          type: 'mrkdwn',
          text: `*Completed Tasks:* ${briefingData.thisWeek.completed}`
        },
        {
          type: 'mrkdwn',
          text: `*SLA Compliance:* ${briefingData.thisWeek.slaCompliancePercent}%`
        },
        {
          type: 'mrkdwn',
          text: `*Evidence Compliance:* ${briefingData.thisWeek.evidenceCompliancePercent}%`
        }
      ]
    });
  }
  
  // Trend Analysis Deep Dive
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📈 Strategic Trend Analysis*'
      }
    }
  );
  
  const trendInsights = generateWeeklyTrendInsights(briefingData);
  for (const insight of trendInsights) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${insight.emoji} *${insight.title}*\n${insight.analysis}`
      }
    });
  }
  
  // Team Performance Deep Dive
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*👥 Team Performance Analysis*'
      }
    }
  );
  
  const teamAnalysis = generateWeeklyTeamAnalysis(briefingData.teamPerformance);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: teamAnalysis
    }
  });
  
  // Critical Issues & Risks
  if (briefingData.criticalIssues.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🚨 Critical Issues & Risk Assessment*'
        }
      }
    );
    
    const riskAssessment = generateRiskAssessment(briefingData.criticalIssues);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: riskAssessment
      }
    });
  }
  
  // Strategic Recommendations
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🎯 Strategic Recommendations & Action Plan*'
      }
    }
  );
  
  const recommendations = generateWeeklyRecommendations(briefingData, weeklyScorecard);
  for (const rec of recommendations) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${rec.priority === 'high' ? '🔥' : '📋'} *${rec.title}*\n${rec.description}\n_Owner: ${rec.owner} | Timeline: ${rec.timeline}_`
      }
    });
  }
  
  // Success Stories & Recognition
  if (briefingData.successStories.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🌟 Success Stories & Team Recognition*'
        }
      }
    );
    
    for (const story of briefingData.successStories) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⭐ **${story.type.replace('_', ' ').toUpperCase()}**: ${story.description}`
        }
      });
    }
  }
  
  // Next Week Outlook
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🔮 Next Week Outlook & Priorities*'
      }
    }
  );
  
  const outlook = generateNextWeekOutlook(briefingData);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: outlook
    }
  });
  
  // Footer
  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Weekly Executive Summary | Generated ${briefingData.timestamp.toLocaleString()} CT | Next summary: Next Monday 9:00 AM CT`
        }
      ]
    }
  );
  
  return blocks;
}

function getWeeklyExecutiveSummary(briefingData: any, weeklyScorecard: any) {
  const completionRate = briefingData.thisWeek.completionRate || 
    (briefingData.thisWeek.completed / (briefingData.thisWeek.created || 1)) * 100;
  const slaCompliance = briefingData.thisWeek.slaCompliancePercent;
  const weekOverWeekGrowth = briefingData.trends.weeklyThroughput.changePercent;
  
  if (slaCompliance >= 95 && completionRate >= 85 && weekOverWeekGrowth >= 0) {
    return {
      emoji: '🟢',
      status: 'EXCEPTIONAL PERFORMANCE',
      summary: `Outstanding week with ${completionRate.toFixed(0)}% completion rate and ${slaCompliance}% SLA compliance. Team is exceeding all benchmarks.`
    };
  } else if (slaCompliance >= 85 && completionRate >= 70) {
    return {
      emoji: '🟡',
      status: 'SOLID PERFORMANCE', 
      summary: `Steady performance with room for optimization. Completion rate at ${completionRate.toFixed(0)}% and SLA compliance at ${slaCompliance}%.`
    };
  } else if (slaCompliance < 80 || completionRate < 60) {
    return {
      emoji: '🔴',
      status: 'PERFORMANCE CONCERNS',
      summary: `Metrics below targets require strategic intervention. Completion: ${completionRate.toFixed(0)}%, SLA: ${slaCompliance}%.`
    };
  } else {
    return {
      emoji: '🟡',
      status: 'MIXED RESULTS',
      summary: `Performance varies across metrics. Focus needed on consistency and process optimization.`
    };
  }
}

function buildScorecardSection(scorecard: any, briefingData: any) {
  return [
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Inbound Volume:* ${scorecard.inboundTasks}`
        },
        {
          type: 'mrkdwn', 
          text: `*Completion Rate:* ${Math.round((scorecard.completedTasks / scorecard.inboundTasks) * 100)}%`
        },
        {
          type: 'mrkdwn',
          text: `*SLA First Response:* ${scorecard.slaFirstResponsePercent}%`
        },
        {
          type: 'mrkdwn',
          text: `*Avg Cycle Time:* ${scorecard.avgCycleTimeHours}h`
        }
      ]
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Quality Score:* ${scorecard.evidenceCompletenessPercent}%`
        },
        {
          type: 'mrkdwn',
          text: `*Reopen Rate:* ${scorecard.reopenRatePercent}%`
        },
        {
          type: 'mrkdwn',
          text: `*Follow-up Satisfaction:* ${scorecard.followupCreatedVsSatisfied}`
        },
        {
          type: 'mrkdwn',
          text: `*Project Milestones:* ${scorecard.projectMilestonesOnTimePercent}%`
        }
      ]
    }
  ];
}

function generateWeeklyTrendInsights(briefingData: any) {
  const insights = [];
  
  // Throughput trends
  const throughputChange = briefingData.trends.weeklyThroughput.changePercent;
  if (Math.abs(throughputChange) >= 10) {
    insights.push({
      emoji: throughputChange > 0 ? '📈' : '📉',
      title: 'Throughput Trend',
      analysis: `Weekly completions ${throughputChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(throughputChange)}%. ${throughputChange > 0 ? 'Excellent momentum - analyze what drove this improvement for replication.' : 'Investigate root causes: resource constraints, process bottlenecks, or priority shifts.'}`
    });
  }
  
  // SLA performance trends
  const slaChange = briefingData.trends.slaCompliance.change;
  if (Math.abs(slaChange) >= 5) {
    insights.push({
      emoji: slaChange > 0 ? '✅' : '⚠️',
      title: 'SLA Performance',
      analysis: `SLA compliance ${slaChange > 0 ? 'improved' : 'declined'} by ${Math.abs(slaChange)}%. ${slaChange > 0 ? 'Great progress on response times.' : 'Review capacity planning and priority management.'}`
    });
  }
  
  // Cycle time analysis
  if (briefingData.trends.cycleTime.trend === 'improving') {
    insights.push({
      emoji: '⚡',
      title: 'Efficiency Gains',
      analysis: `Average cycle time decreased to ${briefingData.today.avgCycleTimeHours}h. Process optimizations are showing results.`
    });
  }
  
  return insights;
}

function generateWeeklyTeamAnalysis(teamPerformance: any[]) {
  const critical = teamPerformance.filter((member: any) => member.stats.status === 'critical').length;
  const warning = teamPerformance.filter((member: any) => member.stats.status === 'warning').length;
  const good = teamPerformance.filter((member: any) => member.stats.status === 'good').length;
  
  let analysis = `**Team Health Overview:**\n• ${good} team members performing well\n• ${warning} members need attention\n• ${critical} members require immediate support\n\n`;
  
  if (critical > 0) {
    analysis += `**Critical Performance Indicators:** ${critical} team members showing signs of overload or performance issues. Recommend immediate 1:1 reviews and workload assessment.\n\n`;
  }
  
  const topPerformers = teamPerformance
    .filter((member: any) => member.stats.status === 'good')
    .slice(0, 3);
  
  if (topPerformers.length > 0) {
    analysis += `**Top Performers:** ${topPerformers.map((p: any) => p.user.name).join(', ')} - consider peer mentoring opportunities.`;
  }
  
  return analysis;
}

function generateRiskAssessment(criticalIssues: any[]) {
  const riskLevels = {
    critical: criticalIssues.filter(issue => issue.severity === 'critical').length,
    high: criticalIssues.filter(issue => issue.severity === 'high').length,
    medium: criticalIssues.filter(issue => issue.severity === 'medium').length
  };
  
  let assessment = `**Risk Distribution:** ${riskLevels.critical} Critical | ${riskLevels.high} High | ${riskLevels.medium} Medium\n\n`;
  
  if (riskLevels.critical > 0) {
    assessment += `🚨 **CRITICAL RISKS:** Immediate escalation required for ${riskLevels.critical} issues. These may impact client satisfaction or SLA commitments.\n\n`;
  }
  
  // Risk trends and recommendations
  assessment += `**Mitigation Strategy:** Focus on process improvements, resource allocation, and proactive monitoring to prevent issue escalation.`;
  
  return assessment;
}

function generateWeeklyRecommendations(briefingData: any, scorecard: any) {
  const recommendations = [];
  
  // SLA improvement recommendations
  if (briefingData.thisWeek.slaCompliancePercent < 90) {
    recommendations.push({
      priority: 'high',
      title: 'SLA Performance Enhancement',
      description: `Current compliance at ${briefingData.thisWeek.slaCompliancePercent}%. Implement stricter priority triage and consider resource reallocation.`,
      owner: 'Operations Lead',
      timeline: 'This week'
    });
  }
  
  // Team performance recommendations
  const criticalTeamCount = briefingData.teamPerformance.filter((member: any) => member.stats.status === 'critical').length;
  if (criticalTeamCount > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Team Support Initiative',
      description: `${criticalTeamCount} team members need immediate support. Schedule performance reviews and workload redistribution.`,
      owner: 'Team Leads',
      timeline: 'Next 2 days'
    });
  }
  
  // Process optimization
  if (briefingData.thisWeek.evidenceCompliancePercent < 85) {
    recommendations.push({
      priority: 'medium',
      title: 'Quality Process Review',
      description: `Evidence compliance at ${briefingData.thisWeek.evidenceCompliancePercent}%. Review DoD requirements and provide additional training.`,
      owner: 'Quality Team',
      timeline: 'Next week'
    });
  }
  
  return recommendations;
}

function generateNextWeekOutlook(briefingData: any) {
  const openTasks = briefingData.today.created - briefingData.today.completed;
  const followupTasks = briefingData.thisWeek.followupsCreated - briefingData.thisWeek.followupsCompleted;
  
  let outlook = `**Workload Forecast:**\n• ${openTasks} tasks carried forward\n• ${followupTasks} pending follow-ups\n• Expected new inbound: ~${Math.round(briefingData.thisWeek.created * 1.1)} (10% growth estimate)\n\n`;
  
  outlook += `**Focus Areas:**\n• Priority: Complete overdue items first\n• Quality: Maintain evidence compliance\n• Efficiency: Target <${briefingData.today.avgCycleTimeHours}h cycle time\n\n`;
  
  outlook += `**Success Metrics:**\n• Target >90% SLA compliance\n• Aim for >85% completion rate\n• Zero critical escalations`;
  
  return outlook;
}

function getTasksMissingEvidence(tasks: Task[]): Task[] {
  return tasks.filter(task => 
    task.status === 'IN_PROGRESS' && 
    task.playbookKey &&
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
