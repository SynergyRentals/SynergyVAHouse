import { 
  users, tasks, projects, comments, audits, metricRollups, playbooks, aiSuggestions,
  type User, type InsertUser, type Task, type InsertTask, 
  type Project, type InsertProject, type Comment, type InsertComment,
  type Audit, type InsertAudit, type Playbook, type InsertPlaybook,
  type AISuggestion, type InsertAISuggestion
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserBySlackId(slackId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  // Tasks
  getTask(id: string): Promise<Task | undefined>;
  getTasks(filters?: any): Promise<Task[]>;
  getTasksForUser(userId: string): Promise<Task[]>;
  getTasksForSLA(): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Projects
  getProject(id: string): Promise<Project | undefined>;
  getProjects(): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project>;

  // Comments
  getCommentsForTask(taskId: string): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;

  // Audits
  createAudit(audit: InsertAudit): Promise<Audit>;
  getAuditsForEntity(entity: string, entityId: string): Promise<Audit[]>;

  // Playbooks
  getPlaybook(key: string): Promise<Playbook | undefined>;
  getPlaybooks(): Promise<Playbook[]>;
  createPlaybook(playbook: InsertPlaybook): Promise<Playbook>;
  updatePlaybook(key: string, updates: Partial<Playbook>): Promise<Playbook>;

  // Metrics
  getMetrics(startDate: Date, endDate: Date, userId?: string): Promise<any[]>;
  createMetricRollup(rollup: any): Promise<void>;

  // AI Suggestions
  getAISuggestion(id: string): Promise<AISuggestion | undefined>;
  getAISuggestionsForTask(taskId: string): Promise<AISuggestion[]>;
  createAISuggestion(suggestion: InsertAISuggestion): Promise<AISuggestion>;
  updateAISuggestion(id: string, updates: Partial<AISuggestion>): Promise<AISuggestion>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserBySlackId(slackId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.slackId, slackId));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  // Tasks
  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async getTasks(filters?: any): Promise<Task[]> {
    const conditions = [];
    
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(sql`${tasks.status} IN (${sql.join(filters.status.map((s: string) => sql`${s}`), sql`, `)})`);
      } else {
        conditions.push(eq(tasks.status, filters.status));
      }
    }
    if (filters?.assigneeId) {
      conditions.push(eq(tasks.assigneeId, filters.assigneeId));
    }
    if (filters?.type) {
      conditions.push(eq(tasks.type, filters.type));
    }
    if (filters?.category) {
      conditions.push(eq(tasks.category, filters.category));
    }
    if (filters?.sourceId) {
      conditions.push(eq(tasks.sourceId, filters.sourceId));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(tasks)
        .where(and(...conditions))
        .orderBy(desc(tasks.createdAt));
    }
    
    return await db.select().from(tasks)
      .orderBy(desc(tasks.createdAt));
  }

  async getTasksForUser(userId: string): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(eq(tasks.assigneeId, userId))
      .orderBy(desc(tasks.createdAt));
  }

  async getTasksForSLA(): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(and(
        sql`${tasks.status} IN ('OPEN', 'IN_PROGRESS')`,
        sql`${tasks.slaAt} IS NOT NULL`
      ))
      .orderBy(tasks.slaAt);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(insertTask).returning();
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const [task] = await db.update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  // Projects
  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || undefined;
  }

  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const [project] = await db.update(projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  // Comments
  async getCommentsForTask(taskId: string): Promise<Comment[]> {
    return await db.select().from(comments)
      .where(eq(comments.taskId, taskId))
      .orderBy(comments.createdAt);
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const [comment] = await db.insert(comments).values(insertComment).returning();
    return comment;
  }

  // Audits
  async createAudit(insertAudit: InsertAudit): Promise<Audit> {
    const [audit] = await db.insert(audits).values(insertAudit).returning();
    return audit;
  }

  async getAuditsForEntity(entity: string, entityId: string): Promise<Audit[]> {
    return await db.select().from(audits)
      .where(and(eq(audits.entity, entity), eq(audits.entityId, entityId)))
      .orderBy(desc(audits.ts));
  }

  // Playbooks
  async getPlaybook(key: string): Promise<Playbook | undefined> {
    const [playbook] = await db.select().from(playbooks).where(eq(playbooks.key, key));
    return playbook || undefined;
  }

  async getPlaybooks(): Promise<Playbook[]> {
    return await db.select().from(playbooks).orderBy(playbooks.key);
  }

  async createPlaybook(insertPlaybook: InsertPlaybook): Promise<Playbook> {
    const [playbook] = await db.insert(playbooks).values(insertPlaybook).returning();
    return playbook;
  }

  async updatePlaybook(key: string, updates: Partial<Playbook>): Promise<Playbook> {
    const [playbook] = await db.update(playbooks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(playbooks.key, key))
      .returning();
    return playbook;
  }

  // Metrics
  async getMetrics(startDate: Date, endDate: Date, userId?: string): Promise<any[]> {
    const conditions = [
      gte(metricRollups.day, startDate),
      lte(metricRollups.day, endDate)
    ];
    
    if (userId) {
      conditions.push(eq(metricRollups.userId, userId));
    }
    
    return await db.select().from(metricRollups)
      .where(and(...conditions))
      .orderBy(metricRollups.day);
  }

  async createMetricRollup(rollup: any): Promise<void> {
    await db.insert(metricRollups).values(rollup);
  }

  // AI Suggestions
  async getAISuggestion(id: string): Promise<AISuggestion | undefined> {
    const [suggestion] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id));
    return suggestion || undefined;
  }

  async getAISuggestionsForTask(taskId: string): Promise<AISuggestion[]> {
    return await db.select().from(aiSuggestions)
      .where(eq(aiSuggestions.taskId, taskId))
      .orderBy(desc(aiSuggestions.createdAt));
  }

  async createAISuggestion(insertSuggestion: InsertAISuggestion): Promise<AISuggestion> {
    const [suggestion] = await db.insert(aiSuggestions).values(insertSuggestion).returning();
    return suggestion;
  }

  async updateAISuggestion(id: string, updates: Partial<AISuggestion>): Promise<AISuggestion> {
    const [suggestion] = await db.update(aiSuggestions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(aiSuggestions.id, id))
      .returning();
    return suggestion;
  }
}

export const storage = new DatabaseStorage();
