import { storage } from '../server/storage';

export async function seedFollowUpPlaybook() {
  console.log('Seeding follow-up playbook...');
  
  try {
    // Create the follow-up playbook
    const followUpPlaybook = {
      key: 'follow_up_v1',
      category: 'follow_up',
      content: {
        title: 'Follow-up Task Management',
        description: 'Standard operating procedure for managing follow-up commitments and promises',
        version: '1.0',
        
        // SLA configuration
        sla: {
          first_response_minutes: 0, // No initial SLA since this is a follow-up
          completion_target_multiplier: 1.0, // Complete by the promised deadline
          breach_escalate_to: '#triage',
          reminder_stages: [
            { type: 'early_warning', minutes_before: 1440 }, // 24 hours
            { type: 'urgent_warning', minutes_before: 240 },  // 4 hours  
            { type: 'final_warning', minutes_before: 60 },    // 1 hour
            { type: 'overdue_escalation', minutes_after: 0 }  // Immediate escalation when overdue
          ]
        },
        
        // Process steps
        steps: [
          {
            step: 1,
            title: 'Review Promise Context',
            description: 'Review the original message and commitment made',
            actions: [
              'Read the source message and understand the context',
              'Identify what was specifically promised',
              'Understand who is waiting for the follow-up'
            ]
          },
          {
            step: 2,
            title: 'Execute the Commitment',
            description: 'Complete the promised action or provide the requested update',
            actions: [
              'Perform the promised action (check status, provide update, etc.)',
              'Gather any necessary information or documentation',
              'Prepare a comprehensive response'
            ]
          },
          {
            step: 3,
            title: 'Provide Follow-up',
            description: 'Communicate the results back to the requester',
            actions: [
              'Reply in the original thread or message the requester directly',
              'Provide clear, specific information',
              'Include next steps if applicable'
            ]
          }
        ],
        
        // Definition of Done - what constitutes completion
        definition_of_done: {
          required_evidence: [
            {
              type: 'completion_confirmation',
              description: 'Confirmation that the follow-up was provided',
              required: true
            }
          ],
          completion_criteria: [
            'The promised information or action has been provided',
            'The requester has been notified in the original context',
            'Any next steps have been clearly communicated'
          ]
        },
        
        // Escalation procedures
        escalation: {
          triggers: [
            'Follow-up is overdue by any amount of time',
            'Multiple reminder stages have been missed',
            'Critical follow-up (marked high priority)'
          ],
          escalation_channel: '#triage',
          escalation_users: ['UJOREL'], // Manager Slack ID
          escalation_message: 'Follow-up commitment is overdue and requires immediate attention'
        },
        
        // Performance metrics
        metrics: {
          target_completion_rate: 98, // 98% of follow-ups should be completed on time
          target_response_time: '100% by deadline', // All follow-ups must be completed by promised deadline
          escalation_threshold: 'Any overdue follow-up triggers escalation'
        },
        
        // Common failure modes and solutions
        troubleshooting: [
          {
            issue: 'Cannot locate original context',
            solution: 'Use the source URL in the task metadata to navigate to the original message'
          },
          {
            issue: 'Promised information is not available',
            solution: 'Communicate delay immediately and provide new timeline'
          },
          {
            issue: 'Follow-up is no longer relevant',
            solution: 'Mark as complete with explanation of why it\'s no longer needed'
          }
        ],
        
        // Quality standards
        quality_standards: [
          'All follow-ups must be completed by the promised deadline',
          'Follow-up responses must be comprehensive and helpful',
          'Communication must be professional and timely',
          'Context from original request must be preserved'
        ]
      }
    };

    // Insert the playbook
    await storage.createPlaybook(followUpPlaybook);
    console.log('Follow-up playbook seeded successfully');

  } catch (error) {
    console.error('Error seeding follow-up playbook:', error);
  }
}

// Run seeding if this file is executed directly
import { fileURLToPath } from 'url';
if (import.meta.url === fileURLToPath(import.meta.url) && import.meta.url.endsWith(process.argv[1])) {
  seedFollowUpPlaybook();
}