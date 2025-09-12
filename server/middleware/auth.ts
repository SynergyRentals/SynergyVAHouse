import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import type { User as AppUser } from '@shared/schema';

// Re-export for backward compatibility
export type AuthenticatedRequest = Request;

/**
 * Secure authentication middleware - PRODUCTION SAFE
 * Only accepts: (1) Valid Replit Auth session OR (2) Slack-signed requests (via dedicated middleware)
 * NO header-based auth bypasses allowed in production
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    let user;
    let authType: 'slack' | 'replit' | 'dev-fallback' = 'replit';

    // Method 1: Check for authenticated Replit Auth session
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      const sessionUser = req.user as any;
      if (sessionUser.claims?.sub) {
        // User authenticated via Replit Auth - lookup by replitSub
        user = await storage.getUserByReplitSub(sessionUser.claims.sub);
        authType = 'replit';
      }
    }

    // Method 2: Check for Slack-authenticated request (must be pre-validated by validateSlackSignature middleware)
    if (!user && req.slackUserId) {
      // This property is only set by validateSlackSignature middleware
      // Find user by Slack ID
      const allUsers = await storage.getAllUsers();
      user = allUsers.find(u => u.slackId === req.slackUserId);
      authType = 'slack';
    }

    // Method 3: Development fallback ONLY (strictly prohibited in production)
    if (!user && process.env.NODE_ENV === 'development') {
      // DEVELOPMENT ONLY: Allow header-based auth for local testing
      const userId = req.headers['x-user-id'] as string || 
                     req.body?.actorId || 
                     req.query?.actorId as string;

      if (userId === 'default-user' || !userId) {
        // Create or find default development user
        const allUsers = await storage.getAllUsers();
        user = allUsers.find(u => u.slackId === 'default-slack-id') || 
               allUsers.find(u => u.role.toLowerCase().includes('manager'));
               
        if (!user) {
          try {
            user = await storage.createUser({
              slackId: 'default-slack-id',
              name: 'Development User',
              role: 'manager',
              timezone: 'Asia/Manila'
            });
          } catch (error) {
            // User might already exist
            const allUsers = await storage.getAllUsers();
            user = allUsers.find(u => u.slackId === 'default-slack-id');
          }
        }
        authType = 'dev-fallback';
      } else if (userId.includes('-')) {
        // UUID lookup
        user = await storage.getUser(userId);
        authType = 'dev-fallback';
      } else {
        // Slack ID or name lookup
        const allUsers = await storage.getAllUsers();
        user = allUsers.find(u => 
          u.slackId === userId || 
          u.name.toLowerCase().includes(userId.toLowerCase())
        );
        authType = 'dev-fallback';
      }
    }

    // PRODUCTION: Reject if no valid authentication method was used
    if (!user) {
      console.error('[Security] Authentication failed - no valid auth method', {
        hasReplitAuth: !!(req.isAuthenticated && req.isAuthenticated()),
        hasSlackAuth: !!req.slackUserId,
        isProduction: process.env.NODE_ENV === 'production',
        userAgent: req.headers['user-agent'],
        ip: req.ip
      });

      res.status(401).json({ 
        error: 'Authentication required',
        details: 'Please log in to access this resource'
      });
      return;
    }

    // Additional security: Ensure user is active
    if (!user.isActive) {
      res.status(403).json({ 
        error: 'Account disabled',
        details: 'Your account has been disabled'
      });
      return;
    }

    // Add user to request context with authType
    req.user = {
      ...user,
      authType
    };

    // DEVELOPMENT: Ensure permission cache is refreshed for dev-fallback users
    if (authType === 'dev-fallback') {
      try {
        await storage.refreshUserPermissionCache(user.id);
      } catch (error) {
        console.warn('[Dev Auth] Failed to refresh permission cache:', error);
      }
    }

    // Security logging for production
    if (process.env.NODE_ENV === 'production') {
      console.log('[Security] Authenticated request', {
        userId: user.id,
        authType,
        endpoint: req.path,
        method: req.method
      });
    }

    next();
  } catch (error) {
    console.error('[Security] Authentication error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: 'Unable to validate user credentials'
    });
  }
}

/**
 * Authorization middleware for manager-only operations
 */
