import { storage } from '../storage';
import { getSlackApp } from '../slack/bolt';
import { config } from '../config';

// Comprehensive promise detection patterns
const PROMISE_PATTERNS = [
  // Direct commitment patterns
  /\bI'?ll\s+(get back|update|follow up|check|handle|look into|investigate|respond)/i,
  /\bwill\s+(get back|update|follow up|check|handle|look into|investigate|respond)/i,
  /\bon it\b/i,
  /\bETA\b/i,
  /\bupdate by\b/i,
  /\bwill get back\b/i,
  /\blet me check\b/i,
  /\bworking on\b/i,
  /\bhandle this\b/i,
  /\bgive me.*(?:time|minute|hour|day)/i,
  /\blet me.*(?:check|look|investigate|follow up)/i,
  
  // Time-bound commitments
  /\b(?:by|before)\s+(?:tomorrow|today|tonight|end of day|eod|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+(?:am|pm))/i,
  /\bin\s+(?:a few|\d+)\s*(?:minutes?|hours?|days?)/i,
  /\bnext\s+(?:week|monday|tuesday|wednesday|thursday|friday)/i,
  /\bthis\s+(?:afternoon|evening|week)/i,
  /\bwithin\s+(?:a few|\d+)\s*(?:minutes?|hours?|days?)/i,
  
  // Action commitments
  /\bI'll\s+(?:reach out|contact|call|email|send|provide|deliver)/i,
  /\bshould have.*(?:by|before)/i,
  /\bwill have.*(?:by|before)/i,
  /\bexpect.*(?:by|before)/i,
  /\btarget.*(?:by|before)/i,
  /\baiming for/i
];

