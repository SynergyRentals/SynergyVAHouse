# Webhook Idempotency

## Overview

The Synergy VA Ops Hub implements webhook idempotency to prevent duplicate task creation when external services send the same event multiple times. This is a critical feature for ensuring data integrity and preventing operational issues caused by duplicate webhooks.

## How It Works

The idempotency system operates on a simple but robust principle:

1. **Event Identification**: Each incoming webhook is assigned a unique `event_id`
2. **Duplicate Detection**: The system checks if this `event_id` + `source` combination has been processed before
3. **Graceful Rejection**: If already processed, returns `200 OK` with `{status: 'duplicate'}` to prevent retries
4. **Event Recording**: If new, processes the webhook and stores the event record for future duplicate detection

### Architecture

```
┌─────────────┐
│   Webhook   │
│   Request   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Extract Event ID                   │
│  Priority:                          │
│  1. X-Event-ID header               │
│  2. body.id                         │
│  3. body.event_id                   │
│  4. SHA-256 hash of body (fallback) │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Check Database                     │
│  WHERE event_id = ? AND source = ?  │
└──────┬──────────────────────────────┘
       │
       ├─── Already Exists ───┐
       │                      │
       │                      ▼
       │              ┌───────────────────┐
       │              │ Return 200 OK     │
       │              │ {status: duplicate}│
       │              └───────────────────┘
       │
       └─── New Event ───┐
                         │
                         ▼
                ┌─────────────────────────┐
                │ Process Webhook         │
                │ Create Task             │
                └──────┬──────────────────┘
                       │
                       ▼
                ┌─────────────────────────┐
                │ Record Webhook Event    │
                │ Store event_id, source, │
                │ requestBody, taskId     │
                └─────────────────────────┘
```

## Event ID Extraction Priority

The system extracts event IDs using the following priority order:

1. **`X-Event-ID` header** (recommended)
2. **`body.id`** field
3. **`body.event_id`** field
4. **`body.messageId`** field (for some webhook providers)
5. **Generated SHA-256 hash** of request body (fallback)

### Why This Priority?

- **Headers are explicit**: The `X-Event-ID` header is the most explicit way to specify idempotency
- **Common conventions**: `id` and `event_id` are common fields in webhook payloads
- **Deterministic fallback**: SHA-256 hashing ensures the same payload always generates the same ID

## For Webhook Senders

### Best Practice: Include Event ID in Header

Always include a unique event ID in your webhook requests:

```bash
curl -X POST https://synergy-va-ops-hub.com/webhooks/conduit \
  -H "Content-Type: application/json" \
  -H "X-Event-ID: evt_1234567890_abc" \
  -H "X-Conduit-Signature: sha256=<hmac-signature>" \
  -d '{
    "type": "escalation.created",
    "escalation": {
      "id": "esc-789",
      "propertyId": "prop-123",
      "title": "Guest reports leak in bathroom",
      "severity": "high",
      "url": "https://conduit.example.com/escalations/esc-789"
    }
  }'
```

### Event ID Format Recommendations

Choose event IDs that are:
- **Unique**: Never reuse event IDs across different events
- **Sortable**: Include timestamp for debugging (e.g., `evt_20250122_abc123`)
- **Traceable**: Include source system identifier
- **Version-safe**: Don't change format often

Good examples:
- `evt_2025-01-22T10:30:00Z_conduit_abc123`
- `suiteop_1737540600_task_created_xyz789`
- `wheelhouse_uuid_4f3b2a1c-9e8d-7c6b-5a4f-3e2d1c0b9a8`

Bad examples:
- `1` (not unique)
- `event` (not unique)
- Random UUIDs without context (harder to debug)

### Response Codes

