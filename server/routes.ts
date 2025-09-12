import type { Express } from "express";
import { storage } from "./storage";
import { insertTaskSchema, insertProjectSchema } from "@shared/schema";
import { registerTasksAPI } from "./api/tasks";
import { registerProjectsAPI } from "./api/projects";
import { registerPlaybooksAPI } from "./api/playbooks";
import { registerAISuggestionsAPI } from "./api/ai-suggestions";
import { setupConduitWebhooks } from "./webhooks/conduit";
import { setupSuiteOpWebhooks } from "./webhooks/suiteop";

export async function registerRoutes(app: Express): Promise<void> {
  // Health check
  app.get('/healthz', async (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Register API modules
  await registerTasksAPI(app);
  await registerProjectsAPI(app);
  await registerPlaybooksAPI(app);
  await registerAISuggestionsAPI(app);

  // Setup webhook handlers
  await setupConduitWebhooks(app);
  await setupSuiteOpWebhooks(app);

  // Users API
  app.get('/api/users', async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Metrics API
  app.get('/api/metrics', async (req, res) => {
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

  // Weekly Scorecard
  app.get('/api/metrics/scorecard', async (req, res) => {
    try {
      const { generateWeeklyScorecard } = await import('./services/metrics');
      const scorecard = await generateWeeklyScorecard();
      res.json(scorecard);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate scorecard' });
    }
  });

  // Export Scorecard
  app.post('/api/metrics/export', async (req, res) => {
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

  // Recent Audits
  app.get('/api/audits/recent', async (req, res) => {
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

  // Audits for specific entity
  app.get('/api/audits/:entity/:entityId', async (req, res) => {
    try {
      const { entity, entityId } = req.params as any;
      const audits = await storage.getAuditsForEntity(entity, entityId);
      res.json(audits);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch audits' });
    }
  });

  // Dashboard stats with enhanced calculations
  app.get('/api/dashboard/stats', async (req, res) => {
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
}
