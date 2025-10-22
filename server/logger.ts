import winston from 'winston';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define colors for each level (for development)
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Determine if we're in production
const isProduction = process.env.NODE_ENV === 'production';

// Format for production (JSON)
const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Format for development (pretty print with colors)
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      // Remove empty or system fields
      const cleanMetadata = Object.entries(metadata)
        .filter(([key, value]) => value !== undefined && key !== 'timestamp' && key !== 'level' && key !== 'message')
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

      if (Object.keys(cleanMetadata).length > 0) {
        msg += ` ${JSON.stringify(cleanMetadata)}`;
      }
    }

    return msg;
  })
);

// Create the logger
const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: isProduction ? productionFormat : developmentFormat,
  transports: [
    // Console transport for all environments
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
  // Don't exit on uncaught exceptions
  exitOnError: false,
});

// Helper to add correlation ID to logs
export interface LogContext {
  correlationId?: string;
  userId?: string;
  webhookId?: string;
  taskId?: string;
  projectId?: string;
  duration?: number;
  [key: string]: any;
}

// Wrapper functions that handle context properly
export const log = {
  error: (message: string, context?: LogContext) => {
    logger.error(message, context || {});
  },

  warn: (message: string, context?: LogContext) => {
    logger.warn(message, context || {});
  },

  info: (message: string, context?: LogContext) => {
    logger.info(message, context || {});
  },

  debug: (message: string, context?: LogContext) => {
    logger.debug(message, context || {});
  },

  // Special method for performance logging
  performance: (operation: string, duration: number, context?: LogContext) => {
    const isSlowOperation = duration > 1000;
    const logLevel = isSlowOperation ? 'warn' : 'info';

    logger.log(logLevel, `Performance: ${operation}`, {
      ...context,
      duration,
      durationMs: `${duration}ms`,
      slow: isSlowOperation,
    });
  },

  // Special method for webhook logging
  webhook: (event: string, context?: LogContext) => {
    // In production, sample successful webhook calls (only log 1%)
    if (isProduction && event === 'received' && Math.random() > 0.01) {
      return; // Skip logging 99% of successful webhook calls in production
    }

    logger.info(`Webhook ${event}`, {
      ...context,
      webhookEvent: event,
    });
  },

  // Method for HTTP request logging
  request: (method: string, path: string, statusCode: number, context?: LogContext) => {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger.log(level, `${method} ${path} ${statusCode}`, {
      ...context,
      method,
      path,
      statusCode,
    });
  },
};

// Export the base logger for advanced use cases
export { logger };

// Export default
export default log;
