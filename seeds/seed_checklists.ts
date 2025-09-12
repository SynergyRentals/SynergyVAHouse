import { storage } from '../server/storage';

// Daily checklist tasks for Rica (Listing & OTA optimizer)
const RICA_DAILY_TASKS = [
  {
    title: 'Review overnight booking notifications',
    category: 'daily_checklist',
    priority: 1,
    timeOfDay: '09:00'
  },
  {
    title: 'Check OTA calendar sync status',
    category: 'daily_checklist',
    priority: 1,
    timeOfDay: '09:15'
  },
  {
    title: 'Process pending refund requests',
    category: 'reservations.refund_request',
    priority: 1,
    timeOfDay: '09:30'
  },
  {
    title: 'Respond to guest messages',
    category: 'guest.messaging_known_answer',
    priority: 1,
    timeOfDay: '10:00'
  },
  {
    title: 'Update listing pricing based on market data',
    category: 'ota.listing_fix',
    priority: 2,
    timeOfDay: '14:00'
  },
  {
    title: 'Review and update property descriptions',
    category: 'ota.listing_fix',
    priority: 3,
    timeOfDay: '15:00'
  },
  {
    title: 'End-of-day booking summary report',
    category: 'daily_checklist',
    priority: 2,
    timeOfDay: '17:00'
  }
];

// Daily checklist tasks for Zyra (Operations coordinator)
const ZYRA_DAILY_TASKS = [
  {
    title: 'Review overnight maintenance alerts',
    category: 'daily_checklist',
    priority: 1,
    timeOfDay: '09:00'
  },
  {
    title: 'Check smart lock battery levels',
    category: 'access.smart_lock_issue',
    priority: 1,
    timeOfDay: '09:30'
  },
  {
    title: 'Coordinate cleaning schedules',
    category: 'cleaning.issue',
    priority: 1,
    timeOfDay: '10:00'
  },
  {
    title: 'Review inventory levels',
    category: 'inventory.restock',
    priority: 2,
    timeOfDay: '11:00'
  },
  {
    title: 'Process maintenance requests',
    category: 'maintenance.issue',
    priority: 1,
    timeOfDay: '13:00'
  },
  {
    title: 'Check WiFi connectivity reports',
    category: 'internet.wifi_issue',
    priority: 2,
    timeOfDay: '14:00'
  },
  {
    title: 'Update property readiness status',
    category: 'daily_checklist',
    priority: 1,
    timeOfDay: '16:30'
  }
];

// Weekly checklist tasks
const WEEKLY_TASKS = [
  {
    assignee: 'Rica',
    tasks: [
      {
        title: 'Weekly pricing optimization review',
        category: 'ota.listing_fix',
        priority: 2,
        dayOfWeek: 'Monday'
      },
      {
        title: 'Competitor analysis and pricing adjustment',
        category: 'ota.listing_fix',
        priority: 2,
        dayOfWeek: 'Wednesday'
      },
      {
        title: 'Guest review response and management',
        category: 'guest.messaging_known_answer',
        priority: 1,
        dayOfWeek: 'Friday'
      }
    ]
  },
  {
    assignee: 'Zyra',
    tasks: [
      {
        title: 'Deep clean inspection and scheduling',
        category: 'cleaning.issue',
        priority: 1,
        dayOfWeek: 'Monday'
      },
      {
        title: 'Preventive maintenance checks',
        category: 'maintenance.issue',
        priority: 1,
        dayOfWeek: 'Wednesday'
      },
      {
        title: 'Inventory restock and supplies order',
        category: 'inventory.restock',
        priority: 2,
        dayOfWeek: 'Friday'
      },
      {
        title: 'Access system audit and code rotation',
        category: 'access.smart_lock_issue',
        priority: 2,
        dayOfWeek: 'Sunday'
      }
    ]
  }
];

export async function seedChecklists() {
  try {
    console.log('🌱 Seeding checklist tasks...');
    
    // Get users
    const rica = await storage.getUserBySlackId('U_RICA');
    const zyra = await storage.getUserBySlackId('U_ZYRA');
    
    if (!rica || !zyra) {
      console.log('❌ Users Rica or Zyra not found. Please seed users first.');
      return;
    }
    
    // Create daily task templates for Rica
    console.log('Creating daily tasks for Rica...');
    for (const taskTemplate of RICA_DAILY_TASKS) {
      const existingTasks = await storage.getTasks({
        assigneeId: rica.id,
        category: taskTemplate.category,
        type: 'daily'
      });
      
      // Only create if template doesn't exist
      const templateExists = existingTasks.some(task => 
        task.title === taskTemplate.title && task.type === 'daily'
      );
      
      if (!templateExists) {
        await storage.createTask({
          type: 'daily',
          title: taskTemplate.title,
          category: taskTemplate.category,
          status: 'OPEN',
          priority: taskTemplate.priority,
          assigneeId: rica.id,
          playbookKey: taskTemplate.category !== 'daily_checklist' ? taskTemplate.category : undefined,
          evidence: {
            timeOfDay: taskTemplate.timeOfDay,
            isTemplate: true
          },
          createdBy: 'system'
        });
        console.log(`✅ Created daily task template: ${taskTemplate.title}`);
      }
    }
    
    // Create daily task templates for Zyra
    console.log('Creating daily tasks for Zyra...');
    for (const taskTemplate of ZYRA_DAILY_TASKS) {
      const existingTasks = await storage.getTasks({
        assigneeId: zyra.id,
        category: taskTemplate.category,
        type: 'daily'
      });
      
      const templateExists = existingTasks.some(task => 
        task.title === taskTemplate.title && task.type === 'daily'
      );
      
      if (!templateExists) {
        await storage.createTask({
          type: 'daily',
          title: taskTemplate.title,
          category: taskTemplate.category,
          status: 'OPEN',
          priority: taskTemplate.priority,
          assigneeId: zyra.id,
          playbookKey: taskTemplate.category !== 'daily_checklist' ? taskTemplate.category : undefined,
          evidence: {
            timeOfDay: taskTemplate.timeOfDay,
            isTemplate: true
          },
          createdBy: 'system'
        });
        console.log(`✅ Created daily task template: ${taskTemplate.title}`);
      }
    }
    
    // Create weekly task templates
    console.log('Creating weekly tasks...');
    for (const userTasks of WEEKLY_TASKS) {
      const user = userTasks.assignee === 'Rica' ? rica : zyra;
      
      for (const taskTemplate of userTasks.tasks) {
        const existingTasks = await storage.getTasks({
          assigneeId: user.id,
          category: taskTemplate.category,
          type: 'weekly'
        });
        
        const templateExists = existingTasks.some(task => 
          task.title === taskTemplate.title && task.type === 'weekly'
        );
        
        if (!templateExists) {
          await storage.createTask({
            type: 'weekly',
            title: taskTemplate.title,
            category: taskTemplate.category,
            status: 'OPEN',
            priority: taskTemplate.priority,
            assigneeId: user.id,
            playbookKey: taskTemplate.category,
            evidence: {
              dayOfWeek: taskTemplate.dayOfWeek,
              isTemplate: true
            },
            createdBy: 'system'
          });
          console.log(`✅ Created weekly task template: ${taskTemplate.title} (${userTasks.assignee})`);
        }
      }
    }
    
    console.log('✨ Checklist seeding completed');
  } catch (error) {
    console.error('❌ Error seeding checklists:', error);
    throw error;
  }
}

if (require.main === module) {
  seedChecklists().then(() => {
    console.log('Seeding completed');
    process.exit(0);
  }).catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
}
