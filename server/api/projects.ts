import type { Express } from "express";
import { storage } from "../storage";
import { insertProjectSchema } from "@shared/schema";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export async function registerProjectsAPI(app: Express) {
  // Get all projects - RBAC Protected
  app.get('/api/projects', requireAuth as any, requirePermission('projects', 'read'), async (req: AuthenticatedRequest, res) => {
    try {
      const projects = await storage.getProjects();
      
      // Populate owner information and task counts
      const projectsWithDetails = await Promise.all(projects.map(async (project) => {
        const owner = project.ownerId ? await storage.getUser(project.ownerId) : null;
        const projectTasks = await storage.getTasks({ projectId: project.id });
        
        const taskStats = {
          total: projectTasks.length,
          completed: projectTasks.filter(task => task.status === 'DONE').length,
          inProgress: projectTasks.filter(task => task.status === 'IN_PROGRESS').length,
          blocked: projectTasks.filter(task => task.status === 'BLOCKED').length,
          open: projectTasks.filter(task => task.status === 'OPEN').length
        };
        
        return {
          ...project,
          owner: owner ? { id: owner.id, name: owner.name, slackId: owner.slackId } : null,
          taskStats
        };
      }));
      
      res.json(projectsWithDetails);
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  // Get single project - RBAC Protected
  app.get('/api/projects/:id', requireAuth as any, requirePermission('projects', 'read'), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params as { id: string };
      const project = await storage.getProject(id);
      
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const owner = project.ownerId ? await storage.getUser(project.ownerId) : null;
      const tasks = await storage.getTasks({ projectId: id });
      
      // Group tasks by status for kanban view
      const kanbanColumns = {
        backlog: tasks.filter(task => task.status === 'OPEN'),
        inProgress: tasks.filter(task => task.status === 'IN_PROGRESS'),
        waiting: tasks.filter(task => task.status === 'WAITING'),
        blocked: tasks.filter(task => task.status === 'BLOCKED'),
        done: tasks.filter(task => task.status === 'DONE')
      };

      res.json({
        ...project,
        owner: owner ? { id: owner.id, name: owner.name, slackId: owner.slackId } : null,
        tasks,
        kanbanColumns
      });
    } catch (error) {
      console.error('Error fetching project:', error);
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  // Create project - RBAC Protected
  app.post('/api/projects', requireAuth as any, requirePermission('projects', 'create'), async (req: AuthenticatedRequest, res) => {
    try {
      // Transform date strings to Date objects before validation
      const transformedBody = {
        ...req.body,
        startAt: req.body.startAt ? new Date(req.body.startAt) : undefined,
        targetAt: req.body.targetAt ? new Date(req.body.targetAt) : undefined,
      };
      
      const projectData = insertProjectSchema.parse(transformedBody);
      const project = await storage.createProject(projectData);
      
      await storage.createAudit({
        entity: 'project',
        entityId: project.id,
        action: 'created',
        data: { project }
      });
      
      res.json(project);
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(400).json({ error: 'Invalid project data' });
    }
  });

  // Update project - RBAC Protected
  app.patch('/api/projects/:id', requireAuth as any, requirePermission('projects', 'update'), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params as { id: string };
      const updates = req.body as any;
      
      const existingProject = await storage.getProject(id);
      if (!existingProject) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const project = await storage.updateProject(id, updates);
      
      await storage.createAudit({
        entity: 'project',
        entityId: id,
        action: 'updated',
        data: { updates, previousState: existingProject }
      });
      
      res.json(project);
    } catch (error) {
      console.error('Error updating project:', error);
      res.status(400).json({ error: 'Failed to update project' });
    }
  });

  // Get project progress - RBAC Protected
  app.get('/api/projects/:id/progress', requireAuth as any, requirePermission('projects', 'read'), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params as { id: string };
      const project = await storage.getProject(id);
      
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const tasks = await storage.getTasks({ projectId: id });
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(task => task.status === 'DONE').length;
      
      const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      // Calculate if project is on track
      const now = new Date();
      const onTrack = !project.targetAt || new Date(project.targetAt) >= now;
      
      // Get next 3 actionable tasks
      const nextTasks = tasks
        .filter(task => task.status === 'OPEN' || task.status === 'IN_PROGRESS')
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
          return a.dueAt ? -1 : 1;
        })
        .slice(0, 3);
      
      res.json({
        progressPercent,
        totalTasks,
        completedTasks,
        onTrack,
        nextTasks,
        daysRemaining: project.targetAt ? 
          Math.ceil((new Date(project.targetAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
      });
    } catch (error) {
      console.error('Error fetching project progress:', error);
      res.status(500).json({ error: 'Failed to fetch project progress' });
    }
  });

  // Add task to project
  app.post('/api/projects/:id/tasks', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const taskData = req.body as any;
      
      const project = await storage.getProject(id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const task = await storage.createTask({
        ...taskData,
        projectId: id,
        type: 'project'
      });
      
      await storage.createAudit({
        entity: 'task',
        entityId: task.id,
        action: 'created',
        data: { task, projectId: id }
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
      console.error('Error adding task to project:', error);
      res.status(400).json({ error: 'Failed to add task to project' });
    }
  });
}
