import { storage } from '../storage';
import type { User, Task } from '@shared/schema';

export async function generateDailyMetrics() {
  try {
    const users = await storage.getAllUsers();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    for (const user of users) {
      const userTasks = await storage.getTasksForUser(user.id);
      
      // Calculate daily metrics
      const created = userTasks.filter(task => 
        task.createdAt && 
        new Date(task.createdAt) >= yesterday && 
        new Date(task.createdAt) < today
      ).length;
      
      const completed = userTasks.filter(task => 
        task.status === 'DONE' &&
        task.updatedAt && 
        new Date(task.updatedAt) >= yesterday && 
        new Date(task.updatedAt) < today
      ).length;
      
      const overdue = userTasks.filter(task => 
        task.status !== 'DONE' && 
        task.dueAt && 
        new Date(task.dueAt) < today
      ).length;
      
      const slaBreaches = userTasks.filter(task => 
        task.slaAt && 
        new Date(task.slaAt) >= yesterday && 
        new Date(task.slaAt) < today &&
        task.status !== 'DONE'
      ).length;
      
      const reopens = await calculateReopens(user.id, yesterday, today);
      const followupsCreated = userTasks.filter(task => 
        task.category === 'follow_up' &&
        task.createdAt && 
        new Date(task.createdAt) >= yesterday && 
        new Date(task.createdAt) < today
      ).length;
      
      const counts = {
        created,
        completed,
        overdue,
        slaBreaches,
        reopens,
        followupsCreated
      };
      
      await storage.createMetricRollup({
        day: yesterday,
        userId: user.id,
        counts
      });
    }
    
    // Generate aggregate metrics
    const allTasks = await storage.getTasks();
    
    const aggregateCounts = {
      totalCreated: allTasks.filter(task => 
        task.createdAt && 
        new Date(task.createdAt) >= yesterday && 
        new Date(task.createdAt) < today
      ).length,
      
      totalCompleted: allTasks.filter(task => 
        task.status === 'DONE' &&
        task.updatedAt && 
        new Date(task.updatedAt) >= yesterday && 
        new Date(task.updatedAt) < today
      ).length,
      
      totalSLABreaches: allTasks.filter(task => 
        task.slaAt && 
        new Date(task.slaAt) >= yesterday && 
        new Date(task.slaAt) < today &&
        task.status !== 'DONE'
      ).length
    };
    
    await storage.createMetricRollup({
      day: yesterday,
      userId: null, // Aggregate metrics
      counts: aggregateCounts
    });
    
    console.log('Daily metrics generated');
  } catch (error) {
    console.error('Error generating daily metrics:', error);
  }
}

async function calculateReopens(userId: string, startDate: Date, endDate: Date): Promise<number> {
  try {
    const audits = await storage.getAuditsForEntity('task', '');
    
    // Find tasks that were marked as DONE and then reopened
    const reopenEvents = audits.filter(audit => 
      audit.action === 'updated' &&
      audit.actorId === userId &&
      audit.ts && 
      new Date(audit.ts) >= startDate && 
      new Date(audit.ts) < endDate &&
      audit.data &&
      (audit.data as any).updates?.status === 'OPEN' // Reopened
    );
    
    return reopenEvents.length;
  } catch (error) {
    console.error('Error calculating reopens:', error);
    return 0;
  }
}

