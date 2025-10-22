/**
 * Authentication Service
 *
 * Production-ready authentication service with:
 * - JWT access tokens (15 min expiry)
 * - Refresh tokens with secure rotation (7 days expiry)
 * - Slack OAuth integration
 * - API key management with hashing
 * - Secure token family tracking
 */

import { db } from '../db';
import { users, refreshTokens, apiKeys } from '@shared/schema';
import type { User, InsertRefreshToken, InsertApiKey } from '@shared/schema';
import { eq, and, gt, isNull } from 'drizzle-orm';
import crypto from 'crypto';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'development-jwt-secret-change-in-production';
const JWT_ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const JWT_REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Slack OAuth configuration
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_OAUTH_REDIRECT_URI = process.env.SLACK_OAUTH_REDIRECT_URI;

/**
 * JWT Payload interface
 */
export interface JWTPayload {
  userId: string;
  email?: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Simple JWT implementation without external dependencies
 * Uses HMAC-SHA256 for signing
 */
class SimpleJWT {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  /**
   * Create a JWT token
   */
  sign(payload: JWTPayload, expiresIn: string): string {
    const now = Math.floor(Date.now() / 1000);
    const expirySeconds = this.parseExpiry(expiresIn);

    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const fullPayload = {
      ...payload,
      iat: now,
      exp: now + expirySeconds
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(fullPayload));
    const signature = this.createSignature(encodedHeader, encodedPayload);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Verify and decode a JWT token
   */
  verify(token: string): JWTPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const expectedSignature = this.createSignature(encodedHeader, encodedPayload);
    if (signature !== expectedSignature) {
      throw new Error('Invalid token signature');
    }

    // Decode payload
    const payload = JSON.parse(this.base64UrlDecode(encodedPayload)) as JWTPayload;

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }

    return payload;
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private base64UrlDecode(str: string): string {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
      str += '=';
    }
    return Buffer.from(str, 'base64').toString('utf-8');
  }

  private createSignature(encodedHeader: string, encodedPayload: string): string {
    const data = `${encodedHeader}.${encodedPayload}`;
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(data);
    return this.base64UrlEncode(hmac.digest('base64'));
  }

  private parseExpiry(expiresIn: string): number {
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1));

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return 900; // Default 15 minutes
    }
  }
}

const jwt = new SimpleJWT(JWT_SECRET);

/**
 * Generate JWT access token
 */
export function generateAccessToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email || undefined,
    role: user.role,
  };

  return jwt.sign(payload, JWT_ACCESS_TOKEN_EXPIRY);
}

/**
 * Generate refresh token and store in database
 */
export async function generateRefreshToken(
  userId: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<string> {
  // Generate cryptographically secure random token
  const token = crypto.randomBytes(32).toString('hex');

  const expiresAt = new Date(Date.now() + JWT_REFRESH_TOKEN_EXPIRY);

  // Store in database
  await db.insert(refreshTokens).values({
    userId,
    token,
    expiresAt,
    deviceInfo,
    ipAddress,
  });

  return token;
}

/**
 * Verify refresh token and rotate it (security best practice)
 */
export async function verifyAndRotateRefreshToken(
  token: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<{ user: User; newRefreshToken: string } | null> {
  // Find the refresh token
  const [tokenRecord] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.token, token),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!tokenRecord) {
    return null;
  }

  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, tokenRecord.userId))
    .limit(1);

  if (!user || !user.isActive) {
    return null;
  }

  // Generate new refresh token (rotation)
  const newToken = await generateRefreshToken(user.id, deviceInfo, ipAddress);

  // Mark old token as replaced
  await db
    .update(refreshTokens)
    .set({
      revokedAt: new Date(),
      replacedBy: newToken,
    })
    .where(eq(refreshTokens.token, token));

  return { user, newRefreshToken: newToken };
}

/**
 * Verify JWT access token
 */
export function verifyAccessToken(token: string): JWTPayload {
  try {
    return jwt.verify(token);
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
}

/**
 * Revoke all refresh tokens for a user (logout all devices)
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt)
      )
    );
}

/**
 * Revoke a specific refresh token
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.token, token));
}

/**
 * Clean up expired refresh tokens (call this periodically via cron)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await db
    .delete(refreshTokens)
    .where(gt(new Date(), refreshTokens.expiresAt));

  return result.rowCount || 0;
}

/**
 * Slack OAuth - Get authorization URL
 */
export function getSlackAuthUrl(state?: string): string {
  if (!SLACK_CLIENT_ID || !SLACK_OAUTH_REDIRECT_URI) {
    throw new Error('Slack OAuth not configured. Set SLACK_CLIENT_ID and SLACK_OAUTH_REDIRECT_URI');
  }

  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    scope: 'openid,profile,email',
    redirect_uri: SLACK_OAUTH_REDIRECT_URI,
    ...(state && { state }),
  });

  return `https://slack.com/openid/connect/authorize?${params.toString()}`;
}

