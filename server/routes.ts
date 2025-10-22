import type { Express } from "express";
import { storage } from "./storage";
import { insertTaskSchema, insertProjectSchema } from "@shared/schema";
import { registerTasksAPI } from "./api/tasks";
import { registerProjectsAPI } from "./api/projects";
import { registerPlaybooksAPI } from "./api/playbooks";
import { registerAISuggestionsAPI } from "./api/ai-suggestions";
import { setupConduitWebhooks } from "./webhooks/conduit";
import { setupSuiteOpWebhooks } from "./webhooks/suiteop";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { requireReplitAuth, requireAuth, type AuthenticatedRequest } from "./middleware/auth";
import { z } from "zod";
import authRoutes from "./api/auth/routes";

export async function registerRoutes(app: Express): Promise<void> {
  // Setup Replit Auth middleware first
  await setupAuth(app);

  // Health check
  app.get('/healthz', async (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Register auth routes (JWT, Slack OAuth, API keys)
  app.use('/api/auth', authRoutes);

  // Legacy auth route for backward compatibility (session-based)
  // This is now also handled by /api/auth/user in the auth routes
  // but we keep this for any direct callers

  // Register API modules
  await registerTasksAPI(app);
  await registerProjectsAPI(app);
  await registerPlaybooksAPI(app);
  await registerAISuggestionsAPI(app);

  // Setup webhook handlers
  await setupConduitWebhooks(app);
  await setupSuiteOpWebhooks(app);

  // Users API - Protected endpoint
  app.get('/api/users', requireAuth as any, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Update user profile
  app.patch('/api/users/profile', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const profileUpdateSchema = z.object({
        name: z.string().min(2, 'Name must be at least 2 characters').optional(),
        email: z.string().email('Please enter a valid email').optional(),
        department: z.string().optional(),
        timezone: z.string().optional(),
      });

      const validation = profileUpdateSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ 
          error: 'Invalid request body',
          details: validation.error.errors
        });
        return;
      }

      const updatedUser = await storage.upsertUser({
        id: req.user.id,
        ...validation.data,
      });

      res.json({
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        department: updatedUser.department,
        timezone: updatedUser.timezone,
      });
    } catch (error) {
      console.error('Profile update failed:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Update user preferences
  app.patch('/api/users/preferences', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const preferencesUpdateSchema = z.object({
        theme: z.enum(['light', 'dark', 'system']).optional(),
        notifications: z.boolean().optional(),
        dashboardLayout: z.enum(['grid', 'list']).optional(),
      });

      const validation = preferencesUpdateSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ 
          error: 'Invalid request body',
          details: validation.error.errors
        });
        return;
      }

      // Get current user to merge preferences
      const currentUser = await storage.getUser(req.user.id);
      if (!currentUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const currentPreferences = currentUser.preferences || {};
      const updatedPreferences = {
        ...currentPreferences,
        ...validation.data,
      };

      const updatedUser = await storage.upsertUser({
        id: req.user.id,
        preferences: updatedPreferences,
      });

      res.json({
        preferences: updatedUser.preferences,
      });
    } catch (error) {
      console.error('Preferences update failed:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  });

  // RBAC API endpoints
  
  // Get current user's permissions
  app.get('/api/auth/permissions', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    const { getUserPermissions } = await import('./middleware/rbac');
    await getUserPermissions(req, res);
  });

  // Get all roles (admin only)
  app.get('/api/rbac/roles', requireAuth as any, async (req, res) => {
    try {
      const { requirePermission } = await import('./middleware/rbac');
      await requirePermission('users', 'manage_roles')(req as AuthenticatedRequest, res, async () => {
        const roles = await storage.getRoles();
        res.json(roles);
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch roles' });
    }
  });

  // Get all permissions (admin only)
  app.get('/api/rbac/permissions', requireAuth as any, async (req, res) => {
    try {
      const { requirePermission } = await import('./middleware/rbac');
      await requirePermission('users', 'manage_roles')(req as AuthenticatedRequest, res, async () => {
        const permissions = await storage.getPermissions();
        res.json(permissions);
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch permissions' });
    }
  });

  // Assign role to user (admin only)
  app.post('/api/rbac/users/:userId/roles', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    try {
      const { requirePermission } = await import('./middleware/rbac');
      await requirePermission('users', 'manage_roles')(req, res, async () => {
        const { userId } = req.params;
        
        // Validate request body
        const assignRoleSchema = z.object({
          roleId: z.string().uuid('Role ID must be a valid UUID')
        });
        
        const validation = assignRoleSchema.safeParse(req.body);
        if (!validation.success) {
          res.status(400).json({ 
            error: 'Invalid request body',
            details: validation.error.errors
          });
          return;
        }
        
        const { roleId } = validation.data;

        const userRole = await storage.assignRoleToUser({
          userId,
          roleId,
          assignedBy: req.user!.id,
          assignedAt: new Date()
        });

        // Refresh user's permission cache
        await storage.refreshUserPermissionCache(userId);

        res.json(userRole);
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to assign role' });
    }
  });

  // Remove role from user (admin only)
  app.delete('/api/rbac/users/:userId/roles/:roleId', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    try {
      const { requirePermission } = await import('./middleware/rbac');
      await requirePermission('users', 'manage_roles')(req, res, async () => {
        const { userId, roleId } = req.params;
        
        // Validate UUID parameters
        const paramSchema = z.object({
          userId: z.string().uuid('User ID must be a valid UUID'),
          roleId: z.string().uuid('Role ID must be a valid UUID')
        });
        
        const validation = paramSchema.safeParse({ userId, roleId });
        if (!validation.success) {
          res.status(400).json({ 
            error: 'Invalid parameters',
            details: validation.error.errors
          });
          return;
        }
        
        await storage.removeRoleFromUser(userId, roleId);
        
        // Refresh user's permission cache
        await storage.refreshUserPermissionCache(userId);

        res.json({ success: true });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove role' });
    }
  });

  // Metrics API - RBAC Protected
  app.get('/api/metrics', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    const { requirePermission } = await import('./middleware/rbac');
    await requirePermission('analytics', 'view_all')(req, res, async () => {
    try {
      const { startDate, endDate, userId } = req.query as any;
      const metrics = await storage.getMetrics(
        new Date(startDate),
        new Date(endDate),
        userId
      );
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
    });
  });

  // Weekly Scorecard - RBAC Protected
  app.get('/api/metrics/scorecard', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    const { requirePermission } = await import('./middleware/rbac');
    await requirePermission('analytics', 'view_all')(req, res, async () => {
    try {
      const { generateWeeklyScorecard } = await import('./services/metrics');
      const scorecard = await generateWeeklyScorecard();
      res.json(scorecard);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate scorecard' });
    }
    });
  });

  // Export Scorecard - RBAC Protected
  app.post('/api/metrics/export', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    const { requirePermission } = await import('./middleware/rbac');
    await requirePermission('analytics', 'export')(req, res, async () => {
    try {
      const { exportScorecardToSheets } = await import('./services/metrics');
      const { scorecard } = req.body as any;
      const csvData = await exportScorecardToSheets(scorecard);
      
      res.type('text/csv');
      res.header('Content-Disposition', 'attachment; filename="scorecard.csv"');
      res.send(csvData);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export scorecard' });
    }
    });
  });

  // Recent Audits - RBAC Protected  
  app.get('/api/audits/recent', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    const { requirePermission } = await import('./middleware/rbac');
    await requirePermission('system', 'audit_logs')(req, res, async () => {
    try {
      const { limit = 20 } = req.query as any;
      
      // Get recent audits across all entities
      const audits = await storage.getAuditsForEntity('task', '');
      const recentAudits = audits
        .sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime())
        .slice(0, parseInt(limit));
      
      res.json(recentAudits);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch recent audits' });
    }
    });
  });

  // Audits for specific entity - RBAC Protected
  app.get('/api/audits/:entity/:entityId', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    const { requirePermission } = await import('./middleware/rbac');
    await requirePermission('system', 'audit_logs')(req, res, async () => {
    try {
      const { entity, entityId } = req.params as any;
      const audits = await storage.getAuditsForEntity(entity, entityId);
      res.json(audits);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch audits' });
    }
    });
  });

  // Dashboard stats - RBAC Protected
  app.get('/api/dashboard/stats', requireAuth as any, async (req: AuthenticatedRequest, res) => {
    const { requirePermission } = await import('./middleware/rbac');
    await requirePermission('analytics', 'view_all')(req, res, async () => {
    try {
      const { userId } = req.query as any;
      
      const allTasks = await storage.getTasks({ assigneeId: userId });
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const todayTasks = allTasks.filter(task => 
        task.dueAt && new Date(task.dueAt).toDateString() === now.toDateString()
      );
      
      const overdueTasks = allTasks.filter(task => 
        task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < now
      );
      
      const completedTasks = allTasks.filter(task => 
        task.status === 'DONE' && task.updatedAt && new Date(task.updatedAt) > yesterday
      );
      
      const blockedTasks = allTasks.filter(task => task.status === 'BLOCKED');
      
      const slaBreachTasks = allTasks.filter(task => 
        task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < now
      );
      
      res.json({
        todayStats: { total: todayTasks.length },
        overdueStats: { total: overdueTasks.length },
        completedStats: { total: completedTasks.length },
        blockedStats: { total: blockedTasks.length },
        slaBreachStats: { total: slaBreachTasks.length }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
    });
  });
}
