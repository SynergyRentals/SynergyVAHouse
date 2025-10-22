import Bottleneck from 'bottleneck';

/**
 * Slack API Rate Limiter
 *
 * Implements rate limiting for Slack API calls to prevent hitting API limits.
 *
 * Slack Rate Limits by Tier:
 * - Tier 1 (most common methods): ~1 request per second
 * - Tier 2: ~20 requests per minute
 * - Tier 3: ~50 requests per minute
 * - Tier 4: ~100 requests per minute
 *
 * This implementation uses a conservative approach with retry logic and
 * exponential backoff for handling rate limit errors.
 */

interface RateLimitStats {
  totalCalls: number;
  rateLimitHits: number;
  retriedCalls: number;
  failedCalls: number;
  lastRateLimitAt?: Date;
}

class SlackRateLimiter {
  private limiter: Bottleneck;
  private stats: RateLimitStats = {
    totalCalls: 0,
    rateLimitHits: 0,
    retriedCalls: 0,
    failedCalls: 0,
  };

  private config = {
    enabled: process.env.SLACK_RATE_LIMIT_ENABLED !== 'false', // Enabled by default
    maxConcurrent: parseInt(process.env.SLACK_RATE_LIMIT_CONCURRENT || '1', 10),
    minTime: parseInt(process.env.SLACK_RATE_LIMIT_MIN_TIME || '1000', 10), // 1 request per second
    reservoir: parseInt(process.env.SLACK_RATE_LIMIT_RESERVOIR || '10', 10), // Burst capacity
    reservoirRefreshAmount: parseInt(process.env.SLACK_RATE_LIMIT_REFRESH_AMOUNT || '10', 10),
    reservoirRefreshInterval: parseInt(process.env.SLACK_RATE_LIMIT_REFRESH_INTERVAL || '10000', 10), // 10 seconds
  };

  constructor() {
    this.limiter = new Bottleneck({
      maxConcurrent: this.config.maxConcurrent,
      minTime: this.config.minTime,
      reservoir: this.config.reservoir,
      reservoirRefreshAmount: this.config.reservoirRefreshAmount,
      reservoirRefreshInterval: this.config.reservoirRefreshInterval,

      // Retry configuration
      retryAttempts: 3,
      retryMinDelay: 1000, // 1 second
      retryMaxDelay: 30000, // 30 seconds
    });

    // Listen to Bottleneck events for monitoring
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.limiter.on('failed', async (error, jobInfo) => {
      const isRateLimitError = this.isRateLimitError(error);

      if (isRateLimitError) {
        this.stats.rateLimitHits++;
        this.stats.lastRateLimitAt = new Date();

        console.warn(`[Slack Rate Limiter] Rate limit hit. Retry attempt ${jobInfo.retryCount + 1}/3`);

        // Extract retry-after header if available
        const retryAfter = this.getRetryAfter(error);
        if (retryAfter) {
          console.warn(`[Slack Rate Limiter] Slack requested retry after ${retryAfter}ms`);
          return retryAfter;
        }

        // Exponential backoff: 2^retryCount * 1000ms
        const delay = Math.min(Math.pow(2, jobInfo.retryCount) * 1000, 30000);
        return delay;
      }

      // Don't retry non-rate-limit errors
      return undefined;
    });

    this.limiter.on('retry', () => {
      this.stats.retriedCalls++;
    });

    this.limiter.on('done', (info) => {
      if (info.error) {
        this.stats.failedCalls++;
      }
    });

    // Log queue status periodically when active
    this.limiter.on('queued', () => {
      const counts = this.limiter.counts();
      if (counts.QUEUED > 5) {
        console.warn(`[Slack Rate Limiter] Queue building up: ${counts.QUEUED} jobs queued, ${counts.RUNNING} running`);
      }
    });
  }

  /**
   * Check if an error is a rate limit error from Slack
   */
  private isRateLimitError(error: any): boolean {
    if (!error) return false;

    // Check for Slack rate limit error
    if (error.data?.error === 'rate_limited') return true;

    // Check for HTTP 429 status
    if (error.statusCode === 429) return true;
    if (error.code === 'slack_webapi_rate_limited') return true;

    // Check error message
    const errorMessage = error.message?.toLowerCase() || '';
    if (errorMessage.includes('rate limit') || errorMessage.includes('rate_limited')) {
      return true;
    }

    return false;
  }

