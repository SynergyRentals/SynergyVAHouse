import type { App } from '@slack/bolt';
import { detectAndCreateFollowUp } from '../services/followup';
import { storage } from '../storage';
import { getBotUserId } from './bolt';

export function setupMessageEvents(app: App) {
  // Listen for messages in all channels
  app.message(async ({ message, client }) => {
    try {
      // Skip bot messages and messages without text
      if (message.subtype === 'bot_message' || !message.text || message.bot_id) {
        return;
      }
      
      // Skip messages from our own bot using cached bot user ID
      const botUserId = getBotUserId();
      if (message.user === botUserId || message.bot_id === botUserId) {
        return;
      }
      
      // Check if user exists in our system
      const user = await storage.getUserBySlackId(message.user);
      if (!user) {
        console.log(`Message from unknown user: ${message.user}`);
        return;
      }
      
      // Only monitor specific channels or all channels based on configuration
      const monitoredChannels = process.env.MONITORED_CHANNELS?.split(',') || [];
      const shouldMonitor = monitoredChannels.length === 0 || 
                           monitoredChannels.includes(message.channel) ||
                           monitoredChannels.includes('*'); // * means all channels
      
      if (!shouldMonitor) {
        return;
      }
      
      console.log(`[Follow-up] Analyzing message from ${user.name} in channel ${message.channel}`);
      
      // Attempt to detect and create follow-up
      const followUpTask = await detectAndCreateFollowUp(
        message, 
        message.channel, 
        message.thread_ts
      );
      
      if (followUpTask) {
        console.log(`[Follow-up] Created follow-up task ${followUpTask.id} for message: "${message.text?.substring(0, 50)}..."`);
      }
      
    } catch (error) {
      console.error('Error processing message for follow-up detection:', error);
    }
  });
  
  // Listen for messages in threads specifically
  app.message(/.*/, async ({ message, client }) => {
    try {
      // Only process if this is a threaded message
      if (!message.thread_ts || message.subtype === 'bot_message' || !message.text) {
        return;
      }
      
      // Check if this is an update to an existing follow-up
      await checkForFollowUpUpdates(message, client);
      
    } catch (error) {
      console.error('Error checking thread for follow-up updates:', error);
    }
  });
  
  // Listen for reaction events to help with follow-up completion
  app.event('reaction_added', async ({ event, client }) => {
    try {
      // Check if someone reacted with completion emojis to a follow-up message
      if (['white_check_mark', 'heavy_check_mark', 'check_mark_button'].includes(event.reaction)) {
        await handleFollowUpCompletionReaction(event, client);
      }
    } catch (error) {
      console.error('Error handling reaction for follow-up:', error);
    }
  });
  
  console.log('Follow-up message event handlers initialized');
}

// Check if a threaded message provides an update to an existing follow-up
async function checkForFollowUpUpdates(message: any, client: any) {
  try {
    if (!message.thread_ts) return;
    
    // Find any follow-up tasks that reference this thread
    const followUpTasks = await storage.getTasks({
      category: 'follow_up',
      status: ['OPEN', 'IN_PROGRESS'],
      sourceId: message.thread_ts
    });
    
    if (followUpTasks.length === 0) return;
    
    const user = await storage.getUserBySlackId(message.user);
    if (!user) return;
    
    // Check if this message contains update indicators
    const updateIndicators = [
      /\bupdated?\b/i,
      /\bdone\b/i,
      /\bcompleted?\b/i,
      /\bfinished\b/i,
      /\bresolved?\b/i,
      /\bfixed\b/i,
      /\bhandled\b/i,
      /\bstatusUpdate\b/i,
      /\bfyi\b/i,
      /\bheads up\b/i
    ];
    
    const hasUpdateIndicator = updateIndicators.some(pattern => 
      pattern.test(message.text || '')
    );
    
    if (hasUpdateIndicator) {
      // Mark follow-ups as updated/completed
      for (const task of followUpTasks) {
        if (task.assigneeId === user.id) {
          // This is an update from the person who made the promise
          await storage.updateTask(task.id, { 
            status: 'DONE',
            evidence: {
              ...task.evidence as any,
              completedAt: new Date(),
              completionMessage: message.text,
              completionTs: message.ts
            }
          });
          
          await storage.createAudit({
            entity: 'task',
            entityId: task.id,
            action: 'followup_completed_by_update',
            actorId: user.id,
            data: { 
              updateMessage: message.text,
              messageTs: message.ts
            }
          });
          
          // React to the update message to acknowledge follow-up completion
          await client.reactions.add({
            channel: message.channel,
            timestamp: message.ts,
            name: 'white_check_mark'
          });
          
          console.log(`Follow-up task ${task.id} marked complete by thread update`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking for follow-up updates:', error);
  }
}

// Handle reactions that might indicate follow-up completion
async function handleFollowUpCompletionReaction(event: any, client: any) {
  try {
    // Find follow-ups related to this message
    const followUpTasks = await storage.getTasks({
      category: 'follow_up',
      status: ['OPEN', 'IN_PROGRESS'],
      sourceId: event.item.ts
    });
    
    if (followUpTasks.length === 0) return;
    
    const user = await storage.getUserBySlackId(event.user);
    if (!user) return;
    
    // If the person who made the promise reacted with a completion emoji
    for (const task of followUpTasks) {
      if (task.assigneeId === user.id) {
        await storage.updateTask(task.id, { 
          status: 'DONE',
          evidence: {
            ...task.evidence as any,
            completedAt: new Date(),
            completionMethod: 'reaction',
            completionReaction: event.reaction
          }
        });
        
        await storage.createAudit({
          entity: 'task',
          entityId: task.id,
          action: 'followup_completed_by_reaction',
          actorId: user.id,
          data: { 
            reaction: event.reaction,
            messageTs: event.item.ts
          }
        });
        
        // Send confirmation DM
        await client.chat.postMessage({
          channel: user.slackId,
          text: `✅ Follow-up marked complete: "${task.title}"\n\nThanks for the update!`
        });
        
        console.log(`Follow-up task ${task.id} marked complete by reaction`);
      }
    }
  } catch (error) {
    console.error('Error handling follow-up completion reaction:', error);
  }
}