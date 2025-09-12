import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const taskTypeEnum = pgEnum('task_type', ['daily', 'weekly', 'reactive', 'project', 'follow_up']);
export const taskStatusEnum = pgEnum('task_status', ['OPEN', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'DONE']);

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
  managerId: varchar("manager_id").references(() => users.id),
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
  assigneeId: varchar("assignee_id").references(() => users.id),
  dueAt: timestamp("due_at"),
  slaAt: timestamp("sla_at"),
  sourceKind: text("source_kind"), // slack|conduit|suiteop|manual
  sourceId: text("source_id"),
  sourceUrl: text("source_url"),
  playbookKey: text("playbook_key").references(() => playbooks.key),
  dodSchema: jsonb("dod_schema"),
  evidence: jsonb("evidence"), // [{type, url, note}]
  followUpMetadata: jsonb("followup_metadata"), // {originalMessage, promiseText, extractedTimeframe, threadContext, participants}
  approvals: jsonb("approvals"), // [{bySlackId, at, decision}]
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  projectId: varchar("project_id").references(() => projects.id),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  scope: text("scope").notNull(),
  ownerId: varchar("owner_id").references(() => users.id),
  status: text("status").notNull().default("active"),
  view: text("view").notNull().default("kanban"),
  startAt: timestamp("start_at"),
  targetAt: timestamp("target_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  authorId: varchar("author_id").references(() => users.id),
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
  roleId: varchar("role_id").notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: varchar("permission_id").notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // SECURITY: Ensure unique combinations of role + permission - prevent duplicate assignments
  sql`CONSTRAINT role_permissions_unique UNIQUE (role_id, permission_id)`
]);

export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: varchar("role_id").notNull().references(() => roles.id, { onDelete: 'cascade' }),
  assignedBy: varchar("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // SECURITY: Ensure unique combinations of user + role - prevent duplicate role assignments
  sql`CONSTRAINT user_roles_unique UNIQUE (user_id, role_id)`
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

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const upsertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
}).partial().required({
  id: true,
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

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = z.infer<typeof upsertUserSchema>;
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

// RBAC Types
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;

// Permission computation types
export interface ComputedPermission {
  resource: string;
  action: string;
}

export interface UserPermissions {
  [key: string]: string[]; // e.g., { tasks: ['read', 'create'], users: ['read'] }
}
