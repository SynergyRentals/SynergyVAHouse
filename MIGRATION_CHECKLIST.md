# Webhook Events Migration Checklist

## Status: ⚠️ PENDING - Action Required

The `webhook_events` table schema has been defined but the database migration has not been run yet. **This must be completed before any webhooks are processed.**

## Critical Issue

The application will **crash with "table does not exist" errors** if webhooks are received before this migration is completed.

## Required Steps

### 1. Configure DATABASE_URL ✅ (COMPLETED)
- [x] Schema defined in `shared/schema.ts:228-239`
- [ ] DATABASE_URL configured in Replit Secrets
- [ ] Connection to Neon database verified

### 2. Run Database Migration ⏳ (PENDING)

```bash
npm run db:push
```

**Expected Output:**
```
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/user/SynergyVAHouse/drizzle.config.ts'
...
✓ Pushing schema changes to database
✓ Done!
```

### 3. Verify Table Creation ⏳ (PENDING)

Test that the table exists and is accessible:

```javascript
// Test query to verify table exists
const { db } = require('./server/db');
const { webhookEvents } = require('./shared/schema');

// Should not throw an error
await db.select().from(webhookEvents).limit(1);
```

### 4. Verify Indexes ⏳ (PENDING)

Check that all indexes were created:

**Expected Indexes:**
- `webhook_events_pkey` - Primary key on `id` (UUID)
- `webhook_events_event_id_source_unique` - Unique constraint on `(event_id, source)`
- `webhook_events_event_id_source_idx` - Performance index on `(event_id, source)`

**Verification Query:**
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'webhook_events';
```

### 5. Test Idempotency Middleware ⏳ (PENDING)

Send a test webhook twice and verify duplicate detection:

```bash
# First webhook - should create task
curl -X POST https://your-app.replit.dev/webhooks/conduit \
  -H "Content-Type: application/json" \
  -H "X-Event-ID: migration-test-001" \
  -H "X-Conduit-Signature: sha256=YOUR_SIGNATURE" \
  -d '{"type":"escalation.created","escalation":{"id":"test-001","title":"Migration Test"}}'

# Expected: 200 OK with {"status":"processed","taskId":"..."}

# Second webhook - should be rejected as duplicate
curl -X POST https://your-app.replit.dev/webhooks/conduit \
  -H "Content-Type: application/json" \
  -H "X-Event-ID: migration-test-001" \
  -H "X-Conduit-Signature: sha256=YOUR_SIGNATURE" \
  -d '{"type":"escalation.created","escalation":{"id":"test-001","title":"Migration Test"}}'

# Expected: 200 OK with {"status":"duplicate","eventId":"migration-test-001"}
```

## Table Schema Reference

```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  source TEXT NOT NULL,  -- 'conduit' | 'suiteop' | 'wheelhouse'
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  request_body JSONB,
  task_id VARCHAR REFERENCES tasks(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_events_event_id_source_unique UNIQUE (event_id, source)
);

CREATE INDEX webhook_events_event_id_source_idx
  ON webhook_events(event_id, source);
```

## Quick Start for Replit

1. **Set DATABASE_URL secret:**
   - Tools → Secrets
   - Add: `DATABASE_URL` = `postgresql://...` (from Neon dashboard)

2. **Run migration:**
   ```bash
   npm run db:push
   ```

3. **Restart application:**
   ```bash
   npm run build && npm run start
   ```

4. **Monitor logs:**
   ```bash
   # Look for successful database connection
   grep "Environment" logs
   grep "Idempotency" logs
   ```

## Troubleshooting

### Error: "DATABASE_URL, ensure the database is provisioned"

**Cause:** DATABASE_URL environment variable is not set.

**Solution:**
1. Go to Tools → Secrets in Replit
2. Add DATABASE_URL with your Neon connection string
3. Restart the Replit shell or reload the environment
4. Run `npm run db:push` again

### Error: "relation 'webhook_events' does not exist"

**Cause:** Migration has not been run yet.

**Solution:**
1. Run `npm run db:push` to create the table
2. Restart the application
3. Verify with a test query

### Error: "duplicate key value violates unique constraint"

**Cause:** This is expected! It means idempotency is working correctly.

**Context:** When duplicate webhooks arrive, the database unique constraint prevents duplicate event records. This is the desired behavior.

## Documentation References

- **Webhook Idempotency**: `docs/WEBHOOKS.md`
- **Schema Definition**: `shared/schema.ts:228-239`
- **Migration Config**: `drizzle.config.ts`
- **Environment Setup**: `.env.example`

## Rollback Plan

If the migration causes issues:

```bash
# Drop the table (CAUTION: This will delete all webhook event records)
psql $DATABASE_URL -c "DROP TABLE IF EXISTS webhook_events CASCADE;"

# Re-run migration with fixes
npm run db:push
```

## Post-Migration Monitoring

After migration, monitor these metrics for 24-48 hours:

1. **Webhook Success Rate**: Should remain high
2. **Duplicate Detection**: Should show in logs as `{status: 'duplicate'}`
3. **Database Performance**: Query times should remain under 20ms
4. **Error Rates**: Should not increase
5. **Task Duplication**: Should be zero

## Sign-Off

- [ ] Migration completed successfully
- [ ] Table and indexes verified
- [ ] Idempotency tested with duplicate webhooks
- [ ] Application running without errors
- [ ] Monitoring shows normal operation
- [ ] Documentation updated with actual results

**Completed By:** _________________
**Date:** _________________
**Sign-Off:** _________________
