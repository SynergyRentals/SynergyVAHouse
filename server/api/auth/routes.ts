/**
 * Authentication Routes
 *
 * Endpoints:
 * - POST /api/auth/login - Login with username/password (returns JWT tokens)
 * - POST /api/auth/refresh - Refresh access token using refresh token
 * - POST /api/auth/logout - Logout (revoke refresh token)
 * - POST /api/auth/logout-all - Logout from all devices
 * - GET /api/auth/slack/authorize - Initiate Slack OAuth flow
 * - GET /api/auth/slack/callback - Slack OAuth callback
 * - GET /api/auth/user - Get current authenticated user
 * - POST /api/auth/api-keys - Create new API key
 * - GET /api/auth/api-keys - List user's API keys
 * - DELETE /api/auth/api-keys/:id - Revoke API key
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { storage } from '../../storage';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  getSlackAuthUrl,
  exchangeSlackCode,
  findOrCreateSlackUser,
  createApiKey,
  listUserApiKeys,
  revokeApiKey,
} from '../../services/auth.service';

const router = Router();

/**
 * POST /api/auth/login
 * Login with email/password (for now, we'll use email + auto-create if not exists)
 * In production, you'd validate credentials here
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // TODO: In production, validate password against hashed password
    // For now, just find or create user by email
    let user = await storage.getUserByEmail?.(email);

    if (!user) {
      // For demo purposes, create user if doesn't exist
      // In production, this should return 401 Unauthorized
      const allUsers = await storage.getAllUsers();
      user = allUsers.find(u => u.email === email);

      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Account is disabled' });
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(
      user.id,
      req.headers['user-agent'],
      req.ip
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
      },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const result = await verifyAndRotateRefreshToken(
      refreshToken,
      req.headers['user-agent'],
      req.ip
    );

    if (!result) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    const { user, newRefreshToken } = result;

    // Generate new access token
    const accessToken = generateAccessToken(user);

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
      },
    });
  } catch (error) {
    console.error('[Auth] Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * POST /api/auth/logout
 * Logout (revoke current refresh token)
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * POST /api/auth/logout-all
 * Logout from all devices (revoke all refresh tokens)
 */
router.post('/logout-all', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await revokeAllUserTokens(req.user.id);

    res.json({ message: 'Logged out from all devices' });
  } catch (error) {
    console.error('[Auth] Logout all error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * GET /api/auth/slack/authorize
 * Initiate Slack OAuth flow
 */
router.get('/slack/authorize', (req: Request, res: Response) => {
  try {
    const state = req.query.state as string | undefined;
    const authUrl = getSlackAuthUrl(state);
    res.redirect(authUrl);
  } catch (error) {
    console.error('[Auth] Slack authorize error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Slack OAuth not configured'
    });
  }
});

/**
 * GET /api/auth/slack/callback
 * Slack OAuth callback
 */
router.get('/slack/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('[Auth] Slack OAuth error:', error);
      res.redirect(`/login?error=${error}`);
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    // Exchange code for user info
    const slackUserInfo = await exchangeSlackCode(code);

    // Find or create user
    const user = await findOrCreateSlackUser(slackUserInfo);

    // Generate JWT tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(
      user.id,
      req.headers['user-agent'],
      req.ip
    );

    // Redirect to frontend with tokens
    // In production, you might want to use httpOnly cookies or a more secure method
    const redirectUrl = new URL('/auth/callback', process.env.CLIENT_URL || 'http://localhost:5000');
    redirectUrl.searchParams.set('access_token', accessToken);
    redirectUrl.searchParams.set('refresh_token', refreshToken);
    if (state) {
      redirectUrl.searchParams.set('state', state as string);
    }

    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('[Auth] Slack callback error:', error);
    res.redirect('/login?error=slack_auth_failed');
  }
});

/**
 * GET /api/auth/user
 * Get current authenticated user
 */
router.get('/user', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Return user info without sensitive data
    res.json({
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      department: req.user.department,
      profileImageUrl: req.user.profileImageUrl,
      timezone: req.user.timezone,
      preferences: req.user.preferences,
      authType: (req.user as any).authType,
    });
  } catch (error) {
    console.error('[Auth] Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * POST /api/auth/api-keys
 * Create new API key
 */
router.post('/api-keys', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { name, permissions, expiresInDays } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'API key name is required' });
      return;
    }

    const { apiKey, keyRecord } = await createApiKey(
      req.user.id,
      name,
      permissions,
      expiresInDays,
      req.user.id
    );

    // Return the API key only once (it won't be shown again)
    res.json({
      apiKey, // Full key - save it now!
      id: keyRecord.id,
      name: keyRecord.name,
      keyPrefix: keyRecord.keyPrefix,
      expiresAt: keyRecord.expiresAt,
      createdAt: keyRecord.createdAt,
      message: 'Save this API key now. You won\'t be able to see it again!',
    });
  } catch (error) {
    console.error('[Auth] Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * GET /api/auth/api-keys
 * List user's API keys
 */
router.get('/api-keys', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keys = await listUserApiKeys(req.user.id);

    res.json({ apiKeys: keys });
  } catch (error) {
    console.error('[Auth] List API keys error:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

/**
 * DELETE /api/auth/api-keys/:id
 * Revoke API key
 */
router.delete('/api-keys/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    // Verify the key belongs to the user
    const keys = await listUserApiKeys(req.user.id);
    const keyExists = keys.some(k => k.id === id);

    if (!keyExists) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    await revokeApiKey(id, req.user.id);

    res.json({ message: 'API key revoked successfully' });
  } catch (error) {
    console.error('[Auth] Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

export default router;
