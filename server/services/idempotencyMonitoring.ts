import { db } from '../db';
import { idempotencyFailures } from '../../shared/schema';
import { sql } from 'drizzle-orm';
import { gte } from 'drizzle-orm';

/**
 * In-memory counter for idempotency failures
 * This allows for quick monitoring without hitting the database every time
 */
class IdempotencyFailureCounter {
  private failures: Map<string, number> = new Map();
  private lastReset: Date = new Date();

  increment(source: string, reason: string): void {
    const key = `${source}:${reason}`;
    this.failures.set(key, (this.failures.get(key) || 0) + 1);
  }

  getCount(source?: string, reason?: string): number {
    if (!source && !reason) {
      // Return total count
      return Array.from(this.failures.values()).reduce((sum, count) => sum + count, 0);
    }

    if (source && reason) {
      return this.failures.get(`${source}:${reason}`) || 0;
    }

    // Get count by source or reason
    const prefix = source || reason || '';
    return Array.from(this.failures.entries())
      .filter(([key]) => key.includes(prefix))
      .reduce((sum, [, count]) => sum + count, 0);
  }

  getBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {};
    this.failures.forEach((count, key) => {
      breakdown[key] = count;
    });
    return breakdown;
  }

  reset(): void {
    this.failures.clear();
    this.lastReset = new Date();
  }

  getLastReset(): Date {
    return this.lastReset;
  }
}

export const failureCounter = new IdempotencyFailureCounter();

/**
 * Categories of failure reasons for better tracking
 */
export const FailureReasons = {
  DATABASE_ERROR: 'database_error',
  TIMEOUT: 'timeout',
  CONNECTION_ERROR: 'connection_error',
  QUERY_ERROR: 'query_error',
  UNKNOWN: 'unknown',
} as const;

export type FailureReason = typeof FailureReasons[keyof typeof FailureReasons];

/**
 * Record an idempotency failure to the database and increment counter
 */
export async function recordIdempotencyFailure(params: {
  eventId: string;
  source: string;
  failureReason: FailureReason;
  errorMessage?: string;
  errorStack?: string;
  requestBody?: any;
  recoveryAction?: string;
}): Promise<void> {
  const {
    eventId,
    source,
    failureReason,
    errorMessage,
    errorStack,
    requestBody,
    recoveryAction = 'fail_open'
  } = params;

  try {
    // Record to database
    await db.insert(idempotencyFailures).values({
      eventId,
      source,
      failureReason,
      errorMessage: errorMessage || null,
      errorStack: errorStack || null,
      requestBody: requestBody || null,
      recoveryAction
    });

    // Increment counter
    failureCounter.increment(source, failureReason);

    console.log(`[Idempotency Monitoring] Recorded failure: source=${source}, reason=${failureReason}, eventId=${eventId}`);
  } catch (error) {
    // Don't let monitoring failures break the application
    console.error('[Idempotency Monitoring] Failed to record failure:', error);
  }
}

/**
 * Get idempotency failure statistics
 */
export async function getFailureStats(params?: {
  since?: Date;
  source?: string;
  failureReason?: string;
}): Promise<{
  total: number;
  bySource: Record<string, number>;
  byReason: Record<string, number>;
  recentFailures: any[];
}> {
  const since = params?.since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours by default

  try {
    // Get all failures since the specified time
    const failures = await db.query.idempotencyFailures.findMany({
      where: gte(idempotencyFailures.createdAt, since),
      orderBy: (failures, { desc }) => [desc(failures.createdAt)],
      limit: 100
    });

    // Calculate statistics
    const bySource: Record<string, number> = {};
    const byReason: Record<string, number> = {};

    failures.forEach(failure => {
      bySource[failure.source] = (bySource[failure.source] || 0) + 1;
      byReason[failure.failureReason] = (byReason[failure.failureReason] || 0) + 1;
    });

    return {
      total: failures.length,
      bySource,
      byReason,
      recentFailures: failures.slice(0, 10).map(f => ({
        id: f.id,
        eventId: f.eventId,
        source: f.source,
        failureReason: f.failureReason,
        errorMessage: f.errorMessage,
        recoveryAction: f.recoveryAction,
        createdAt: f.createdAt
      }))
    };
  } catch (error) {
    console.error('[Idempotency Monitoring] Failed to get failure stats:', error);
    return {
      total: 0,
      bySource: {},
      byReason: {},
      recentFailures: []
    };
  }
}

/**
 * Get failure rate per hour for alerting
 */
export async function getFailureRate(hoursBack: number = 1): Promise<number> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(idempotencyFailures)
      .where(gte(idempotencyFailures.createdAt, since));

    return result[0]?.count || 0;
  } catch (error) {
    console.error('[Idempotency Monitoring] Failed to get failure rate:', error);
    return 0;
  }
}

/**
 * Check if idempotency system health is degraded
 * Returns true if failure rate exceeds threshold
 */
export async function checkIdempotencyHealth(params?: {
  hourlyThreshold?: number;
  hoursBack?: number;
}): Promise<{
  healthy: boolean;
  failureRate: number;
  threshold: number;
  status: 'healthy' | 'degraded' | 'critical';
}> {
  const hourlyThreshold = params?.hourlyThreshold || 5; // Default: 5 failures per hour
  const hoursBack = params?.hoursBack || 1;

  const failureRate = await getFailureRate(hoursBack);
  const healthy = failureRate < hourlyThreshold;

  let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (failureRate >= hourlyThreshold * 2) {
    status = 'critical';
  } else if (failureRate >= hourlyThreshold) {
    status = 'degraded';
  }

  return {
    healthy,
    failureRate,
    threshold: hourlyThreshold,
    status
  };
}

/**
 * Clean up old failure records (recommended to run daily)
 */
export async function cleanupOldFailures(daysToKeep: number = 30): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  try {
    const result = await db
      .delete(idempotencyFailures)
      .where(sql`${idempotencyFailures.createdAt} < ${cutoffDate}`);

    console.log(`[Idempotency Monitoring] Cleaned up old failures older than ${daysToKeep} days`);
    return 0; // Drizzle doesn't return affected rows count directly
  } catch (error) {
    console.error('[Idempotency Monitoring] Failed to cleanup old failures:', error);
    return 0;
  }
}

/**
 * Categorize error and determine failure reason
 */
export function categorizeError(error: any): FailureReason {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorName = error?.name?.toLowerCase() || '';

  if (errorMessage.includes('timeout') || errorName.includes('timeout')) {
    return FailureReasons.TIMEOUT;
  }

  if (errorMessage.includes('connection') || errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') || errorName.includes('connection')) {
    return FailureReasons.CONNECTION_ERROR;
  }

  if (errorMessage.includes('query') || errorMessage.includes('sql') ||
      errorName.includes('query') || errorName.includes('postgres')) {
    return FailureReasons.QUERY_ERROR;
  }

  if (errorMessage.includes('database') || errorName.includes('database')) {
    return FailureReasons.DATABASE_ERROR;
  }

  return FailureReasons.UNKNOWN;
}
