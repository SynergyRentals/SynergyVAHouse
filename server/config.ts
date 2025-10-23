/**
 * Centralized Configuration Management
 *
 * This module provides type-safe, validated configuration for the entire application.
 * All configuration values should be accessed through this module rather than
 * directly reading from process.env.
 *
 * Configuration is validated at startup and will fail fast if invalid.
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Helper function to get a string environment variable with a default value
 */
function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Helper function to get a number environment variable with a default value
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = Number(value);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return parsed;
}

/**
 * Helper function to get a boolean environment variable with a default value
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Helper function to parse time string (e.g., '15m', '7d') to milliseconds
 * If value is already a number, returns it as-is
 */
function parseTimeToMs(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }

  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid time format: ${value}. Expected format like '15m', '7d', '30s'`);
  }

  const [, amount, unit] = match;
  const num = parseInt(amount, 10);

  switch (unit) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    default: throw new Error(`Unknown time unit: ${unit}`);
  }
}

/**
 * Main configuration object
 */
export const config = {
  // ============================================
  // Authentication & Security
  // ============================================
  auth: {
    // JWT token expiry times
    accessTokenExpiry: getEnvString('JWT_ACCESS_TOKEN_EXPIRY', '15m'),
    refreshTokenExpiryMs: parseTimeToMs(getEnvString('JWT_REFRESH_TOKEN_EXPIRY', '7d')),

    // OIDC configuration cache TTL
    oidcConfigCacheTtlMs: getEnvNumber('OIDC_CONFIG_CACHE_TTL_MS', 3600 * 1000), // 1 hour

    // Session TTL
    sessionTtlMs: parseTimeToMs(getEnvString('SESSION_TTL', '7d')),

    // Slack webhook replay attack prevention (5 minutes default)
    slackReplayAttackTimeoutSec: getEnvNumber('SLACK_REPLAY_ATTACK_TIMEOUT_SEC', 300),

    // HSTS max-age header (1 year default)
    hstsMaxAgeSec: getEnvNumber('HSTS_MAX_AGE_SEC', 31536000),
  },

  // ============================================
  // SLA & Follow-up Configuration
  // ============================================
  sla: {
    // Default SLA in minutes if not defined in playbook
    defaultMinutes: getEnvNumber('DEFAULT_SLA_MINUTES', 10),

    // Minutes before deadline to send nudge notification
    nudgeMinutesBefore: getEnvNumber('SLA_NUDGE_MINUTES_BEFORE', 5),

    // SLA warning threshold in milliseconds (5 minutes default)
    warningThresholdMs: getEnvNumber('SLA_WARNING_THRESHOLD_MS', 5 * 60 * 1000),
  },

  followup: {
    // Default follow-up timeframe in hours
    defaultHours: getEnvNumber('DEFAULT_FOLLOWUP_HOURS', 4),

    // Default "few minutes" duration in milliseconds
    defaultFewMinutesMs: getEnvNumber('FOLLOWUP_FEW_MINUTES_MS', 15 * 60 * 1000),

    // Default "few hours" duration in milliseconds
    defaultFewHoursMs: getEnvNumber('FOLLOWUP_FEW_HOURS_MS', 2 * 60 * 60 * 1000),

    // Reminder thresholds in hours
    reminder24hThreshold: getEnvNumber('REMINDER_THRESHOLD_24H', 24),
    reminder4hThreshold: getEnvNumber('REMINDER_THRESHOLD_4H', 4),
    reminder1hThreshold: getEnvNumber('REMINDER_THRESHOLD_1H', 1),
  },

  // ============================================
  // Default Time Values
  // ============================================
  defaultTimes: {
    // End of day hour (24-hour format, default 17:00)
    endOfDayHour: getEnvNumber('END_OF_DAY_HOUR', 17),

    // Default start hour for next day/week (24-hour format, default 9:00)
    defaultStartHour: getEnvNumber('DEFAULT_START_HOUR', 9),

    // End of week hour (24-hour format, default 17:00 Friday)
    weekEndHour: getEnvNumber('WEEK_END_HOUR', 17),
  },

  // ============================================
  // Scheduled Jobs Configuration
  // ============================================
  jobs: {
    // SLA monitoring job
    slaCheck: {
      interval: getEnvString('SLA_CHECK_INTERVAL', '* * * * *'), // Every minute
      timezone: getEnvString('SLA_CHECK_TIMEZONE', 'UTC'),
    },

    // Follow-up monitoring job
    followupCheck: {
      interval: getEnvString('FOLLOWUP_CHECK_INTERVAL', '*/5 * * * *'), // Every 5 minutes
      timezone: getEnvString('FOLLOWUP_CHECK_TIMEZONE', 'UTC'),
    },

    // VA AM briefing
    vaBriefingAm: {
      schedule: getEnvString('VA_AM_BRIEFING_SCHEDULE', '0 8 * * 1-5'), // 8 AM weekdays
      timezone: getEnvString('VA_AM_BRIEFING_TIMEZONE', 'Asia/Manila'),
    },

    // VA PM briefing
    vaBriefingPm: {
      schedule: getEnvString('VA_PM_BRIEFING_SCHEDULE', '0 18 * * 1-5'), // 6 PM weekdays
      timezone: getEnvString('VA_PM_BRIEFING_TIMEZONE', 'Asia/Manila'),
    },

    // Manager daily digest
    managerDigest: {
      schedule: getEnvString('MANAGER_DIGEST_SCHEDULE', '0 9 * * 1-5'), // 9 AM weekdays
      timezone: getEnvString('MANAGER_DIGEST_TIMEZONE', 'America/Chicago'),
    },

    // Manager weekly summary
    managerWeekly: {
      schedule: getEnvString('MANAGER_WEEKLY_SCHEDULE', '0 9 * * 1'), // 9 AM Monday
      timezone: getEnvString('MANAGER_WEEKLY_TIMEZONE', 'America/Chicago'),
    },

    // Daily metrics generation
    metricsGeneration: {
      schedule: getEnvString('METRICS_GENERATION_SCHEDULE', '0 1 * * *'), // 1 AM daily
      timezone: getEnvString('METRICS_GENERATION_TIMEZONE', 'Asia/Manila'),
    },

    // Weekly audit cleanup
    auditCleanup: {
      schedule: getEnvString('AUDIT_CLEANUP_SCHEDULE', '0 2 * * 0'), // 2 AM Sunday
      timezone: getEnvString('AUDIT_CLEANUP_TIMEZONE', 'UTC'),
    },
  },

  // ============================================
  // Data Retention
  // ============================================
  retention: {
    // Audit log retention in days
    auditRetentionDays: getEnvNumber('AUDIT_RETENTION_DAYS', 90),
  },

  // ============================================
  // File & Request Limits
  // ============================================
  limits: {
    // Webhook body size limit
    webhookBodySizeLimit: getEnvString('WEBHOOK_BODY_SIZE_LIMIT', '10mb'),
  },

  // ============================================
  // WebSocket Configuration
  // ============================================
  websocket: {
    // Heartbeat interval in milliseconds (30 seconds default)
    heartbeatIntervalMs: getEnvNumber('WEBSOCKET_HEARTBEAT_INTERVAL_MS', 30000),
  },

  // ============================================
  // Metrics Configuration
  // ============================================
  metrics: {
    // Fast completion threshold in hours
    fastCompletionThresholdHours: getEnvNumber('METRICS_FAST_COMPLETION_HOURS', 2),
  },

  // ============================================
  // Default IDs (Channels, Users, etc.)
  // ============================================
  defaults: {
    // Default triage channel ID
    triageChannelId: getEnvString('DEFAULT_TRIAGE_CHANNEL', 'C123456'),

    // Default manager Slack ID
    managerSlackId: getEnvString('DEFAULT_MANAGER_SLACK_ID', 'UJOREL'),
  },
} as const;

/**
 * Configuration validation
 * Validates all configuration values and throws if any are invalid
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Validate positive numbers
  const positiveNumbers = [
    { key: 'auth.oidcConfigCacheTtlMs', value: config.auth.oidcConfigCacheTtlMs },
    { key: 'auth.sessionTtlMs', value: config.auth.sessionTtlMs },
    { key: 'auth.slackReplayAttackTimeoutSec', value: config.auth.slackReplayAttackTimeoutSec },
    { key: 'auth.hstsMaxAgeSec', value: config.auth.hstsMaxAgeSec },
    { key: 'sla.defaultMinutes', value: config.sla.defaultMinutes },
    { key: 'sla.nudgeMinutesBefore', value: config.sla.nudgeMinutesBefore },
    { key: 'sla.warningThresholdMs', value: config.sla.warningThresholdMs },
    { key: 'followup.defaultHours', value: config.followup.defaultHours },
    { key: 'followup.defaultFewMinutesMs', value: config.followup.defaultFewMinutesMs },
    { key: 'followup.defaultFewHoursMs', value: config.followup.defaultFewHoursMs },
    { key: 'followup.reminder24hThreshold', value: config.followup.reminder24hThreshold },
    { key: 'followup.reminder4hThreshold', value: config.followup.reminder4hThreshold },
    { key: 'followup.reminder1hThreshold', value: config.followup.reminder1hThreshold },
    { key: 'retention.auditRetentionDays', value: config.retention.auditRetentionDays },
    { key: 'websocket.heartbeatIntervalMs', value: config.websocket.heartbeatIntervalMs },
    { key: 'metrics.fastCompletionThresholdHours', value: config.metrics.fastCompletionThresholdHours },
  ];

  for (const { key, value } of positiveNumbers) {
    if (value <= 0) {
      errors.push(`${key} must be positive, got: ${value}`);
    }
  }

  // Validate hour ranges (0-23)
  const hours = [
    { key: 'defaultTimes.endOfDayHour', value: config.defaultTimes.endOfDayHour },
    { key: 'defaultTimes.defaultStartHour', value: config.defaultTimes.defaultStartHour },
    { key: 'defaultTimes.weekEndHour', value: config.defaultTimes.weekEndHour },
  ];

  for (const { key, value } of hours) {
    if (value < 0 || value > 23) {
      errors.push(`${key} must be between 0 and 23, got: ${value}`);
    }
  }

  // Validate cron expressions (basic check)
  const cronJobs = [
    { key: 'jobs.slaCheck.interval', value: config.jobs.slaCheck.interval },
    { key: 'jobs.followupCheck.interval', value: config.jobs.followupCheck.interval },
    { key: 'jobs.vaBriefingAm.schedule', value: config.jobs.vaBriefingAm.schedule },
    { key: 'jobs.vaBriefingPm.schedule', value: config.jobs.vaBriefingPm.schedule },
    { key: 'jobs.managerDigest.schedule', value: config.jobs.managerDigest.schedule },
    { key: 'jobs.managerWeekly.schedule', value: config.jobs.managerWeekly.schedule },
    { key: 'jobs.metricsGeneration.schedule', value: config.jobs.metricsGeneration.schedule },
    { key: 'jobs.auditCleanup.schedule', value: config.jobs.auditCleanup.schedule },
  ];

  for (const { key, value } of cronJobs) {
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 5) {
      errors.push(`${key} must be a valid cron expression (5 parts), got: ${value}`);
    }
  }

  // Validate required string values
  if (!config.auth.accessTokenExpiry) {
    errors.push('auth.accessTokenExpiry is required');
  }
  if (!config.limits.webhookBodySizeLimit) {
    errors.push('limits.webhookBodySizeLimit is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Logs the current configuration (excluding sensitive values)
 */
export function logConfig(): void {
  console.log('='.repeat(60));
  console.log('Application Configuration');
  console.log('='.repeat(60));

  console.log('\nAuthentication & Security:');
  console.log(`  Access Token Expiry: ${config.auth.accessTokenExpiry}`);
  console.log(`  Refresh Token Expiry: ${config.auth.refreshTokenExpiryMs}ms`);
  console.log(`  Session TTL: ${config.auth.sessionTtlMs}ms`);
  console.log(`  Slack Replay Attack Timeout: ${config.auth.slackReplayAttackTimeoutSec}s`);
  console.log(`  HSTS Max Age: ${config.auth.hstsMaxAgeSec}s`);

  console.log('\nSLA & Follow-up:');
  console.log(`  Default SLA: ${config.sla.defaultMinutes} minutes`);
  console.log(`  SLA Nudge Before: ${config.sla.nudgeMinutesBefore} minutes`);
  console.log(`  SLA Warning Threshold: ${config.sla.warningThresholdMs}ms`);
  console.log(`  Default Follow-up: ${config.followup.defaultHours} hours`);
  console.log(`  Reminder Thresholds: 24h=${config.followup.reminder24hThreshold}h, 4h=${config.followup.reminder4hThreshold}h, 1h=${config.followup.reminder1hThreshold}h`);

  console.log('\nScheduled Jobs:');
  console.log(`  SLA Check: ${config.jobs.slaCheck.interval} (${config.jobs.slaCheck.timezone})`);
  console.log(`  Follow-up Check: ${config.jobs.followupCheck.interval} (${config.jobs.followupCheck.timezone})`);
  console.log(`  VA AM Briefing: ${config.jobs.vaBriefingAm.schedule} (${config.jobs.vaBriefingAm.timezone})`);
  console.log(`  VA PM Briefing: ${config.jobs.vaBriefingPm.schedule} (${config.jobs.vaBriefingPm.timezone})`);
  console.log(`  Manager Digest: ${config.jobs.managerDigest.schedule} (${config.jobs.managerDigest.timezone})`);
  console.log(`  Manager Weekly: ${config.jobs.managerWeekly.schedule} (${config.jobs.managerWeekly.timezone})`);
  console.log(`  Metrics Generation: ${config.jobs.metricsGeneration.schedule} (${config.jobs.metricsGeneration.timezone})`);
  console.log(`  Audit Cleanup: ${config.jobs.auditCleanup.schedule} (${config.jobs.auditCleanup.timezone})`);

  console.log('\nLimits & Retention:');
  console.log(`  Webhook Body Size: ${config.limits.webhookBodySizeLimit}`);
  console.log(`  Audit Retention: ${config.retention.auditRetentionDays} days`);
  console.log(`  WebSocket Heartbeat: ${config.websocket.heartbeatIntervalMs}ms`);

  console.log('\nDefault Times:');
  console.log(`  End of Day: ${config.defaultTimes.endOfDayHour}:00`);
  console.log(`  Default Start: ${config.defaultTimes.defaultStartHour}:00`);
  console.log(`  Week End: ${config.defaultTimes.weekEndHour}:00`);

  console.log('\n' + '='.repeat(60));
}

// Validate configuration on module load
validateConfig();
