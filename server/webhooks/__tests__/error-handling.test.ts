/**
 * Test script to validate webhook error handling
 *
 * This demonstrates the different error scenarios and how they're handled:
 * - Validation errors (400 - not retryable)
 * - Authentication errors (401 - not retryable)
 * - Processing errors (500 - retryable)
 * - Database errors (503 - retryable)
 */

import {
  WebhookValidationError,
  WebhookAuthenticationError,
  WebhookProcessingError,
  WebhookDatabaseError,
  wrapDatabaseOperation,
  wrapProcessingOperation,
  formatErrorResponse
} from '../errors';

// Test 1: Validation Error
console.log('\n=== Test 1: Validation Error ===');
try {
  throw new WebhookValidationError('Invalid JSON payload', {
    eventId: 'test-123',
    source: 'conduit',
    webhookType: 'escalation.created'
  });
} catch (error: any) {
  console.log('Status Code:', error.statusCode);
  console.log('Retryable:', error.retryable);
  console.log('Response:', JSON.stringify(formatErrorResponse(error), null, 2));
}

// Test 2: Authentication Error
console.log('\n=== Test 2: Authentication Error ===');
try {
  throw new WebhookAuthenticationError('HMAC signature verification failed', {
    eventId: 'test-456',
    source: 'suiteop'
  });
} catch (error: any) {
  console.log('Status Code:', error.statusCode);
  console.log('Retryable:', error.retryable);
  console.log('Response:', JSON.stringify(formatErrorResponse(error), null, 2));
}

// Test 3: Processing Error
console.log('\n=== Test 3: Processing Error ===');
try {
  throw new WebhookProcessingError('Could not map task', {
    eventId: 'test-789',
    source: 'conduit',
    operation: 'map_task'
  });
} catch (error: any) {
  console.log('Status Code:', error.statusCode);
  console.log('Retryable:', error.retryable);
  console.log('Response:', JSON.stringify(formatErrorResponse(error), null, 2));
}

// Test 4: Database Error
console.log('\n=== Test 4: Database Error ===');
try {
  throw new WebhookDatabaseError('Database connection failed', {
    eventId: 'test-101',
    source: 'suiteop',
    operation: 'create_task'
  });
} catch (error: any) {
  console.log('Status Code:', error.statusCode);
  console.log('Retryable:', error.retryable);
  console.log('Retry After:', error.context.retryAfter, 'seconds');
  console.log('Response:', JSON.stringify(formatErrorResponse(error), null, 2));
}

// Test 5: Wrapped Database Operation
console.log('\n=== Test 5: Wrapped Database Operation (Success) ===');
wrapDatabaseOperation(
  async () => {
    return { id: 'task-123', title: 'Test Task' };
  },
  { eventId: 'test-202', source: 'conduit' }
).then(result => {
  console.log('Operation succeeded:', result);
}).catch(error => {
  console.error('Operation failed:', error.message);
});

// Test 6: Wrapped Database Operation (Failure)
console.log('\n=== Test 6: Wrapped Database Operation (Failure) ===');
wrapDatabaseOperation(
  async () => {
    throw new Error('Connection timeout');
  },
  { eventId: 'test-303', source: 'suiteop', operation: 'get_playbook' }
).then(result => {
  console.log('Operation succeeded:', result);
}).catch(error => {
  console.log('Error Type:', error.name);
  console.log('Status Code:', error.statusCode);
  console.log('Retryable:', error.retryable);
});

// Test 7: Wrapped Processing Operation (Failure)
console.log('\n=== Test 7: Wrapped Processing Operation (Failure) ===');
wrapProcessingOperation(
  async () => {
    throw new Error('Invalid playbook format');
  },
  { eventId: 'test-404', source: 'conduit', operation: 'parse_playbook' }
).then(result => {
  console.log('Operation succeeded:', result);
}).catch(error => {
  console.log('Error Type:', error.name);
  console.log('Status Code:', error.statusCode);
  console.log('Retryable:', error.retryable);
});

console.log('\n=== All tests completed ===\n');
