import { storage } from '../server/storage';

const SEED_USERS = [
  {
    slackId: 'U_RICA',
    name: 'Rica Lombos',
    role: 'Listing & OTA optimizer',
    timezone: 'Asia/Manila'
  },
  {
    slackId: 'U_ZYRA',
    name: 'Zyra Kamille Tendero',
    role: 'Operations coordinator',
    timezone: 'Asia/Manila'
  },
  {
    slackId: 'U_JOREL',
    name: 'John Richard Lunario',
    role: 'EA & data manager (lead)',
    timezone: 'Asia/Manila'
  },
  {
    slackId: process.env.MANAGER_SLACK_ID || 'U_DAN',
    name: 'Dan',
    role: 'Manager',
    timezone: 'America/Chicago'
  }
];

export async function seedUsers() {
  try {
    console.log('🌱 Seeding users...');
    
    for (const userData of SEED_USERS) {
      // Check if user already exists
      const existingUser = await storage.getUserBySlackId(userData.slackId);
      
      if (!existingUser) {
        const user = await storage.createUser(userData);
        console.log(`✅ Created user: ${user.name} (${user.slackId})`);
      } else {
        console.log(`⏭️  User already exists: ${existingUser.name} (${existingUser.slackId})`);
      }
    }
    
    console.log('✨ User seeding completed');
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    throw error;
  }
}

if (require.main === module) {
  seedUsers().then(() => {
    console.log('Seeding completed');
    process.exit(0);
  }).catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
}
