import crypto from 'crypto';

// Test script for webhook endpoints
// Run with: npx tsx server/test-webhooks.ts

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const CONDUIT_SECRET = process.env.WEBHOOK_CONDUIT_SECRET || 'test-conduit-secret';
const SUITEOP_SECRET = process.env.WEBHOOK_SUITEOP_SECRET || 'test-suiteop-secret';

interface WebhookTestPayload {
  url: string;
  payload: any;
  secret: string;
  signatureHeader: string;
}

function generateHMACSignature(payload: any, secret: string): string {
  const body = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function sendWebhookRequest(test: WebhookTestPayload): Promise<void> {
  const body = JSON.stringify(test.payload);
  const signature = generateHMACSignature(test.payload, test.secret);
  
  console.log(`\n🧪 Testing ${test.url}`);
  console.log(`📦 Payload: ${JSON.stringify(test.payload, null, 2)}`);
  console.log(`🔐 Signature: sha256=${signature}`);
  
  try {
    const response = await fetch(test.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [test.signatureHeader]: `sha256=${signature}`,
      },
      body,
    });
    
    const responseData = await response.text();
    console.log(`✅ Status: ${response.status}`);
    console.log(`📄 Response: ${responseData}`);
    
    if (response.status !== 200) {
      console.error(`❌ Test failed with status ${response.status}`);
    } else {
      console.log(`✅ Test passed!`);
    }
  } catch (error) {
    console.error(`❌ Request failed:`, error);
  }
}

async function testConduitWebhooks() {
  console.log('\n🔗 TESTING CONDUIT WEBHOOKS');
  
  const tests: WebhookTestPayload[] = [
    // Test 1: Escalation created
    {
      url: `${BASE_URL}/webhooks/conduit`,
      signatureHeader: 'x-conduit-signature',
      secret: CONDUIT_SECRET,
      payload: {
        type: 'escalation.created',
        id: 'esc_12345',
        escalation: {
          id: 'esc_12345',
          type: 'refund_request',
          priority: 'high',
          reservation_id: 'RES123',
          guest_name: 'John Smith',
          property_name: 'Downtown Loft',
          url: 'https://conduit.example.com/escalations/esc_12345'
        }
      }
    },
    
    // Test 2: Task created
    {
      url: `${BASE_URL}/webhooks/conduit`,
      signatureHeader: 'x-conduit-signature',
      secret: CONDUIT_SECRET,
      payload: {
        type: 'task.created',
        id: 'task_67890',
        task: {
          id: 'task_67890',
          title: 'Guest inquiry about WiFi',
          category: 'internet.wifi_issue',
          priority: 'normal'
        }
      }
    },
    
    // Test 3: AI Help requested
    {
      url: `${BASE_URL}/webhooks/conduit`,
      signatureHeader: 'x-conduit-signature',
      secret: CONDUIT_SECRET,
      payload: {
        type: 'ai.help_requested',
        id: 'ai_req_456',
        request: {
          id: 'ai_req_456',
          subject: 'Help with complex booking issue',
          description: 'Customer needs assistance with multi-property booking'
        }
      }
    }
  ];
  
  for (const test of tests) {
    await sendWebhookRequest(test);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between tests
  }
}

async function testSuiteOpWebhooks() {
  console.log('\n🏠 TESTING SUITEOP WEBHOOKS');
  
  const tests: WebhookTestPayload[] = [
    // Test 1: Cleaning task
    {
      url: `${BASE_URL}/webhooks/suiteop`,
      signatureHeader: 'x-suiteop-signature',
      secret: SUITEOP_SECRET,
      payload: {
        type: 'task.created',
        id: 'suite_task_123',
        task: {
          id: 'suite_task_123',
          type: 'cleaning',
          priority: 'urgent',
          property_name: 'Beach House Villa',
          location: 'Unit 4B',
          description: 'Deep cleaning required after checkout',
          url: 'https://suiteop.example.com/tasks/suite_task_123'
        }
      }
    },
    
    // Test 2: Maintenance task
    {
      url: `${BASE_URL}/webhooks/suiteop`,
      signatureHeader: 'x-suiteop-signature',
      secret: SUITEOP_SECRET,
      payload: {
        type: 'task.created',
        id: 'suite_task_456',
        task: {
          id: 'suite_task_456',
          type: 'maintenance',
          priority: 'normal',
          property_name: 'City Center Apartment',
          location: 'Unit 2A',
          description: 'Leaky faucet in bathroom',
          url: 'https://suiteop.example.com/tasks/suite_task_456'
        }
      }
    },
    
    // Test 3: Task updated
    {
      url: `${BASE_URL}/webhooks/suiteop`,
      signatureHeader: 'x-suiteop-signature',
      secret: SUITEOP_SECRET,
      payload: {
        type: 'task.updated',
        id: 'suite_task_123',
        task: {
          id: 'suite_task_123',
          type: 'cleaning',
          status: 'completed',
          property_name: 'Beach House Villa'
        }
      }
    }
  ];
  
  for (const test of tests) {
    await sendWebhookRequest(test);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between tests
  }
}

async function testInvalidSignatures() {
  console.log('\n🚫 TESTING INVALID SIGNATURES');
  
  const payload = {
    type: 'escalation.created',
    id: 'test_invalid'
  };
  
  // Test with wrong signature
  try {
    const response = await fetch(`${BASE_URL}/webhooks/conduit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-conduit-signature': 'sha256=invalid_signature_here',
      },
      body: JSON.stringify(payload),
    });
    
    console.log(`🔐 Invalid signature test: ${response.status === 401 ? '✅ PASSED' : '❌ FAILED'} (Status: ${response.status})`);
  } catch (error) {
    console.error('❌ Invalid signature test failed:', error);
  }
}

async function runTests() {
  console.log('🚀 WEBHOOK INTEGRATION TESTS');
  console.log(`🌐 Target URL: ${BASE_URL}`);
  console.log(`🔑 Conduit Secret: ${CONDUIT_SECRET ? 'SET' : 'NOT SET'}`);
  console.log(`🔑 SuiteOp Secret: ${SUITEOP_SECRET ? 'SET' : 'NOT SET'}`);
  
  await testConduitWebhooks();
  await testSuiteOpWebhooks();
  await testInvalidSignatures();
  
  console.log('\n✨ Test suite completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests, testConduitWebhooks, testSuiteOpWebhooks };