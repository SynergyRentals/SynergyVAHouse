import type { Express } from "express";
import { storage } from "../storage";
import { insertPlaybookSchema } from "@shared/schema";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export async function registerPlaybooksAPI(app: Express) {
  // Get all playbooks - RBAC Protected
  app.get('/api/playbooks', requireAuth as any, requirePermission('playbooks', 'read'), async (req: AuthenticatedRequest, res) => {
    try {
      const playbooks = await storage.getPlaybooks();
      res.json(playbooks.map(playbook => ({
        ...playbook,
        content: typeof playbook.content === 'string' ? 
          JSON.parse(playbook.content) : playbook.content
      })));
    } catch (error) {
      console.error('Error fetching playbooks:', error);
      res.status(500).json({ error: 'Failed to fetch playbooks' });
    }
  });

  // Get single playbook - RBAC Protected
  app.get('/api/playbooks/:key', requireAuth as any, requirePermission('playbooks', 'read'), async (req: AuthenticatedRequest, res) => {
    try {
      const { key } = req.params as { key: string };
      const playbook = await storage.getPlaybook(key);
      
      if (!playbook) {
        res.status(404).json({ error: 'Playbook not found' });
        return;
      }

      res.json({
        ...playbook,
        content: typeof playbook.content === 'string' ? 
          JSON.parse(playbook.content) : playbook.content
      });
    } catch (error) {
      console.error('Error fetching playbook:', error);
      res.status(500).json({ error: 'Failed to fetch playbook' });
    }
  });

  // Create playbook - RBAC Protected
  app.post('/api/playbooks', requireAuth as any, requirePermission('playbooks', 'create'), async (req: AuthenticatedRequest, res) => {
    try {
      const playbookData = insertPlaybookSchema.parse(req.body);
      const playbook = await storage.createPlaybook(playbookData);
      
      await storage.createAudit({
        entity: 'playbook',
        entityId: playbook.id,
        action: 'created',
        data: { playbook }
      });
      
      res.json(playbook);
    } catch (error) {
      console.error('Error creating playbook:', error);
      res.status(400).json({ error: 'Invalid playbook data' });
    }
  });

  // Update playbook - RBAC Protected
  app.patch('/api/playbooks/:key', requireAuth as any, requirePermission('playbooks', 'update'), async (req: AuthenticatedRequest, res) => {
    try {
      const { key } = req.params as { key: string };
      const updates = req.body as any;
      
      const existingPlaybook = await storage.getPlaybook(key);
      if (!existingPlaybook) {
        res.status(404).json({ error: 'Playbook not found' });
        return;
      }

      const playbook = await storage.updatePlaybook(key, updates);
      
      await storage.createAudit({
        entity: 'playbook',
        entityId: playbook.id,
        action: 'updated',
        data: { updates, previousState: existingPlaybook }
      });
      
      res.json(playbook);
    } catch (error) {
      console.error('Error updating playbook:', error);
      res.status(400).json({ error: 'Failed to update playbook' });
    }
  });

  // Get playbook by category - RBAC Protected
  app.get('/api/playbooks/category/:category', requireAuth as any, requirePermission('playbooks', 'read'), async (req: AuthenticatedRequest, res) => {
    try {
      const { category } = req.params as { category: string };
      const playbooks = await storage.getPlaybooks();
      
      const categoryPlaybooks = playbooks.filter(playbook => playbook.category === category);
      
      res.json(categoryPlaybooks.map(playbook => ({
        ...playbook,
        content: typeof playbook.content === 'string' ? 
          JSON.parse(playbook.content) : playbook.content
      })));
    } catch (error) {
      console.error('Error fetching playbooks by category:', error);
      res.status(500).json({ error: 'Failed to fetch playbooks by category' });
    }
  });

  // Validate playbook DoD requirements - RBAC Protected
  app.post('/api/playbooks/:key/validate-dod', requireAuth as any, requirePermission('playbooks', 'read'), async (req: AuthenticatedRequest, res) => {
    try {
      const { key } = req.params as { key: string };
      const evidence = req.body as any;
      
      const playbook = await storage.getPlaybook(key);
      if (!playbook) {
        res.status(404).json({ error: 'Playbook not found' });
        return;
      }

      const playbookContent = typeof playbook.content === 'string' ? 
        JSON.parse(playbook.content) : playbook.content;
      
      const dod = playbookContent.definition_of_done;
      if (!dod) {
        res.json({ valid: true, missingFields: [], missingEvidence: [] });
        return;
      }

      const missingFields = [];
      const missingEvidence = [];

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
          if (!evidence[evidenceType]) {
            missingEvidence.push(evidenceType);
          }
        }
      }

      const valid = missingFields.length === 0 && missingEvidence.length === 0;
      
      res.json({
        valid,
        missingFields,
        missingEvidence,
        dodRequirements: dod
      });
    } catch (error) {
      console.error('Error validating DoD:', error);
      res.status(500).json({ error: 'Failed to validate definition of done' });
    }
  });

  // Get SLA information for category
  app.get('/api/playbooks/sla/:category', async (req, res) => {
    try {
      const { category } = req.params as { category: string };
      const playbook = await storage.getPlaybook(category);
      
      if (!playbook) {
        res.json({ 
          hasSLA: false, 
          firstResponseMinutes: null,
          escalationChannel: null 
        });
        return;
      }

      const playbookContent = typeof playbook.content === 'string' ? 
        JSON.parse(playbook.content) : playbook.content;
      
      const sla = playbookContent.sla;
      
      res.json({
        hasSLA: !!sla,
        firstResponseMinutes: sla?.first_response_minutes || null,
        escalationChannel: sla?.breach_escalate_to || null,
        nightHours: sla?.night_hours || null
      });
    } catch (error) {
      console.error('Error fetching SLA info:', error);
      res.status(500).json({ error: 'Failed to fetch SLA information' });
    }
  });
}
