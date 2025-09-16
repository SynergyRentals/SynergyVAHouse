import type { Express } from "express";
import { storage } from "../storage";
import { insertTaskSchema } from "@shared/schema";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

// Category to playbook key mapping (shared function)
function getCategoryPlaybookMapping(): Record<string, string> {
  return {
    'guest.messaging_known_answer': 'guest_messaging_known_answer_v1',
    'reservations.refund_request': 'guest_refund_request_v1',
    'reservations.cancellation_request': 'guest_cancellation_request_v1',
    'access.smart_lock_issue': 'access_smart_lock_issue_v1',
    'internet.wifi_issue': 'wifi_issue_v1'
  };
}

// DoD validation helper function
async function validateTaskDoD(task: any, evidence: any = {}) {
  try {
    let dod = task.dodSchema;
    
    // If task doesn't have DoD schema but has playbook, get from playbook
    if (!dod && task.playbookKey) {
      console.log('[DoD Validation] Task missing dodSchema, fetching from playbook:', task.playbookKey);
      const playbook = await storage.getPlaybook(task.playbookKey);
      if (playbook) {
        const playbookContent = typeof playbook.content === 'string' ? 
          JSON.parse(playbook.content) : playbook.content;
        dod = playbookContent.definition_of_done;
        console.log('[DoD Validation] Retrieved DoD from playbook:', dod);
      }
    }
    
    // If no DoD schema but category suggests one should exist, try category mapping
    if (!dod && task.category) {
      console.log('[DoD Validation] No DoD found via playbookKey, trying category mapping for:', task.category);
      const categoryMapping = getCategoryPlaybookMapping();
      const correctPlaybookKey = categoryMapping[task.category];
      
      if (correctPlaybookKey) {
        console.log('[DoD Validation] Found mapped playbook key:', correctPlaybookKey);
        const playbook = await storage.getPlaybook(correctPlaybookKey);
        if (playbook) {
          const playbookContent = typeof playbook.content === 'string' ? 
            JSON.parse(playbook.content) : playbook.content;
          dod = playbookContent.definition_of_done;
          console.log('[DoD Validation] Retrieved DoD from mapped playbook:', dod);
        }
      }
    }
    
    // If no DoD requirements at all, check if this category should have requirements
    if (!dod) {
      const categoryMapping = getCategoryPlaybookMapping();
      if (categoryMapping[task.category]) {
        console.error(`[DoD Validation] ERROR: Category '${task.category}' should have DoD requirements but none found!`);
        return { valid: false, missingFields: [], missingEvidence: [], error: 'DoD requirements missing for category that should have them' };
      }
      console.log('[DoD Validation] No DoD requirements for category:', task.category);
      return { valid: true, missingFields: [], missingEvidence: [] };
    }
    const missingFields: string[] = [];
    const missingEvidence: string[] = [];

    // Check required fields
    if (dod.required_fields) {
      for (const field of dod.required_fields) {
        if (!evidence[field] || evidence[field] === '') {
          missingFields.push(field);
        }
      }
    }

    // Check required evidence
    if (dod.required_evidence) {
      for (const evidenceType of dod.required_evidence) {
        if (!evidence[evidenceType] || 
            (Array.isArray(evidence[evidenceType]) && evidence[evidenceType].length === 0)) {
          missingEvidence.push(evidenceType);
        }
      }
    }

    const valid = missingFields.length === 0 && missingEvidence.length === 0;
    
    return {
      valid,
      missingFields,
      missingEvidence,
      dodRequirements: dod
    };
  } catch (error) {
    console.error('Error validating DoD:', error);
    return { valid: false, missingFields: [], missingEvidence: [], error: 'Validation failed' };
  }
}

