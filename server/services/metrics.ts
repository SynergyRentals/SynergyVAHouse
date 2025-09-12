import { storage } from '../storage';

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
        task.category === 'followup' &&
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
    const followupTasks = weeklyTasks.filter(task => task.category === 'followup');
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
