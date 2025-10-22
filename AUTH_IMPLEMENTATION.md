# Authentication System Implementation

## Overview

This document describes the production-ready authentication system implemented for the Synergy VA Ops Hub. The system provides multiple authentication methods and comprehensive security features.

## Features Implemented

### 1. JWT-Based Authentication
- **Access Tokens**: Short-lived tokens (15 minutes) for API requests
- **Refresh Tokens**: Long-lived tokens (7 days) stored securely with rotation
- **Token Family Tracking**: Prevents token replay attacks
- **Automatic Token Refresh**: Client automatically refreshes expiring tokens

### 2. Multiple Authentication Methods
The system supports 5 authentication methods (in order of priority):

1. **JWT Bearer Tokens**: `Authorization: Bearer <token>`
2. **API Keys**: `X-API-Key: <key>` header
3. **Replit Auth Session**: Session-based authentication (legacy)
4. **Slack-signed Requests**: Webhook signature validation
5. **Development Fallback**: Header-based auth (development only)

### 3. Slack OAuth Integration
- Full OAuth 2.0 flow with OpenID Connect
- Automatic user creation/linking
- Profile synchronization (name, email, avatar)

### 4. API Key Management
- Secure key generation with SHA-256 hashing
- Key prefix display (full key only shown once)
- Expiration dates and rate limiting support
- Per-key permission scoping
- Usage tracking (last used timestamp)

### 5. Role-Based Access Control (RBAC)
- Existing RBAC system fully integrated
- Permission-based authorization
- Role assignment auditing

## File Structure

### Backend Files

```
server/
├── services/
│   └── auth.service.ts          # Core auth logic (JWT, tokens, API keys)
├── middleware/
│   └── auth.ts                  # Updated to support JWT & API keys
├── api/
│   └── auth/
│       └── routes.ts            # Auth endpoints
└── routes.ts                    # Updated to include auth routes
```

### Frontend Files

```
client/src/
├── contexts/
│   └── AuthContext.tsx          # Auth state management
└── hooks/
    └── useAuth.ts               # Auth hooks (updated)
```

### Database Schema

```
shared/
└── schema.ts                    # Added: refreshTokens, apiKeys tables
```

## Database Schema Changes

### New Tables

#### `refresh_tokens`
- Stores JWT refresh tokens with rotation tracking
- Columns: id, userId, token, expiresAt, createdAt, revokedAt, replacedBy, deviceInfo, ipAddress
- Indexes: userId, expiresAt

#### `api_keys`
- Stores hashed API keys for external integrations
- Columns: id, userId, name, keyHash, keyPrefix, lastUsedAt, expiresAt, isActive, permissions, rateLimit, createdBy, createdAt, revokedAt, revokedBy
- Indexes: userId, keyHash

## API Endpoints

### Authentication Endpoints

```
POST   /api/auth/login              # Login with email/password
POST   /api/auth/refresh            # Refresh access token
POST   /api/auth/logout             # Logout (revoke token)
POST   /api/auth/logout-all         # Logout from all devices
GET    /api/auth/slack/authorize    # Initiate Slack OAuth
GET    /api/auth/slack/callback     # Slack OAuth callback
GET    /api/auth/user               # Get current user (supports all auth methods)
```

### API Key Management Endpoints

```
POST   /api/auth/api-keys           # Create new API key
GET    /api/auth/api-keys           # List user's API keys
DELETE /api/auth/api-keys/:id       # Revoke API key
```

## Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# JWT Authentication
JWT_SECRET=your-secret-here  # Use: openssl rand -base64 32
SESSION_SECRET=your-session-secret  # Fallback for JWT_SECRET

# Slack OAuth (Optional - for Slack login)
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
SLACK_OAUTH_REDIRECT_URI=https://your-app.com/api/auth/slack/callback

# Slack Integration (For webhooks)
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token

# Client Configuration
CLIENT_URL=http://localhost:5000

# Replit Auth (Legacy)
REPLIT_DOMAINS=your-repl.replit.dev
REPL_ID=your-repl-id
```

## Usage Examples

### Frontend: Using JWT Authentication

```typescript
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext';
import { useAuth, useApiKeys } from '@/hooks/useAuth';

// Wrap your app with AuthProvider
function App() {
  return (
    <AuthProvider>
      <YourApp />
    </AuthProvider>
  );
}