export async function registerTasksAPI(app: Express) {
  // Get tasks with filters - RBAC Protected
  app.get('/api/tasks', requireAuth as any, requirePermission('tasks', 'read'), async (req: AuthenticatedRequest, res) => {
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

  // Get task statistics - RBAC Protected 
  app.get('/api/tasks/stats', requireAuth as any, requirePermission('tasks', 'read'), async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.query as { userId?: string };
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

  // Get task statistics for specific user
  app.get('/api/tasks/stats/:userId', async (req, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const filters = { assigneeId: userId };
      
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

  // Get single task - RBAC Protected
  app.get('/api/tasks/:id', requireAuth as any, requirePermission('tasks', 'read'), async (req: AuthenticatedRequest, res) => {
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

  // Create task - RBAC Protected
  app.post('/api/tasks', requireAuth as any, requirePermission('tasks', 'create'), async (req: AuthenticatedRequest, res) => {
    try {
      // Transform date strings to Date objects before validation
      const transformedBody = {
        ...req.body,
        dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
        slaAt: req.body.slaAt ? new Date(req.body.slaAt) : undefined,
      };
      
      // Use safeParse for detailed validation error handling
      const validationResult = insertTaskSchema.safeParse(transformedBody);
      
      if (!validationResult.success) {
        const fieldErrors: Record<string, string> = {};
        validationResult.error.errors.forEach(error => {
          const field = error.path.join('.');
          fieldErrors[field] = error.message;
        });
        
        console.error('Task validation failed:', fieldErrors);
        res.status(400).json({ 
          error: 'Validation failed',
          message: 'The task data you provided is invalid. Please check the errors below.',
          fieldErrors,
          details: validationResult.error.errors
        });
        return;
      }

      let taskData = validationResult.data;
      
      // Fix playbookKey mapping if not provided or incorrect
      const categoryMapping = getCategoryPlaybookMapping();
      if (!taskData.playbookKey && taskData.category) {
        taskData.playbookKey = categoryMapping[taskData.category] || taskData.category;
        console.log(`[DoD Schema] Mapped category '${taskData.category}' to playbookKey '${taskData.playbookKey}'`);
      } else if (taskData.playbookKey && categoryMapping[taskData.category]) {
        // Ensure the playbookKey is the correct mapped one
        const correctPlaybookKey = categoryMapping[taskData.category];
        if (taskData.playbookKey !== correctPlaybookKey) {
          console.log(`[DoD Schema] Correcting playbookKey from '${taskData.playbookKey}' to '${correctPlaybookKey}' for category '${taskData.category}'`);
          taskData.playbookKey = correctPlaybookKey;
        }
      }
      
      // Populate DoD schema if playbook exists
      if (taskData.playbookKey) {
        console.log('[DoD Schema] Task has playbookKey:', taskData.playbookKey);
        const playbook = await storage.getPlaybook(taskData.playbookKey);
        console.log('[DoD Schema] Playbook found:', playbook ? 'YES' : 'NO');
        
        if (playbook) {
          const playbookContent = typeof playbook.content === 'string' ? 
            JSON.parse(playbook.content) : playbook.content;
          
          console.log('[DoD Schema] Playbook content structure:', Object.keys(playbookContent));
          console.log('[DoD Schema] Has definition_of_done:', !!playbookContent.definition_of_done);
          
          if (playbookContent.definition_of_done) {
            taskData.dodSchema = playbookContent.definition_of_done;
            console.log('[DoD Schema] DoD schema populated:', taskData.dodSchema);
          } else {
            console.log('[DoD Schema] No definition_of_done found in playbook');
          }
        } else {
          console.log('[DoD Schema] Playbook not found in storage');
        }
      } else {
        console.log('[DoD Schema] Task has no playbookKey');
      }
      
      const task = await storage.createTask(taskData);
      
      // Create audit log
      await storage.createAudit({
        entity: 'task',
        entityId: task.id,
        action: 'created',
        actorId: req.user?.id || taskData.createdBy || undefined,
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
      res.status(500).json({ error: 'Internal server error while creating task' });
    }
  });

  // Update task - RBAC Protected
  app.patch('/api/tasks/:id', requireAuth as any, requirePermission('tasks', 'update'), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params as { id: string };
      const { adminOverride, overrideReason, overrideUserId, ...updates } = req.body;
      
      const existingTask = await storage.getTask(id);
      if (!existingTask) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      // Transform date strings to Date objects before validation
      const transformedUpdates = {
        ...updates,
        dueAt: updates.dueAt ? new Date(updates.dueAt) : undefined,
        slaAt: updates.slaAt ? new Date(updates.slaAt) : undefined,
      };
      
      // Create partial schema for updates (all fields optional but still validated when present)
      const updateTaskSchema = insertTaskSchema.partial();
      const validationResult = updateTaskSchema.safeParse(transformedUpdates);
      
      if (!validationResult.success) {
        const fieldErrors: Record<string, string> = {};
        validationResult.error.errors.forEach(error => {
          const field = error.path.join('.');
          fieldErrors[field] = error.message;
        });
        
        console.error('Task update validation failed:', fieldErrors);
        res.status(400).json({ 
          error: 'Validation failed',
          message: 'The task update data you provided is invalid. Please check the errors below.',
          fieldErrors,
          details: validationResult.error.errors
        });
        return;
      }

      const validatedUpdates = validationResult.data;

      // DoD validation when marking task as DONE
      if (validatedUpdates.status === 'DONE' && existingTask.status !== 'DONE') {
        console.log('[DoD Debug] Starting validation for task:', existingTask.id);
        console.log('[DoD Debug] Task playbookKey:', existingTask.playbookKey);
        console.log('[DoD Debug] Task dodSchema:', existingTask.dodSchema);
        console.log('[DoD Debug] Evidence provided:', validatedUpdates.evidence || existingTask.evidence);
        
        const dodValidation = await validateTaskDoD(existingTask, validatedUpdates.evidence || existingTask.evidence);
        
        console.log('[DoD Debug] Validation result:', dodValidation);
        console.log('[DoD Debug] Admin override:', adminOverride);
        
        if (!dodValidation.valid && !adminOverride) {
          console.log('[DoD Debug] BLOCKING completion due to DoD validation failure');
          res.status(400).json({
            error: 'Definition of Done requirements not met',
            validation: dodValidation
          });
          return;
        }
        
        console.log('[DoD Debug] ALLOWING completion - validation passed or admin override used');
        
        // Handle admin override
        if (!dodValidation.valid && adminOverride) {
          // Verify admin user has manager role
          const adminUser = overrideUserId ? await storage.getUser(overrideUserId) : null;
          if (!adminUser || adminUser.role !== 'manager') {
            res.status(403).json({ error: 'Admin override requires manager role' });
            return;
          }
          
          // Log admin override
          await storage.createAudit({
            entity: 'task',
            entityId: id,
            action: 'dod_admin_override',
            actorId: adminUser.id,
            data: {
              overrideReason,
              dodValidation,
              adminUser: { id: adminUser.id, name: adminUser.name }
            }
          });
        }
      }

      const task = await storage.updateTask(id, validatedUpdates);
      
      // Create audit log
      await storage.createAudit({
        entity: 'task',
        entityId: id,
        action: 'updated',
        data: { updates: validatedUpdates, previousState: existingTask }
      });
      
      res.json(task);
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ error: 'Internal server error while updating task' });
    }
  });

  // Delete task - RBAC Protected
  app.delete('/api/tasks/:id', requireAuth as any, requirePermission('tasks', 'delete'), async (req: AuthenticatedRequest, res) => {
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

  // Add comment to task - RBAC Protected
  app.post('/api/tasks/:id/comments', requireAuth as any, requirePermission('tasks', 'comment'), async (req: AuthenticatedRequest, res) => {
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

  // Validate DoD for a specific task - RBAC Protected
  app.post('/api/tasks/:id/validate-dod', requireAuth as any, requirePermission('tasks', 'read'), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params as { id: string };
      const evidence = req.body as any;
      
      const task = await storage.getTask(id);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const validation = await validateTaskDoD(task, evidence);
      
      res.json(validation);
    } catch (error) {
      console.error('Error validating task DoD:', error);
      res.status(500).json({ error: 'Failed to validate definition of done' });
    }
  });

  // Update task evidence - RBAC Protected
  app.patch('/api/tasks/:id/evidence', requireAuth as any, requirePermission('tasks', 'update'), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params as { id: string };
      const evidenceUpdate = req.body as any;
      
      const existingTask = await storage.getTask(id);
      if (!existingTask) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const updatedEvidence = { 
        ...existingTask.evidence, 
        ...evidenceUpdate,
        lastUpdated: new Date()
      };
      
      const task = await storage.updateTask(id, { evidence: updatedEvidence });
      
      // Create audit log
      await storage.createAudit({
        entity: 'task',
        entityId: id,
        action: 'evidence_updated',
        data: { evidenceUpdate }
      });
      
      res.json({ success: true, evidence: updatedEvidence });
    } catch (error) {
      console.error('Error updating task evidence:', error);
      res.status(500).json({ error: 'Failed to update evidence' });
    }
  });

}
