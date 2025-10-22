/**
 * Test script for structured logging
 * Run with: npm run tsx test-logging.ts
 */

import log from './server/logger';

console.log('\n=== Testing Structured Logging ===\n');

// Test basic logging levels
log.info('Application started', { environment: 'test', version: '1.0.0' });
log.debug('Debug information', { details: 'Some debug data' });
log.warn('Warning message', { reason: 'Something might be wrong' });

// Test error logging with stack trace
try {
  throw new Error('Test error');
} catch (error) {
  log.error('Caught an error', { error, context: 'test' });
}

// Test correlation ID logging
const correlationId = '12345-test-id';
log.info('Request received', {
  correlationId,
  method: 'POST',
  path: '/api/test'
});

// Test webhook logging
log.webhook('received', {
  correlationId,
  webhookId: 'webhook-123',
  type: 'test.event',
  source: 'test'
});

// Test performance logging
log.performance('Database query', 1500, {
  correlationId,
  query: 'SELECT * FROM tasks'
});

log.performance('Fast operation', 50, {
  correlationId,
  operation: 'cache-hit'
});

// Test request logging
log.request('GET', '/api/tasks', 200, {
  correlationId,
  duration: 45
});

log.request('POST', '/api/tasks', 500, {
  correlationId,
  duration: 2500,
  error: 'Database connection failed'
});

console.log('\n=== Logging Test Complete ===\n');
console.log('Check the output above - it should show:');
console.log('- Timestamps on all logs');
console.log('- Colored output (if in development)');
console.log('- Structured JSON context');
console.log('- Performance warnings for slow operations (>1s)');
console.log('- Proper log levels (info, debug, warn, error)');
