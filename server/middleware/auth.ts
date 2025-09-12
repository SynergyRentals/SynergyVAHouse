import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// Extended request interface with user context
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    slackId: string;
    name: string;
    role: string;
  };
}

/**
 * Basic authentication middleware for AI suggestions
 * In a real app, this would validate session tokens or JWT
 * For now, it validates userId exists in database
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    // Extract user identifier from headers, body, or query
    // In a real app, this would come from session/JWT
    const userId = req.headers['x-user-id'] as string || 
                   req.body?.actorId || 
                   req.query?.actorId as string ||
                   'default-user'; // Fallback for development

    if (!userId) {
      res.status(401).json({ 
        error: 'Authentication required',
        details: 'Please provide valid user credentials'
      });
      return;
    }

    // For development, map 'web-user' to a default manager user
    let resolvedUserId = userId;
    if (userId === 'web-user') {
      resolvedUserId = 'default-user';
    }

    // Validate user exists in database
    let user;
    if (resolvedUserId.includes('-')) {
      // Looks like a UUID, try direct lookup
      user = await storage.getUser(resolvedUserId);
    } else {
      // Try to find by name or create default user for development
      const allUsers = await storage.getAllUsers();
      user = allUsers.find(u => u.name.toLowerCase().includes(resolvedUserId.toLowerCase()));
      
      // For development, create a default user if none exists
      if (!user && resolvedUserId === 'default-user') {
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
      slackId: user.slackId,
      name: user.name,
      role: user.role
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
 * Validate Slack signature for webhook requests
 * This would be used for Slack approval callbacks
 */
export function validateSlackSignature(req: Request, res: Response, next: NextFunction) {
  // In a real implementation, you'd validate the Slack signing secret
  // For now, we'll just pass through
  // TODO: Implement proper Slack signature validation
  next();
}