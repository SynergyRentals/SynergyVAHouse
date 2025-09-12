import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const taskTypeEnum = pgEnum('task_type', ['daily', 'weekly', 'reactive', 'project', 'follow_up']);
export const taskStatusEnum = pgEnum('task_status', ['OPEN', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'DONE']);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slackId: text("slack_id").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  timezone: text("timezone").notNull().default("Asia/Manila"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: taskTypeEnum("type").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  status: taskStatusEnum("status").notNull().default('OPEN'),
  priority: integer("priority").notNull().default(3), // 1 high, 5 low
  assigneeId: varchar("assignee_id"),
  dueAt: timestamp("due_at"),
  slaAt: timestamp("sla_at"),
  sourceKind: text("source_kind"), // slack|conduit|suiteop|manual
  sourceId: text("source_id"),
  sourceUrl: text("source_url"),
  playbookKey: text("playbook_key"),
  dodSchema: jsonb("dod_schema"),
  evidence: jsonb("evidence"), // [{type, url, note}]
  followUpMetadata: jsonb("followup_metadata"), // {originalMessage, promiseText, extractedTimeframe, threadContext, participants}
  approvals: jsonb("approvals"), // [{bySlackId, at, decision}]
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  projectId: varchar("project_id"),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  scope: text("scope").notNull(),
  ownerId: varchar("owner_id"),
  status: text("status").notNull().default("active"),
  view: text("view").notNull().default("kanban"),
  startAt: timestamp("start_at"),
  targetAt: timestamp("target_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  authorId: varchar("author_id"),
  body: text("body").notNull(),
  slackTs: text("slack_ts"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const audits = pgTable("audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entity: text("entity").notNull(),
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(),
  actorId: varchar("actor_id"),
  data: jsonb("data"),
  ts: timestamp("ts").defaultNow(),
});

export const metricRollups = pgTable("metric_rollups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  day: timestamp("day").notNull(),
  userId: varchar("user_id"),
  counts: jsonb("counts").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const playbooks = pgTable("playbooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  category: text("category").notNull(),
  content: jsonb("content").notNull(), // YAML content as JSON
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiSuggestions = pgTable("ai_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id"), // Allow null for new task suggestions
  type: text("type").notNull(), // 'categorization', 'playbook', 'response_draft'
  suggestions: jsonb("suggestions").notNull(), // AI suggestions data
  appliedSuggestions: jsonb("applied_suggestions"), // Which suggestions were applied
  confidence: integer("confidence").notNull().default(50), // 0-100
  status: text("status").notNull().default('pending'), // pending, approved, rejected, applied
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  slackApprovalTs: text("slack_approval_ts"), // Slack thread timestamp for approval workflow
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  tasks: many(tasks),
  projectsOwned: many(projects),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  comments: many(comments),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  tasks: many(tasks),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, {
    fields: [comments.taskId],
    references: [tasks.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
});

export const insertAuditSchema = createInsertSchema(audits).omit({
  id: true,
  ts: true,
});

export const insertPlaybookSchema = createInsertSchema(playbooks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAISuggestionSchema = createInsertSchema(aiSuggestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;
export type InsertAudit = z.infer<typeof insertAuditSchema>;
export type Audit = typeof audits.$inferSelect;
export type InsertPlaybook = z.infer<typeof insertPlaybookSchema>;
export type Playbook = typeof playbooks.$inferSelect;
export type InsertAISuggestion = z.infer<typeof insertAISuggestionSchema>;
export type AISuggestion = typeof aiSuggestions.$inferSelect;