| Status | Response Body | Meaning | Action |
|--------|---------------|---------|--------|
| **200 OK** | `{status: 'processed', taskId: '...'}` | Webhook processed successfully | Continue normally |
| **200 OK** | `{status: 'duplicate', eventId: '...', processedAt: '...', taskId: '...'}` | Webhook already processed (idempotent) | Stop retrying - event was already handled |
| **400 Bad Request** | `{error: 'Invalid JSON payload'}` | Malformed request | Fix request format |
| **401 Unauthorized** | `{error: 'Invalid signature'}` | HMAC verification failed | Check webhook secret |
| **500 Internal Server Error** | `{error: 'Processing failed'}` | Server error | Retry with exponential backoff |

### Retry Strategy

When you receive a `500` error:

1. **Retry with exponential backoff**: 1s, 2s, 4s, 8s, 16s
2. **Maximum retries**: 5 attempts
3. **Preserve event ID**: Use the same `X-Event-ID` for all retry attempts
4. **Alert after failures**: If all retries fail, alert operations team

### Do NOT Retry On

- `200` with `{status: 'duplicate'}` - Event already processed
- `400` - Fix your request format first
- `401` - Fix your authentication first

## Database Schema

The `webhook_events` table stores all processed webhooks:

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

### Key Fields

- **`event_id`**: The unique identifier for this webhook event
- **`source`**: Which external system sent this webhook (`conduit`, `suiteop`, etc.)
- **`processed_at`**: When we first processed this webhook
- **`request_body`**: Full webhook payload (for debugging and audit)
- **`task_id`**: The task that was created/updated by this webhook (if any)

### Unique Constraint

The `(event_id, source)` unique constraint ensures:
- Same `event_id` from the same source = duplicate (rejected)
- Same `event_id` from different sources = different events (allowed)

This allows different webhook sources to use their own event ID schemes without conflicts.

## Monitoring

### Check for Duplicate Webhooks

Find duplicate webhooks received in the last 24 hours:

```sql
SELECT
  source,
  COUNT(*) as total_webhooks,
  COUNT(DISTINCT event_id) as unique_events,
  COUNT(*) - COUNT(DISTINCT event_id) as duplicates_blocked
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY source;
```

### Find Most Common Duplicates

Identify which events are being duplicated most:

```sql
SELECT
  event_id,
  source,
  COUNT(*) as duplicate_count,
  MIN(processed_at) as first_processed,
  MAX(processed_at) as last_attempt
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY event_id, source
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 10;
```

### Webhook Processing Metrics

Track webhook processing success rate:

```sql
-- This requires webhook_events to store all attempts (current implementation only stores successful ones)
SELECT
  source,
  DATE(processed_at) as date,
  COUNT(*) as total_processed,
  COUNT(task_id) as tasks_created,
  COUNT(*) FILTER (WHERE task_id IS NULL) as tasks_not_created
FROM webhook_events
WHERE processed_at > NOW() - INTERVAL '30 days'
GROUP BY source, DATE(processed_at)
ORDER BY date DESC, source;
```

### Alert Conditions

Set up alerts for:

1. **High duplicate rate**: `duplicates_blocked / total_webhooks > 0.1` (10%)
   - May indicate webhook sender is retrying unnecessarily

2. **Sudden spike in webhooks**: `COUNT(*) > avg + 3*stddev`
   - May indicate a webhook flood attack or sender misconfiguration

3. **Zero webhooks for extended period**: No webhooks for > 4 hours
   - May indicate connectivity issue or sender downtime

## Monitoring Idempotency Failures

### Overview

The idempotency middleware is designed to "fail open" - if the idempotency check fails due to database issues or other errors, the webhook is still processed to prevent blocking legitimate events. However, this means we need robust monitoring to detect when idempotency checks are failing.

### What is an Idempotency Failure?

An idempotency failure occurs when the system cannot verify whether a webhook has been processed before due to:
- Database connection errors
- Query timeouts
- Database server issues
- Network connectivity problems
- Other unexpected errors

When this happens:
1. The error is logged at ERROR level
2. The failure is recorded in the `idempotency_failures` table
3. A failure counter is incremented
4. The webhook is processed anyway (fail-open behavior)

### Failure Tracking

All idempotency failures are stored in the `idempotency_failures` table:

