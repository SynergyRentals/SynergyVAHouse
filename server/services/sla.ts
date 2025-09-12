import { storage } from '../storage';
import { getSlackApp } from '../slack/bolt';

export async function startSLATimer(taskId: string, playbook: any) {
  try {
    const playbookContent = playbook.content as any;
    const slaMinutes = playbookContent.sla?.first_response_minutes || 10;
    
    const slaAt = new Date(Date.now() + slaMinutes * 60 * 1000);
    
    await storage.updateTask(taskId, { slaAt });
    
    console.log(`SLA timer started for task ${taskId}: ${slaMinutes} minutes`);
  } catch (error) {
    console.error('Error starting SLA timer:', error);
  }
}

export async function checkSLABreaches() {
  try {
    const tasks = await storage.getTasksForSLA();
    const now = new Date();
    const slackApp = getSlackApp();
    
    for (const task of tasks) {
      if (!task.slaAt || new Date(task.slaAt) > now) continue;
      
      // Check if already escalated
      const audits = await storage.getAuditsForEntity('task', task.id);
      const alreadyEscalated = audits.some(audit => audit.action === 'sla_breach_escalated');
      
      if (alreadyEscalated) continue;
      
      // Escalate SLA breach
      await escalateSLABreach(task, slackApp);
      
      // Mark as escalated
      await storage.createAudit({
        entity: 'task',
        entityId: task.id,
        action: 'sla_breach_escalated',
        data: { slaAt: task.slaAt, breachTime: now }
      });
    }
  } catch (error) {
    console.error('Error checking SLA breaches:', error);
  }
}

async function escalateSLABreach(task: any, slackApp: any) {
  try {
    const assignee = task.assigneeId ? await storage.getUser(task.assigneeId) : null;
    const playbook = task.playbookKey ? await storage.getPlaybook(task.playbookKey) : null;
    
    const escalationChannel = playbook?.content?.sla?.breach_escalate_to || '#triage';
    const breachMinutes = Math.floor((new Date().getTime() - new Date(task.slaAt).getTime()) / (1000 * 60));
    
    const message = {
      channel: escalationChannel.replace('#', ''),
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 SLA Breach Alert'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Task:* ${task.title}\n*Category:* ${task.category}\n*Breach Time:* ${breachMinutes} minutes overdue`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Assignee:* ${assignee ? `<@${assignee.slackId}>` : 'Unassigned'}\n*Lead:* <@${process.env.MANAGER_SLACK_ID || 'UJOREL'}>`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Task'
              },
              action_id: 'view_task',
              value: task.id,
              style: 'danger'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Take Ownership'
              },
              action_id: 'take_ownership',
              value: task.id
            }
          ]
        }
      ]
    };

    if (slackApp && slackApp.client) {
      await slackApp.client.chat.postMessage(message);
    }
    
    console.log(`SLA breach escalated for task ${task.id}`);
  } catch (error) {
    console.error('Error escalating SLA breach:', error);
  }
}

export async function sendSLANudge(taskId: string) {
  try {
    const task = await storage.getTask(taskId);
    if (!task || !task.assigneeId) return;
    
    const assignee = await storage.getUser(task.assigneeId);
    if (!assignee) return;
    
    const slackApp = getSlackApp();
    if (!slackApp) return;
    
    const minutesRemaining = Math.floor((new Date(task.slaAt!).getTime() - new Date().getTime()) / (1000 * 60));
    
    await slackApp.client.chat.postMessage({
      channel: assignee.slackId,
      text: `⏰ SLA Reminder: Task "${task.title}" is due in ${minutesRemaining} minutes`
    });
    
    console.log(`SLA nudge sent for task ${taskId}`);
  } catch (error) {
    console.error('Error sending SLA nudge:', error);
  }
}