// Time extraction patterns
const TIME_PATTERNS = {
  // Absolute times
  specific_time: /\b(?:by|before)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
  end_of_day: /\b(?:by|before)\s+(?:end of day|eod|tonight)/i,
  tomorrow: /\b(?:by|before)?\s*tomorrow/i,
  today: /\b(?:by|before)?\s*(?:today|this afternoon|this evening)/i,
  
  // Relative times
  in_minutes: /\bin\s+(\d+)\s*(?:minutes?|mins?)/i,
  in_hours: /\bin\s+(\d+)\s*(?:hours?|hrs?)/i,
  in_days: /\bin\s+(\d+)\s*days?/i,
  
  // Weekly references
  next_week: /\bnext\s+week/i,
  this_week: /\bthis\s+week/i,
  specific_day: /\b(?:next|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  
  // Vague timeframes
  few_minutes: /\bin\s+a\s+few\s+minutes?/i,
  few_hours: /\bin\s+a\s+few\s+hours?/i,
  later_today: /\blater\s+today/i,
  
  // Business timeframes
  within_timeframe: /\bwithin\s+(\d+)\s*(?:minutes?|hours?|days?|weeks?)/i
};

// Enhanced promise detection with sophisticated timeframe extraction
export async function detectAndCreateFollowUp(message: any, channelId: string, threadTs?: string) {
  try {
    const messageText = message.text || '';
    
    // Check if message contains promise patterns
    const detectedPatterns = PROMISE_PATTERNS.filter(pattern => pattern.test(messageText));
    if (detectedPatterns.length === 0) return null;
    
    const user = await storage.getUserBySlackId(message.user);
    if (!user) return null;
    
    // Check for existing follow-ups to prevent duplicates
    const existingFollowUps = await storage.getTasks({
      category: 'follow_up',
      status: ['OPEN', 'IN_PROGRESS'],
      sourceId: threadTs || message.ts,
      assigneeId: user.id
    });
    
    if (existingFollowUps.length > 0) {
      console.log(`Duplicate follow-up prevented: User ${user.name} already has ${existingFollowUps.length} open follow-up(s) for this thread/message`);
      return null;
    }
    
    // Extract timeframe from message
    const extractedTimeframe = extractTimeframe(messageText);
    const dueDate = calculateDueDate(extractedTimeframe);
    
    // Extract promise text (the specific commitment made)
    const promiseText = extractPromiseText(messageText, detectedPatterns);
    
    // Get thread context if this is part of a thread
    const threadContext = await getThreadContext(channelId, threadTs || message.thread_ts);
    
    // Create follow-up task with rich metadata
    const task = await storage.createTask({
      type: 'follow_up',
      title: `Follow-up: ${promiseText}`,
      category: 'follow_up',
      status: 'OPEN',
      priority: determineFollowUpPriority(extractedTimeframe),
      assigneeId: user.id,
      dueAt: dueDate,
      sourceKind: 'slack',
      sourceId: message.ts,
      sourceUrl: `https://slack.com/archives/${channelId}/p${message.ts.replace('.', '')}`,
      playbookKey: 'follow_up_v1',
      followUpMetadata: {
        originalMessage: messageText,
        promiseText,
        extractedTimeframe,
        threadContext,
        detectedPatterns: detectedPatterns.map(p => p.toString()),
        channelId,
        participants: threadContext?.participants || [user.slackId]
      },
      createdBy: 'follow_up_detector'
    });
    
    await storage.createAudit({
      entity: 'task',
      entityId: task.id,
      action: 'follow_up_auto_created',
      actorId: user.id,
      data: { 
        originalMessage: messageText,
        extractedTimeframe,
        dueDate,
        detectedPatterns: detectedPatterns.map(p => p.toString())
      }
    });
    
    // React to message to indicate follow-up was detected
    const slackApp = getSlackApp();
    if (slackApp) {
      await slackApp.client.reactions.add({
        channel: channelId,
        timestamp: message.ts,
        name: 'alarm_clock'
      });
      
      // Post thread reply with follow-up details
      await slackApp.client.chat.postMessage({
        channel: channelId,
        thread_ts: message.ts,
        text: `⏰ Follow-up detected! I'll remind you ${formatDueDate(dueDate)} if no update is provided.\n\n*Promise:* "${promiseText}"\n*Task ID:* ${task.id}`
      });
    }
    
    console.log(`Follow-up task created: ${task.id} for promise: "${promiseText}"`);
    return task;
  } catch (error) {
    console.error('Error creating follow-up task:', error);
    return null;
  }
}

// Legacy function for backwards compatibility
export async function checkForFollowUpPromises(message: any, channelId: string) {
  return await detectAndCreateFollowUp(message, channelId);
}

// Enhanced follow-up monitoring with staged reminders
export async function checkOverdueFollowUps() {
  try {
    const followUpTasks = await storage.getTasks({ 
      category: 'follow_up',
      status: ['OPEN', 'IN_PROGRESS']
    });
    
    const now = new Date();
    const slackApp = getSlackApp();
    
    for (const task of followUpTasks) {
      if (!task.dueAt) continue;
      
      const dueDate = new Date(task.dueAt);
      const timeToDeadline = dueDate.getTime() - now.getTime();
      const hoursToDeadline = timeToDeadline / (1000 * 60 * 60);
      
      const assignee = task.assigneeId ? await storage.getUser(task.assigneeId) : null;
      if (!assignee) continue;
      
      const metadata = task.followUpMetadata as any || {};
      const evidence = task.evidence as any || {};
      
      // Check for T-24h reminder - robust threshold logic
      if (hoursToDeadline <= config.followup.reminder24hThreshold && !evidence.reminder_24h_sent) {
        try {
          await sendFollowUpReminder(task, assignee, '24-hour', slackApp);
          await markReminderSent(task.id, 'reminder_24h_sent');
          console.log(`24-hour reminder sent for follow-up task ${task.id}`);
        } catch (error) {
          console.error(`Failed to send 24-hour reminder for task ${task.id}:`, error);
        }
      }
      
      // Check for T-4h reminder - robust threshold logic
      if (hoursToDeadline <= config.followup.reminder4hThreshold && !evidence.reminder_4h_sent) {
        try {
          await sendFollowUpReminder(task, assignee, '4-hour', slackApp);
          await markReminderSent(task.id, 'reminder_4h_sent');
          console.log(`4-hour reminder sent for follow-up task ${task.id}`);
        } catch (error) {
          console.error(`Failed to send 4-hour reminder for task ${task.id}:`, error);
        }
      }
      
      // Check for T-1h reminder - robust threshold logic
      if (hoursToDeadline <= config.followup.reminder1hThreshold && hoursToDeadline > 0 && !evidence.reminder_1h_sent) {
        try {
          await sendFollowUpReminder(task, assignee, '1-hour', slackApp);
          await markReminderSent(task.id, 'reminder_1h_sent');
          console.log(`1-hour reminder sent for follow-up task ${task.id}`);
        } catch (error) {
          console.error(`Failed to send 1-hour reminder for task ${task.id}:`, error);
        }
      }
      
      // Check for overdue escalation - robust threshold logic
      if (timeToDeadline <= 0 && !evidence.overdue_escalated) {
        try {
          await escalateOverdueFollowUp(task, assignee, slackApp);
          await markReminderSent(task.id, 'overdue_escalated');
          console.log(`Overdue escalation sent for follow-up task ${task.id}`);
        } catch (error) {
          console.error(`Failed to escalate overdue follow-up task ${task.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error checking overdue follow-ups:', error);
  }
}

// Send staged follow-up reminders
async function sendFollowUpReminder(task: any, assignee: any, reminderType: string, slackApp: any) {
  if (!slackApp) return;
  
  try {
    // Open DM channel first to ensure proper channel ID
    const dmResult = await slackApp.client.conversations.open({
      users: assignee.slackId
    });
    
    if (!dmResult.ok || !dmResult.channel?.id) {
      console.error(`Failed to open DM channel for user ${assignee.slackId}`);
      return;
    }
    
    const dmChannelId = dmResult.channel.id;
    const metadata = task.followUpMetadata as any || {};
  const urgencyEmoji = reminderType === '1-hour' ? '🚨' : 
                      reminderType === '4-hour' ? '⚠️' : '⏰';
  
  const message = {
    channel: dmChannelId,
    text: `${urgencyEmoji} Follow-up reminder (${reminderType})`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${urgencyEmoji} Follow-up Reminder (${reminderType})`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Promise:* "${metadata.promiseText || task.title}"\n*Due:* ${new Date(task.dueAt).toLocaleString()}\n*Source:* <${task.sourceUrl}|View original message>`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Mark Complete'
            },
            action_id: 'complete_followup',
            value: task.id,
            style: 'primary'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Extend Deadline'
            },
            action_id: 'extend_followup',
            value: task.id
          }
        ]
      }
    ]
  };
  
    await slackApp.client.chat.postMessage(message);
    console.log(`${reminderType} reminder sent for follow-up task ${task.id}`);
  } catch (error) {
    console.error(`Failed to send ${reminderType} reminder for task ${task.id}:`, error);
    throw error;
  }
}

// Escalate overdue follow-ups
async function escalateOverdueFollowUp(task: any, assignee: any, slackApp: any) {
  if (!slackApp) return;
  
  const metadata = task.followUpMetadata as any || {};
  const escalationChannel = process.env.TRIAGE_CHANNEL || config.defaults.triageChannelId;
  
  const escalationMessage = {
    channel: escalationChannel,
    text: `🚨 Overdue Follow-up Alert`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 Overdue Follow-up Alert'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Assignee:* <@${assignee.slackId}>\n*Promise:* "${metadata.promiseText || task.title}"\n*Due:* ${new Date(task.dueAt).toLocaleString()}\n*Source:* <${task.sourceUrl}|View original message>`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Take Ownership'
            },
            action_id: 'take_followup_ownership',
            value: task.id,
            style: 'danger'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Mark Complete'
            },
            action_id: 'complete_followup',
            value: task.id
          }
        ]
      }
    ]
  };
  
  await slackApp.client.chat.postMessage(escalationMessage);
  
  // Also notify the assignee via DM
  try {
    const dmResult = await slackApp.client.conversations.open({
      users: assignee.slackId
    });
    
    if (dmResult.ok && dmResult.channel?.id) {
      await slackApp.client.chat.postMessage({
        channel: dmResult.channel.id,
        text: `🚨 Your follow-up commitment is overdue and has been escalated to the triage team.\n\n*Promise:* "${metadata.promiseText}"\n*Source:* <${task.sourceUrl}|View original message>`
      });
    }
  } catch (dmError) {
    console.error(`Failed to send DM to assignee ${assignee.slackId} for escalation:`, dmError);
  }
  
  console.log(`Overdue follow-up escalated for task ${task.id}`);
}

