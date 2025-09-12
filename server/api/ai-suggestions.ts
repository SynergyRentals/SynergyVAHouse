import type { Express } from "express";
import { generateTaskSuggestions, improveResponseDraft, generateFollowUpSuggestions } from "../services/ai-suggestions";
import { storage } from "../storage";

export async function registerAISuggestionsAPI(app: Express): Promise<void> {
  
  // Generate AI suggestions for a task
  app.post('/api/ai/suggest-task', async (req, res) => {
    try {
      const { taskTitle, taskDescription, sourceContext } = req.body as {
        taskTitle: string;
        taskDescription?: string;
        sourceContext?: string;
      };

      if (!taskTitle) {
        res.status(400).json({ error: 'Task title is required' });
        return;
      }

      const suggestions = await generateTaskSuggestions(
        taskTitle,
        taskDescription,
        sourceContext
      );

      res.json(suggestions);
    } catch (error) {
      console.error('Error generating task suggestions:', error);
      res.status(500).json({ error: 'Failed to generate AI suggestions' });
    }
  });

  // Generate AI suggestions for an existing task
  app.post('/api/ai/suggest-for-task/:taskId', async (req, res) => {
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

      const suggestions = await generateTaskSuggestions(
        task.title,
        commentContext || 'No additional context',
        `Source: ${task.sourceKind || 'manual'}`
      );

      res.json(suggestions);
    } catch (error) {
      console.error('Error generating suggestions for task:', error);
      res.status(500).json({ error: 'Failed to generate AI suggestions' });
    }
  });

  // Improve a response draft based on feedback
  app.post('/api/ai/improve-response', async (req, res) => {
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
  app.post('/api/ai/apply-suggestions/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params as { taskId: string };
      const { category, playbookKey, actorId } = req.body as {
        category?: string;
        playbookKey?: string;
        actorId?: string;
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

  // Get AI suggestion history for a task
  app.get('/api/ai/suggestions-history/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params as { taskId: string };

      const audits = await storage.getAuditsForEntity('task', taskId);
      const aiSuggestionAudits = audits.filter(audit => 
        audit.action === 'ai_suggestions_applied' || 
        audit.action === 'ai_suggestions_generated'
      );

      res.json(aiSuggestionAudits);
    } catch (error) {
      console.error('Error fetching AI suggestions history:', error);
      res.status(500).json({ error: 'Failed to fetch suggestions history' });
    }
  });
}