export function requireManagerRole(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!req.user.role.toLowerCase().includes('manager')) {
    res.status(403).json({ 
      error: 'Insufficient permissions',
      details: 'Manager role required for this operation'
    });
    return;
  }

  next();
}

/**
 * Extract authenticated user ID from request
 */
export function getAuthenticatedUserId(req: Request): string | undefined {
  return req.user?.id;
}

/**
 * Middleware specifically for Replit Auth protected routes
 * Requires valid session authentication
 */
export function requireReplitAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ 
      error: 'Authentication required',
      details: 'Please log in to access this resource'
    });
    return;
  }

  const sessionUser = req.user as any;
  if (!sessionUser?.claims?.sub) {
    res.status(401).json({ 
      error: 'Invalid session',
      details: 'Please log in again'
    });
    return;
  }

  next();
}

/**
 * Validate Slack signature for webhook requests - PRODUCTION READY
 * This middleware MUST be applied to ALL Slack webhook endpoints
 */
export function validateSlackSignature(req: Request, res: Response, next: NextFunction) {
  const crypto = require('crypto');
  
  try {
    const slackSignature = req.headers['x-slack-signature'] as string;
    const timestamp = req.headers['x-slack-request-timestamp'] as string;
    const slackUserId = req.body?.user?.id || req.body?.user_id || req.body?.event?.user;
    
    // Required headers check
    if (!slackSignature || !timestamp) {
      console.error('[Security] Missing Slack signature headers', {
        hasSignature: !!slackSignature,
        hasTimestamp: !!timestamp,
        body: req.body
      });
      res.status(401).json({ 
        error: 'Missing Slack signature',
        details: 'Slack webhook signature validation failed'
      });
      return;
    }
    
    // Require Slack signing secret in all environments
    if (!process.env.SLACK_SIGNING_SECRET) {
      console.error('[Security] SLACK_SIGNING_SECRET not configured');
      res.status(500).json({ 
        error: 'Configuration error',
        details: 'Slack signing secret not configured'
      });
      return;
    }
    
    // Check timestamp to prevent replay attacks (within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp);
    if (Math.abs(now - requestTime) > 300) {
      console.error('[Security] Slack request timestamp too old', {
        now,
        requestTime,
        diff: Math.abs(now - requestTime)
      });
      res.status(401).json({ 
        error: 'Request timestamp too old',
        details: 'Slack webhook timestamp validation failed'
      });
      return;
    }
    
    // Full HMAC-SHA256 signature validation
    const rawBody = JSON.stringify(req.body);
    const baseString = `v0:${timestamp}:${rawBody}`;
    const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET);
    hmac.update(baseString);
    const computedSignature = `v0=${hmac.digest('hex')}`;
    
    // Secure signature comparison to prevent timing attacks
    const providedSignature = Buffer.from(slackSignature, 'utf8');
    const expectedSignature = Buffer.from(computedSignature, 'utf8');
    
    if (providedSignature.length !== expectedSignature.length || 
        !crypto.timingSafeEqual(providedSignature, expectedSignature)) {
      console.error('[Security] Slack signature validation failed', {
        provided: slackSignature,
        computed: computedSignature,
        baseString: baseString.substring(0, 100) + '...'
      });
      res.status(401).json({ 
        error: 'Invalid signature',
        details: 'Slack webhook signature validation failed'
      });
      return;
    }
    
    // Extract and validate Slack user ID for auth context
    if (slackUserId && typeof slackUserId === 'string') {
      req.slackUserId = slackUserId;
      console.log('[Security] Slack signature validated', {
        slackUserId,
        timestamp,
        endpoint: req.path
      });
    } else {
      console.warn('[Security] Slack request validated but no user ID found', {
        body: req.body,
        endpoint: req.path
      });
    }
    
    next();
  } catch (error) {
    console.error('[Security] Slack signature validation error:', error);
    res.status(500).json({ 
      error: 'Signature validation failed',
      details: 'Unable to validate Slack webhook signature'
    });
  }
}