```sql
CREATE TABLE idempotency_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  source TEXT NOT NULL,
  failure_reason TEXT NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  request_body JSONB,
  recovery_action TEXT NOT NULL DEFAULT 'fail_open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idempotency_failures_source_idx ON idempotency_failures(source);
CREATE INDEX idempotency_failures_created_at_idx ON idempotency_failures(created_at);
CREATE INDEX idempotency_failures_failure_reason_idx ON idempotency_failures(failure_reason);
```

### Failure Categories

Failures are categorized into the following types:

- **`database_error`**: General database errors
- **`timeout`**: Query or connection timeouts
- **`connection_error`**: Database connection failures
- **`query_error`**: SQL query errors
- **`unknown`**: Unclassified errors

### Health Check Integration

The `/healthz` endpoint includes idempotency failure metrics:

```bash
curl http://localhost:5000/healthz
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-22T10:30:00.000Z",
  "idempotency": {
    "status": "healthy",
    "failureRate": {
      "lastHour": 0,
      "last24Hours": 2
    },
    "threshold": 5
  }
}
```

Health status values:
- **`healthy`**: Failure rate < threshold (default: 5 failures/hour)
- **`degraded`**: Failure rate >= threshold but < 2x threshold
- **`critical`**: Failure rate >= 2x threshold

### Monitoring API

View detailed idempotency failure metrics (requires system audit permissions):

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/monitoring/idempotency?hours=24
```

Response:
```json
{
  "health": {
    "healthy": true,
    "failureRate": 2,
    "threshold": 5,
    "status": "healthy"
  },
  "stats": {
    "total": 2,
    "bySource": {
      "conduit": 1,
      "suiteop": 1
    },
    "byReason": {
      "timeout": 1,
      "connection_error": 1
    },
    "recentFailures": [
      {
        "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "eventId": "evt_123456",
        "source": "conduit",
        "failureReason": "timeout",
        "errorMessage": "Query timeout after 5000ms",
        "recoveryAction": "fail_open",
        "createdAt": "2025-01-22T09:15:00.000Z"
      }
    ]
  },
  "counter": {
    "breakdown": {
      "conduit:timeout": 1,
      "suiteop:connection_error": 1
    },
    "lastReset": "2025-01-22T00:00:00.000Z"
  },
  "period": {
    "hoursBack": 24,
    "since": "2025-01-21T10:30:00.000Z"
  }
}
```

### Query Failure Statistics

Find recent failures:

```sql
SELECT
  source,
  failure_reason,
  COUNT(*) as failure_count,
  MAX(created_at) as last_failure
FROM idempotency_failures
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY source, failure_reason
ORDER BY failure_count DESC;
```

Find failures for specific event:

```sql
SELECT *
FROM idempotency_failures
WHERE event_id = 'evt_123456'
ORDER BY created_at DESC;
```

### Alert Thresholds

Set up monitoring alerts for the following conditions:

#### 1. High Failure Rate (CRITICAL)
**Threshold**: More than 5 failures per hour
**Meaning**: Database or infrastructure issues affecting idempotency checks
**Action**:
- Check database health and connectivity
- Review database logs for errors
- Check connection pool status
- Verify network connectivity to database

#### 2. Repeated Failures for Same Event (WARNING)
**Threshold**: Same event_id failing multiple times
**Meaning**: Persistent issue with specific webhook or data
**Action**:
- Review the specific event's error details
- Check if webhook payload is malformed
- Verify event_id format

#### 3. Spike in Specific Failure Type (WARNING)
**Threshold**: >80% of failures are the same reason
**Meaning**: Specific infrastructure issue
**Action**:
- **`timeout`**: Check database query performance, consider increasing timeout
- **`connection_error`**: Check database connectivity and connection pool
- **`query_error`**: Review database schema and query syntax
- **`database_error`**: Check database health and logs

#### 4. Critical Status in Health Check (CRITICAL)
**Threshold**: `/healthz` returns `status: "critical"`
**Meaning**: Failure rate >= 10 failures/hour
**Action**:
- Immediate investigation required
- Check database status
- Review recent deployments
- Consider temporary fail-closed if duplicates are being created

### Investigating Failures

When idempotency failures are detected:

1. **Check the health endpoint**:
   ```bash
   curl http://localhost:5000/healthz | jq .idempotency
   ```

2. **Review recent failures**:
   ```bash
   curl -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/monitoring/idempotency | jq .stats.recentFailures
   ```

3. **Check database connectivity**:
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   ```

