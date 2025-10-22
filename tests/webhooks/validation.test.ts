import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../server/index';
import crypto from 'crypto';
import { ConduitWebhookSchema, SuiteOpWebhookSchema } from '../../server/webhooks/schemas';

describe('Webhook Validation', () => {
  // Helper function to create HMAC signature
  function createSignature(secret: string, body: string): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  describe('Conduit Webhook Validation', () => {
    describe('Valid Payloads', () => {
      it('should accept valid escalation.created payload', async () => {
        const validPayload = {
          type: 'escalation.created',
          id: 'valid-esc-1',
          escalation: {
            id: 'esc-123',
            type: 'refund_request',
            reservation_id: 'res-456',
            guest_name: 'John Doe',
            property_name: 'Beach House',
            url: 'https://conduit.example.com/escalations/esc-123',
            priority: 'high'
          }
        };

        const bodyString = JSON.stringify(validPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Event-ID', 'valid-esc-1')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(200);
        expect(response.body.status).toMatch(/processed|duplicate/);
      });

      it('should accept valid task.created payload', async () => {
        const validPayload = {
          type: 'task.created',
          id: 'valid-task-1',
          task: {
            id: 'task-789',
            title: 'Fix WiFi issue',
            category: 'internet.wifi_issue',
            priority: 'medium',
            status: 'open',
            url: 'https://conduit.example.com/tasks/task-789'
          }
        };

        const bodyString = JSON.stringify(validPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Event-ID', 'valid-task-1')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(200);
        expect(response.body.status).toMatch(/processed|duplicate/);
      });

      it('should accept valid task.updated payload', async () => {
        const validPayload = {
          type: 'task.updated',
          id: 'valid-task-update-1',
          task: {
            id: 'task-999',
            status: 'resolved'
          }
        };

        const bodyString = JSON.stringify(validPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Event-ID', 'valid-task-update-1')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(200);
        expect(response.body.status).toMatch(/processed|duplicate/);
      });

      it('should accept valid ai.help_requested payload', async () => {
        const validPayload = {
          type: 'ai.help_requested',
          id: 'valid-ai-1',
          request: {
            id: 'req-111',
            subject: 'Need help with guest refund'
          }
        };

        const bodyString = JSON.stringify(validPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Event-ID', 'valid-ai-1')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(200);
        expect(response.body.status).toMatch(/processed|duplicate/);
      });
    });

    describe('Missing Required Fields', () => {
      it('should reject payload without type field', async () => {
        const invalidPayload = {
          id: 'missing-type',
          escalation: {
            id: 'esc-123'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toBeDefined();
        expect(response.body.details.some((d: any) => d.path === 'type')).toBe(true);
      });

      it('should reject escalation.created without escalation object', async () => {
        const invalidPayload = {
          type: 'escalation.created',
          id: 'missing-escalation'
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.message).toContain('Missing required nested object');
      });

      it('should reject task.created without task object', async () => {
        const invalidPayload = {
          type: 'task.created',
          id: 'missing-task'
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.message).toContain('Missing required nested object');
      });

      it('should reject ai.help_requested without request object', async () => {
        const invalidPayload = {
          type: 'ai.help_requested',
          id: 'missing-request'
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.message).toContain('Missing required nested object');
      });
    });

    describe('Invalid Data Types', () => {
      it('should reject invalid event type', async () => {
        const invalidPayload = {
          type: 'invalid.event.type',
          id: 'invalid-type',
          task: {
            id: 'task-123'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details.some((d: any) => d.path === 'type')).toBe(true);
      });

      it('should reject invalid escalation type', async () => {
        const invalidPayload = {
          type: 'escalation.created',
          id: 'invalid-esc-type',
          escalation: {
            id: 'esc-123',
            type: 'invalid_escalation_type'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should reject invalid priority value', async () => {
        const invalidPayload = {
          type: 'escalation.created',
          id: 'invalid-priority',
          escalation: {
            id: 'esc-123',
            priority: 'super-duper-urgent'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should reject invalid task status', async () => {
        const invalidPayload = {
          type: 'task.updated',
          id: 'invalid-status',
          task: {
            id: 'task-123',
            status: 'super_done'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('Max Length Validation', () => {
      it('should reject ID exceeding max length', async () => {
        const longId = 'x'.repeat(256); // MAX_ID_LENGTH is 255
        const invalidPayload = {
          type: 'task.created',
          id: longId,
          task: {
            id: 'task-123',
            title: 'Test Task'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details.some((d: any) =>
          d.path === 'id' && d.message.includes('255')
        )).toBe(true);
      });

      it('should reject string field exceeding max length', async () => {
        const longString = 'x'.repeat(1001); // MAX_STRING_LENGTH is 1000
        const invalidPayload = {
          type: 'escalation.created',
          id: 'long-string-test',
          escalation: {
            id: 'esc-123',
            guest_name: longString
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details.some((d: any) =>
          d.path === 'escalation.guest_name' && d.message.includes('1000')
        )).toBe(true);
      });

      it('should reject URL exceeding max length', async () => {
        const longUrl = 'https://example.com/' + 'x'.repeat(2049); // MAX_URL_LENGTH is 2048
        const invalidPayload = {
          type: 'escalation.created',
          id: 'long-url-test',
          escalation: {
            id: 'esc-123',
            url: longUrl
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details.some((d: any) =>
          d.path === 'escalation.url' && d.message.includes('2048')
        )).toBe(true);
      });
    });

    describe('Clear Error Messages', () => {
      it('should provide clear error messages for validation failures', async () => {
        const invalidPayload = {
          type: 'escalation.created',
          // Missing escalation object
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Conduit-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('details');
        expect(Array.isArray(response.body.details)).toBe(true);
        expect(response.body.details.length).toBeGreaterThan(0);
        expect(response.body.details[0]).toHaveProperty('path');
        expect(response.body.details[0]).toHaveProperty('message');
      });
    });
  });

  describe('SuiteOp Webhook Validation', () => {
    describe('Valid Payloads', () => {
      it('should accept valid task.created payload', async () => {
        const validPayload = {
          type: 'task.created',
          id: 'suiteop-valid-1',
          task: {
            id: 'task-456',
            type: 'cleaning',
            property_name: 'Ocean View Condo',
            location: 'Unit 302',
            priority: 'high',
            status: 'open',
            url: 'https://suiteop.example.com/tasks/task-456'
          }
        };

        const bodyString = JSON.stringify(validPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-Event-ID', 'suiteop-valid-1')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(200);
        expect(response.body.status).toMatch(/processed|duplicate/);
      });

      it('should accept valid task.updated payload', async () => {
        const validPayload = {
          type: 'task.updated',
          id: 'suiteop-update-1',
          task: {
            id: 'task-789',
            status: 'completed'
          }
        };

        const bodyString = JSON.stringify(validPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-Event-ID', 'suiteop-update-1')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(200);
        expect(response.body.status).toMatch(/processed|duplicate/);
      });
    });

    describe('Missing Required Fields', () => {
      it('should reject payload without type field', async () => {
        const invalidPayload = {
          id: 'suiteop-missing-type',
          task: {
            id: 'task-123'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details.some((d: any) => d.path === 'type')).toBe(true);
      });

      it('should reject task event without task object', async () => {
        const invalidPayload = {
          type: 'task.created',
          id: 'suiteop-missing-task'
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.message).toContain('Missing required task object');
      });
    });

    describe('Invalid Data Types', () => {
      it('should reject invalid event type', async () => {
        const invalidPayload = {
          type: 'invalid.event',
          id: 'suiteop-invalid-type',
          task: {
            id: 'task-123'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details.some((d: any) => d.path === 'type')).toBe(true);
      });

      it('should reject invalid task type', async () => {
        const invalidPayload = {
          type: 'task.created',
          id: 'suiteop-invalid-task-type',
          task: {
            id: 'task-123',
            type: 'invalid_task_type'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should reject invalid priority value', async () => {
        const invalidPayload = {
          type: 'task.created',
          id: 'suiteop-invalid-priority',
          task: {
            id: 'task-123',
            priority: 'critical-emergency'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should reject invalid task status', async () => {
        const invalidPayload = {
          type: 'task.updated',
          id: 'suiteop-invalid-status',
          task: {
            id: 'task-123',
            status: 'super_cancelled'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('Max Length Validation', () => {
      it('should reject ID exceeding max length', async () => {
        const longId = 'x'.repeat(256);
        const invalidPayload = {
          type: 'task.created',
          id: longId,
          task: {
            id: 'task-123'
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details.some((d: any) =>
          d.path === 'id' && d.message.includes('255')
        )).toBe(true);
      });

      it('should reject property_name exceeding max length', async () => {
        const longString = 'x'.repeat(1001);
        const invalidPayload = {
          type: 'task.created',
          id: 'suiteop-long-string',
          task: {
            id: 'task-123',
            property_name: longString
          }
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details.some((d: any) =>
          d.path === 'task.property_name' && d.message.includes('1000')
        )).toBe(true);
      });
    });

    describe('Clear Error Messages', () => {
      it('should provide clear error messages for validation failures', async () => {
        const invalidPayload = {
          type: 'task.created',
          // Missing task object
        };

        const bodyString = JSON.stringify(invalidPayload);
        const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

        const response = await request(app)
          .post('/webhooks/suiteop')
          .set('Content-Type', 'application/json')
          .set('X-SuiteOp-Signature', signature)
          .send(bodyString);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('details');
        expect(Array.isArray(response.body.details)).toBe(true);
        expect(response.body.details.length).toBeGreaterThan(0);
        expect(response.body.details[0]).toHaveProperty('path');
        expect(response.body.details[0]).toHaveProperty('message');
      });
    });
  });

  describe('Schema Unit Tests', () => {
    describe('ConduitWebhookSchema', () => {
      it('should validate correct escalation.created schema', () => {
        const validData = {
          type: 'escalation.created',
          id: 'test-1',
          escalation: {
            id: 'esc-1',
            type: 'refund_request'
          }
        };

        const result = ConduitWebhookSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it('should validate correct task.created schema', () => {
        const validData = {
          type: 'task.created',
          task: {
            id: 'task-1',
            title: 'Test Task'
          }
        };

        const result = ConduitWebhookSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it('should validate correct ai.help_requested schema', () => {
        const validData = {
          type: 'ai.help_requested',
          request: {
            id: 'req-1',
            subject: 'Help needed'
          }
        };

        const result = ConduitWebhookSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it('should reject escalation.created without escalation object', () => {
        const invalidData = {
          type: 'escalation.created',
          id: 'test-1'
        };

        const result = ConduitWebhookSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });

    describe('SuiteOpWebhookSchema', () => {
      it('should validate correct task.created schema', () => {
        const validData = {
          type: 'task.created',
          task: {
            id: 'task-1',
            type: 'cleaning'
          }
        };

        const result = SuiteOpWebhookSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it('should reject task.created without task object', () => {
        const invalidData = {
          type: 'task.created',
          id: 'test-1'
        };

        const result = SuiteOpWebhookSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });
  });
});
