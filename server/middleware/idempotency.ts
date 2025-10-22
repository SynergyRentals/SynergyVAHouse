import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { webhookEvents } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { recordIdempotencyFailure, categorizeError } from '../services/idempotencyMonitoring';

// Extend Request interface to include webhook metadata
declare global {
  namespace Express {
    interface Request {
      webhookEventId?: string;
      webhookSource?: string;
    }
  }
}

/**
 * Generates a deterministic event ID from webhook body if not provided
 */
function generateEventId(body: any): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(body));
  return hash.digest('hex');
}

/**
 * Extracts event ID from various webhook formats
 */
function extractEventId(req: Request): string {
  // Priority 1: X-Event-ID header
  const headerEventId = req.headers['x-event-id'];
  if (headerEventId && typeof headerEventId === 'string') {
    return headerEventId;
  }

  // Priority 2: Body id field
  if (req.body?.id) {
    return String(req.body.id);
  }

  // Priority 3: Body event_id field
  if (req.body?.event_id) {
    return String(req.body.event_id);
  }

  // Priority 4: Body messageId field (some webhooks use this)
  if (req.body?.messageId) {
    return String(req.body.messageId);
  }

  // Fallback: Generate deterministic ID from body
  return generateEventId(req.body);
}

/**
 * Extracts webhook source from URL path
 */
function extractSource(path: string): string {
  const parts = path.split('/');
  const sourceIndex = parts.indexOf('webhooks') + 1;
  return parts[sourceIndex] || 'unknown';
}

/**
 * Middleware to ensure webhook idempotency
 * Prevents duplicate webhook processing by checking event_id + source
 */
export async function ensureWebhookIdempotency(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const source = extractSource(req.path);
  const eventId = extractEventId(req);

  // Log for monitoring
  console.log(`[Idempotency Check] source=${source} eventId=${eventId}`);

  try {
    // Check if this event has already been processed
    const existingEvent = await db.query.webhookEvents.findFirst({
      where: and(
        eq(webhookEvents.eventId, eventId),
        eq(webhookEvents.source, source)
      )
    });

    if (existingEvent) {
      console.log(`[Idempotency] Duplicate webhook blocked: ${eventId} from ${source}`);

      // Return success (200) to prevent retries, but indicate it's a duplicate
      res.status(200).json({
        status: 'duplicate',
        message: 'Event already processed',
        eventId,
        processedAt: existingEvent.processedAt,
        taskId: existingEvent.taskId
      });
      return;
    }

    // Store event ID in request for downstream use
    req.webhookEventId = eventId;
    req.webhookSource = source;

    // Proceed to webhook handler
    next();
  } catch (error) {
    // Enhanced error logging with full context
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error(`[Idempotency Error] Failed to check idempotency for event ${eventId} from ${source}:`, {
      eventId,
      source,
      error: errorMessage,
      stack: errorStack
    });

    // Record the failure for monitoring and alerting
    const failureReason = categorizeError(error);
    await recordIdempotencyFailure({
      eventId,
      source,
      failureReason,
      errorMessage,
      errorStack,
      requestBody: req.body,
      recoveryAction: 'fail_open'
    });

    // On error, fail open (allow processing) to prevent blocking legitimate webhooks
    // But log the error for investigation
    req.webhookEventId = eventId;
    req.webhookSource = source;
    next();
  }
}

/**
 * Helper function to record webhook event after processing
 * Call this from webhook handlers after successfully creating a task
 */
export async function recordWebhookEvent(
  eventId: string,
  source: string,
  requestBody: any,
  taskId?: string
): Promise<void> {
  try {
    await db.insert(webhookEvents).values({
      eventId,
      source,
      requestBody,
      taskId: taskId || null
    });
    console.log(`[Idempotency] Recorded webhook event: ${eventId}`);
  } catch (error) {
    console.error(`[Idempotency Error] Failed to record webhook event:`, error);
    // Don't throw - recording failure shouldn't break the webhook
  }
}
