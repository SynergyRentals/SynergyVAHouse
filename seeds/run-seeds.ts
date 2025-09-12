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

if (require.main === module) {
  runAllSeeds();
}

export { runAllSeeds };
