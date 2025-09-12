import type { Express } from "express";
import { generateTaskSuggestions, improveResponseDraft, generateFollowUpSuggestions } from "../services/ai-suggestions";
import { storage } from "../storage";
import { requireAuth, requireManagerRole, getAuthenticatedUserId, type AuthenticatedRequest } from "../middleware/auth";

export async function registerAISuggestionsAPI(app: Express): Promise<void> {
  
  // Generate AI suggestions for a task
  app.post('/api/ai/suggest-task', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { taskTitle, taskDescription, sourceContext, taskId } = req.body as {
        taskTitle: string;
        taskDescription?: string;
        sourceContext?: string;
        taskId?: string;
      };

      if (!taskTitle) {
        res.status(400).json({ error: 'Task title is required' });
        return;
      }

      const actorId = getAuthenticatedUserId(req);
      const suggestions = await generateTaskSuggestions(
        taskTitle,
        taskDescription,
        sourceContext,
        taskId,
        actorId
      );

      res.json(suggestions);
    } catch (error) {
      console.error('Error generating task suggestions:', error);
      res.status(500).json({ error: 'Failed to generate AI suggestions' });
    }
  });

  // Generate AI suggestions for an existing task
  app.post('/api/ai/suggest-for-task/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { taskId } = req.params as { taskId: string };
      
      const task = await storage.getTask(taskId);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      // Get task comments for additional context
      const comments = await storage.getCommentsForTask(taskId);
      const commentContext = comments.map(c => c.body).join(' ');

      const actorId = getAuthenticatedUserId(req);
      const suggestions = await generateTaskSuggestions(
        task.title,
        commentContext || 'No additional context',
        `Source: ${task.sourceKind || 'manual'}`,
        taskId,
        actorId
      );

      res.json(suggestions);
    } catch (error) {
      console.error('Error generating suggestions for task:', error);
      res.status(500).json({ error: 'Failed to generate AI suggestions' });
    }
  });

  // Improve a response draft based on feedback
  app.post('/api/ai/improve-response', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { originalDraft, feedback, taskContext } = req.body as {
        originalDraft: string;
        feedback: string;
        taskContext?: string;
      };

      if (!originalDraft || !feedback) {
        res.status(400).json({ error: 'Original draft and feedback are required' });
        return;
      }

      const improvedDraft = await improveResponseDraft(
        originalDraft,
        feedback,
        taskContext || ''
      );

      res.json(improvedDraft);
    } catch (error) {
      console.error('Error improving response draft:', error);
      res.status(500).json({ error: 'Failed to improve response draft' });
    }
  });

  // Generate follow-up suggestions for completed tasks
  app.post('/api/ai/suggest-followups', async (req, res) => {
    try {
      const { taskTitle, taskDescription, completedActions } = req.body as {
        taskTitle: string;
        taskDescription: string;
        completedActions: string[];
      };

      if (!taskTitle || !taskDescription) {
        res.status(400).json({ error: 'Task title and description are required' });
        return;
      }

      const followUps = await generateFollowUpSuggestions(
        taskTitle,
        taskDescription,
        completedActions || []
      );

      res.json({ followUps });
    } catch (error) {
      console.error('Error generating follow-up suggestions:', error);
      res.status(500).json({ error: 'Failed to generate follow-up suggestions' });
    }
  });

  // Apply AI suggestions to a task (update category/playbook)
  app.post('/api/ai/apply-suggestions/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { taskId } = req.params as { taskId: string };
      const { category, playbookKey } = req.body as {
        category?: string;
        playbookKey?: string;
      };

      const task = await storage.getTask(taskId);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const updates: any = {};
      
      if (category) {
        updates.category = category;
      }
      
      if (playbookKey) {
        updates.playbookKey = playbookKey;
        
        // Get DoD schema from playbook
        const playbook = await storage.getPlaybook(playbookKey);
        if (playbook) {
          const playbookContent = typeof playbook.content === 'string' ? 
            JSON.parse(playbook.content) : playbook.content;
          if (playbookContent.definition_of_done) {
            updates.dodSchema = playbookContent.definition_of_done;
          }
        }
      }

      const updatedTask = await storage.updateTask(taskId, updates);

      // Log the AI suggestion application
      const actorId = getAuthenticatedUserId(req);
      if (actorId) {
        await storage.createAudit({
          entity: 'task',
          entityId: taskId,
          action: 'ai_suggestions_applied',
          actorId: actorId,
          data: { category, playbookKey, appliedBy: 'ai_assistant' }
        });
      }

      res.json(updatedTask);
    } catch (error) {
      console.error('Error applying AI suggestions:', error);
      res.status(500).json({ error: 'Failed to apply AI suggestions' });
    }
  });

  // Get AI suggestions history for a task from database
  app.get('/api/ai/suggestions/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { taskId } = req.params as { taskId: string };

      const suggestions = await storage.getAISuggestionsForTask(taskId);
      res.json(suggestions);
    } catch (error) {
      console.error('Error fetching AI suggestions for task:', error);
      res.status(500).json({ error: 'Failed to fetch AI suggestions' });
    }
  });

  // Get specific AI suggestion by ID
  app.get('/api/ai/suggestion/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params as { id: string };

      const suggestion = await storage.getAISuggestion(id);
      if (!suggestion) {
        res.status(404).json({ error: 'AI suggestion not found' });
        return;
      }

      res.json(suggestion);
    } catch (error) {
      console.error('Error fetching AI suggestion:', error);
      res.status(500).json({ error: 'Failed to fetch AI suggestion' });
    }
  });

  // Link AI suggestion to a task after task creation
  app.patch('/api/ai/suggestion/:id/link', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params as { id: string };
      const { taskId } = req.body as {
        taskId: string;
      };

      if (!taskId) {
        res.status(400).json({ error: 'Task ID is required for linking' });
        return;
      }

      const suggestion = await storage.getAISuggestion(id);
      if (!suggestion) {
        res.status(404).json({ error: 'AI suggestion not found' });
        return;
      }

      // Verify the task exists
      const task = await storage.getTask(taskId);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      // Update the suggestion with the task ID
      const updatedSuggestion = await storage.updateAISuggestion(id, {
        taskId: taskId
      });

      // Create audit log for the linkage
      const actorId = getAuthenticatedUserId(req);
      if (actorId) {
        await storage.createAudit({
          entity: 'ai_suggestions',
          entityId: id,
          action: 'suggestion_linked_to_task',
          actorId: actorId,
          data: { taskId, suggestionId: id }
        });
      }

      // Check if this suggestion requires Slack approval and trigger it now that we have a task
      const suggestions = typeof suggestion.suggestions === 'string' ? 
        JSON.parse(suggestion.suggestions) : suggestion.suggestions;
      
      if (suggestions.responseDraft?.requiresApproval && !suggestion.slackApprovalTs) {
        try {
          const { postSlackApprovalRequest } = await import('../services/ai-suggestions');
          const slackTs = await postSlackApprovalRequest(
            id,
            taskId,
            task.title,
            suggestions
          );
          
          if (slackTs) {
            await storage.updateAISuggestion(id, {
              slackApprovalTs: slackTs
            });
          }
        } catch (slackError) {
          console.error('Error posting Slack approval request:', slackError);
          // Don't fail the linkage if Slack fails
        }
      }

      res.json(updatedSuggestion);
    } catch (error) {
      console.error('Error linking AI suggestion to task:', error);
      res.status(500).json({ error: 'Failed to link AI suggestion to task' });
    }
  });

  // Update AI suggestion status (for approval workflow) - requires manager role
  app.put('/api/ai/suggestion/:id', requireAuth, requireManagerRole, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params as { id: string };
      const { status, appliedSuggestions } = req.body as {
        status?: string;
        appliedSuggestions?: any;
      };

      const suggestion = await storage.getAISuggestion(id);
      if (!suggestion) {
        res.status(404).json({ error: 'AI suggestion not found' });
        return;
      }

      const updates: any = {};
      if (status) updates.status = status;
      
      // Only allow approval/rejection status changes
      if (status && ['approved', 'rejected'].includes(status)) {
        updates.approvedBy = getAuthenticatedUserId(req);
        updates.approvedAt = new Date();
      }
      
      if (appliedSuggestions) updates.appliedSuggestions = appliedSuggestions;

      const updatedSuggestion = await storage.updateAISuggestion(id, updates);
      res.json(updatedSuggestion);
    } catch (error) {
      console.error('Error updating AI suggestion:', error);
      res.status(500).json({ error: 'Failed to update AI suggestion' });
    }
  });

  // Get AI suggestion audits/history
  app.get('/api/ai/suggestions-history/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params as { taskId: string };

      const audits = await storage.getAuditsForEntity('ai_suggestions', taskId);
      const taskAudits = await storage.getAuditsForEntity('task', taskId);
      
      // Combine AI suggestion audits and related task audits
      const allAudits = [...audits, ...taskAudits.filter(audit => 
        audit.action.includes('ai_suggestions')
      )].sort((a, b) => (new Date(b.ts || 0)).getTime() - (new Date(a.ts || 0)).getTime());

      res.json(allAudits);
    } catch (error) {
      console.error('Error fetching AI suggestions history:', error);
      res.status(500).json({ error: 'Failed to fetch suggestions history' });
    }
  });
}