export async function generateWeeklyScorecard(): Promise<any> {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const metrics = await storage.getMetrics(weekAgo, now);
    const allTasks = await storage.getTasks();
    const weeklyTasks = allTasks.filter(task => 
      task.createdAt && new Date(task.createdAt) > weekAgo
    );
    
    // Calculate key metrics
    const inboundTasks = weeklyTasks.length;
    const completedTasks = weeklyTasks.filter(task => task.status === 'DONE').length;
    const openTasks = weeklyTasks.filter(task => task.status !== 'DONE').length;
    
    // SLA metrics
    const tasksWithSLA = weeklyTasks.filter(task => task.slaAt);
    const slaBreaches = tasksWithSLA.filter(task => 
      task.slaAt && 
      new Date(task.slaAt) < now && 
      task.status !== 'DONE'
    ).length;
    
    const slaFirstResponsePercent = tasksWithSLA.length > 0 ? 
      Math.round(((tasksWithSLA.length - slaBreaches) / tasksWithSLA.length) * 100) : 100;
    
    // Cycle time (average time from creation to completion)
    const completedWithTimes = weeklyTasks.filter(task => 
      task.status === 'DONE' && task.createdAt && task.updatedAt
    );
    
    const avgCycleTime = completedWithTimes.length > 0 ? 
      completedWithTimes.reduce((sum, task) => {
        const cycleTime = new Date(task.updatedAt!).getTime() - new Date(task.createdAt!).getTime();
        return sum + cycleTime;
      }, 0) / completedWithTimes.length / (1000 * 60 * 60) : 0; // Convert to hours
    
    // Reopen rate
    const totalReopens = metrics.reduce((sum, metric) => {
      return sum + ((metric.counts as any).reopens || 0);
    }, 0);
    
    const reopenRate = completedTasks > 0 ? 
      Math.round((totalReopens / completedTasks) * 100) : 0;
    
    // Follow-up satisfaction
    const followupTasks = weeklyTasks.filter(task => task.category === 'follow_up');
    const satisfiedFollowups = followupTasks.filter(task => task.status === 'DONE');
    const followupSatisfactionPercent = followupTasks.length > 0 ? 
      Math.round((satisfiedFollowups.length / followupTasks.length) * 100) : 100;
    
    // Evidence completeness
    const tasksRequiringEvidence = weeklyTasks.filter(task => 
      task.status === 'DONE' && task.playbookKey
    );
    const tasksWithEvidence = tasksRequiringEvidence.filter(task => 
      task.evidence && Object.keys(task.evidence).length > 0
    );
    const evidenceCompletenessPercent = tasksRequiringEvidence.length > 0 ? 
      Math.round((tasksWithEvidence.length / tasksRequiringEvidence.length) * 100) : 100;
    
    // Project milestones (simplified)
    const projects = await storage.getProjects();
    const projectsOnTime = projects.filter(project => 
      !project.targetAt || new Date(project.targetAt) >= now
    ).length;
    const projectMilestonesOnTimePercent = projects.length > 0 ? 
      Math.round((projectsOnTime / projects.length) * 100) : 100;
    
    return {
      inboundTasks,
      completedTasks,
      openTasks,
      slaFirstResponsePercent,
      slaBreachCount: slaBreaches,
      avgCycleTimeHours: Math.round(avgCycleTime * 100) / 100,
      reopenRatePercent: reopenRate,
      followupCreatedVsSatisfied: `${followupTasks.length}/${satisfiedFollowups.length}`,
      evidenceCompletenessPercent,
      projectMilestonesOnTimePercent
    };
  } catch (error) {
    console.error('Error generating weekly scorecard:', error);
    return null;
  }
}

// Enhanced metrics for intelligent briefing content
export async function generateBriefingData(): Promise<any> {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const allTasks = await storage.getTasks();
    const users = await storage.getAllUsers();
    
    // Today's metrics
    const todayMetrics = await calculatePeriodMetrics(allTasks, yesterday, today);
    
    // Yesterday's metrics for comparison
    const yesterdayStart = new Date(yesterday.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayMetrics = await calculatePeriodMetrics(allTasks, yesterdayStart, yesterday);
    
    // Week-over-week comparison
    const thisWeekMetrics = await calculatePeriodMetrics(allTasks, weekAgo, now);
    const lastWeekMetrics = await calculatePeriodMetrics(allTasks, twoWeeksAgo, weekAgo);
    
    // Priority highlights
    const criticalIssues = await identifyCriticalIssues(allTasks, now);
    const successStories = await identifySuccessStories(allTasks, yesterday, today);
    const trendAnalysis = calculateTrends(todayMetrics, yesterdayMetrics, thisWeekMetrics, lastWeekMetrics);
    
    // Team performance with detailed insights
    const teamPerformance = await calculateTeamPerformance(users, allTasks, now);
    
    return {
      timestamp: now,
      today: todayMetrics,
      yesterday: yesterdayMetrics,
      thisWeek: thisWeekMetrics,
      lastWeek: lastWeekMetrics,
      trends: trendAnalysis,
      criticalIssues,
      successStories,
      teamPerformance,
      insights: generateInsights(todayMetrics, criticalIssues, trendAnalysis)
    };
  } catch (error) {
    console.error('Error generating briefing data:', error);
    return null;
  }
}