// In your components
function LoginPage() {
  const { login, loginWithSlack } = useAuthContext();

  const handleLogin = async () => {
    await login('user@example.com', 'password');
  };

  const handleSlackLogin = () => {
    loginWithSlack(); // Redirects to Slack OAuth
  };
}

// Protected routes
function Dashboard() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return <div>Welcome, {user.name}!</div>;
}

// API Key Management
function ApiKeysPage() {
  const { apiKeys, createApiKey, revokeApiKey } = useApiKeys();

  const handleCreate = async () => {
    const result = await createApiKey({
      name: 'My Integration',
      expiresInDays: 90
    });

    // Save result.apiKey - it won't be shown again!
    console.log('API Key:', result.apiKey);
  };
}
```

### Backend: Using Authentication Middleware

```typescript
import { requireAuth } from './middleware/auth';
import { Router } from 'express';

const router = Router();

// Protected endpoint - supports all auth methods
router.get('/protected', requireAuth, async (req, res) => {
  // req.user is populated by middleware
  res.json({ message: `Hello, ${req.user.name}!` });
});
```

### Making Authenticated API Requests

#### With JWT Token

```typescript
const response = await fetch('/api/protected', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

#### With API Key

```typescript
const response = await fetch('/api/protected', {
  headers: {
    'X-API-Key': 'sk_live_...'
  }
});
```

#### With Session (Legacy)

```typescript
// Session cookie automatically included
const response = await fetch('/api/protected', {
  credentials: 'include'
});
```

## Security Features

### Token Security
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Automatic token rotation on refresh
- Token family tracking prevents replay attacks
- Device and IP tracking for security auditing

### API Key Security
- Keys are hashed with SHA-256 before storage
- Full key only shown once at creation
- Key prefix shown for identification (first 15 chars)
- Per-key expiration dates
- Per-key permission scoping
- Usage tracking

### Additional Security
- HMAC-SHA256 for JWT signing
- Timing-safe signature comparison
- HttpOnly cookies for session storage
- Secure cookie flags in production
- Rate limiting support (per API key)
- Comprehensive audit logging

## Migration Instructions

### 1. Install Dependencies

All required dependencies are already in package.json. No additional installations needed.

### 2. Set Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

At minimum, set:
- `DATABASE_URL`
- `JWT_SECRET` (or `SESSION_SECRET`)

### 3. Run Database Migration

```bash
npm run db:push
```

This will create the new `refresh_tokens` and `api_keys` tables.

### 4. Optional: Configure Slack OAuth

If you want Slack login functionality:

1. Go to https://api.slack.com/apps
2. Create a new app or select existing
3. Enable "OAuth & Permissions"
4. Add redirect URL: `https://your-app.com/api/auth/slack/callback`
5. Add OAuth scopes: `openid`, `profile`, `email`
6. Get your `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`
7. Add to `.env`

### 5. Start the Server

```bash
npm run dev      # Development
npm run build    # Production build
npm start        # Production
```

## Testing

### Test JWT Authentication

```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"test"}'

# Use access token
curl http://localhost:5000/api/auth/user \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Refresh token
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

### Test API Key

```bash
# Create API key (requires authentication)
curl -X POST http://localhost:5000/api/auth/api-keys \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Key","expiresInDays":30}'

# Use API key
curl http://localhost:5000/api/auth/user \
  -H "X-API-Key: sk_live_YOUR_API_KEY"
```

## Backward Compatibility

The implementation maintains full backward compatibility:

- Existing session-based auth continues to work
- Existing endpoints unchanged
- `useAuth` hook works with or without `AuthProvider`
- All existing authentication flows preserved

## Future Enhancements

Potential improvements:

1. **Password Hashing**: Add bcrypt for password-based auth
2. **2FA Support**: TOTP-based two-factor authentication
3. **OAuth Providers**: Google, Microsoft, GitHub login
4. **Passwordless Auth**: Magic link or email-based auth
5. **Session Management UI**: View/revoke active sessions
6. **Advanced Rate Limiting**: Per-user, per-endpoint limits
7. **Audit Dashboard**: Real-time security monitoring

## Support

For issues or questions:
- Check this documentation
- Review the source code comments
- Test with the provided examples
- Check environment variables are set correctly

## License

Part of the Synergy VA Ops Hub project.
