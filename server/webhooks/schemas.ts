import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { fromZodError } from 'zod-validation-error';

/**
 * Maximum lengths for string fields to prevent abuse
 */
const MAX_STRING_LENGTH = 1000;
const MAX_TEXT_LENGTH = 5000;
const MAX_ID_LENGTH = 255;
const MAX_URL_LENGTH = 2048;

/**
 * Conduit Webhook Schemas
 */

// Escalation object schema for escalation.created events
const ConduitEscalationSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  type: z.enum(['refund_request', 'cancellation_request', 'guest_message', 'access_issue']).optional(),
  reservation_id: z.string().max(MAX_ID_LENGTH).optional(),
  guest_name: z.string().max(MAX_STRING_LENGTH).optional(),
  property_name: z.string().max(MAX_STRING_LENGTH).optional(),
  url: z.string().max(MAX_URL_LENGTH).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

// Task object schema for task.created and task.updated events
const ConduitTaskSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  title: z.string().max(MAX_STRING_LENGTH).optional(),
  category: z.string().max(MAX_STRING_LENGTH).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  url: z.string().max(MAX_URL_LENGTH).optional(),
});

// Request object schema for ai.help_requested events
const ConduitRequestSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  subject: z.string().max(MAX_STRING_LENGTH).optional(),
});

// Main Conduit webhook schema
export const ConduitWebhookSchema = z.object({
  type: z.enum([
    'escalation.created',
    'task.created',
    'task.updated',
    'ai.help_requested'
  ]),
  id: z.string().max(MAX_ID_LENGTH).optional(),
  event_id: z.string().max(MAX_ID_LENGTH).optional(),
  escalation: ConduitEscalationSchema.optional(),
  task: ConduitTaskSchema.optional(),
  request: ConduitRequestSchema.optional(),
}).refine(
  (data) => {
    // Ensure escalation object exists for escalation.created events
    if (data.type === 'escalation.created') {
      return data.escalation !== undefined;
    }
    // Ensure task object exists for task events
    if (data.type === 'task.created' || data.type === 'task.updated') {
      return data.task !== undefined;
    }
    // Ensure request object exists for ai.help_requested events
    if (data.type === 'ai.help_requested') {
      return data.request !== undefined;
    }
    return true;
  },
  {
    message: 'Missing required nested object for event type',
  }
);

/**
 * SuiteOp Webhook Schemas
 */

// Task object schema for SuiteOp webhooks
const SuiteOpTaskSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  type: z.enum(['cleaning', 'maintenance', 'inventory', 'wifi']).optional(),
  property_name: z.string().max(MAX_STRING_LENGTH).optional(),
  location: z.string().max(MAX_STRING_LENGTH).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
  url: z.string().max(MAX_URL_LENGTH).optional(),
});

// Main SuiteOp webhook schema
export const SuiteOpWebhookSchema = z.object({
  type: z.enum(['task.created', 'task.updated']),
  id: z.string().max(MAX_ID_LENGTH).optional(),
  event_id: z.string().max(MAX_ID_LENGTH).optional(),
  task: SuiteOpTaskSchema.optional(),
}).refine(
  (data) => {
    // Ensure task object exists for task events
    return data.task !== undefined;
  },
  {
    message: 'Missing required task object for event type',
  }
);

/**
 * Express middleware factory for validating webhook payloads
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function validateWebhook<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate the request body against the schema
      schema.parse(req.body);

      // Validation passed, proceed to next middleware
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Convert Zod error to a human-readable format
        const validationError = fromZodError(error);

        console.error('[Webhook Validation Error]', {
          source: req.path,
          errors: validationError.details,
          payload: req.body,
        });

        // Return 400 Bad Request with clear error message
        res.status(400).json({
          error: 'Validation failed',
          message: validationError.message,
          details: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
        return;
      }

      // Unexpected error during validation
      console.error('[Webhook Validation] Unexpected error:', error);
      res.status(500).json({
        error: 'Internal validation error',
      });
    }
  };
}

/**
 * Type exports for TypeScript
 */
export type ConduitWebhookPayload = z.infer<typeof ConduitWebhookSchema>;
export type SuiteOpWebhookPayload = z.infer<typeof SuiteOpWebhookSchema>;