async function calculatePeriodMetrics(allTasks: Task[], startDate: Date, endDate: Date) {
  const periodTasks = allTasks.filter(task => {
    const createdAt = task.createdAt ? new Date(task.createdAt) : null;
    return createdAt && createdAt >= startDate && createdAt < endDate;
  });
  
  const completedTasks = periodTasks.filter(task => task.status === 'DONE');
  const overdueTasks = allTasks.filter(task => 
    task.status !== 'DONE' && 
    task.dueAt && 
    new Date(task.dueAt) < endDate
  );
  
  // SLA metrics
  const tasksWithSLA = periodTasks.filter(task => task.slaAt);
  const slaBreaches = tasksWithSLA.filter(task => {
    if (!task.slaAt) return false;
    const slaDate = new Date(task.slaAt);
    return slaDate >= startDate && slaDate < endDate && task.status !== 'DONE';
  });
  
  // Follow-up metrics
  const followupTasks = periodTasks.filter(task => task.category === 'follow_up');
  const completedFollowups = followupTasks.filter(task => task.status === 'DONE');
  const overdueFollowups = followupTasks.filter(task => 
    task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < endDate
  );
  
  // Evidence metrics
  const tasksNeedingEvidence = completedTasks.filter(task => task.playbookKey);
  const tasksWithEvidence = tasksNeedingEvidence.filter(task => 
    task.evidence && Object.keys(task.evidence).length > 0
  );
  
  // Calculate cycle times
  const cycleTimeHours = completedTasks
    .filter(task => task.createdAt && task.updatedAt)
    .map(task => {
      const created = new Date(task.createdAt!).getTime();
      const completed = new Date(task.updatedAt!).getTime();
      return (completed - created) / (1000 * 60 * 60);
    });
  
  const avgCycleTime = cycleTimeHours.length > 0 
    ? cycleTimeHours.reduce((a, b) => a + b, 0) / cycleTimeHours.length 
    : 0;
  
  return {
    created: periodTasks.length,
    completed: completedTasks.length,
    overdue: overdueTasks.length,
    slaTotal: tasksWithSLA.length,
    slaBreaches: slaBreaches.length,
    slaCompliancePercent: tasksWithSLA.length > 0 
      ? Math.round(((tasksWithSLA.length - slaBreaches.length) / tasksWithSLA.length) * 100) 
      : 100,
    followupsCreated: followupTasks.length,
    followupsCompleted: completedFollowups.length,
    followupsOverdue: overdueFollowups.length,
    evidenceCompliancePercent: tasksNeedingEvidence.length > 0 
      ? Math.round((tasksWithEvidence.length / tasksNeedingEvidence.length) * 100) 
      : 100,
    avgCycleTimeHours: Math.round(avgCycleTime * 100) / 100,
    completionRate: periodTasks.length > 0 
      ? Math.round((completedTasks.length / periodTasks.length) * 100) 
      : 0
  };
}

