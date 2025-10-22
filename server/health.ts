import { pool } from './db';
import { getSlackApp } from './slack/bolt';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Track server start time for uptime calculation
const startTime = Date.now();

// Version information
let version = '1.0.0';
try {
  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  version = packageJson.version || '1.0.0';
} catch (error) {
  console.warn('Could not read version from package.json:', error);
}

/**
 * Service status type
 */
export type ServiceStatus = 'up' | 'down' | 'degraded';

/**
 * Overall health status type
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Individual service check result
 */
export interface ServiceCheckResult {
  status: ServiceStatus;
  responseTime?: number;
  message?: string;
  details?: Record<string, any>;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    database: ServiceStatus;
    slack: ServiceStatus;
  };
  details?: {
    database?: ServiceCheckResult;
    slack?: ServiceCheckResult;
  };
}

/**
 * Check database connectivity
 * Performs a simple query to verify the database is accessible
 */
async function checkDatabase(): Promise<ServiceCheckResult> {
  const start = Date.now();
  try {
    // Simple query to check database connectivity
    await pool.query('SELECT 1');
    const responseTime = Date.now() - start;

    return {
      status: 'up',
      responseTime,
      message: 'Database connection successful'
    };
  } catch (error: any) {
    const responseTime = Date.now() - start;
    return {
      status: 'down',
      responseTime,
      message: error.message || 'Database connection failed',
      details: {
        error: error.message
      }
    };
  }
}

/**
 * Check Slack API connectivity
 * Verifies that the Slack bot token is valid and the API is accessible
 */
async function checkSlack(): Promise<ServiceCheckResult> {
  const start = Date.now();

  // Check if Slack is configured
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_SIGNING_SECRET) {
    return {
      status: 'degraded',
      responseTime: Date.now() - start,
      message: 'Slack integration not configured',
      details: {
        configured: false
      }
    };
  }

  try {
    const slackApp = getSlackApp();

    if (!slackApp) {
      return {
        status: 'down',
        responseTime: Date.now() - start,
        message: 'Slack app not initialized'
      };
    }

    // Test the auth.test API endpoint to verify token validity
    // This is a lightweight endpoint that doesn't count against rate limits heavily
    const authTest = await slackApp.client.auth.test();
    const responseTime = Date.now() - start;

    return {
      status: 'up',
      responseTime,
      message: 'Slack API connection successful',
      details: {
        configured: true,
        team: authTest.team,
        user: authTest.user
      }
    };
  } catch (error: any) {
    const responseTime = Date.now() - start;
    return {
      status: 'down',
      responseTime,
      message: error.message || 'Slack API connection failed',
      details: {
        error: error.message,
        configured: true
      }
    };
  }
}

/**
 * Determine overall health status based on individual service checks
 */
function determineOverallStatus(
  database: ServiceStatus,
  slack: ServiceStatus
): HealthStatus {
  // If any critical service (database) is down, system is unhealthy
  if (database === 'down') {
    return 'unhealthy';
  }

  // If database is up but Slack is down, system is degraded
  if (slack === 'down') {
    return 'degraded';
  }

  // If any service is degraded, system is degraded
  if (database === 'degraded' || slack === 'degraded') {
    return 'degraded';
  }

  // All services are up
  return 'healthy';
}

/**
 * Perform comprehensive health check
 *
 * @param includeDetails - Whether to include detailed service check results
 * @returns Health check response with status and service information
 */
export async function performHealthCheck(
  includeDetails: boolean = false
): Promise<HealthCheckResponse> {
  // Run all checks in parallel for faster response
  const [databaseCheck, slackCheck] = await Promise.all([
    checkDatabase(),
    checkSlack()
  ]);

  const status = determineOverallStatus(
    databaseCheck.status,
    slackCheck.status
  );

  const uptime = Math.floor((Date.now() - startTime) / 1000); // in seconds

  const response: HealthCheckResponse = {
    status,
    timestamp: new Date().toISOString(),
    version,
    uptime,
    services: {
      database: databaseCheck.status,
      slack: slackCheck.status
    }
  };

  // Include detailed information if requested
  if (includeDetails) {
    response.details = {
      database: databaseCheck,
      slack: slackCheck
    };
  }

  return response;
}

/**
 * Perform readiness check
 * More strict than health check - used for Kubernetes readiness probes
 *
 * @returns Whether the application is ready to receive traffic
 */
export async function performReadinessCheck(): Promise<HealthCheckResponse> {
  const healthCheck = await performHealthCheck(true);

  // For readiness, we require database to be fully up
  // Slack can be degraded (not configured) but not down
  const isReady =
    healthCheck.services.database === 'up' &&
    healthCheck.services.slack !== 'down';

  return {
    ...healthCheck,
    status: isReady ? 'healthy' : 'unhealthy'
  };
}
