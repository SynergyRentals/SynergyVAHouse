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

### 2025-01-22 - Initial Implementation
- Added `webhook_events` table with unique constraint
- Implemented idempotency middleware
- Updated Conduit and SuiteOp webhook handlers
- Added comprehensive test suite
- Created documentation