export async function identifyCriticalIssues(allTasks: Task[], now: Date) {
  const issues = [];
  
  // SLA breaches
  const slaBreaches = allTasks.filter(task => 
    task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < now
  );
  if (slaBreaches.length > 0) {
    issues.push({
      type: 'sla_breach',
      severity: 'critical',
      count: slaBreaches.length,
      description: `${slaBreaches.length} tasks have breached SLA`,
      tasks: slaBreaches.slice(0, 5) // Top 5 most critical
    });
  }
  
  // Long overdue tasks (more than 3 days)
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const longOverdue = allTasks.filter(task => 
    task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < threeDaysAgo
  );
  if (longOverdue.length > 0) {
    issues.push({
      type: 'long_overdue',
      severity: 'high',
      count: longOverdue.length,
      description: `${longOverdue.length} tasks overdue by more than 3 days`,
      tasks: longOverdue.slice(0, 5)
    });
  }
  
  // Blocked tasks
  const blockedTasks = allTasks.filter(task => task.status === 'BLOCKED');
  if (blockedTasks.length > 0) {
    issues.push({
      type: 'blocked',
      severity: 'medium',
      count: blockedTasks.length,
      description: `${blockedTasks.length} tasks are blocked`,
      tasks: blockedTasks.slice(0, 5)
    });
  }
  
  // High-priority overdue follow-ups
  const overdueFollowups = allTasks.filter(task => 
    task.category === 'follow_up' && 
    task.status !== 'DONE' && 
    task.dueAt && 
    new Date(task.dueAt) < now
  );
  if (overdueFollowups.length > 0) {
    issues.push({
      type: 'followup_overdue',
      severity: 'high',
      count: overdueFollowups.length,
      description: `${overdueFollowups.length} follow-ups are overdue`,
      tasks: overdueFollowups.slice(0, 5)
    });
  }
  
  return issues.sort((a, b) => {
    const severityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
    return (severityOrder[b.severity as keyof typeof severityOrder] || 0) - 
           (severityOrder[a.severity as keyof typeof severityOrder] || 0);
  });
}

async function identifySuccessStories(allTasks: Task[], startDate: Date, endDate: Date) {
  const stories = [];
  
  // Fast completions (under 2 hours)
  const fastCompletions = allTasks.filter(task => {
    if (task.status !== 'DONE' || !task.createdAt || !task.updatedAt) return false;
    const created = new Date(task.createdAt);
    const completed = new Date(task.updatedAt);
    const cycleHours = (completed.getTime() - created.getTime()) / (1000 * 60 * 60);
    return created >= startDate && created < endDate && cycleHours < 2;
  });
  
  if (fastCompletions.length > 0) {
    stories.push({
      type: 'fast_completion',
      count: fastCompletions.length,
      description: `${fastCompletions.length} tasks completed in under 2 hours`,
      tasks: fastCompletions.slice(0, 3)
    });
  }
  
  // High-priority completions
  const highPriorityCompletions = allTasks.filter(task => {
    if (task.status !== 'DONE' || !task.updatedAt) return false;
    const completed = new Date(task.updatedAt);
    return completed >= startDate && completed < endDate && task.priority === 1;
  });
  
  if (highPriorityCompletions.length > 0) {
    stories.push({
      type: 'high_priority_completion',
      count: highPriorityCompletions.length,
      description: `${highPriorityCompletions.length} high-priority tasks completed`,
      tasks: highPriorityCompletions.slice(0, 3)
    });
  }
  
  return stories;
}

function calculateTrends(today: any, yesterday: any, thisWeek: any, lastWeek: any) {
  return {
    dailyCompletion: {
      current: today.completed,
      previous: yesterday.completed,
      change: today.completed - yesterday.completed,
      changePercent: yesterday.completed > 0 
        ? Math.round(((today.completed - yesterday.completed) / yesterday.completed) * 100) 
        : 0
    },
    slaCompliance: {
      current: today.slaCompliancePercent,
      previous: yesterday.slaCompliancePercent,
      change: today.slaCompliancePercent - yesterday.slaCompliancePercent
    },
    weeklyThroughput: {
      current: thisWeek.completed,
      previous: lastWeek.completed,
      change: thisWeek.completed - lastWeek.completed,
      changePercent: lastWeek.completed > 0 
        ? Math.round(((thisWeek.completed - lastWeek.completed) / lastWeek.completed) * 100) 
        : 0
    },
    cycleTime: {
      current: today.avgCycleTimeHours,
      previous: yesterday.avgCycleTimeHours,
      change: today.avgCycleTimeHours - yesterday.avgCycleTimeHours,
      trend: today.avgCycleTimeHours < yesterday.avgCycleTimeHours ? 'improving' : 'stable'
    }
  };
}