/**
 * Slack OAuth - Exchange code for tokens and user info
 */
export async function exchangeSlackCode(code: string): Promise<{
  slackId: string;
  email: string;
  name: string;
  profileImage?: string;
}> {
  if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET || !SLACK_OAUTH_REDIRECT_URI) {
    throw new Error('Slack OAuth not configured');
  }

  // Exchange code for access token
  const tokenResponse = await fetch('https://slack.com/api/openid.connect.token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code,
      redirect_uri: SLACK_OAUTH_REDIRECT_URI,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.ok) {
    throw new Error(`Slack OAuth error: ${tokenData.error}`);
  }

  // Get user info
  const userInfoResponse = await fetch('https://slack.com/api/openid.connect.userInfo', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  const userInfo = await userInfoResponse.json();

  if (!userInfo.ok) {
    throw new Error(`Slack user info error: ${userInfo.error}`);
  }

  return {
    slackId: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name,
    profileImage: userInfo.picture,
  };
}

/**
 * Find or create user from Slack OAuth
 */
export async function findOrCreateSlackUser(slackUserInfo: {
  slackId: string;
  email: string;
  name: string;
  profileImage?: string;
}): Promise<User> {
  // Try to find existing user by Slack ID
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.slackId, slackUserInfo.slackId))
    .limit(1);

  if (user) {
    // Update user info
    [user] = await db
      .update(users)
      .set({
        email: slackUserInfo.email,
        name: slackUserInfo.name,
        profileImageUrl: slackUserInfo.profileImage,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    return user;
  }

  // Try to find by email
  if (slackUserInfo.email) {
    [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, slackUserInfo.email))
      .limit(1);

    if (user) {
      // Link Slack ID to existing user
      [user] = await db
        .update(users)
        .set({
          slackId: slackUserInfo.slackId,
          profileImageUrl: slackUserInfo.profileImage,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();

      return user;
    }
  }

  // Create new user
  [user] = await db
    .insert(users)
    .values({
      slackId: slackUserInfo.slackId,
      email: slackUserInfo.email,
      name: slackUserInfo.name,
      profileImageUrl: slackUserInfo.profileImage,
      role: 'VA', // Default role
      timezone: 'Asia/Manila',
      isActive: true,
    })
    .returning();

  return user;
}

/**
 * API Key Management
 */

/**
 * Generate API key with prefix
 */
function generateApiKey(): { key: string; prefix: string; hash: string } {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const key = `sk_live_${randomBytes}`;
  const prefix = key.substring(0, 15); // "sk_live_" + first 8 chars
  const hash = crypto.createHash('sha256').update(key).digest('hex');

  return { key, prefix, hash };
}

/**
 * Create API key for a user
 */
export async function createApiKey(
  userId: string,
  name: string,
  permissions?: any,
  expiresInDays?: number,
  createdBy?: string
): Promise<{ apiKey: string; keyRecord: any }> {
  const { key, prefix, hash } = generateApiKey();

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  const [keyRecord] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      keyHash: hash,
      keyPrefix: prefix,
      permissions,
      expiresAt,
      createdBy: createdBy || userId,
      isActive: true,
    })
    .returning();

  // Return the actual key only once (it won't be stored in plain text)
  return { apiKey: key, keyRecord };
}

/**
 * Verify API key and return associated user
 */
export async function verifyApiKey(apiKey: string): Promise<User | null> {
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const [keyRecord] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, hash),
        eq(apiKeys.isActive, true),
        isNull(apiKeys.revokedAt)
      )
    )
    .limit(1);

  if (!keyRecord) {
    return null;
  }

  // Check expiration
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return null;
  }

  // Update last used timestamp
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRecord.id));

  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, keyRecord.userId))
    .limit(1);

  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

/**
 * List API keys for a user (without exposing full keys)
 */
export async function listUserApiKeys(userId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      isActive: apiKeys.isActive,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, userId),
        isNull(apiKeys.revokedAt)
      )
    );
}

/**
 * Revoke API key
 */
export async function revokeApiKey(
  keyId: string,
  revokedBy?: string
): Promise<void> {
  await db
    .update(apiKeys)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
    })
    .where(eq(apiKeys.id, keyId));
}

/**
 * Delete expired API keys
 */
export async function cleanupExpiredApiKeys(): Promise<number> {
  const result = await db
    .delete(apiKeys)
    .where(
      and(
        gt(new Date(), apiKeys.expiresAt),
        eq(apiKeys.isActive, false)
      )
    );

  return result.rowCount || 0;
}
