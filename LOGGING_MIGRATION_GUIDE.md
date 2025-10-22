# Structured Logging Migration Guide

## Overview

The application now uses Winston for structured logging. This guide explains how to migrate remaining console.log/console.error statements to the new logging system.

## What's Been Implemented

### Core Infrastructure
- ✅ **server/logger.ts**: Winston configuration with JSON format for production and pretty-print for development
- ✅ **server/middleware/correlationId.ts**: Middleware to track requests across the system
- ✅ **server/index.ts**: Updated to use structured logging throughout
- ✅ **server/webhooks/conduit.ts**: Updated with webhook-specific logging and correlation IDs

### Key Features
- **Log Levels**: error, warn, info, debug
- **Correlation IDs**: Automatically generated or extracted from X-Correlation-ID header
- **Performance Logging**: Automatic warnings for operations > 1s
- **Webhook Sampling**: Only logs 1% of successful webhook calls in production (always logs errors)
- **Structured Context**: All logs include relevant context (userId, taskId, webhookId, etc.)
- **Stack Traces**: Errors automatically include stack traces

## Migration Pattern

### Basic Pattern

**Before:**
```typescript
console.log('User logged in');
console.error('Failed to save task:', error);
```

**After:**
```typescript
import log from './logger';

log.info('User logged in', { userId: user.id });
log.error('Failed to save task', { taskId, error });
```

### With Correlation IDs (in route handlers)

**Before:**
```typescript
app.post('/api/tasks', async (req, res) => {
  console.log('Creating task');
  // ... task creation logic
});
```

**After:**
```typescript
import log from './logger';
import { getCorrelationId } from './middleware/correlationId';

app.post('/api/tasks', async (req, res) => {
  const correlationId = getCorrelationId(req);
  log.info('Creating task', { correlationId, userId: req.user?.id });
  // ... task creation logic
});
```

### Webhook Logging Pattern

**Before:**
```typescript
console.log('Webhook received:', payload.type);
```

**After:**
```typescript
log.webhook('received', {
  correlationId,
  webhookId: payload.id,
  type: payload.type,
  source: 'conduit'
});
```

### Performance Logging Pattern

**Before:**
```typescript
const start = Date.now();
// ... expensive operation
const duration = Date.now() - start;
if (duration > 1000) {
  console.log(`Slow operation: ${duration}ms`);
}
```

**After:**
```typescript
const start = Date.now();
// ... expensive operation
const duration = Date.now() - start;
log.performance('Operation name', duration, {
  correlationId,
  additionalContext: 'value'
});
// Automatically warns if > 1s
```

## Files That Need Migration

### High Priority (Critical Paths)
- [ ] server/webhooks/suiteop.ts (20 console statements)
- [ ] server/routes.ts
- [ ] server/api/tasks.ts
- [ ] server/api/auth/routes.ts
- [ ] server/services/taskAssignment.ts
- [ ] server/services/sla.ts
- [ ] server/services/followup.ts

### Medium Priority (Slack Integration)
- [ ] server/slack/bolt.ts
- [ ] server/slack/commands.ts
- [ ] server/slack/actions.ts
- [ ] server/slack/modals.ts
- [ ] server/slack/message_events.ts
- [ ] server/slack/app_home.ts

### Lower Priority (Background Jobs & Utilities)
- [ ] server/jobs/scheduler.ts
- [ ] server/services/briefings.ts
- [ ] server/services/mappers.ts
- [ ] server/services/metrics.ts
- [ ] server/middleware/auth.ts
- [ ] server/middleware/idempotency.ts
- [ ] server/middleware/rbac.ts

## Migration Checklist

For each file:

1. **Add imports at the top:**
   ```typescript
   import log from './logger'; // or '../logger' depending on path
   import { getCorrelationId } from './middleware/correlationId';
   ```

2. **Replace console.log with log.info:**
   - Add relevant context (userId, taskId, etc.)
   - Include correlationId when in request handlers

3. **Replace console.error with log.error:**
   - Always pass error object in context: `{ error }`
   - Include relevant context for debugging

4. **Replace console.warn with log.warn:**
   - Add context explaining why warning

5. **Replace console.debug with log.debug:**
   - Use for verbose debugging info

6. **Add special logging where appropriate:**
   - Use `log.webhook()` for webhook events
   - Use `log.performance()` for timing operations
   - Use `log.request()` is already handled in middleware

## Testing

After migrating a file:

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Run the test server:**
   ```bash
   npm run dev
   ```

3. **Verify logs appear with:**
   - Timestamps
   - Proper log levels (colored in development)
   - Structured context
   - Correlation IDs (in request flows)

## Log Levels Guide

- **error**: System errors, failed operations, exceptions
- **warn**: Unexpected situations, deprecated usage, slow operations
- **info**: Important business events, task creation, user actions
- **debug**: Detailed debugging information, verbose output

## Production Considerations

In production (NODE_ENV=production):
- Logs are in JSON format for log aggregation
- Debug logs are hidden by default (set LOG_LEVEL=debug to enable)
- Successful webhook calls are sampled at 1% (errors always logged)
- Correlation IDs help trace requests across services

## Example: Complete File Migration

See **server/webhooks/conduit.ts** for a complete example of:
- Proper import statements
- Correlation ID usage throughout
- Context-rich logging
- Error handling with logging
- Performance considerations

## Questions?

For questions or issues with the logging system, see:
- server/logger.ts for the implementation
- test-logging.ts for usage examples
