import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, pgEnum, index, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const taskTypeEnum = pgEnum('task_type', ['daily', 'weekly', 'reactive', 'project', 'follow_up']);
export const taskStatusEnum = pgEnum('task_status', ['OPEN', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'DONE']);

// Task category constants for shared use across frontend and backend
export const TASK_CATEGORIES = {
  daily: 'Daily Tasks',
  weekly: 'Weekly Tasks', 
  reactive: 'Reactive Tasks',
  project: 'Project Tasks',
  follow_up: 'Follow Up Tasks'
} as const;

export const TASK_CATEGORY_OPTIONS = Object.entries(TASK_CATEGORIES).map(([value, label]) => ({
  value,
  label
}));

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Existing Slack integration fields
  slackId: text("slack_id").unique(), // Made nullable for web users
  name: text("name").notNull(),
  role: text("role").notNull(),
  timezone: text("timezone").notNull().default("Asia/Manila"),
  // New Replit Auth fields
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  replitSub: varchar("replit_sub").unique(), // Links to Replit Auth subject for identity linking
  // Additional enhanced fields
  permissions: jsonb("permissions"), // {read: boolean, write: boolean, admin: boolean, etc.}
  preferences: jsonb("preferences"), // {theme: string, notifications: boolean, etc.}
  isActive: boolean("is_active").notNull().default(true),
  department: text("department"),
  managerId: varchar("manager_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

// RBAC Tables
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resource: text("resource").notNull(), // e.g., 'tasks', 'projects', 'users'
  action: text("action").notNull(), // e.g., 'create', 'read', 'update', 'delete'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // SECURITY: Ensure unique combinations of resource + action - prevent duplicate permissions
  sql`CONSTRAINT permissions_resource_action_unique UNIQUE (resource, action)`
]);

export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull(),
  permissionId: varchar("permission_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // SECURITY: Ensure unique combinations of role + permission - prevent duplicate assignments
  sql`CONSTRAINT role_permissions_unique UNIQUE (role_id, permission_id)`
]);

export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  roleId: varchar("role_id").notNull(),
  assignedBy: varchar("assigned_by"),
  assignedAt: timestamp("assigned_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // SECURITY: Ensure unique combinations of user + role - prevent duplicate role assignments
  sql`CONSTRAINT user_roles_unique UNIQUE (user_id, role_id)`
]);

// JWT Refresh Tokens table for secure token rotation
export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
  replacedBy: varchar("replaced_by"), // Token family tracking for rotation
  deviceInfo: text("device_info"), // User agent for security tracking
  ipAddress: text("ip_address"),
}, (table) => [
  index("refresh_tokens_user_id_idx").on(table.userId),
  index("refresh_tokens_expires_at_idx").on(table.expiresAt)
]);

// API Keys table for external integrations
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(), // Human-readable name (e.g., "Zapier Integration")
  keyHash: text("key_hash").notNull().unique(), // Hashed API key for security
  keyPrefix: text("key_prefix").notNull(), // First 8 chars for display (e.g., "sk_live_...")
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  permissions: jsonb("permissions"), // Scoped permissions for this API key
  rateLimit: integer("rate_limit").default(1000), // Requests per hour
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by"),
}, (table) => [
  index("api_keys_user_id_idx").on(table.userId),
  index("api_keys_key_hash_idx").on(table.keyHash)
]);

// Webhook Events table for idempotency
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: text("event_id").notNull(),
  source: text("source").notNull(), // 'conduit' | 'suiteop' | 'wheelhouse'
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  requestBody: jsonb("request_body"),
  taskId: varchar("task_id").references(() => tasks.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("webhook_events_event_id_source_idx").on(table.eventId, table.source),
  sql`CONSTRAINT webhook_events_event_id_source_unique UNIQUE (event_id, source)`
]);

// Idempotency Failures table for monitoring
export const idempotencyFailures = pgTable("idempotency_failures", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: text("event_id").notNull(),
  source: text("source").notNull(), // 'conduit' | 'suiteop' | 'wheelhouse'
  failureReason: text("failure_reason").notNull(), // 'database_error', 'timeout', 'unknown'
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  requestBody: jsonb("request_body"),
  recoveryAction: text("recovery_action").notNull().default('fail_open'), // 'fail_open', 'retry', 'blocked'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("idempotency_failures_source_idx").on(table.source),
  index("idempotency_failures_created_at_idx").on(table.createdAt),
  index("idempotency_failures_failure_reason_idx").on(table.failureReason)
]);

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  tasks: many(tasks),
  projectsOwned: many(projects),
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "manager_subordinates"
  }),
  subordinates: many(users, {
    relationName: "manager_subordinates"
  }),
  userRoles: many(userRoles),
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

// RBAC Relations
export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  assignedByUser: one(users, {
    fields: [userRoles.assignedBy],
    references: [users.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id],
  }),
  revoker: one(users, {
    fields: [apiKeys.revokedBy],
    references: [users.id],
  }),
}));

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  task: one(tasks, {
    fields: [webhookEvents.taskId],
    references: [tasks.id],
  }),
}));