// Mark reminder as sent
async function markReminderSent(taskId: string, reminderField: string) {
  const task = await storage.getTask(taskId);
  if (!task) return;
  
  const updatedEvidence = {
    ...task.evidence as any,
    [reminderField]: true,
    [`${reminderField}_at`]: new Date()
  };
  
  await storage.updateTask(taskId, { evidence: updatedEvidence });
  
  await storage.createAudit({
    entity: 'task',
    entityId: taskId,
    action: `followup_${reminderField}`,
    data: { sentAt: new Date() }
  });
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

// Extract timeframe information from message text
function extractTimeframe(messageText: string): any {
  const timeframe: any = {
    type: 'default',
    value: null,
    unit: null,
    confidence: 'low'
  };
  
  // Check for specific time patterns
  for (const [patternName, pattern] of Object.entries(TIME_PATTERNS)) {
    const match = messageText.match(pattern);
    if (match) {
      timeframe.type = patternName;
      timeframe.confidence = 'high';
      
      // Extract numeric values where applicable
      if (match[1] && /\d+/.test(match[1])) {
        timeframe.value = parseInt(match[1]);
        timeframe.unit = patternName.includes('minute') ? 'minutes' :
                        patternName.includes('hour') ? 'hours' :
                        patternName.includes('day') ? 'days' : 
                        patternName.includes('week') ? 'weeks' : null;
      }
      
      // Store the matched text for reference
      timeframe.matchedText = match[0];
      break;
    }
  }
  
  return timeframe;
}

// Calculate due date based on extracted timeframe
function calculateDueDate(timeframe: any): Date {
  const now = new Date();
  const defaultHours = config.followup.defaultHours;
  
  switch (timeframe.type) {
    case 'specific_time':
      // Parse specific time (e.g., "by 5pm")
      const timeMatch = timeframe.matchedText?.match(/\d{1,2}(?::\d{2})?\s*(?:am|pm)/i);
      if (timeMatch) {
        const targetTime = parseTime(timeMatch[0]);
        if (targetTime > now) {
          return targetTime;
        } else {
          // If time has passed today, assume tomorrow
          targetTime.setDate(targetTime.getDate() + 1);
          return targetTime;
        }
      }
      break;
      
    case 'end_of_day':
      const eod = new Date(now);
      eod.setHours(config.defaultTimes.endOfDayHour, 0, 0, 0);
      return eod > now ? eod : new Date(eod.getTime() + 24 * 60 * 60 * 1000);
      
    case 'tomorrow':
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(config.defaultTimes.defaultStartHour, 0, 0, 0);
      return tomorrow;
      
    case 'today':
    case 'later_today':
      const laterToday = new Date(now.getTime() + config.followup.defaultHours * 60 * 60 * 1000);
      return laterToday;
      
    case 'in_minutes':
      return new Date(now.getTime() + (timeframe.value || 30) * 60 * 1000);
      
    case 'in_hours':
      return new Date(now.getTime() + (timeframe.value || 2) * 60 * 60 * 1000);
      
    case 'in_days':
      return new Date(now.getTime() + (timeframe.value || 1) * 24 * 60 * 60 * 1000);
      
    case 'next_week':
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(config.defaultTimes.defaultStartHour, 0, 0, 0);
      return nextWeek;
      
    case 'this_week':
      const endOfWeek = new Date(now);
      endOfWeek.setDate(endOfWeek.getDate() + (5 - endOfWeek.getDay())); // Friday
      endOfWeek.setHours(config.defaultTimes.weekEndHour, 0, 0, 0);
      return endOfWeek;
      
    case 'specific_day':
      return calculateSpecificDay(timeframe.matchedText, now);
      
    case 'few_minutes':
      return new Date(now.getTime() + config.followup.defaultFewMinutesMs);

    case 'few_hours':
      return new Date(now.getTime() + config.followup.defaultFewHoursMs);
      
    case 'within_timeframe':
      const multiplier = timeframe.unit === 'minutes' ? 60 * 1000 :
                        timeframe.unit === 'hours' ? 60 * 60 * 1000 :
                        timeframe.unit === 'days' ? 24 * 60 * 60 * 1000 :
                        timeframe.unit === 'weeks' ? 7 * 24 * 60 * 60 * 1000 :
                        60 * 60 * 1000; // Default to hours
      return new Date(now.getTime() + (timeframe.value || 1) * multiplier);
      
    default:
      // Default fallback: 4 hours from now
      return new Date(now.getTime() + defaultHours * 60 * 60 * 1000);
  }
  
  return new Date(now.getTime() + defaultHours * 60 * 60 * 1000);
}

// Parse time string like "5pm" or "2:30pm"
function parseTime(timeStr: string): Date {
  const now = new Date();
  const timeMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  
  if (!timeMatch) return new Date(now.getTime() + 4 * 60 * 60 * 1000);
  
  let hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2] || '0');
  const ampm = timeMatch[3].toLowerCase();
  
  if (ampm === 'pm' && hours !== 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;
  
  const targetTime = new Date(now);
  targetTime.setHours(hours, minutes, 0, 0);
  
  return targetTime;
}

