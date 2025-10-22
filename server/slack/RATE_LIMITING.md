# Slack API Rate Limiting

This document describes the rate limiting implementation for Slack API calls in the SynergyVAHouse application.

## Overview

We use the `bottleneck` library to implement rate limiting for all Slack API calls to prevent hitting Slack's API rate limits. The rate limiter is configured conservatively to handle Slack's Tier 1 rate limits (~1 request per second).

## Configuration

Rate limiting can be configured via environment variables:

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_RATE_LIMIT_ENABLED` | `true` | Enable/disable rate limiting |
| `SLACK_RATE_LIMIT_CONCURRENT` | `1` | Maximum concurrent requests |
| `SLACK_RATE_LIMIT_MIN_TIME` | `1000` | Minimum time between requests (ms) |
| `SLACK_RATE_LIMIT_RESERVOIR` | `10` | Burst capacity (number of requests) |
| `SLACK_RATE_LIMIT_REFRESH_AMOUNT` | `10` | Number of tokens to refresh |
| `SLACK_RATE_LIMIT_REFRESH_INTERVAL` | `10000` | Interval to refresh tokens (ms) |
| `SLACK_RATE_LIMIT_LOGGING` | `false` | Enable periodic stats logging |

### Example Configuration

```.env
# Enable rate limiting (default: true)
SLACK_RATE_LIMIT_ENABLED=true

# Allow 1 request per second
SLACK_RATE_LIMIT_CONCURRENT=1
SLACK_RATE_LIMIT_MIN_TIME=1000

# Burst handling: allow up to 10 requests to queue
SLACK_RATE_LIMIT_RESERVOIR=10
SLACK_RATE_LIMIT_REFRESH_AMOUNT=10
SLACK_RATE_LIMIT_REFRESH_INTERVAL=10000

# Enable statistics logging every 5 minutes
SLACK_RATE_LIMIT_LOGGING=true
```

### Disabling Rate Limiting (for testing)

```bash
export SLACK_RATE_LIMIT_ENABLED=false
```

## Usage

### Wrapping Slack API Calls

All Slack API calls should be wrapped with the `withRateLimit` function:

```typescript
import { withRateLimit } from '../slack/rateLimiter';

// Example: Wrapping chat.postMessage
await withRateLimit(
  () => client.chat.postMessage({
    channel: channelId,
    text: 'Hello World'
  }),
  { methodName: 'chat.postMessage' }
);

// Example: Wrapping views.open
await withRateLimit(
  () => client.views.open({
    trigger_id: triggerId,
    view: { /* ... */ }
  }),
  { methodName: 'views.open' }
);
```

### Supported Slack API Methods

The rate limiter supports all Slack Web API methods, including:

- `chat.postMessage` - Send messages
- `chat.update` - Update messages
- `views.open` - Open modals
- `views.publish` - Publish app home views
- `views.update` - Update views
- `reactions.add` - Add reactions
- `conversations.open` - Open DM channels
- `conversations.replies` - Get thread replies
- `users.info` - Get user information

## Features

### Automatic Retry with Exponential Backoff

The rate limiter automatically retries failed requests with exponential backoff:

- **Maximum retries**: 3 attempts
- **Backoff strategy**: Exponential (2^retryCount * 1000ms)
- **Maximum delay**: 30 seconds
- **Retry-After header**: Respects Slack's retry-after header when available

### Rate Limit Error Detection

The rate limiter detects Slack rate limit errors through:

- HTTP 429 status codes
- `rate_limited` error codes
- `slack_webapi_rate_limited` error codes
- Error messages containing "rate limit"

### Monitoring and Statistics

The rate limiter tracks:

- Total API calls
- Rate limit hits
- Retried calls
- Failed calls
- Last rate limit timestamp

Access statistics programmatically:

```typescript
import { getRateLimiterStats, getRateLimiterStatus } from '../slack/rateLimiter';

// Get basic statistics
const stats = getRateLimiterStats();
console.log(`Total calls: ${stats.totalCalls}`);
console.log(`Rate limit hits: ${stats.rateLimitHits}`);
console.log(`Success rate: ${(1 - stats.failedCalls / stats.totalCalls) * 100}%`);

