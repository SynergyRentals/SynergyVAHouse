/**
 * Environment variable validation and diagnostics
 * Provides helpful error messages for missing configuration
 */

interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates that a PostgreSQL connection string is properly formatted
 */
function isValidPostgresUrl(url: string): boolean {
  try {
    // PostgreSQL URLs should start with postgres:// or postgresql://
    if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
      return false;
    }

    // Should contain @ symbol (user@host pattern)
    if (!url.includes('@')) {
      return false;
    }

    // Basic URL format validation
    const urlObj = new URL(url);
    return urlObj.protocol === 'postgres:' || urlObj.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required environment variables with validation
  const requiredChecks = [
    {
      key: 'DATABASE_URL',
      description: 'PostgreSQL connection string (e.g., from Neon)',
      validate: (value: string) => {
        if (!isValidPostgresUrl(value)) {
          return 'Must be a valid PostgreSQL connection string (postgresql://user:password@host:port/database)';
        }
        return null;
      }
    },
    {
      key: 'SLACK_BOT_TOKEN',
      description: 'Slack bot token for bot functionality',
      validate: (value: string) => {
        if (!value.startsWith('xoxb-')) {
          return 'Must start with "xoxb-" (OAuth bot token format)';
        }
        return null;
      }
    },
    {
      key: 'SLACK_APP_LEVEL_TOKEN',
      description: 'Slack app-level token for socket mode',
      validate: (value: string) => {
        if (!value.startsWith('xapp-')) {
          return 'Must start with "xapp-" (app-level token format)';
        }
        return null;
      }
    },
    {
      key: 'SLACK_SIGNING_SECRET',
      description: 'Slack signing secret for webhook verification',
      validate: (value: string) => {
        if (value.length < 32) {
          return 'Must be at least 32 characters long';
        }
        return null;
      }
    },
    {
      key: 'REPLIT_DOMAINS',
      description: 'Replit domains for OIDC authentication',
      validate: null
    },
    {
      key: 'SESSION_SECRET',
      description: 'Secret for session encryption (32+ characters)',
      validate: (value: string) => {
        if (value.length < 32) {
          return 'Must be at least 32 characters long for secure encryption';
        }
        return null;
      }
    },
    {
      key: 'REPL_ID',
      description: 'Replit project ID for OIDC',
      validate: null
    }
  ];

  // Optional but recommended
  const optional = {
    OPENAI_API_KEY: 'OpenAI API key for AI suggestions',
  };

  // Check required variables with validation
  for (const check of requiredChecks) {
    const value = process.env[check.key];

    if (!value) {
      errors.push(`❌ ${check.key}: Missing - ${check.description}`);
    } else if (check.validate) {
      const validationError = check.validate(value);
      if (validationError) {
        errors.push(`❌ ${check.key}: Invalid - ${validationError}`);
      }
    }
  }

  // Check optional variables
  for (const [key, description] of Object.entries(optional)) {
    if (!process.env[key]) {
      warnings.push(`⚠️  ${key}: ${description} (optional)`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function printEnvironmentStatus(): void {
  console.log('\n='.repeat(60));
  console.log('🔍 ENVIRONMENT CONFIGURATION CHECK');
  console.log('='.repeat(60));

  const result = validateEnvironment();

  if (result.errors.length > 0) {
    console.log('\n❌ CONFIGURATION ERRORS DETECTED:\n');
    result.errors.forEach(error => console.log(`  ${error}`));
    console.log('\n📋 CONFIGURATION INSTRUCTIONS:');
    console.log('\n  Replit Setup (Tools > Secrets):');
    console.log('  ────────────────────────────────');
    console.log('  • DATABASE_URL: Your Neon PostgreSQL connection string');
    console.log('    Format: postgresql://user:password@host:port/database');
    console.log('\n  • SLACK_BOT_TOKEN: Get from Slack App OAuth & Permissions');
    console.log('    Format: xoxb-XXXXXXXXXXXX-XXXXXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXX');
    console.log('\n  • SLACK_APP_LEVEL_TOKEN: Get from Slack App Basic Information');
    console.log('    Format: xapp-X-XXXXXXXXXXX-XXXXXXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    console.log('\n  • SLACK_SIGNING_SECRET: Get from Slack App Basic Information');
    console.log('    Format: 32+ character hex string');
    console.log('\n  • SESSION_SECRET: Generate with: openssl rand -base64 32');
    console.log('\n  • REPL_ID and REPLIT_DOMAINS: Check Replit integrations');
    console.log('\n  Local Development (.env file):');
    console.log('  ────────────────────────────────');
    console.log('  Create a .env file in the project root with the same variables');
    console.log();
  }

  if (result.warnings.length > 0 && result.isValid) {
    console.log('\n✅ All required variables are set\n');
    console.log('⚠️  OPTIONAL VARIABLES (not configured):');
    result.warnings.forEach(warning => console.log(`  ${warning}`));
    console.log();
  }

  if (result.isValid && result.warnings.length === 0) {
    console.log('\n✅ All environment variables are configured and valid!\n');
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Validates environment and throws an error if validation fails
 * This should be called at server startup to ensure all variables are valid
 * @throws {Error} If any required environment variables are missing or invalid
 */
export function validateEnvironmentOrThrow(): void {
  const result = validateEnvironment();

  if (!result.isValid) {
    printEnvironmentStatus();
    console.error('\n🛑 SERVER STARTUP ABORTED\n');
    console.error('Cannot start server with missing or invalid environment variables.');
    console.error('Please fix the configuration errors listed above.\n');

    // Create a detailed error message
    const errorMessage = [
      'Environment validation failed:',
      ...result.errors.map(err => `  ${err}`)
    ].join('\n');

    throw new Error(errorMessage);
  }

  // Print status even on success (will show warnings if any)
  printEnvironmentStatus();
}

export function getRequiredEnv(key: string, description: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`\n❌ FATAL ERROR: Missing required environment variable\n`);
    console.error(`Variable: ${key}`);
    console.error(`Description: ${description}\n`);
    printEnvironmentStatus();
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
