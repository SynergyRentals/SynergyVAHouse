import { storage } from '../storage';
import { getSlackApp } from '../slack/bolt';

const FOLLOWUP_PATTERNS = [
  /\bI'?ll\b/i,
  /\bon it\b/i,
  /\bETA\b/i,
  /\bupdate by\b/i,
  /\bwill get back\b/i,
  /\blet me check\b/i,
  /\bworking on\b/i,
  /\bhandle this\b/i
];

export async function checkForFollowUpPromises(message: any, channelId: string) {
  try {
    // Check if message contains follow-up patterns
    const hasFollowUpPattern = FOLLOWUP_PATTERNS.some(pattern => 
      pattern.test(message.text || '')
    );
    
    if (!hasFollowUpPattern) return;
    
    const user = await storage.getUserBySlackId(message.user);
    if (!user) return;
    
    // Create follow-up task
    const followUpTime = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours
    
    const task = await storage.createTask({
      type: 'reactive',
      title: `Follow-up: ${message.text?.substring(0, 50)}...`,
      category: 'followup',
      status: 'OPEN',
      assigneeId: user.id,
      dueAt: followUpTime,
      sourceKind: 'slack',
      sourceId: message.ts,
      sourceUrl: `https://slack.com/archives/${channelId}/p${message.ts.replace('.', '')}`,
      createdBy: 'followup_catcher'
    });
    
    await storage.createAudit({
      entity: 'task',
      entityId: task.id,
      action: 'created_followup',
      data: { 
        originalMessage: message.text,
        followUpTime,
        detectedPatterns: FOLLOWUP_PATTERNS.filter(p => p.test(message.text || ''))
      }
    });
    
    // Reply to thread
    const slackApp = getSlackApp();
    if (slackApp) {
      await slackApp.client.chat.postMessage({
        channel: channelId,
        thread_ts: message.ts,
        text: `📋 Follow-up created! I'll remind you at ${followUpTime.toLocaleTimeString()} if no update is provided.`
      });
    }
    
    console.log(`Follow-up task created: ${task.id}`);
  } catch (error) {
    console.error('Error creating follow-up task:', error);
  }
}

export async function checkOverdueFollowUps() {
  try {
    const followUpTasks = await storage.getTasks({ 
      category: 'followup',
      status: 'OPEN'
    });
    
    const now = new Date();
    const slackApp = getSlackApp();
    
    for (const task of followUpTasks) {
      if (!task.dueAt || new Date(task.dueAt) > now) continue;
      
      const assignee = task.assigneeId ? await storage.getUser(task.assigneeId) : null;
      if (!assignee) continue;
      
      // Check if there's been any update since follow-up was created
      const comments = await storage.getCommentsForTask(task.id);
      const hasUpdate = comments.length > 0;
      
      if (hasUpdate) {
        // Mark as completed if there's been an update
        await storage.updateTask(task.id, { status: 'DONE' });
        continue;
      }
      
      // Send reminder
      if (slackApp) {
        await slackApp.client.chat.postMessage({
          channel: assignee.slackId,
          text: `⏰ Follow-up reminder: You mentioned you'd update on "${task.title.replace('Follow-up: ', '')}".\n\nSource: ${task.sourceUrl}`
        });
      }
      
      // Update task to prevent repeated reminders
      await storage.updateTask(task.id, { 
        status: 'WAITING',
        evidence: { 
          ...task.evidence, 
          reminderSent: true, 
          reminderSentAt: now 
        }
      });
      
      await storage.createAudit({
        entity: 'task',
        entityId: task.id,
        action: 'followup_reminder_sent',
        data: { reminderSentAt: now }
      });
      
      console.log(`Follow-up reminder sent for task ${task.id}`);
    }
  } catch (error) {
    console.error('Error checking overdue follow-ups:', error);
  }
}

export async function satisfyFollowUp(taskId: string, updateText: string) {
  try {
    await storage.updateTask(taskId, { status: 'DONE' });
    
    await storage.createComment({
      taskId,
      body: updateText,
      authorId: undefined // System comment
    });
    
    await storage.createAudit({
      entity: 'task',
      entityId: taskId,
      action: 'followup_satisfied',
      data: { updateText }
    });
    
    console.log(`Follow-up satisfied for task ${taskId}`);
  } catch (error) {
    console.error('Error satisfying follow-up:', error);
  }
}