// Get detailed queue status
const status = getRateLimiterStatus();
console.log(`Current queue: ${status.counts.QUEUED}`);
console.log(`Currently running: ${status.counts.RUNNING}`);
```

### Queue Management

The rate limiter uses a queue to handle bursts:

- **Queue monitoring**: Logs warnings when queue builds up (>5 items)
- **Priority support**: Higher priority requests can be processed first
- **Weight support**: Heavy operations can be weighted differently

Example with priority:

```typescript
await withRateLimit(
  () => client.chat.postMessage({ channel, text: 'Urgent!' }),
  {
    methodName: 'chat.postMessage',
    priority: 10,  // Higher number = higher priority (default: 5)
    weight: 1      // Weight of this job (default: 1)
  }
);
```

## Slack's Rate Limits

Slack has tiered rate limits based on method:

### Tier 1 (Most Common Methods)
- **Limit**: ~1 request per second
- **Methods**: Most chat.* and conversations.* methods
- **Our config**: 1 request/second with burst capacity of 10

### Tier 2
- **Limit**: ~20 requests per minute
- **Methods**: Some less-frequently used methods

### Tier 3
- **Limit**: ~50 requests per minute

### Tier 4
- **Limit**: ~100 requests per minute

Our default configuration is conservative (Tier 1) to ensure reliability across all methods.

## Error Handling

### Rate Limit Exceeded

When rate limits are exceeded even after retries:

```typescript
try {
  await withRateLimit(
    () => client.chat.postMessage({ channel, text }),
    { methodName: 'chat.postMessage' }
  );
} catch (error) {
  if (error.data?.error === 'rate_limited') {
    console.error('Rate limit exceeded after retries');
    // Handle gracefully - maybe queue for later or notify user
  }
}
```

### Logging

Rate limit events are logged automatically:

```
[Slack Rate Limiter] Rate limit hit. Retry attempt 1/3
[Slack Rate Limiter] Slack requested retry after 30000ms
[Slack Rate Limiter] Queue building up: 7 jobs queued, 1 running
[Slack Rate Limiter] Rate limit exceeded even after retries. This may indicate sustained high volume.
```

## Implementation Status

### Wrapped Files

✅ **Service Files**
- `server/services/followup.ts` - All API calls wrapped
- `server/services/briefings.ts` - All API calls wrapped

✅ **Slack Integration Files**
- `server/slack/message_events.ts` - All API calls wrapped
- `server/slack/app_home.ts` - All API calls wrapped
- `server/slack/modals.ts` - All API calls wrapped
- `server/slack/actions.ts` - Partially wrapped (in progress)
- `server/slack/commands.ts` - To be wrapped

### Files to Wrap

🔄 **In Progress**
- `server/slack/actions.ts` - Contains ~6 views.open and ~6 chat.postMessage calls
- `server/slack/commands.ts` - Contains ~2 views.open calls

## Best Practices

1. **Always wrap API calls**: Every Slack API call should be wrapped with `withRateLimit`
2. **Specify method names**: Include the `methodName` parameter for better logging
3. **Handle errors gracefully**: Always catch and handle rate limit errors
4. **Monitor statistics**: Periodically check rate limiter stats in production
5. **Test with rate limiting disabled**: Use `SLACK_RATE_LIMIT_ENABLED=false` for local testing
6. **Use priorities wisely**: Reserve high priorities for critical operations only

## Troubleshooting

### High Queue Build-up

If you see frequent "Queue building up" warnings:

1. Check if you're making too many API calls in bursts
2. Consider increasing `SLACK_RATE_LIMIT_RESERVOIR`
3. Review if all API calls are necessary
4. Implement batching for bulk operations

### Frequent Rate Limit Hits

If `rateLimitHits` is high:

1. Increase `SLACK_RATE_LIMIT_MIN_TIME` (slower but more conservative)
2. Reduce `SLACK_RATE_LIMIT_CONCURRENT` to 1
3. Review your application's API usage patterns
4. Consider caching responses where appropriate

### Performance Issues

If rate limiting is causing performance issues:

1. Enable logging to understand bottlenecks: `SLACK_RATE_LIMIT_LOGGING=true`
2. Review queue status: Use `getRateLimiterStatus()`
3. Consider using priorities for critical operations
4. Ensure you're not making unnecessary API calls

## Testing

### Manual Testing

```bash
# Test with rate limiting enabled
npm run dev

# Test with rate limiting disabled
SLACK_RATE_LIMIT_ENABLED=false npm run dev

# Test with verbose logging
SLACK_RATE_LIMIT_LOGGING=true npm run dev
```

### Monitoring in Production

Enable periodic logging to monitor rate limiter performance:

```bash
export SLACK_RATE_LIMIT_LOGGING=true
```

This will log statistics every 5 minutes:

```
[Slack Rate Limiter] Statistics: {
  enabled: true,
  totalCalls: 1523,
  rateLimitHits: 2,
  retriedCalls: 4,
  failedCalls: 0,
  successRate: '100.00%',
  lastRateLimitAt: '2025-10-22T10:30:15.000Z',
  currentQueue: 0,
  currentRunning: 0
}
```

## References

- [Slack API Rate Limits](https://api.slack.com/docs/rate-limits)
- [Bottleneck Documentation](https://github.com/SGrondin/bottleneck)
- [Slack Web API Client](https://slack.dev/node-slack-sdk/web-api)
