import { storage } from '../storage';

export async function mapConduitEventToTask(payload: any): Promise<any | null> {
  try {
    // Map Conduit event to our task structure
    const event = payload;
    let category = 'general';
    let title = 'Task from Conduit';
    
    // Infer category from event type and content
    if (event.type === 'escalation.created') {
      if (event.escalation?.type === 'refund_request') {
        category = 'reservations.refund_request';
        title = `Process refund request #${event.escalation.reservation_id}`;
      } else if (event.escalation?.type === 'cancellation_request') {
        category = 'reservations.cancellation_request';
        title = `Process cancellation request #${event.escalation.reservation_id}`;
      } else if (event.escalation?.type === 'guest_message') {
        category = 'guest.messaging_known_answer';
        title = `Respond to guest message - ${event.escalation.guest_name}`;
      } else if (event.escalation?.type === 'access_issue') {
        category = 'access.smart_lock_issue';
        title = `Smart lock issue - ${event.escalation.property_name}`;
      }
    } else if (event.type === 'task.created') {
      category = event.task?.category || 'general';
      title = event.task?.title || `Task from Conduit - ${event.task?.id}`;
    } else if (event.type === 'ai.help_requested') {
      category = 'general';
      title = `AI Help Request - ${event.request?.subject || 'General assistance'}`;
    }
    
    // Assign based on category
    const assigneeId = await guessAssigneeFromCategory(category);
    
    return {
      title,
      category,
      assigneeId,
      priority: event.escalation?.priority === 'high' || event.task?.priority === 'high' ? 1 : 3,
      playbookKey: category
    };
  } catch (error) {
    console.error('Error mapping Conduit event:', error);
    return null;
  }
}

export async function mapSuiteOpEventToTask(payload: any): Promise<any | null> {
  try {
    const task = payload.task || payload;
    let category = 'maintenance.issue';
    let title = 'Task from SuiteOp';
    
    // Map SuiteOp task types to our categories
    if (task.type === 'cleaning') {
      category = 'cleaning.issue';
      title = `Cleaning issue - ${task.property_name || task.location}`;
    } else if (task.type === 'maintenance') {
      category = 'maintenance.issue';
      title = `Maintenance issue - ${task.property_name || task.location}`;
    } else if (task.type === 'inventory') {
      category = 'inventory.restock';
      title = `Inventory restock - ${task.property_name || task.location}`;
    } else if (task.type === 'wifi') {
      category = 'internet.wifi_issue';
      title = `WiFi issue - ${task.property_name || task.location}`;
    }
    
    const assigneeId = await guessAssigneeFromCategory(category);
    
    return {
      title,
      category,
      assigneeId,
      priority: task.priority === 'urgent' || task.priority === 'high' ? 1 : 3,
      playbookKey: category
    };
  } catch (error) {
    console.error('Error mapping SuiteOp event:', error);
    return null;
  }
}

export async function guessAssigneeFromCategory(category: string): Promise<string | null> {
  // Simple assignee inference based on category
  // In a real system, this would be more sophisticated
  
  const categoryAssignments: Record<string, string[]> = {
    'reservations.refund_request': ['Rica'],
    'reservations.cancellation_request': ['Rica'],
    'reservations.change_request': ['Rica'],
    'guest.messaging_known_answer': ['Rica'],
    'ota.listing_fix': ['Rica'],
    'access.smart_lock_issue': ['Zyra'],
    'internet.wifi_issue': ['Zyra'],
    'cleaning.issue': ['Zyra'],
    'maintenance.issue': ['Zyra'],
    'inventory.restock': ['Zyra']
  };
  
  const potentialAssignees = categoryAssignments[category];
  if (!potentialAssignees || potentialAssignees.length === 0) {
    return null;
  }
  
  // Get the first assignee's user ID from Slack ID
  const assigneeSlackId = potentialAssignees[0];
  try {
    const user = await storage.getUserBySlackId(assigneeSlackId);
    return user?.id || null;
  } catch (error) {
    console.error(`Error getting user ID for ${assigneeSlackId}:`, error);
    return null;
  }
}

export async function inferAssigneeFromMessage(messageText: string, channelId: string): Promise<string | null> {
  try {
    // Simple keyword-based assignee inference
    const text = messageText.toLowerCase();
    
    // Reservation-related keywords -> Rica
    if (text.includes('refund') || text.includes('cancel') || text.includes('booking') || 
        text.includes('reservation') || text.includes('guest') || text.includes('ota')) {
      const rica = await storage.getUserBySlackId('Rica');
      return rica?.id || null;
    }
    
    // Operations-related keywords -> Zyra
    if (text.includes('clean') || text.includes('maintenance') || text.includes('lock') || 
        text.includes('wifi') || text.includes('access') || text.includes('inventory')) {
      const zyra = await storage.getUserBySlackId('Zyra');
      return zyra?.id || null;
    }
    
    // Data/lead items -> Jorel
    if (text.includes('report') || text.includes('analysis') || text.includes('data') || 
        text.includes('escalate') || text.includes('urgent')) {
      const jorel = await storage.getUserBySlackId('Jorel');
      return jorel?.id || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error inferring assignee from message:', error);
    return null;
  }
}
