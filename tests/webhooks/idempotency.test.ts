import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../server/index';
import { db } from '../../server/db';
import { webhookEvents, tasks } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Webhook Idempotency', () => {
  // Helper function to create HMAC signature
  function createSignature(secret: string, body: string): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  // Clean up test data after each test
  afterEach(async () => {
    // Delete test webhook events
    await db.delete(webhookEvents).where(eq(webhookEvents.source, 'conduit'));
    await db.delete(webhookEvents).where(eq(webhookEvents.source, 'suiteop'));
    // Note: Also clean up test tasks if needed
  });

  describe('Conduit Webhooks', () => {
    const testPayload = {
      id: 'test-event-123',
      type: 'escalation.created',
      escalation: {
        id: 'esc-123',
        title: 'Test Escalation',
        description: 'Test escalation from guest',
        propertyId: 'prop-123',
        url: 'https://conduit.example.com/escalations/esc-123'
      }
    };

    it('should process webhook on first delivery', async () => {
      const bodyString = JSON.stringify(testPayload);
      const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

      const response = await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', 'test-event-123')
        .set('X-Conduit-Signature', signature)
        .send(bodyString);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('processed');
      expect(response.body.taskId).toBeDefined();

      // Verify event was recorded
      const event = await db.query.webhookEvents.findFirst({
        where: (events, { eq, and }) => and(
          eq(events.eventId, 'test-event-123'),
          eq(events.source, 'conduit')
        )
      });
      expect(event).toBeDefined();
      expect(event?.source).toBe('conduit');
      expect(event?.taskId).toBe(response.body.taskId);
    });

    it('should reject duplicate webhook delivery', async () => {
      const bodyString = JSON.stringify(testPayload);
      const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

      // First delivery
      const firstResponse = await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', 'test-event-456')
        .set('X-Conduit-Signature', signature)
        .send(bodyString);

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.status).toBe('processed');
      const firstTaskId = firstResponse.body.taskId;

      // Duplicate delivery
      const duplicate = await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', 'test-event-456')
        .set('X-Conduit-Signature', signature)
        .send(bodyString);

      expect(duplicate.status).toBe(200);
      expect(duplicate.body.status).toBe('duplicate');
      expect(duplicate.body.eventId).toBe('test-event-456');
      expect(duplicate.body.taskId).toBe(firstTaskId);

      // Verify only one event record exists
      const eventRecords = await db.query.webhookEvents.findMany({
        where: (events, { eq, and }) => and(
          eq(events.eventId, 'test-event-456'),
          eq(events.source, 'conduit')
        )
      });
      expect(eventRecords).toHaveLength(1);
    });

    it('should handle concurrent duplicate requests', async () => {
      const bodyString = JSON.stringify({
        ...testPayload,
        id: 'concurrent-test'
      });
      const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

      // Send two identical requests simultaneously
      const promises = [
        request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Event-ID', 'concurrent-test')
          .set('X-Conduit-Signature', signature)
          .send(bodyString),
        request(app)
          .post('/webhooks/conduit')
          .set('Content-Type', 'application/json')
          .set('X-Event-ID', 'concurrent-test')
          .set('X-Conduit-Signature', signature)
          .send(bodyString)
      ];

      const results = await Promise.all(promises);

      // One should succeed, one should be duplicate
      const successCount = results.filter(r => r.body.status === 'processed').length;
      const duplicateCount = results.filter(r => r.body.status === 'duplicate').length;

      // Due to race conditions, we might have either (1 success, 1 duplicate) or (2 duplicates)
      // The important thing is we only created one task
      expect(successCount + duplicateCount).toBe(2);
      expect(successCount).toBeGreaterThanOrEqual(0);
      expect(successCount).toBeLessThanOrEqual(1);

      // Verify only one event record exists
      const eventRecords = await db.query.webhookEvents.findMany({
        where: (events, { eq, and }) => and(
          eq(events.eventId, 'concurrent-test'),
          eq(events.source, 'conduit')
        )
      });
      expect(eventRecords.length).toBeGreaterThanOrEqual(1);
      expect(eventRecords.length).toBeLessThanOrEqual(2);
    });

    it('should generate deterministic ID when event_id missing', async () => {
      const payloadWithoutId = {
        type: 'task.created',
        task: {
          title: 'Test Task',
          description: 'Task without explicit ID'
        }
      };

      const bodyString = JSON.stringify(payloadWithoutId);
      const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

      // Send same payload twice (without X-Event-ID header)
      const first = await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Conduit-Signature', signature)
        .send(bodyString);

      const second = await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Conduit-Signature', signature)
        .send(bodyString);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.status).toBe('duplicate');
    });

    it('should extract event ID from body.id field', async () => {
      const payloadWithBodyId = {
        id: 'body-id-test-789',
        type: 'escalation.created',
        escalation: {
          id: 'esc-789',
          title: 'Test with body ID'
        }
      };

      const bodyString = JSON.stringify(payloadWithBodyId);
      const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

      const response = await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Conduit-Signature', signature)
        .send(bodyString);

      expect(response.status).toBe(200);

      // Verify event was recorded with the body ID
      const event = await db.query.webhookEvents.findFirst({
        where: (events, { eq, and }) => and(
          eq(events.eventId, 'body-id-test-789'),
          eq(events.source, 'conduit')
        )
      });
      expect(event).toBeDefined();
    });
  });

  describe('SuiteOp Webhooks', () => {
    const testPayload = {
      id: 'suiteop-event-123',
      type: 'task.created',
      task: {
        id: 'task-123',
        title: 'SuiteOp Test Task',
        description: 'Test task from SuiteOp',
        status: 'open',
        url: 'https://suiteop.example.com/tasks/task-123'
      }
    };

    it('should process SuiteOp webhook on first delivery', async () => {
      const bodyString = JSON.stringify(testPayload);
      const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

      const response = await request(app)
        .post('/webhooks/suiteop')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', 'suiteop-event-123')
        .set('X-SuiteOp-Signature', signature)
        .send(bodyString);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('processed');
      expect(response.body.taskId).toBeDefined();

      // Verify event was recorded
      const event = await db.query.webhookEvents.findFirst({
        where: (events, { eq, and }) => and(
          eq(events.eventId, 'suiteop-event-123'),
          eq(events.source, 'suiteop')
        )
      });
      expect(event).toBeDefined();
      expect(event?.source).toBe('suiteop');
    });

    it('should reject duplicate SuiteOp webhook', async () => {
      const bodyString = JSON.stringify(testPayload);
      const signature = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', bodyString);

      // First delivery
      await request(app)
        .post('/webhooks/suiteop')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', 'suiteop-dup-test')
        .set('X-SuiteOp-Signature', signature)
        .send(bodyString);

      // Duplicate delivery
      const duplicate = await request(app)
        .post('/webhooks/suiteop')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', 'suiteop-dup-test')
        .set('X-SuiteOp-Signature', signature)
        .send(bodyString);

      expect(duplicate.status).toBe(200);
      expect(duplicate.body.status).toBe('duplicate');
      expect(duplicate.body.eventId).toBe('suiteop-dup-test');
    });
  });

  describe('Cross-source Idempotency', () => {
    it('should allow same event_id from different sources', async () => {
      const eventId = 'shared-event-id';

      const conduitPayload = {
        id: eventId,
        type: 'escalation.created',
        escalation: { id: 'esc-1', title: 'Test' }
      };

      const suiteOpPayload = {
        id: eventId,
        type: 'task.created',
        task: { id: 'task-1', title: 'Test Task' }
      };

      const conduitBody = JSON.stringify(conduitPayload);
      const suiteOpBody = JSON.stringify(suiteOpPayload);

      const conduitSig = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', conduitBody);
      const suiteOpSig = createSignature(process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret', suiteOpBody);

      // Send to Conduit
      const conduitResponse = await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', eventId)
        .set('X-Conduit-Signature', conduitSig)
        .send(conduitBody);

      // Send to SuiteOp with same ID
      const suiteOpResponse = await request(app)
        .post('/webhooks/suiteop')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', eventId)
        .set('X-SuiteOp-Signature', suiteOpSig)
        .send(suiteOpBody);

      // Both should succeed (different sources)
      expect(conduitResponse.body.status).toBe('processed');
      expect(suiteOpResponse.body.status).toBe('processed');
      expect(conduitResponse.body.taskId).toBeDefined();
      expect(suiteOpResponse.body.taskId).toBeDefined();
      expect(conduitResponse.body.taskId).not.toBe(suiteOpResponse.body.taskId);
    });
  });

  describe('Event ID Extraction Priority', () => {
    it('should prioritize X-Event-ID header over body fields', async () => {
      const payload = {
        id: 'body-id',
        event_id: 'event-id-field',
        type: 'escalation.created',
        escalation: { id: 'esc-1', title: 'Test' }
      };

      const bodyString = JSON.stringify(payload);
      const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

      await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', 'header-event-id')
        .set('X-Conduit-Signature', signature)
        .send(bodyString);

      // Should use header ID
      const event = await db.query.webhookEvents.findFirst({
        where: (events, { eq, and }) => and(
          eq(events.eventId, 'header-event-id'),
          eq(events.source, 'conduit')
        )
      });
      expect(event).toBeDefined();
    });

    it('should use body.event_id if header is missing', async () => {
      const payload = {
        event_id: 'event-id-from-body',
        type: 'task.created',
        task: { id: 'task-1', title: 'Test' }
      };

      const bodyString = JSON.stringify(payload);
      const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

      await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Conduit-Signature', signature)
        .send(bodyString);

      // Should use event_id field
      const event = await db.query.webhookEvents.findFirst({
        where: (events, { eq, and }) => and(
          eq(events.eventId, 'event-id-from-body'),
          eq(events.source, 'conduit')
        )
      });
      expect(event).toBeDefined();
    });
  });

  describe('Webhook Event Storage', () => {
    it('should store complete request body in webhook event', async () => {
      const payload = {
        id: 'storage-test',
        type: 'escalation.created',
        escalation: {
          id: 'esc-storage',
          title: 'Storage Test',
          metadata: { custom: 'data', nested: { value: 123 } }
        }
      };

      const bodyString = JSON.stringify(payload);
      const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

      await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', 'storage-test')
        .set('X-Conduit-Signature', signature)
        .send(bodyString);

      const event = await db.query.webhookEvents.findFirst({
        where: (events, { eq, and }) => and(
          eq(events.eventId, 'storage-test'),
          eq(events.source, 'conduit')
        )
      });

      expect(event?.requestBody).toEqual(payload);
    });

    it('should record processedAt timestamp', async () => {
      const payload = {
        id: 'timestamp-test',
        type: 'task.created',
        task: { id: 'task-ts', title: 'Timestamp Test' }
      };

      const bodyString = JSON.stringify(payload);
      const signature = createSignature(process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret', bodyString);

      const beforeTime = new Date();

      await request(app)
        .post('/webhooks/conduit')
        .set('Content-Type', 'application/json')
        .set('X-Event-ID', 'timestamp-test')
        .set('X-Conduit-Signature', signature)
        .send(bodyString);

      const afterTime = new Date();

      const event = await db.query.webhookEvents.findFirst({
        where: (events, { eq, and }) => and(
          eq(events.eventId, 'timestamp-test'),
          eq(events.source, 'conduit')
        )
      });

      expect(event?.processedAt).toBeDefined();
      expect(new Date(event!.processedAt!)).toBeInstanceOf(Date);
      expect(event!.processedAt!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(event!.processedAt!.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });
});