4. **Review application logs**:
   ```bash
   grep "Idempotency Error" logs/app.log | tail -20
   ```

5. **Check for duplicates created**:
   ```sql
   -- Find potential duplicates (same event_id processed multiple times)
   SELECT event_id, source, COUNT(*) as process_count
   FROM webhook_events
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY event_id, source
   HAVING COUNT(*) > 1;
   ```

### Runbook: Responding to Idempotency Failures

#### Scenario 1: Intermittent Failures (<5/hour)
**Severity**: LOW
**Action**: Monitor only
- Log review during next on-call check
- No immediate action required

#### Scenario 2: Sustained Failures (5-10/hour)
**Severity**: MEDIUM
**Actions**:
1. Check database health and connection pool
2. Review database query performance
3. Check for infrastructure changes or deployments
4. Monitor for duplicate task creation
5. Escalate if rate increases

#### Scenario 3: Critical Failure Rate (>10/hour)
**Severity**: HIGH
**Actions**:
1. **Immediate**: Check database status
   ```bash
   psql $DATABASE_URL -c "SELECT version(); SELECT NOW();"
   ```

2. **Immediate**: Check for duplicate tasks created
   ```sql
   SELECT event_id, source, COUNT(*) as count
   FROM webhook_events
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY event_id, source
   HAVING COUNT(*) > 1;
   ```

3. **If duplicates found**: Consider temporary fail-closed mode (block webhooks on failure)

4. **Diagnose root cause**:
   - Database performance issues?
   - Network connectivity problems?
   - Database connection pool exhaustion?
   - Recent deployment or configuration change?

5. **Mitigate**:
   - Scale database if performance issue
   - Increase connection pool if exhaustion
   - Rollback if recent deployment caused issue

6. **Communicate**: Update status page and notify stakeholders

#### Scenario 4: Database Completely Unavailable
**Severity**: CRITICAL
**Actions**:
1. **Immediate**: All idempotency checks will fail
2. **Risk**: High potential for duplicate task creation
3. **Monitor**: Watch for duplicate tasks being created
4. **Communicate**: Notify stakeholders of potential duplicates
5. **Post-recovery**: Run deduplication query to identify and merge duplicates

### Cleanup and Maintenance

Old failure records should be cleaned up periodically:

```sql
-- Delete failure records older than 30 days
DELETE FROM idempotency_failures
WHERE created_at < NOW() - INTERVAL '30 days';
```

Add to daily maintenance cron job:
```typescript
import { cleanupOldFailures } from './services/idempotencyMonitoring';

// Run daily at 2 AM
schedule.scheduleJob('0 2 * * *', async () => {
  await cleanupOldFailures(30); // Keep 30 days of history
});
```

### Preventing Idempotency Failures

Best practices to minimize idempotency check failures:

1. **Database Connection Pooling**: Use appropriate pool size (recommend: 20-50 connections)
2. **Query Timeout**: Set reasonable timeout (recommend: 5000ms)
3. **Connection Retry**: Implement connection retry logic with exponential backoff
4. **Database Monitoring**: Monitor database health proactively
5. **Graceful Degradation**: Ensure fail-open behavior is maintained
6. **Regular Testing**: Test idempotency under database stress conditions

### Metrics to Track

Key metrics for long-term monitoring:

1. **Failure Rate**: Failures per hour/day/week
2. **Failure Distribution**: By source and by reason
3. **Mean Time Between Failures (MTBF)**: Average time between failures
4. **Recovery Success Rate**: % of webhooks successfully processed despite failures
5. **Duplicate Creation Rate**: % of webhooks that created duplicates during failures

## Implementation Details

### Fail-Open Strategy

