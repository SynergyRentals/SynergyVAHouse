/**
 * Environment variable validation and diagnostics
 * Provides helpful error messages for missing configuration
 */

interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required environment variables
  const required = {
    DATABASE_URL: 'PostgreSQL connection string (e.g., from Neon)',
    REPLIT_DOMAINS: 'Replit domains for OIDC authentication',
    SESSION_SECRET: 'Secret for session encryption (32+ characters)',
    REPL_ID: 'Replit project ID for OIDC',
  };

  // Optional but recommended
  const optional = {
    SLACK_BOT_TOKEN: 'Slack bot token for Slack integration',
    SLACK_SIGNING_SECRET: 'Slack signing secret for webhook verification',
    SLACK_APP_LEVEL_TOKEN: 'Slack app-level token for socket mode',
    OPENAI_API_KEY: 'OpenAI API key for AI suggestions',
  };

  // Check required variables
  for (const [key, description] of Object.entries(required)) {
    if (!process.env[key]) {
      errors.push(`❌ ${key}: ${description}`);
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
    console.log('\n❌ MISSING REQUIRED ENVIRONMENT VARIABLES:\n');
    result.errors.forEach(error => console.log(`  ${error}`));
    console.log('\n📋 CONFIGURATION INSTRUCTIONS:');
    console.log('  1. In Replit, go to Tools > Secrets');
    console.log('  2. Add the missing environment variables listed above');
    console.log('  3. For DATABASE_URL: Use your Neon PostgreSQL connection string');
    console.log('  4. For SESSION_SECRET: Generate with: openssl rand -base64 32');
    console.log('  5. For REPL_ID and REPLIT_DOMAINS: Check Replit integrations');
    console.log('\n  OR configure in .env file for local development\n');
  }

  if (result.warnings.length > 0 && result.isValid) {
    console.log('\n✅ All required variables are set\n');
    console.log('⚠️  OPTIONAL VARIABLES (not configured):');
    result.warnings.forEach(warning => console.log(`  ${warning}`));
    console.log();
  }

  if (result.isValid && result.warnings.length === 0) {
    console.log('\n✅ All environment variables are configured!\n');
  }

  console.log('='.repeat(60) + '\n');
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
