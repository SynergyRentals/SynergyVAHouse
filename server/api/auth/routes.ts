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
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: User login
 *     description: |
 *       Authenticates a user with email and password credentials.
 *       Returns JWT access token (15min expiry) and refresh token (7d expiry).
 *
 *       Note: Current implementation is simplified for demo purposes.
 *       In production, password validation should be implemented.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokens'
 *       400:
 *         description: Email is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Email is required"
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Invalid credentials"
 *       403:
 *         description: Account is disabled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Account is disabled"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Login failed"
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
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Refresh access token
 *     description: |
 *       Exchanges a valid refresh token for a new access token and refresh token.
 *       Implements automatic token rotation for enhanced security.
 *       The old refresh token is revoked after use.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Valid refresh token
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokens'
 *       400:
 *         description: Refresh token is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Refresh token is required"
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Invalid or expired refresh token"
 *       500:
 *         $ref: '#/components/responses/ValidationError'
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
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Logout from current session
 *     description: |
 *       Revokes the provided refresh token, logging out the user from the current session.
 *       The user will remain logged in on other devices.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token to revoke
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Logged out successfully"
 *       500:
 *         $ref: '#/components/responses/ValidationError'
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
 * @openapi
 * /api/auth/logout-all:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Logout from all devices
 *     description: |
 *       Revokes all refresh tokens for the authenticated user, logging them out from all devices.
 *       Requires authentication via Bearer token or API key.
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all devices
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Logged out from all devices"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ValidationError'
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
 * @openapi
 * /api/auth/slack/authorize:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: Initiate Slack OAuth flow
 *     description: Redirects to Slack OAuth authorization URL
 *     parameters:
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Optional state parameter for OAuth flow
 *     responses:
 *       302:
 *         description: Redirect to Slack OAuth URL
 *       500:
 *         description: Slack OAuth not configured
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * @openapi
 * /api/auth/slack/callback:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: Slack OAuth callback
 *     description: |
 *       Handles the OAuth callback from Slack.
 *       Exchanges authorization code for user info and creates/updates user account.
 *       Redirects to frontend with JWT tokens.
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Slack
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: State parameter from authorization request
 *       - in: query
 *         name: error
 *         schema:
 *           type: string
 *         description: Error code if authorization failed
 *     responses:
 *       302:
 *         description: Redirect to frontend with tokens
 *       400:
 *         description: Authorization code is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * @openapi
 * /api/auth/user:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: Get current user
 *     description: Returns the currently authenticated user's information
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/User'
 *                 - type: object
 *                   properties:
 *                     authType:
 *                       type: string
 *                       description: Authentication method used
 *                       enum: [jwt, apiKey, replit, slack, dev]
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ValidationError'
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
 * @openapi
 * /api/auth/api-keys:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Create API key
 *     description: |
 *       Creates a new API key for the authenticated user.
 *       The full API key is returned only once - save it immediately!
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Descriptive name for the API key
 *                 example: "Production API Key"
 *               permissions:
 *                 type: object
 *                 description: Optional permissions scope for the API key
 *               expiresInDays:
 *                 type: integer
 *                 description: Number of days until expiration (default 365)
 *                 example: 90
 *     responses:
 *       200:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiKey'
 *                 - type: object
 *                   required:
 *                     - apiKey
 *                     - message
 *                   properties:
 *                     apiKey:
 *                       type: string
 *                       description: Full API key (shown only once)
 *                       example: "svah_1234567890abcdef..."
 *                     message:
 *                       type: string
 *                       example: "Save this API key now. You won't be able to see it again!"
 *       400:
 *         description: API key name is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ValidationError'
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
 * @openapi
 * /api/auth/api-keys:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: List API keys
 *     description: Returns all API keys for the authenticated user (without full key values)
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: API keys retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiKeys:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ApiKey'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ValidationError'
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
 * @openapi
 * /api/auth/api-keys/{id}:
 *   delete:
 *     tags:
 *       - Authentication
 *     summary: Revoke API key
 *     description: Permanently revokes an API key. The key will no longer be valid for authentication.
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: API key ID to revoke
 *     responses:
 *       200:
 *         description: API key revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "API key revoked successfully"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ValidationError'
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
