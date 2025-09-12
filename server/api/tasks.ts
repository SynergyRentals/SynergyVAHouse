import type { Express } from "express";
import { storage } from "../storage";
import { insertTaskSchema } from "@shared/schema";
import { z } from "zod";

export async function registerTasksAPI(app: Express) {
  // Get tasks with filters
  app.get('/api/tasks', async (req, res) => {
    try {
      const querySchema = z.object({
        status: z.string().optional(),
        assigneeId: z.string().optional(),
        type: z.string().optional(),
        category: z.string().optional(),
        dueToday: z.string().optional(),
        overdue: z.string().optional(),
        slaBreached: z.string().optional()
      });

      const query = querySchema.parse(req.query);
      let filters: any = {};

      if (query.status) filters.status = query.status;
      if (query.assigneeId) filters.assigneeId = query.assigneeId;
      if (query.type) filters.type = query.type;
      if (query.category) filters.category = query.category;

      let tasks = await storage.getTasks(filters);

      // Apply additional filters
      const now = new Date();
      const today = now.toDateString();

      if (query.dueToday === 'true') {
        tasks = tasks.filter(task => 
          task.dueAt && new Date(task.dueAt).toDateString() === today
        );
      }

      if (query.overdue === 'true') {
        tasks = tasks.filter(task => 
          task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < now
        );
      }

      if (query.slaBreached === 'true') {
        tasks = tasks.filter(task => 
          task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < now
        );
      }

      // Populate assignee information
      const tasksWithAssignees = await Promise.all(tasks.map(async (task) => {
        const assignee = task.assigneeId ? await storage.getUser(task.assigneeId) : null;
        return {
          ...task,
          assignee: assignee ? { id: assignee.id, name: assignee.name, slackId: assignee.slackId } : null
        };
      }));

      res.json(tasksWithAssignees);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  // Get single task
  app.get('/api/tasks/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const task = await storage.getTask(id);
      
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const assignee = task.assigneeId ? await storage.getUser(task.assigneeId) : null;
      const comments = await storage.getCommentsForTask(id);
      const audits = await storage.getAuditsForEntity('task', id);

      res.json({
        ...task,
        assignee: assignee ? { id: assignee.id, name: assignee.name, slackId: assignee.slackId } : null,
        comments,
        audits
      });
    } catch (error) {
      console.error('Error fetching task:', error);
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  // Create task
  app.post('/api/tasks', async (req, res) => {
    try {
      const taskData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(taskData);
      
      // Create audit log
      await storage.createAudit({
        entity: 'task',
        entityId: task.id,
        action: 'created',
        actorId: taskData.createdBy || undefined,
        data: { task }
      });

      // Start SLA timer if playbook exists
      if (task.playbookKey) {
        const playbook = await storage.getPlaybook(task.playbookKey);
        if (playbook) {
          const { startSLATimer } = await import('../services/sla');
          await startSLATimer(task.id, playbook);
        }
      }
      
      res.json(task);
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(400).json({ error: 'Invalid task data' });
    }
  });

  // Update task
  app.patch('/api/tasks/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const updates = req.body as any;
      
      const existingTask = await storage.getTask(id);
      if (!existingTask) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const task = await storage.updateTask(id, updates);
      
      // Create audit log
      await storage.createAudit({
        entity: 'task',
        entityId: id,
        action: 'updated',
        data: { updates, previousState: existingTask }
      });
      
      res.json(task);
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(400).json({ error: 'Failed to update task' });
    }
  });

  // Delete task
  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      
      const existingTask = await storage.getTask(id);
      if (!existingTask) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      await storage.deleteTask(id);
      
      // Create audit log
      await storage.createAudit({
        entity: 'task',
        entityId: id,
        action: 'deleted',
        data: { deletedTask: existingTask }
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  // Add comment to task
  app.post('/api/tasks/:id/comments', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const { body, authorId } = req.body as any;
      
      const task = await storage.getTask(id);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const comment = await storage.createComment({
        taskId: id,
        authorId,
        body
      });
      
      res.json(comment);
    } catch (error) {
      console.error('Error adding comment:', error);
      res.status(400).json({ error: 'Failed to add comment' });
    }
  });

  // Get task statistics
  app.get('/api/tasks/stats/:userId?', async (req, res) => {
    try {
      const { userId } = req.params as { userId?: string };
      const filters = userId ? { assigneeId: userId } : {};
      
      const allTasks = await storage.getTasks(filters);
      const now = new Date();
      const today = now.toDateString();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const todayTasks = allTasks.filter(task => 
        task.dueAt && new Date(task.dueAt).toDateString() === today
      );
      
      const overdueTasks = allTasks.filter(task => 
        task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < now
      );
      
      const completedTasks = allTasks.filter(task => 
        task.status === 'DONE' && task.updatedAt && new Date(task.updatedAt) > yesterday
      );
      
      const blockedTasks = allTasks.filter(task => task.status === 'BLOCKED');
      
      const slaBreaches = allTasks.filter(task => 
        task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < now
      );
      
      res.json({
        todayStats: { total: todayTasks.length },
        overdueStats: { total: overdueTasks.length },
        completedStats: { total: completedTasks.length },
        blockedStats: { total: blockedTasks.length },
        slaBreachStats: { total: slaBreaches.length }
      });
    } catch (error) {
      console.error('Error fetching task stats:', error);
      res.status(500).json({ error: 'Failed to fetch task statistics' });
    }
  });
}
