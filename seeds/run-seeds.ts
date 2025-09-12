import { seedUsers } from './seed_users';
import { seedPlaybooks } from './seed_playbooks';
import { seedChecklists } from './seed_checklists';

async function runAllSeeds() {
  try {
    console.log('🌱 Starting seed process...');
    
    await seedUsers();
    await seedPlaybooks();
    await seedChecklists();
    
    console.log('✨ All seeds completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed process failed:', error);
    process.exit(1);
  }
}

// Check if this file is being executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllSeeds();
}

export { runAllSeeds };