If the idempotency check fails (database error, network issue), the system **fails open** - it allows the webhook to be processed rather than rejecting it. This prevents legitimate webhooks from being blocked due to temporary infrastructure issues.

```typescript
try {
  const existingEvent = await db.query.webhookEvents.findFirst({...});
  if (existingEvent) {
    return duplicate response;
  }
} catch (error) {
  console.error('Idempotency check failed:', error);
  // Continue processing - don't block legitimate webhooks
}
```

### Recording Failures

If recording the webhook event fails after processing, we log the error but **do not fail the webhook**. This prevents webhook retries when the task was already created successfully.

```typescript
try {
  await db.insert(webhookEvents).values({...});
} catch (error) {
  console.error('Failed to record webhook event:', error);
  // Don't throw - the task was already created
}
```

### Race Condition Handling

The database unique constraint on `(event_id, source)` provides atomic duplicate detection. If two identical webhooks arrive simultaneously:

1. Both check the database (no existing event found)
2. Both try to insert into `webhook_events`
3. **One succeeds**, the other gets a unique constraint violation
4. The failed insert indicates a duplicate was detected
5. Both webhooks may create tasks, but only one event record is stored

**Note**: There's a small race condition window where both webhooks might create tasks before the event is recorded. To fully prevent this, we would need distributed locking or database-level locking, which may be added in a future iteration.

## Testing

### Manual Testing

Test idempotency by sending duplicate webhooks:

```bash
# First webhook - should create task
curl -X POST http://localhost:5000/webhooks/conduit \
  -H "Content-Type: application/json" \
  -H "X-Event-ID: test-123" \
  -H "X-Conduit-Signature: sha256=$(echo -n '{"type":"escalation.created"}' | openssl dgst -sha256 -hmac 'your-secret' | cut -d' ' -f2)" \
  -d '{"type":"escalation.created","escalation":{"id":"test-esc","title":"Test"}}'

# Second webhook - should return duplicate
curl -X POST http://localhost:5000/webhooks/conduit \
  -H "Content-Type: application/json" \
  -H "X-Event-ID: test-123" \
  -H "X-Conduit-Signature: sha256=$(echo -n '{"type":"escalation.created"}' | openssl dgst -sha256 -hmac 'your-secret' | cut -d' ' -f2)" \
  -d '{"type":"escalation.created","escalation":{"id":"test-esc","title":"Test"}}'
```

### Automated Testing

Run the comprehensive test suite:

```bash
npm test tests/webhooks/idempotency.test.ts
```

The test suite covers:
- First-time webhook processing
- Duplicate webhook rejection
- Concurrent duplicate handling
- Event ID extraction priority
- Cross-source idempotency
- Event storage and timestamps

## Performance

### Overhead

The idempotency check adds minimal overhead to webhook processing:

1. **Database query**: ~5-10ms for indexed lookup
2. **Event recording**: ~5-10ms for insert
3. **Total overhead**: ~10-20ms per webhook

This is well within the acceptable range for webhook processing.

### Scaling Considerations

For high-volume webhook processing (>1000 webhooks/second):

1. **Database indexing**: Ensure `(event_id, source)` index is optimal
2. **Connection pooling**: Use database connection pooling
3. **Async recording**: Consider async event recording (trade-off: potential duplicates)
4. **Partitioning**: Partition `webhook_events` table by date for large datasets

## Migration Steps

After implementing this feature:

1. **Deploy to staging**
   ```bash
   git push origin staging
   ```

2. **Run database migration**
   ```bash
   npm run db:push
   ```

3. **Test with duplicate webhooks**
   - Send test webhooks twice
   - Verify duplicate detection works
   - Check logs for idempotency messages

4. **Monitor logs**
   ```bash
   # Look for idempotency check logs
   grep "Idempotency Check" logs/app.log
   grep "Duplicate webhook blocked" logs/app.log
   ```

5. **Deploy to production**
   ```bash
   git push origin main
   ```

6. **Monitor for 24 hours**
   - Check duplicate rates
   - Verify no legitimate webhooks are blocked
   - Monitor error rates

