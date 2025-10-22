/**
 * Custom error types for webhook handling
 * These errors help distinguish between different failure modes and provide
 * appropriate HTTP status codes and retry guidance to webhook senders.
 */

export interface WebhookErrorContext {
  eventId?: string;
  source?: string;
  timestamp?: Date;
  webhookType?: string;
  correlationId?: string;
  retryable?: boolean;
  retryAfter?: number;
  [key: string]: any;
}

/**
 * Base webhook error class with common properties
 */
export class WebhookError extends Error {
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly context: WebhookErrorContext;
  public readonly correlationId: string;

  constructor(
    message: string,
    statusCode: number,
    retryable: boolean,
    context: WebhookErrorContext = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.correlationId = context.correlationId || this.generateCorrelationId();
    this.context = {
      ...context,
      correlationId: this.correlationId,
      timestamp: context.timestamp || new Date(),
      retryable
    };

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  private generateCorrelationId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert error to JSON format suitable for API responses
   */
  toJSON() {
    return {
      error: {
        type: this.name,
        message: this.message,
        correlationId: this.correlationId,
        retryable: this.retryable,
        retryAfter: this.context.retryAfter,
        timestamp: this.context.timestamp,
        eventId: this.context.eventId,
        source: this.context.source
      }
    };
  }

  /**
   * Get detailed error information for logging
   */
  toLogFormat() {
    return {
      errorType: this.name,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      correlationId: this.correlationId,
      eventId: this.context.eventId,
      source: this.context.source,
      webhookType: this.context.webhookType,
      timestamp: this.context.timestamp,
      stack: this.stack,
      context: this.context
    };
  }
}

/**
 * WebhookValidationError
 * Used for payload validation failures, signature verification, malformed requests
 * HTTP Status: 400 Bad Request (not retryable)
 */
export class WebhookValidationError extends WebhookError {
  constructor(message: string, context: WebhookErrorContext = {}) {
    super(message, 400, false, context);
  }
}

/**
 * WebhookProcessingError
 * Used for business logic failures, mapping errors, playbook issues
 * HTTP Status: 500 Internal Server Error (retryable)
 */
export class WebhookProcessingError extends WebhookError {
  constructor(message: string, context: WebhookErrorContext = {}) {
    super(message, 500, true, context);
  }
}

/**
 * WebhookDatabaseError
 * Used for database operation failures, connection issues
 * HTTP Status: 503 Service Unavailable (retryable)
 */
export class WebhookDatabaseError extends WebhookError {
  constructor(message: string, context: WebhookErrorContext = {}) {
    // Retry after 30 seconds for database errors
    super(message, 503, true, { ...context, retryAfter: 30 });
  }
}

/**
 * WebhookAuthenticationError
 * Used for signature verification failures, missing authentication
 * HTTP Status: 401 Unauthorized (not retryable without fixing auth)
 */
export class WebhookAuthenticationError extends WebhookError {
  constructor(message: string, context: WebhookErrorContext = {}) {
    super(message, 401, false, context);
  }
}

/**
 * WebhookRateLimitError
 * Used when rate limits are exceeded
 * HTTP Status: 429 Too Many Requests (retryable after delay)
 */
export class WebhookRateLimitError extends WebhookError {
  constructor(message: string, retryAfter: number = 60, context: WebhookErrorContext = {}) {
    super(message, 429, true, { ...context, retryAfter });
  }
}

/**
 * Helper function to wrap database operations with proper error handling
 */
export async function wrapDatabaseOperation<T>(
  operation: () => Promise<T>,
  errorContext: WebhookErrorContext
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Check if it's already a webhook error
    if (error instanceof WebhookError) {
      throw error;
    }

    // Wrap database errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    throw new WebhookDatabaseError(
      `Database operation failed: ${errorMessage}`,
      {
        ...errorContext,
        originalError: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error
      }
    );
  }
}

/**
 * Helper function to wrap business logic with proper error handling
 */
export async function wrapProcessingOperation<T>(
  operation: () => Promise<T>,
  errorContext: WebhookErrorContext
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Check if it's already a webhook error
    if (error instanceof WebhookError) {
      throw error;
    }

    // Wrap processing errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    throw new WebhookProcessingError(
      `Processing operation failed: ${errorMessage}`,
      {
        ...errorContext,
        originalError: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error
      }
    );
  }
}

/**
 * Logger for webhook errors with structured output
 */
export function logWebhookError(error: WebhookError | Error, additionalContext?: any) {
  const timestamp = new Date().toISOString();

  if (error instanceof WebhookError) {
    const logData = {
      ...error.toLogFormat(),
      additionalContext,
      loggedAt: timestamp
    };

    console.error(`[Webhook Error ${error.correlationId}]`, JSON.stringify(logData, null, 2));
  } else {
    // Handle non-webhook errors
    console.error(`[Webhook Error]`, {
      errorType: error.name,
      message: error.message,
      stack: error.stack,
      additionalContext,
      loggedAt: timestamp
    });
  }
}

/**
 * Format error response for webhook clients
 */
export function formatErrorResponse(error: WebhookError | Error) {
  if (error instanceof WebhookError) {
    return error.toJSON();
  }

  // Fallback for unexpected errors
  return {
    error: {
      type: 'InternalError',
      message: 'An unexpected error occurred',
      retryable: true,
      timestamp: new Date()
    }
  };
}
