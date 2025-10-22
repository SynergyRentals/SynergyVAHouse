import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SynergyVAHouse API Documentation',
      version: '1.0.0',
      description: `
# SynergyVAHouse API

A comprehensive task management and workflow automation platform with webhook integrations, AI assistance, and RBAC.

## Authentication

The API supports multiple authentication methods:

### 1. JWT Bearer Tokens
\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`

### 2. API Keys
\`\`\`
X-API-Key: <your_api_key>
\`\`\`

### 3. Webhook Signatures
For webhook endpoints (Conduit and SuiteOp):
\`\`\`
X-Conduit-Signature: sha256=<hmac_signature>
X-SuiteOp-Signature: sha256=<hmac_signature>
\`\`\`

### 4. Slack Signatures
For Slack events:
\`\`\`
X-Slack-Signature: v0=<hmac_signature>
X-Slack-Request-Timestamp: <unix_timestamp>
\`\`\`

## Rate Limiting

API endpoints are rate-limited to ensure fair usage. Please implement exponential backoff for retries.

## Idempotency

Webhook endpoints support idempotency through event IDs. Duplicate events with the same ID will return a 200 status with \`status: 'duplicate'\`.
      `.trim(),
      contact: {
        name: 'SynergyVAHouse Team',
      },
      license: {
        name: 'Private',
      },
    },
    servers: [
      {
        url: process.env.BASE_URL || 'http://localhost:5000',
        description: 'API Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/login',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for service-to-service authentication',
        },
        webhookSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Conduit-Signature',
          description: 'HMAC-SHA256 signature for webhook verification',
        },
        slackSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Slack-Signature',
          description: 'Slack request signature verification',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique user identifier' },
            slackId: { type: 'string', description: 'Slack user ID' },
            name: { type: 'string', description: 'Full name of the user' },
            email: { type: 'string', format: 'email', description: 'Email address' },
            firstName: { type: 'string', description: 'First name' },
            lastName: { type: 'string', description: 'Last name' },
            role: { type: 'string', description: 'User role (legacy)' },
            replitSub: { type: 'string', description: 'Replit subject identifier' },
            profileImageUrl: { type: 'string', format: 'uri', description: 'Profile image URL' },
            timezone: { type: 'string', default: 'America/New_York', description: 'User timezone' },
            permissions: { type: 'object', description: 'RBAC permissions object' },
            preferences: { type: 'object', description: 'User preferences' },
            isActive: { type: 'boolean', default: true, description: 'Whether user is active' },
            department: { type: 'string', description: 'Department name' },
            managerId: { type: 'string', format: 'uuid', description: 'Manager user ID' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'name', 'timezone'],
        },
        Task: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique task identifier' },
            type: {
              type: 'string',
              enum: ['daily', 'weekly', 'reactive', 'project', 'follow_up'],
              description: 'Task type',
            },
            title: { type: 'string', description: 'Task title' },
            category: { type: 'string', description: 'Task category' },
            status: {
              type: 'string',
              enum: ['OPEN', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'DONE'],
              description: 'Current task status',
            },
            priority: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
              description: 'Task priority (1=highest, 5=lowest)',
            },
            assigneeId: { type: 'string', format: 'uuid', description: 'Assigned user ID' },
            dueAt: { type: 'string', format: 'date-time', description: 'Due date/time' },
            slaAt: { type: 'string', format: 'date-time', description: 'SLA deadline' },
            sourceKind: {
              type: 'string',
              enum: ['slack', 'conduit', 'suiteop', 'manual'],
              description: 'Source of task creation',
            },
            sourceId: { type: 'string', description: 'External source identifier' },
            sourceUrl: { type: 'string', format: 'uri', description: 'Link to external source' },
            playbookKey: { type: 'string', description: 'Associated playbook key' },
            dodSchema: {
              type: 'object',
              description: 'Definition of Done schema with required fields',
            },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', description: 'Evidence type (screenshot, link, etc.)' },
                  url: { type: 'string', format: 'uri', description: 'Evidence URL' },
                  note: { type: 'string', description: 'Additional notes' },
                },
              },
              description: 'Task evidence attachments',
            },
            followUpMetadata: { type: 'object', description: 'Follow-up task metadata' },
            approvals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  bySlackId: { type: 'string', description: 'Approver Slack ID' },
                  at: { type: 'string', format: 'date-time', description: 'Approval time' },
                  decision: {
                    type: 'string',
                    enum: ['approve', 'reject'],
                    description: 'Approval decision',
                  },
                },
              },
              description: 'Task approvals',
            },
            projectId: { type: 'string', format: 'uuid', description: 'Associated project ID' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'type', 'title', 'category', 'status', 'priority'],
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string', description: 'Project title' },
            scope: { type: 'string', description: 'Project scope/description' },
            ownerId: { type: 'string', format: 'uuid', description: 'Project owner user ID' },
            status: {
              type: 'string',
              enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
              description: 'Project status',
            },
            view: {
              type: 'string',
              enum: ['kanban', 'list', 'timeline'],
              default: 'kanban',
              description: 'Preferred view mode',
            },
            startAt: { type: 'string', format: 'date-time', description: 'Start date' },
            targetAt: { type: 'string', format: 'date-time', description: 'Target completion date' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'title', 'scope', 'status', 'view'],
        },
        Playbook: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Unique playbook key' },
            title: { type: 'string', description: 'Playbook title' },
            category: { type: 'string', description: 'Category/type' },
            dodSchema: {
              type: 'object',
              description: 'Definition of Done schema',
              properties: {
                fields: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: { type: 'string' },
                      label: { type: 'string' },
                      type: { type: 'string', enum: ['text', 'boolean', 'url', 'file'] },
                      required: { type: 'boolean' },
                      placeholder: { type: 'string' },
                    },
                  },
                },
              },
            },
            template: { type: 'string', description: 'Task template text' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['key', 'title', 'category'],
        },
        WebhookEvent: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            eventId: { type: 'string', description: 'Unique event identifier for idempotency' },
            source: {
              type: 'string',
              enum: ['conduit', 'suiteop'],
              description: 'Webhook source',
            },
            processedAt: { type: 'string', format: 'date-time' },
            requestBody: { type: 'object', description: 'Original webhook payload' },
            taskId: { type: 'string', format: 'uuid', description: 'Created/updated task ID' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message' },
            details: { type: 'object', description: 'Additional error details' },
          },
          required: ['error'],
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string', description: 'JWT access token (15min expiry)' },
            refreshToken: { type: 'string', description: 'Refresh token (7d expiry)' },
            user: { $ref: '#/components/schemas/User' },
          },
          required: ['accessToken', 'refreshToken', 'user'],
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            name: { type: 'string', description: 'API key name/description' },
            keyPrefix: { type: 'string', description: 'First 8 chars of the key' },
            lastUsedAt: { type: 'string', format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required or invalid credentials',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Unauthorized' },
            },
          },
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Forbidden: insufficient permissions' },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Resource not found' },
            },
          },
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Validation failed', details: {} },
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Webhooks',
        description: 'External webhook integrations for Conduit and SuiteOp',
      },
      {
        name: 'Authentication',
        description: 'User authentication and authorization endpoints',
      },
      {
        name: 'Tasks',
        description: 'Task management operations',
      },
      {
        name: 'Projects',
        description: 'Project management operations',
      },
      {
        name: 'Playbooks',
        description: 'Playbook templates and definitions',
      },
      {
        name: 'AI',
        description: 'AI-powered suggestions and improvements',
      },
      {
        name: 'Users',
        description: 'User management operations',
      },
      {
        name: 'RBAC',
        description: 'Role-Based Access Control management',
      },
      {
        name: 'Analytics',
        description: 'Metrics and analytics endpoints',
      },
      {
        name: 'Audit',
        description: 'Audit log retrieval',
      },
    ],
  },
  apis: [
    './server/webhooks/*.ts',
    './server/api/**/*.ts',
    './server/routes.ts',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  // Serve Swagger UI at /api-docs
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'SynergyVAHouse API Docs',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
      },
    })
  );

  // Serve raw OpenAPI spec as JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('📚 Swagger documentation available at /api-docs');
  console.log('📄 OpenAPI spec available at /api-docs.json');
}

export function generateOpenApiSpec(): void {
  const outputPath = path.join(__dirname, '..', 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2), 'utf-8');
  console.log(`✅ OpenAPI spec generated at ${outputPath}`);
}

export { swaggerSpec };
