import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import type { AuthenticatedRequest } from './auth';

/**
 * Middleware to check if user has specific permission
 * @param resource - The resource to check (e.g., 'tasks', 'projects')
 * @param action - The action to check (e.g., 'create', 'read', 'update', 'delete')
 * @returns Express middleware function
 */
export function requirePermission(resource: string, action: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ 
          error: 'Authentication required',
          details: 'Please log in to access this resource'
        });
        return;
      }

      const hasPermission = await storage.hasPermission(req.user.id, resource, action);
      
      if (!hasPermission) {
        res.status(403).json({ 
          error: 'Insufficient permissions',
          details: `Required permission: ${resource}:${action}`,
          requiredPermission: { resource, action }
        });
        return;
      }

      next();
    } catch (error) {
      console.error(`Permission check failed for ${resource}:${action}:`, error);
      res.status(500).json({ 
        error: 'Permission check failed',
        details: 'Unable to verify user permissions'
      });
    }
  };
}

/**
 * Middleware to check if user has ANY of the specified permissions
 * @param permissions - Array of {resource, action} permission objects
 * @returns Express middleware function
 */
export function requireAnyPermission(permissions: Array<{resource: string; action: string}>) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ 
          error: 'Authentication required',
          details: 'Please log in to access this resource'
        });
        return;
      }

      let hasAnyPermission = false;
      
      for (const { resource, action } of permissions) {
        const hasPermission = await storage.hasPermission(req.user.id, resource, action);
        if (hasPermission) {
          hasAnyPermission = true;
          break;
        }
      }
      
      if (!hasAnyPermission) {
        const permissionStrings = permissions.map(p => `${p.resource}:${p.action}`);
        res.status(403).json({ 
          error: 'Insufficient permissions',
          details: `Required any of: ${permissionStrings.join(', ')}`,
          requiredPermissions: permissions
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Any permission check failed:', error);
      res.status(500).json({ 
        error: 'Permission check failed',
        details: 'Unable to verify user permissions'
      });
    }
  };
}

/**
 * Middleware to check if user has ALL of the specified permissions
 * @param permissions - Array of {resource, action} permission objects
 * @returns Express middleware function
 */
export function requireAllPermissions(permissions: Array<{resource: string; action: string}>) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ 
          error: 'Authentication required',
          details: 'Please log in to access this resource'
        });
        return;
      }

      const missingPermissions: Array<{resource: string; action: string}> = [];
      
      for (const { resource, action } of permissions) {
        const hasPermission = await storage.hasPermission(req.user.id, resource, action);
        if (!hasPermission) {
          missingPermissions.push({ resource, action });
        }
      }
      
      if (missingPermissions.length > 0) {
        const permissionStrings = missingPermissions.map(p => `${p.resource}:${p.action}`);
        res.status(403).json({ 
          error: 'Insufficient permissions',
          details: `Missing permissions: ${permissionStrings.join(', ')}`,
          missingPermissions
        });
        return;
      }

      next();
    } catch (error) {
      console.error('All permissions check failed:', error);
      res.status(500).json({ 
        error: 'Permission check failed',
        details: 'Unable to verify user permissions'
      });
    }
  };
}

/**
 * Middleware for admin-level operations (user management, system settings)
 * Requires either 'users:manage_roles' OR 'system:manage_settings'
 */
export const requireAdminAccess = requireAnyPermission([
  { resource: 'users', action: 'manage_roles' },
  { resource: 'system', action: 'manage_settings' }
]);

/**
 * Middleware for manager-level operations (team oversight, analytics)
 * Requires either team analytics OR user management permissions
 */
export const requireManagerAccess = requireAnyPermission([
  { resource: 'analytics', action: 'view_team' },
  { resource: 'users', action: 'invite' },
  { resource: 'tasks', action: 'assign' }
]);

/**
 * Utility function to get user permissions for client-side display
 * @param req - Authenticated request object
 * @param res - Response object
 */
export async function getUserPermissions(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id) {
      res.status(401).json({ 
        error: 'Authentication required' 
      });
      return;
    }

    const userPermissions = await storage.getUserPermissionsFromCache(req.user.id);
    
    if (!userPermissions) {
      // Compute and cache permissions if not in cache
      const computedPermissions = await storage.computeUserPermissions(req.user.id);
      await storage.refreshUserPermissionCache(req.user.id);
      
      res.json({
        permissions: computedPermissions,
        fromCache: false
      });
    } else {
      res.json({
        permissions: userPermissions,
        fromCache: true
      });
    }
  } catch (error) {
    console.error('Failed to get user permissions:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve user permissions' 
    });
  }
}

/**
 * Utility function to check permission without middleware (for programmatic use)
 * @param userId - User ID to check permissions for
 * @param resource - Resource to check
 * @param action - Action to check
 * @returns Promise<boolean> indicating if user has permission
 */
export async function checkUserPermission(userId: string, resource: string, action: string): Promise<boolean> {
  try {
    return await storage.hasPermission(userId, resource, action);
  } catch (error) {
    console.error(`Permission check failed for user ${userId}:`, error);
    return false;
  }
}

/**
 * Permission constants for easy reference
 */
export const PERMISSIONS = {
  TASKS: {
    CREATE: 'tasks:create',
    READ: 'tasks:read',
    UPDATE: 'tasks:update',
    DELETE: 'tasks:delete',
    ASSIGN: 'tasks:assign',
    APPROVE: 'tasks:approve'
  },
  PROJECTS: {
    CREATE: 'projects:create',
    READ: 'projects:read',
    UPDATE: 'projects:update',
    DELETE: 'projects:delete',
    MANAGE_TEAM: 'projects:manage_team'
  },
  USERS: {
    READ: 'users:read',
    INVITE: 'users:invite',
    UPDATE: 'users:update',
    DEACTIVATE: 'users:deactivate',
    MANAGE_ROLES: 'users:manage_roles'
  },
  ANALYTICS: {
    VIEW_OWN: 'analytics:view_own',
    VIEW_TEAM: 'analytics:view_team',
    VIEW_ALL: 'analytics:view_all',
    EXPORT: 'analytics:export'
  },
  SYSTEM: {
    MANAGE_INTEGRATIONS: 'system:manage_integrations',
    MANAGE_SETTINGS: 'system:manage_settings',
    AUDIT_LOGS: 'system:audit_logs'
  }
} as const;

/**
 * Helper function to parse permission string into resource and action
 * @param permissionString - String like 'tasks:create'
 * @returns Object with resource and action properties
 */
export function parsePermission(permissionString: string): { resource: string; action: string } {
  const [resource, action] = permissionString.split(':');
  if (!resource || !action) {
    throw new Error(`Invalid permission format: ${permissionString}. Expected format: 'resource:action'`);
  }
  return { resource, action };
}