/**
 * Webhook Events Migration Verification Script
 *
 * This script verifies that the webhook_events table has been created
 * correctly with all required indexes and constraints.
 *
 * Usage:
 *   npm run db:push        # Run migration first
 *   tsx scripts/verify-migration.ts   # Then verify
 */

import { db, pool } from '../server/db';
import { webhookEvents } from '../shared/schema';
import { sql } from 'drizzle-orm';

interface IndexInfo {
  tablename: string;
  indexname: string;
  indexdef: string;
}

interface ConstraintInfo {
  constraint_name: string;
  constraint_type: string;
  table_name: string;
  constraint_def: string;
}

async function verifyMigration() {
  console.log('\n='.repeat(70));
  console.log('🔍 WEBHOOK EVENTS TABLE MIGRATION VERIFICATION');
  console.log('='.repeat(70));

  let allChecksPassed = true;

  try {
    // Step 1: Verify table exists
    console.log('\n📋 Step 1: Verifying table exists...');
    try {
      await db.select().from(webhookEvents).limit(1);
      console.log('✅ Table "webhook_events" exists and is accessible');
    } catch (error: any) {
      console.error('❌ Table verification failed:', error.message);
      if (error.message.includes('does not exist')) {
        console.error('\n⚠️  CRITICAL: The webhook_events table does not exist!');
        console.error('   Run: npm run db:push');
      }
      allChecksPassed = false;
      throw error;
    }

    // Step 2: Verify indexes
    console.log('\n🔍 Step 2: Verifying indexes...');
    const indexQuery = await pool.query<IndexInfo>(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'webhook_events'
      ORDER BY indexname;
    `);

    const indexes = indexQuery.rows;

    if (indexes.length === 0) {
      console.error('❌ No indexes found for webhook_events table');
      allChecksPassed = false;
    } else {
      console.log(`\n   Found ${indexes.length} index(es):`);
      indexes.forEach(idx => {
        console.log(`   • ${idx.indexname}`);
        console.log(`     ${idx.indexdef}`);
      });

      // Check for required indexes
      const requiredIndexes = [
        'webhook_events_pkey',  // Primary key
        'webhook_events_event_id_source_idx'  // Performance index
      ];

      const foundIndexNames = indexes.map(idx => idx.indexname);
      const missingIndexes = requiredIndexes.filter(
        name => !foundIndexNames.includes(name)
      );

      if (missingIndexes.length > 0) {
        console.error('\n❌ Missing required indexes:', missingIndexes.join(', '));
        allChecksPassed = false;
      } else {
        console.log('\n✅ All required indexes are present');
      }
    }

    // Step 3: Verify unique constraint
    console.log('\n🔒 Step 3: Verifying unique constraint...');
    const constraintQuery = await pool.query<ConstraintInfo>(`
      SELECT
        con.conname as constraint_name,
        CASE con.contype
          WHEN 'p' THEN 'PRIMARY KEY'
          WHEN 'u' THEN 'UNIQUE'
          WHEN 'f' THEN 'FOREIGN KEY'
          WHEN 'c' THEN 'CHECK'
          ELSE 'OTHER'
        END as constraint_type,
        rel.relname as table_name,
        pg_get_constraintdef(con.oid) as constraint_def
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'webhook_events'
      ORDER BY con.conname;
    `);

    const constraints = constraintQuery.rows;

    if (constraints.length === 0) {
      console.error('❌ No constraints found for webhook_events table');
      allChecksPassed = false;
    } else {
      console.log(`\n   Found ${constraints.length} constraint(s):`);
      constraints.forEach(con => {
        console.log(`   • ${con.constraint_name} (${con.constraint_type})`);
        console.log(`     ${con.constraint_def}`);
      });

      // Check for required unique constraint
      const uniqueConstraint = constraints.find(
        con => con.constraint_name === 'webhook_events_event_id_source_unique'
      );

      if (!uniqueConstraint) {
        console.error('\n❌ Missing required unique constraint: webhook_events_event_id_source_unique');
        console.error('   This constraint is CRITICAL for idempotency!');
        allChecksPassed = false;
      } else {
        console.log('\n✅ Unique constraint (event_id, source) is present');
      }
    }

    // Step 4: Verify column types
    console.log('\n📊 Step 4: Verifying column types...');
    const columnQuery = await pool.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'webhook_events'
      ORDER BY ordinal_position;
    `);

    const columns = columnQuery.rows;
    console.log(`\n   Found ${columns.length} column(s):`);
    columns.forEach((col: any) => {
      const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(not null)';
      const defaultVal = col.column_default ? ` [default: ${col.column_default}]` : '';
      console.log(`   • ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
    });

    const requiredColumns = [
      'id',
      'event_id',
      'source',
      'processed_at',
      'request_body',
      'task_id',
      'created_at'
    ];

    const foundColumnNames = columns.map((col: any) => col.column_name);
    const missingColumns = requiredColumns.filter(
      name => !foundColumnNames.includes(name)
    );

    if (missingColumns.length > 0) {
      console.error('\n❌ Missing required columns:', missingColumns.join(', '));
      allChecksPassed = false;
    } else {
      console.log('\n✅ All required columns are present');
    }

    // Step 5: Test idempotency with mock data
    console.log('\n🧪 Step 5: Testing idempotency...');

    const testEventId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const testSource = 'test';

    try {
      // Insert first event
      await db.insert(webhookEvents).values({
        eventId: testEventId,
        source: testSource,
        requestBody: { test: true, timestamp: new Date().toISOString() }
      });
      console.log('✅ First event inserted successfully');

      // Try to insert duplicate
      try {
        await db.insert(webhookEvents).values({
          eventId: testEventId,
          source: testSource,
          requestBody: { test: true, duplicate: true }
        });
        console.error('❌ Duplicate event was NOT rejected - UNIQUE constraint may be missing!');
        allChecksPassed = false;
      } catch (dupError: any) {
        if (dupError.message.includes('unique constraint') || dupError.message.includes('duplicate key')) {
          console.log('✅ Duplicate event correctly rejected by unique constraint');
        } else {
          console.error('❌ Unexpected error during duplicate test:', dupError.message);
          allChecksPassed = false;
        }
      }

      // Clean up test data
      await db.delete(webhookEvents).where(
        sql`${webhookEvents.eventId} = ${testEventId} AND ${webhookEvents.source} = ${testSource}`
      );
      console.log('✅ Test data cleaned up');

    } catch (error: any) {
      console.error('❌ Idempotency test failed:', error.message);
      allChecksPassed = false;
    }

    // Step 6: Count existing webhook events
    console.log('\n📈 Step 6: Checking existing webhook events...');
    const countResult = await db.select().from(webhookEvents);
    console.log(`   Total webhook events in database: ${countResult.length}`);

    if (countResult.length > 0) {
      console.log('\n   Recent events by source:');
      const bySource = countResult.reduce((acc: any, event: any) => {
        acc[event.source] = (acc[event.source] || 0) + 1;
        return acc;
      }, {});
      Object.entries(bySource).forEach(([source, count]) => {
        console.log(`   • ${source}: ${count} events`);
      });
    }

    // Final summary
    console.log('\n' + '='.repeat(70));
    if (allChecksPassed) {
      console.log('✅ MIGRATION VERIFICATION PASSED');
      console.log('\nThe webhook_events table is correctly configured and ready for use.');
      console.log('Webhook idempotency is fully operational.');
    } else {
      console.log('❌ MIGRATION VERIFICATION FAILED');
      console.log('\nSome checks did not pass. Please review the errors above.');
      console.log('You may need to re-run: npm run db:push');
    }
    console.log('='.repeat(70) + '\n');

    return allChecksPassed;

  } catch (error: any) {
    console.error('\n💥 Verification script error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    console.log('\n' + '='.repeat(70));
    console.log('❌ MIGRATION VERIFICATION FAILED');
    console.log('='.repeat(70) + '\n');
    return false;
  } finally {
    // Close database connection
    await pool.end();
  }
}

// Run verification
verifyMigration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
