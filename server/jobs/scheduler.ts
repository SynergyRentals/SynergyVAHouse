import cron from 'node-cron';
import { checkSLABreaches, sendSLANudge } from '../services/sla';
import { checkOverdueFollowUps } from '../services/followup';
import { sendDailyVABriefings, sendPMVABriefings, sendManagerDigest, sendWeeklyManagerSummary } from '../services/briefings';
import { generateDailyMetrics } from '../services/metrics';
import { storage } from '../storage';
import { config } from '../config';

export function startScheduler() {
  console.log('Starting background job scheduler...');

  // SLA monitoring
  cron.schedule(config.jobs.slaCheck.interval, async () => {
    await checkSLABreaches();
  }, {
    timezone: config.jobs.slaCheck.timezone
  });

  // SLA nudges - check at same interval as SLA monitoring
  cron.schedule(config.jobs.slaCheck.interval, async () => {
    try {
      const tasks = await storage.getTasksForSLA();
      const now = new Date();
      
      for (const task of tasks) {
        if (!task.slaAt) continue;

        const timeToSLA = new Date(task.slaAt).getTime() - now.getTime();
        const minutesToSLA = Math.floor(timeToSLA / (1000 * 60));

        // Send nudge at configured minutes before deadline
        if (minutesToSLA === config.sla.nudgeMinutesBefore) {
          await sendSLANudge(task.id);
        }
      }
    } catch (error) {
      console.error('Error checking SLA nudges:', error);
    }
  }, {
    timezone: config.jobs.slaCheck.timezone
  });
  
  // Follow-up monitoring
  cron.schedule(config.jobs.followupCheck.interval, async () => {
    try {
      await checkOverdueFollowUps();
    } catch (error) {
      console.error('Error in follow-up monitoring:', error);
    }
  }, {
    timezone: config.jobs.followupCheck.timezone
  });
  
  // AM briefings for VAs
  cron.schedule(config.jobs.vaBriefingAm.schedule, async () => {
    await sendDailyVABriefings();
  }, {
    timezone: config.jobs.vaBriefingAm.timezone
  });

  // PM briefings for VAs
  cron.schedule(config.jobs.vaBriefingPm.schedule, async () => {
    await sendPMVABriefings();
  }, {
    timezone: config.jobs.vaBriefingPm.timezone
  });
  
  // Manager daily digest
  cron.schedule(config.jobs.managerDigest.schedule, async () => {
    await sendManagerDigest();
  }, {
    timezone: config.jobs.managerDigest.timezone
  });

  // Manager weekly summary
  cron.schedule(config.jobs.managerWeekly.schedule, async () => {
    await sendWeeklyManagerSummary();
  }, {
    timezone: config.jobs.managerWeekly.timezone
  });
  
  // Daily metrics generation
  cron.schedule(config.jobs.metricsGeneration.schedule, async () => {
    await generateDailyMetrics();
  }, {
    timezone: config.jobs.metricsGeneration.timezone
  });

  // Cleanup old audits
  cron.schedule(config.jobs.auditCleanup.schedule, async () => {
    console.log(`Running weekly cleanup (retention: ${config.retention.auditRetentionDays} days)...`);
    // TODO: Implement actual cleanup logic using config.retention.auditRetentionDays
  }, {
    timezone: config.jobs.auditCleanup.timezone
  });
  
  console.log('Scheduler started with all jobs configured');
}