// Calculate date for specific day mentions
function calculateSpecificDay(dayText: string, now: Date): Date {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayMatch = dayText?.toLowerCase().match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  
  if (!dayMatch) return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  const targetDayIndex = days.indexOf(dayMatch[1]);
  const currentDayIndex = now.getDay();
  
  let daysToAdd = targetDayIndex - currentDayIndex;
  if (daysToAdd <= 0) daysToAdd += 7; // Next occurrence of the day
  
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + daysToAdd);
  targetDate.setHours(9, 0, 0, 0); // 9 AM on target day
  
  return targetDate;
}

// Extract the specific promise/commitment text from the message
function extractPromiseText(messageText: string, detectedPatterns: RegExp[]): string {
  // Try to extract the most relevant part of the promise
  let promiseText = messageText;
  
  // Look for the sentence containing the promise
  const sentences = messageText.split(/[.!?]+/);
  for (const sentence of sentences) {
    if (detectedPatterns.some(pattern => pattern.test(sentence))) {
      promiseText = sentence.trim();
      break;
    }
  }
  
  // Truncate if too long
  if (promiseText.length > 100) {
    promiseText = promiseText.substring(0, 97) + '...';
  }
  
  return promiseText || 'Follow-up commitment';
}

// Get thread context for better follow-up tracking
async function getThreadContext(channelId: string, threadTs?: string) {
  if (!threadTs) return null;
  
  try {
    const slackApp = getSlackApp();
    if (!slackApp) return null;
    
    const result = await slackApp.client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 10
    });
    
    const messages = result.messages || [];
    const participants = [...new Set(messages.map((m: any) => m.user).filter(Boolean))];

    return {
      threadTs,
      messageCount: messages.length,
      participants,
      firstMessage: messages[0]?.text?.substring(0, 100) || ''
    };
  } catch (error) {
    console.error('Error getting thread context:', error);
    return null;
  }
}

