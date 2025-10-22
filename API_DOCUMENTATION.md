# API Documentation

## Overview

Comprehensive API documentation has been added to the SynergyVAHouse application using OpenAPI 3.0 (Swagger).

## Accessing the Documentation

### Interactive Swagger UI

Visit `/api-docs` in your browser when the server is running:

**Development:** http://localhost:5000/api-docs
**Production:** https://your-domain.com/api-docs

The Swagger UI provides:
- Interactive API explorer
- "Try it out" functionality for testing endpoints
- Request/response examples
- Authentication support
- Schema definitions

### OpenAPI Specification

The raw OpenAPI spec is available in two formats:

1. **JSON format:** `/api-docs.json` endpoint
2. **File:** `openapi.json` in the project root

## Documented Endpoints

### Webhooks
- `POST /webhooks/conduit` - Conduit webhook integration
  - Supports: escalation.created, task.created, task.updated, ai.help_requested
  - HMAC-SHA256 signature verification
  - Idempotency support
- `POST /webhooks/suiteop` - SuiteOp webhook integration
  - Supports: task.created, task.updated
  - HMAC-SHA256 signature verification
  - Idempotency support

### Authentication
- `POST /api/auth/login` - User login with JWT tokens
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout from current session
- `POST /api/auth/logout-all` - Logout from all devices
- `GET /api/auth/slack/authorize` - Initiate Slack OAuth
- `GET /api/auth/slack/callback` - Slack OAuth callback
- `GET /api/auth/user` - Get current user info
- `POST /api/auth/api-keys` - Create API key
- `GET /api/auth/api-keys` - List user's API keys
- `DELETE /api/auth/api-keys/:id` - Revoke API key

### More Endpoints

Additional endpoints for tasks, projects, playbooks, AI suggestions, users, RBAC, analytics, and audit logs are accessible through the Swagger UI.

## Authentication Methods

The API supports multiple authentication methods:

### 1. JWT Bearer Tokens
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.example.com/api/auth/user
```

### 2. API Keys
```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  https://api.example.com/api/tasks
```

### 3. Webhook Signatures
For Conduit webhooks:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Conduit-Signature: sha256=HMAC_SIGNATURE" \
  -d '{"type":"task.created",...}' \
  https://api.example.com/webhooks/conduit
```

For SuiteOp webhooks:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-SuiteOp-Signature: sha256=HMAC_SIGNATURE" \
  -d '{"type":"task.created",...}' \
  https://api.example.com/webhooks/suiteop
```

### 4. Slack Signatures
```bash
curl -X POST \
  -H "X-Slack-Signature: v0=SIGNATURE" \
  -H "X-Slack-Request-Timestamp: TIMESTAMP" \
  https://api.example.com/slack/events
```

## Key Features

### Idempotency

Webhook endpoints support idempotency to prevent duplicate processing:
- Event IDs are extracted from headers or request body
- Duplicate events return 200 with `status: 'duplicate'`
- Safe to retry failed webhook deliveries

### Security

- HMAC-SHA256 signature verification for webhooks
- JWT token rotation with 15-minute access tokens
- Refresh tokens with 7-day expiry
- API keys with customizable permissions and expiration
- RBAC (Role-Based Access Control) for fine-grained permissions

### Rate Limiting

API endpoints are rate-limited. Implement exponential backoff for retries:
- First retry: 2 seconds
- Second retry: 4 seconds
- Third retry: 8 seconds
- Fourth retry: 16 seconds

## Development

### Generating OpenAPI Spec

To regenerate the OpenAPI specification:

```bash
npm run generate-openapi
```

This creates/updates `openapi.json` in the project root.

### Adding New Endpoints

To document new endpoints, add JSDoc comments using OpenAPI format:

```typescript
/**
 * @openapi
 * /api/example:
 *   get:
 *     tags:
 *       - Example
 *     summary: Example endpoint
 *     description: Detailed description here
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.get('/example', async (req, res) => {
  // Implementation
});
```

### Configuration

Swagger is configured in `server/swagger.ts`:
- OpenAPI version: 3.0.0
- Base URL: Configurable via `BASE_URL` environment variable
- API paths: Automatically scanned from route files

## Schema Definitions

The API uses comprehensive TypeScript types defined in `shared/schema.ts`:
- User
- Task
- Project
- Playbook
- WebhookEvent
- ApiKey
- Error responses

All schemas are available in the Swagger UI for reference.

## Testing with Swagger UI

1. Navigate to `/api-docs`
2. Click "Authorize" button
3. Enter your JWT token or API key
4. Select an endpoint to test
5. Click "Try it out"
6. Fill in required parameters
7. Click "Execute"
8. View the response

## Integration Examples

### JavaScript/TypeScript

```typescript
// Using fetch with JWT
const response = await fetch('https://api.example.com/api/tasks', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});
const tasks = await response.json();
```

### Python

```python
import requests

# Using API key
headers = {
    'X-API-Key': 'your_api_key',
    'Content-Type': 'application/json'
}
response = requests.get('https://api.example.com/api/tasks', headers=headers)
tasks = response.json()
```

### cURL

```bash
# Using Bearer token
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.example.com/api/tasks

# Using API key
curl -H "X-API-Key: YOUR_KEY" \
  https://api.example.com/api/tasks
```

## Webhook Integration

### Conduit Setup

1. Configure webhook URL: `https://your-domain.com/webhooks/conduit`
2. Set webhook secret in environment: `WEBHOOK_CONDUIT_SECRET`
3. Conduit will sign requests with `X-Conduit-Signature` header
4. Include event ID in `X-Event-ID` header or request body for idempotency

### SuiteOp Setup

1. Configure webhook URL: `https://your-domain.com/webhooks/suiteop`
2. Set webhook secret in environment: `WEBHOOK_SUITEOP_SECRET`
3. SuiteOp will sign requests with `X-SuiteOp-Signature` header
4. Include event ID in `X-Event-ID` header or request body for idempotency

## Support

For issues or questions:
- Review the interactive documentation at `/api-docs`
- Check the `openapi.json` specification
- Refer to inline JSDoc comments in the source code
