import cron from 'node-cron';
import { checkSLABreaches, sendSLANudge } from '../services/sla';
import { checkOverdueFollowUps } from '../services/followup';
import { sendDailyVABriefings, sendPMVABriefings, sendManagerDigest, sendWeeklyManagerSummary } from '../services/briefings';
import { generateDailyMetrics } from '../services/metrics';
import { storage } from '../storage';

export function startScheduler() {
  console.log('Starting background job scheduler...');
  
  // SLA monitoring - every minute
  cron.schedule('* * * * *', async () => {
    await checkSLABreaches();
  });
  
  // SLA nudges - check every minute, send nudge at T-5
  cron.schedule('* * * * *', async () => {
    try {
      const tasks = await storage.getTasksForSLA();
      const now = new Date();
      
      for (const task of tasks) {
        if (!task.slaAt) continue;
        
        const timeToSLA = new Date(task.slaAt).getTime() - now.getTime();
        const minutesToSLA = Math.floor(timeToSLA / (1000 * 60));
        
        // Send nudge at exactly 5 minutes before
        if (minutesToSLA === 5) {
          await sendSLANudge(task.id);
        }
      }
    } catch (error) {
      console.error('Error checking SLA nudges:', error);
    }
  });
  
  // Follow-up monitoring - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await checkOverdueFollowUps();
    } catch (error) {
      console.error('Error in follow-up monitoring:', error);
    }
  });
  
  // AM briefings for VAs - 08:00 Manila time (weekdays)
  cron.schedule('0 8 * * 1-5', async () => {
    await sendDailyVABriefings();
  }, {
    timezone: 'Asia/Manila'
  });
  
  // PM briefings for VAs - 18:00 Manila time (weekdays)
  cron.schedule('0 18 * * 1-5', async () => {
    await sendPMVABriefings();
  }, {
    timezone: 'Asia/Manila'
  });
  
  // Manager daily digest - 09:00 Chicago time (weekdays)
  cron.schedule('0 9 * * 1-5', async () => {
    await sendManagerDigest();
  }, {
    timezone: 'America/Chicago'
  });
  
  // Manager weekly summary - Monday 09:00 Chicago time  
  cron.schedule('0 9 * * 1', async () => {
    await sendWeeklyManagerSummary();
  }, {
    timezone: 'America/Chicago'
  });
  
  // Daily metrics generation - 01:00 Manila time
  cron.schedule('0 1 * * *', async () => {
    await generateDailyMetrics();
  }, {
    timezone: 'Asia/Manila'
  });
  
  // Cleanup old audits - weekly on Sunday at 02:00
  cron.schedule('0 2 * * 0', async () => {
    // Clean up audits older than 90 days
    console.log('Running weekly cleanup...');
  });
  
  console.log('Scheduler started with all jobs configured');
}