async function calculateTeamPerformance(users: User[], allTasks: Task[], now: Date) {
  const performance = [];
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  for (const user of users) {
    const userTasks = allTasks.filter(task => task.assigneeId === user.id);
    const recentTasks = userTasks.filter(task => {
      const created = task.createdAt ? new Date(task.createdAt) : null;
      return created && created >= last24h;
    });
    
    const completed = recentTasks.filter(task => task.status === 'DONE').length;
    const overdue = userTasks.filter(task => 
      task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < now
    ).length;
    const slaBreaches = userTasks.filter(task => 
      task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < now
    ).length;
    
    // Performance status
    let status = 'good';
    if (slaBreaches > 0) status = 'critical';
    else if (overdue > 3) status = 'warning';
    
    performance.push({
      user,
      stats: {
        totalActive: userTasks.filter(task => task.status !== 'DONE').length,
        completedToday: completed,
        overdue,
        slaBreaches,
        avgResponseTime: await calculateUserAvgResponseTime(user.id, allTasks),
        status
      }
    });
  }
  
  return performance.sort((a, b) => {
    const statusOrder = { critical: 3, warning: 2, good: 1 };
    return (statusOrder[b.stats.status as keyof typeof statusOrder] || 0) - 
           (statusOrder[a.stats.status as keyof typeof statusOrder] || 0);
  });
}

async function calculateUserAvgResponseTime(userId: string, allTasks: Task[]) {
  const userTasks = allTasks.filter(task => 
    task.assigneeId === userId && 
    task.createdAt && 
    task.updatedAt &&
    task.status === 'DONE'
  );
  
  if (userTasks.length === 0) return 0;
  
  const totalHours = userTasks.reduce((sum, task) => {
    const created = new Date(task.createdAt!).getTime();
    const updated = new Date(task.updatedAt!).getTime();
    return sum + (updated - created) / (1000 * 60 * 60);
  }, 0);
  
  return Math.round((totalHours / userTasks.length) * 100) / 100;
}

function generateInsights(todayMetrics: any, criticalIssues: any[], trendAnalysis: any) {
  const insights = [];
  
  // Performance insights
  if (todayMetrics.completionRate > 80) {
    insights.push({ type: 'positive', message: 'High completion rate achieved today' });
  } else if (todayMetrics.completionRate < 50) {
    insights.push({ type: 'concern', message: 'Low completion rate needs attention' });
  }
  
  // SLA insights
  if (todayMetrics.slaCompliancePercent >= 95) {
    insights.push({ type: 'positive', message: 'Excellent SLA performance' });
  } else if (todayMetrics.slaCompliancePercent < 80) {
    insights.push({ type: 'concern', message: 'SLA compliance below target' });
  }
  
  // Trend insights
  if (trendAnalysis.dailyCompletion.change > 0) {
    insights.push({ type: 'positive', message: `Daily completions up by ${trendAnalysis.dailyCompletion.change}` });
  }
  
  // Critical issue insights
  if (criticalIssues.length > 0) {
    const critical = criticalIssues.filter(issue => issue.severity === 'critical').length;
    if (critical > 0) {
      insights.push({ type: 'urgent', message: `${critical} critical issues require immediate attention` });
    }
  }
  
  return insights;
}

export async function exportScorecardToSheets(scorecard: any): Promise<string> {
  // This would integrate with Google Sheets API
  // For now, return a CSV format string
  
  const csvData = [
    ['Metric', 'Value'],
    ['Inbound Tasks', scorecard.inboundTasks],
    ['Completed Tasks', scorecard.completedTasks],
    ['Open Tasks', scorecard.openTasks],
    ['SLA First Response %', `${scorecard.slaFirstResponsePercent}%`],
    ['SLA Breach Count', scorecard.slaBreachCount],
    ['Avg Cycle Time (hours)', scorecard.avgCycleTimeHours],
    ['Reopen Rate %', `${scorecard.reopenRatePercent}%`],
    ['Follow-ups Created/Satisfied', scorecard.followupCreatedVsSatisfied],
    ['Evidence Completeness %', `${scorecard.evidenceCompletenessPercent}%`],
    ['Project Milestones On Time %', `${scorecard.projectMilestonesOnTimePercent}%`]
  ];
  
  return csvData.map(row => row.join(',')).join('\n');
}
