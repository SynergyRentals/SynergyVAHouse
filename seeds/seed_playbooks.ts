import { storage } from '../server/storage';

const SEED_PLAYBOOKS = [
  {
    key: 'guest_refund_request_v1',
    category: 'reservations.refund_request',
    content: {
      key: 'guest_refund_request_v1',
      category: 'reservations.refund_request',
      sla: {
        first_response_minutes: 10,
        breach_escalate_to: '#triage'
      },
      definition_of_done: {
        required_fields: [
          'guest_platform_id',
          'reservation_id',
          'refund_reason_code',
          'action_taken'
        ],
        required_evidence: [
          'screenshot_platform_request',
          'notes_summary'
        ]
      },
      steps: [
        'Validate policy eligibility and reservation state.',
        'Compute allowed refund per policy.',
        'Draft response template.',
        'If edge case → mark WAITING and @Jorel.'
      ],
      escalation: {
        night_hours: '22:00-07:00 Asia/Manila',
        route: '#open-issues'
      }
    }
  },
  {
    key: 'guest_cancellation_request_v1',
    category: 'reservations.cancellation_request',
    content: {
      key: 'guest_cancellation_request_v1',
      category: 'reservations.cancellation_request',
      sla: {
        first_response_minutes: 10,
        breach_escalate_to: '#triage'
      },
      definition_of_done: {
        required_fields: [
          'guest_platform_id',
          'reservation_id',
          'cancellation_reason',
          'action_taken',
          'refund_amount'
        ],
        required_evidence: [
          'screenshot_platform_request',
          'cancellation_confirmation'
        ]
      },
      steps: [
        'Verify cancellation policy and timing.',
        'Calculate applicable fees and refunds.',
        'Process cancellation in platform.',
        'Send confirmation to guest.'
      ]
    }
  },
  {
    key: 'access_smart_lock_issue_v1',
    category: 'access.smart_lock_issue',
    content: {
      key: 'access_smart_lock_issue_v1',
      category: 'access.smart_lock_issue',
      sla: {
        first_response_minutes: 10,
        breach_escalate_to: '#triage'
      },
      definition_of_done: {
        required_fields: [
          'unit_id',
          'device_type',
          'code_window',
          'guest_platform_id'
        ],
        required_evidence: [
          'photo_or_log_screenshot',
          'resolution_notes'
        ]
      },
      steps: [
        'Verify correct code window and time drift.',
        'Check battery status and keypad logs.',
        'Provide fallback entry (lockbox) if unresolved in 10m.',
        'Create SuiteOp task if physical service required.'
      ]
    }
  },
  {
    key: 'guest_messaging_known_answer_v1',
    category: 'guest.messaging_known_answer',
    content: {
      key: 'guest_messaging_known_answer_v1',
      category: 'guest.messaging_known_answer',
      sla: {
        first_response_minutes: 10,
        breach_escalate_to: '#triage'
      },
      definition_of_done: {
        required_fields: [
          'guest_platform_id',
          'message_category',
          'response_template_used'
        ],
        required_evidence: [
          'message_screenshot',
          'response_sent_confirmation'
        ]
      },
      steps: [
        'Identify message category and urgency.',
        'Select appropriate response template.',
        'Personalize response with guest details.',
        'Send response and mark as resolved.'
      ]
    }
  },
  {
    key: 'wifi_issue_v1',
    category: 'internet.wifi_issue',
    content: {
      key: 'wifi_issue_v1',
      category: 'internet.wifi_issue',
      sla: {
        first_response_minutes: 15,
        breach_escalate_to: '#triage'
      },
      definition_of_done: {
        required_fields: [
          'unit_id',
          'issue_description',
          'troubleshooting_steps',
          'resolution_status'
        ],
        required_evidence: [
          'router_status_photo',
          'speed_test_results'
        ]
      },
      steps: [
        'Verify router power and connection status.',
        'Guide guest through basic troubleshooting.',
        'Check ISP status for outages.',
        'Schedule technician visit if hardware issue.'
      ]
    }
  }
];

export async function seedPlaybooks() {
  try {
    console.log('🌱 Seeding playbooks...');
    
    for (const playbookData of SEED_PLAYBOOKS) {
      // Check if playbook already exists
      const existingPlaybook = await storage.getPlaybook(playbookData.key);
      
      if (!existingPlaybook) {
        const playbook = await storage.createPlaybook(playbookData);
        console.log(`✅ Created playbook: ${playbook.key} (${playbook.category})`);
      } else {
        console.log(`⏭️  Playbook already exists: ${existingPlaybook.key} (${existingPlaybook.category})`);
      }
    }
    
    console.log('✨ Playbook seeding completed');
  } catch (error) {
    console.error('❌ Error seeding playbooks:', error);
    throw error;
  }
}

// Check if this file is being executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPlaybooks().then(() => {
    console.log('Seeding completed');
    process.exit(0);
  }).catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
}
