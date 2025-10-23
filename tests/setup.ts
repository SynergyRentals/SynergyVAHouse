import { beforeAll, afterAll, vi } from 'vitest';

// Set up test environment variables
beforeAll(() => {
  // Database configuration - use test database
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/synergy_va_ops_test';

  // Slack configuration - use mock values for tests
  process.env.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'xoxb-test-token';
  process.env.SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || 'test-signing-secret';
  process.env.SLACK_APP_LEVEL_TOKEN = process.env.SLACK_APP_LEVEL_TOKEN || 'xapp-test-token';

  // Webhook secrets for testing
  process.env.WEBHOOK_CONDUIT_SECRET = process.env.WEBHOOK_CONDUIT_SECRET || 'test-secret';
  process.env.WEBHOOK_SUITEOP_SECRET = process.env.WEBHOOK_SUITEOP_SECRET || 'test-secret';

  // Application configuration
  process.env.NODE_ENV = 'test';
  process.env.APP_BASE_URL = 'http://localhost:3000';
  process.env.PORT = '3001';

  // Team configuration
  process.env.MANAGER_SLACK_ID = 'U123456789';
  process.env.TZ_MANAGER = 'America/Chicago';
  process.env.TZ_TEAM = 'Asia/Manila';

  // Mock external services
  mockExternalServices();
});

afterAll(() => {
  // Cleanup after all tests
  vi.clearAllMocks();
});

function mockExternalServices() {
  // Mock Slack API calls
  vi.mock('@slack/bolt', () => ({
    App: vi.fn(() => ({
      start: vi.fn(),
      client: {
        chat: {
          postMessage: vi.fn(),
        },
        views: {
          open: vi.fn(),
          publish: vi.fn(),
        },
      },
    })),
  }));

  // Mock Slack Web API
  vi.mock('@slack/web-api', () => ({
    WebClient: vi.fn(() => ({
      chat: {
        postMessage: vi.fn(),
      },
    })),
  }));
}
