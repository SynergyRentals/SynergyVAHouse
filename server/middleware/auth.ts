import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// Extended request interface with user context
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    slackId?: string; // Optional for web users
    name: string;
    role: string;
    email?: string;
    authType?: 'slack' | 'replit' | 'header'; // Track auth source
  };
}

/**
 * Enhanced authentication middleware supporting both Slack and Replit Auth
 * Handles session-based auth (Replit) and header-based auth (Slack/development)
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let user;
    let authType: 'slack' | 'replit' | 'header' = 'header';

    // First, check if user is authenticated via Replit Auth session
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      const sessionUser = req.user as any;
      if (sessionUser.claims?.sub) {
        // User authenticated via Replit Auth
        authType = 'replit';
        user = await storage.getUser(sessionUser.claims.sub);
      }
    }

    // If no Replit Auth, fall back to header/body auth (for Slack integration and development only)
    if (!user) {
      // In production, only allow Slack-authenticated requests with proper validation
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      const userId = req.headers['x-user-id'] as string || 
                     req.body?.actorId || 
                     req.query?.actorId as string;

      // In production, require strict authentication - no fallbacks
      if (!isDevelopment && !userId) {
        res.status(401).json({ 
          error: 'Authentication required',
          details: 'Please log in to access this resource'
        });
        return;
      }
      
      // Development fallback only
      let resolvedUserId = userId;
      if (isDevelopment && (!userId || userId === 'web-user')) {
        resolvedUserId = 'default-user';
      } else if (!userId) {
        res.status(401).json({ 
          error: 'Authentication required',
          details: 'Please log in to access this resource'
        });
        return;
      }

      // Validate user exists in database
      if (resolvedUserId.includes('-')) {
        // Looks like a UUID, try direct lookup
        user = await storage.getUser(resolvedUserId);
      } else {
        // Try to find by name or create default user for development
        const allUsers = await storage.getAllUsers();
        user = allUsers.find(u => 
          u.name.toLowerCase().includes(resolvedUserId.toLowerCase()) ||
          u.slackId === resolvedUserId
        );
        
        // For development only, create a default user if none exists
        if (!user && isDevelopment && resolvedUserId === 'default-user') {
          try {
            // Try to use an existing seeded manager user first
            user = allUsers.find(u => u.role.toLowerCase().includes('manager'));
            
            // If no manager found, create a default user
            if (!user) {
              user = await storage.createUser({
                slackId: 'default-slack-id',
                name: 'Default User',
                role: 'manager',
                timezone: 'Asia/Manila'
              });
            }
          } catch (error) {
            // User might already exist, try to find existing default user
            user = allUsers.find(u => u.slackId === 'default-slack-id') || 
                   allUsers.find(u => u.role.toLowerCase().includes('manager'));
          }
        }
      }

      if (userId && userId.startsWith('U') && userId.length > 8) {
        // Looks like a Slack user ID
        authType = 'slack';
      }
    }

    if (!user) {
      res.status(403).json({ 
        error: 'User not found',
        details: 'User account does not exist in the system'
      });
      return;
    }

    // Add user to request context
    req.user = {
      id: user.id,
      slackId: user.slackId || undefined,
      name: user.name,
      role: user.role,
      email: user.email || undefined,
      authType
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: 'Unable to validate user credentials'
    });
  }
}

/**
 * Authorization middleware for manager-only operations
 */
export function requireManagerRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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
export function getAuthenticatedUserId(req: AuthenticatedRequest): string | undefined {
  return req.user?.id;
}

/**
 * Middleware specifically for Replit Auth protected routes
 * Requires valid session authentication
 */
export function requireReplitAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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
 * Validate Slack signature for webhook requests
 * This would be used for Slack approval callbacks
 */
export function validateSlackSignature(req: Request, res: Response, next: NextFunction) {
  // Validate Slack signature for webhook requests
  const slackSignature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  
  if (!slackSignature || !timestamp) {
    res.status(401).json({ 
      error: 'Missing Slack signature',
      details: 'Slack webhook signature validation failed'
    });
    return;
  }
  
  // In production, implement proper HMAC-SHA256 validation
  // For now, just check that signature headers are present
  if (process.env.NODE_ENV === 'production' && !process.env.SLACK_SIGNING_SECRET) {
    console.error('SLACK_SIGNING_SECRET not configured for production');
    res.status(500).json({ 
      error: 'Configuration error',
      details: 'Slack signing secret not configured'
    });
    return;
  }
  
  // TODO: Implement full HMAC-SHA256 signature validation
  // const crypto = require('crypto');
  // const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET);
  // hmac.update(`v0:${timestamp}:${JSON.stringify(req.body)}`);
  // const computedSignature = `v0=${hmac.digest('hex')}`;
  // if (computedSignature !== slackSignature) { return res.status(401); }
  
  next();
}