  /**
   * Extract retry-after delay from error
   */
  private getRetryAfter(error: any): number | undefined {
    // Slack provides retry-after in seconds
    if (error.data?.['retry-after']) {
      return error.data['retry-after'] * 1000;
    }

    if (error.retryAfter) {
      return typeof error.retryAfter === 'number'
        ? error.retryAfter * 1000
        : parseInt(error.retryAfter, 10) * 1000;
    }

    return undefined;
  }

  /**
   * Wrap a Slack API call with rate limiting
   */
  async execute<T>(
    fn: () => Promise<T>,
    options?: {
      priority?: number;
      weight?: number;
      methodName?: string;
    }
  ): Promise<T> {
    if (!this.config.enabled) {
      // Rate limiting disabled, execute directly
      return fn();
    }

    this.stats.totalCalls++;

    try {
      const result = await this.limiter.schedule(
        {
          priority: options?.priority ?? 5,
          weight: options?.weight ?? 1,
        },
        fn
      );

      return result;
    } catch (error: any) {
      // Log failed API calls for monitoring
      const methodName = options?.methodName || 'unknown';
      console.error(`[Slack Rate Limiter] Failed API call to ${methodName}:`, error.message);

      // Check if it's still a rate limit error after retries
      if (this.isRateLimitError(error)) {
        console.error('[Slack Rate Limiter] Rate limit exceeded even after retries. This may indicate sustained high volume.');
      }

      throw error;
    }
  }

  /**
   * Get current rate limiting statistics
   */
  getStats(): RateLimitStats {
    return { ...this.stats };
  }

  /**
   * Get current queue status
   */
  getQueueStatus() {
    return {
      counts: this.limiter.counts(),
      config: { ...this.config },
      stats: this.getStats(),
    };
  }

  /**
   * Reset statistics (useful for testing)
   */
  resetStats(): void {
    this.stats = {
      totalCalls: 0,
      rateLimitHits: 0,
      retriedCalls: 0,
      failedCalls: 0,
    };
  }

  /**
   * Log current statistics
   */
  logStats(): void {
    const stats = this.getStats();
    const counts = this.limiter.counts();

    console.log('[Slack Rate Limiter] Statistics:', {
      enabled: this.config.enabled,
      totalCalls: stats.totalCalls,
      rateLimitHits: stats.rateLimitHits,
      retriedCalls: stats.retriedCalls,
      failedCalls: stats.failedCalls,
      successRate: stats.totalCalls > 0
        ? ((stats.totalCalls - stats.failedCalls) / stats.totalCalls * 100).toFixed(2) + '%'
        : 'N/A',
      lastRateLimitAt: stats.lastRateLimitAt?.toISOString() || 'Never',
      currentQueue: counts.QUEUED,
      currentRunning: counts.RUNNING,
    });
  }

  /**
   * Drain the queue and wait for all jobs to complete
   */
  async stop(): Promise<void> {
    await this.limiter.stop();
  }
}

// Singleton instance
const slackRateLimiter = new SlackRateLimiter();

/**
 * Log rate limiter stats every 5 minutes
 */
if (process.env.SLACK_RATE_LIMIT_LOGGING === 'true') {
  setInterval(() => {
    slackRateLimiter.logStats();
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * Helper function to wrap Slack API calls with rate limiting
 *
 * @example
 * ```typescript
 * const result = await withRateLimit(
 *   () => client.chat.postMessage({ channel, text }),
 *   { methodName: 'chat.postMessage' }
 * );
 * ```
 */
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  options?: {
    priority?: number;
    weight?: number;
    methodName?: string;
  }
): Promise<T> {
  return slackRateLimiter.execute(fn, options);
}

/**
 * Get rate limiter statistics
 */
export function getRateLimiterStats() {
  return slackRateLimiter.getStats();
}

/**
 * Get detailed queue status
 */
export function getRateLimiterStatus() {
  return slackRateLimiter.getQueueStatus();
}

/**
 * Log current statistics
 */
export function logRateLimiterStats() {
  slackRateLimiter.logStats();
}

/**
 * Reset rate limiter statistics (for testing)
 */
export function resetRateLimiterStats() {
  slackRateLimiter.resetStats();
}

export default slackRateLimiter;