// Insert schemas with enhanced validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string()
    .min(1, "Name is required and cannot be empty")
    .max(100, "Name cannot exceed 100 characters")
    .trim()
    .refine(val => val.length > 0, "Name cannot be just whitespace"),
  role: z.string()
    .min(1, "Role is required and cannot be empty")
    .max(50, "Role cannot exceed 50 characters")
    .trim()
    .refine(val => val.length > 0, "Role cannot be just whitespace"),
  email: z.string()
    .email("Invalid email format")
    .optional()
    .or(z.literal("")),
});

export const upsertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
}).partial().required({
  id: true,
});

// Enhanced task schema with strict validation - completely redefine to ensure validation works
export const insertTaskSchema = z.object({
  title: z.string()
    .min(1, "Task title is required and cannot be empty")
    .max(200, "Task title cannot exceed 200 characters")
    .trim()
    .refine(val => val.length > 0, "Task title cannot be just whitespace"),
  category: z.string()
    .min(1, "Category is required and cannot be empty")
    .max(100, "Category cannot exceed 100 characters")
    .trim()
    .refine(val => val.length > 0, "Category cannot be just whitespace"),
  type: z.enum(['daily', 'weekly', 'reactive', 'project', 'follow_up'], {
    errorMap: () => ({ message: "Type must be one of: daily, weekly, reactive, project, follow_up" }),
  }),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'DONE'], {
    errorMap: () => ({ message: "Status must be one of: OPEN, IN_PROGRESS, WAITING, BLOCKED, DONE" }),
  }).default('OPEN'),
  priority: z.number()
    .int("Priority must be a whole number")
    .min(1, "Priority must be between 1 (highest) and 5 (lowest)")
    .max(5, "Priority must be between 1 (highest) and 5 (lowest)")
    .default(3),
  assigneeId: z.string().optional().or(z.literal("")),
  dueAt: z.date().optional().or(z.literal(null)),
  slaAt: z.date().optional().or(z.literal(null)),
  sourceKind: z.string().optional().or(z.literal("")),
  sourceId: z.string().optional().or(z.literal("")),
  sourceUrl: z.string().url("Invalid URL format").optional().or(z.literal("")),
  playbookKey: z.string().optional().or(z.literal("")),
  dodSchema: z.any().optional(),
  evidence: z.any().optional(),
  followUpMetadata: z.any().optional(),
  approvals: z.any().optional(),
  createdBy: z.string().optional().or(z.literal("")),
  projectId: z.string().optional().or(z.literal("")),
});

// Enhanced project schema with strict validation - completely redefine to ensure validation works
export const insertProjectSchema = z.object({
  title: z.string()
    .min(1, "Project title is required and cannot be empty")
    .max(200, "Project title cannot exceed 200 characters")
    .trim()
    .refine(val => val.length > 0, "Project title cannot be just whitespace"),
  scope: z.string()
    .min(1, "Project scope is required and cannot be empty")
    .max(500, "Project scope cannot exceed 500 characters")
    .trim()
    .refine(val => val.length > 0, "Project scope cannot be just whitespace"),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled'], {
    errorMap: () => ({ message: "Status must be one of: planning, active, on_hold, completed, cancelled" }),
  }).default('planning'),
  view: z.enum(['kanban', 'list', 'timeline'], {
    errorMap: () => ({ message: "View must be one of: kanban, list, timeline" }),
  }).default('kanban'),
  ownerId: z.string().optional().or(z.literal("")),
  startAt: z.date().optional().or(z.literal(null)),
  targetAt: z.date().optional().or(z.literal(null)),
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

// RBAC Insert schemas
export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true,
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({
  id: true,
  createdAt: true,
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  createdAt: true,
});

export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).omit({
  id: true,
  createdAt: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

export const insertIdempotencyFailureSchema = createInsertSchema(idempotencyFailures).omit({
  id: true,
  createdAt: true,
});

// Types - Using proper Drizzle inference
export type User = InferSelectModel<typeof users>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = z.infer<typeof upsertUserSchema>;

export type Task = InferSelectModel<typeof tasks>;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type Project = InferSelectModel<typeof projects>;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Comment = InferSelectModel<typeof comments>;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type Audit = InferSelectModel<typeof audits>;
export type InsertAudit = z.infer<typeof insertAuditSchema>;

export type Playbook = InferSelectModel<typeof playbooks>;
export type InsertPlaybook = z.infer<typeof insertPlaybookSchema>;

export type AISuggestion = InferSelectModel<typeof aiSuggestions>;
export type InsertAISuggestion = z.infer<typeof insertAISuggestionSchema>;

// RBAC Types
export type Role = InferSelectModel<typeof roles>;
export type InsertRole = z.infer<typeof insertRoleSchema>;

export type Permission = InferSelectModel<typeof permissions>;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;

export type RolePermission = InferSelectModel<typeof rolePermissions>;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;

export type UserRole = InferSelectModel<typeof userRoles>;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;

export type RefreshToken = InferSelectModel<typeof refreshTokens>;
export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;

export type ApiKey = InferSelectModel<typeof apiKeys>;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export type WebhookEvent = InferSelectModel<typeof webhookEvents>;
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;

export type IdempotencyFailure = InferSelectModel<typeof idempotencyFailures>;
export type InsertIdempotencyFailure = z.infer<typeof insertIdempotencyFailureSchema>;

// Permission computation types
export interface ComputedPermission {
  resource: string;
  action: string;
}

export interface UserPermissions {
  [key: string]: string[]; // e.g., { tasks: ['read', 'create'], users: ['read'] }
}