// Determine priority based on timeframe urgency
function determineFollowUpPriority(timeframe: any): number {
  if (timeframe.type === 'in_minutes' || timeframe.type === 'few_minutes') {
    return 1; // High priority
  }
  if (timeframe.type === 'in_hours' || timeframe.type === 'few_hours' || timeframe.type === 'today') {
    return 2; // Medium-high priority
  }
  if (timeframe.type === 'tomorrow' || timeframe.type === 'end_of_day') {
    return 3; // Medium priority
  }
  return 4; // Lower priority for longer timeframes
}

// Format due date for user-friendly display
function formatDueDate(dueDate: Date): string {
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffHours < 1) {
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    return `in ${diffMinutes} minutes`;
  } else if (diffHours < 24) {
    return `in ${diffHours} hours (${dueDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`;
  } else if (diffDays === 1) {
    return `tomorrow at ${dueDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  } else {
    return `on ${dueDate.toLocaleDateString()} at ${dueDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  }
}

// Extension function for deadline management
export async function extendFollowUpDeadline(taskId: string, newDueDate: Date, reason: string, userSlackId: string) {
  try {
    const task = await storage.getTask(taskId);
    if (!task) {
      console.error(`Task ${taskId} not found for deadline extension`);
      return;
    }

    await storage.updateTask(taskId, {
      dueAt: newDueDate,
      evidence: {
        ...task.evidence as any,
        deadlineExtended: true,
        extensionReason: reason,
        extendedBy: userSlackId,
        extendedAt: new Date()
      }
    });

    await storage.createAudit({
      entity: 'task',
      entityId: taskId,
      action: 'followup_deadline_extended',
      actorId: userSlackId,
      data: {
        originalDue: task.dueAt,
        newDue: newDueDate,
        reason
      }
    });

    console.log(`Follow-up ${taskId} deadline extended to ${newDueDate.toISOString()}`);
  } catch (error) {
    console.error('Error extending follow-up deadline:', error);
  }
}

// Manual follow-up creation
export async function createManualFollowUp(data: any) {
  try {
    const user = await storage.getUserBySlackId(data.userSlackId);
    if (!user) {
      console.error('User not found for manual follow-up creation');
      return null;
    }

    const dueDate = new Date(data.dueDate || Date.now() + 24 * 60 * 60 * 1000); // Default 1 day
    
    const task = await storage.createTask({
      title: data.title || 'Manual Follow-up',
      category: 'follow_up',
      type: 'follow_up',
      status: 'OPEN',
      priority: data.priority || 2,
      assigneeId: data.assigneeId || user.id,
      dueAt: dueDate,
      sourceUrl: data.sourceUrl,
      evidence: {
        manuallyCreated: true,
        createdBy: data.userSlackId,
        originalRequest: data.description
      }
    });

    await storage.createAudit({
      entity: 'task',
      entityId: task.id,
      action: 'followup_manually_created',
      actorId: user.id,
      data: { source: 'manual_creation', dueDate }
    });

    console.log(`Manual follow-up created: ${task.id}`);
    return task;
  } catch (error) {
    console.error('Error creating manual follow-up:', error);
    return null;
  }
}