7. **Verify success**
   - No duplicate tasks created
   - Webhook senders receiving appropriate responses
   - Logs show duplicate detection working

## Troubleshooting

### Problem: Webhooks always returning duplicate

**Possible causes:**
1. Event ID is not unique (e.g., hardcoded to `"1"`)
2. Event ID extraction is deterministic and payload hasn't changed

**Solutions:**
1. Check event ID generation logic in webhook sender
2. Ensure event IDs are truly unique per event
3. Add timestamp or UUID to event IDs

### Problem: Legitimate webhooks being rejected as duplicates

**Possible causes:**
1. Webhook sender is reusing event IDs
2. System clock skew causing premature event ID reuse

**Solutions:**
1. Contact webhook sender to fix event ID generation
2. Temporarily clear old webhook events (if safe)
3. Adjust event ID extraction logic if needed

### Problem: Database unique constraint violations in logs

**This is expected!** Unique constraint violations are the mechanism for detecting duplicates. If you see these errors, it means:
- The idempotency system is working correctly
- A duplicate webhook was detected at the database level
- No duplicate task was created

### Problem: High memory usage from webhook_events table

**Solutions:**
1. **Archive old events**: Move events older than 90 days to cold storage
2. **Implement cleanup job**: Delete events older than 1 year
3. **Partition table**: Use PostgreSQL partitioning by date

Example cleanup job:

```sql
-- Delete webhook events older than 1 year
DELETE FROM webhook_events
WHERE created_at < NOW() - INTERVAL '1 year';
```

## Security Considerations

### Event ID Prediction

An attacker who can predict future event IDs could:
1. Send webhooks with those event IDs
2. Block legitimate webhooks from being processed (DoS attack)

**Mitigation:**
- Event IDs should be unpredictable (include randomness)
- HMAC signature verification prevents unauthorized webhooks
- Rate limiting prevents event ID flooding

### Request Body Storage

The `request_body` field stores the complete webhook payload, which may contain:
- PII (Personally Identifiable Information)
- Sensitive property data
- Internal system IDs

**Mitigation:**
- Webhook events table access is restricted
- Consider encrypting `request_body` field
- Implement data retention policy (delete old events)

## Future Enhancements

### 1. Distributed Locking

Implement distributed locking (Redis, PostgreSQL advisory locks) to fully prevent race conditions on concurrent duplicates.

### 2. Webhook Replay

Use stored `request_body` to replay failed webhooks:

```sql
SELECT * FROM webhook_events
WHERE task_id IS NULL  -- Failed to create task
AND created_at > NOW() - INTERVAL '1 hour';
```

### 3. Webhook Analytics Dashboard

Build dashboard showing:
- Webhook volume by source
- Duplicate rate over time
- Processing latency
- Error rates

### 4. Automatic Event Cleanup

Implement automated cleanup job:

```typescript
// Delete events older than 90 days
async function cleanupOldWebhookEvents() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  await db.delete(webhookEvents)
    .where(lt(webhookEvents.createdAt, ninetyDaysAgo));
}
```

## Support

For questions or issues with webhook idempotency:

1. **Check logs**: Look for `[Idempotency]` tagged messages
2. **Query database**: Check `webhook_events` table for event records
3. **Review monitoring**: Check duplicate rates and error rates
4. **Contact team**: Reach out to platform engineering team

## Changelog

### 2025-01-22 - Idempotency Failure Monitoring
- Added `idempotency_failures` table for failure tracking
- Implemented failure monitoring service with in-memory counters
- Enhanced idempotency middleware with detailed error logging
- Updated `/healthz` endpoint to include idempotency health metrics
- Added `/api/monitoring/idempotency` endpoint for detailed failure stats
- Added comprehensive failure monitoring documentation
- Defined alert thresholds and runbook for investigating failures

### 2025-01-22 - Initial Implementation
- Added `webhook_events` table with unique constraint
- Implemented idempotency middleware
- Updated Conduit and SuiteOp webhook handlers
- Added comprehensive test suite
- Created documentation
