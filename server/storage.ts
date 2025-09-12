import { 
  users, tasks, projects, comments, audits, metricRollups, playbooks, aiSuggestions,
  roles, permissions, rolePermissions, userRoles,
  type User, type InsertUser, type UpsertUser, type Task, type InsertTask, 
  type Project, type InsertProject, type Comment, type InsertComment,
  type Audit, type InsertAudit, type Playbook, type InsertPlaybook,
  type AISuggestion, type InsertAISuggestion,
  type Role, type InsertRole, type Permission, type InsertPermission,
  type RolePermission, type InsertRolePermission, type UserRole, type InsertUserRole,
  type UserPermissions
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserBySlackId(slackId: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByReplitSub(replitSub: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>; // Required for Replit Auth
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

  // RBAC - Roles
  getRole(id: string): Promise<Role | undefined>;
  getRoleByName(name: string): Promise<Role | undefined>;
  getRoles(): Promise<Role[]>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: string, updates: Partial<Role>): Promise<Role>;
  deactivateRole(id: string): Promise<Role>;

  // RBAC - Permissions
  getPermission(id: string): Promise<Permission | undefined>;
  getPermissionsByResourceAction(resource: string, action: string): Promise<Permission[]>;
  getPermissions(): Promise<Permission[]>;
  createPermission(permission: InsertPermission): Promise<Permission>;
  updatePermission(id: string, updates: Partial<Permission>): Promise<Permission>;

  // RBAC - Role Permissions
  getRolePermissions(roleId: string): Promise<RolePermission[]>;
  createRolePermission(rolePermission: InsertRolePermission): Promise<RolePermission>;
  removeRolePermission(roleId: string, permissionId: string): Promise<void>;

  // RBAC - User Roles
  getUserRoles(userId: string): Promise<UserRole[]>;
  assignRoleToUser(userRole: InsertUserRole): Promise<UserRole>;
  removeRoleFromUser(userId: string, roleId: string): Promise<void>;

  // RBAC - Permission Computation and Caching
  computeUserPermissions(userId: string): Promise<UserPermissions>;
  refreshUserPermissionCache(userId: string): Promise<void>;
  getUserPermissionsFromCache(userId: string): Promise<UserPermissions | null>;
  hasPermission(userId: string, resource: string, action: string): Promise<boolean>;
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

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData as any)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        } as any,
      })
      .returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByReplitSub(replitSub: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.replitSub, replitSub));
    return user || undefined;
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

  // RBAC - Roles
  async getRole(id: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role || undefined;
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.name, name));
    return role || undefined;
  }

  async getRoles(): Promise<Role[]> {
    return await db.select().from(roles).where(eq(roles.isActive, true)).orderBy(roles.name);
  }

  async createRole(insertRole: InsertRole): Promise<Role> {
    const [role] = await db.insert(roles).values(insertRole).returning();
    return role;
  }

  async updateRole(id: string, updates: Partial<Role>): Promise<Role> {
    const [role] = await db.update(roles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();
    return role;
  }

  async deactivateRole(id: string): Promise<Role> {
    const [role] = await db.update(roles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();
    return role;
  }

  // RBAC - Permissions
  async getPermission(id: string): Promise<Permission | undefined> {
    const [permission] = await db.select().from(permissions).where(eq(permissions.id, id));
    return permission || undefined;
  }

  async getPermissionsByResourceAction(resource: string, action: string): Promise<Permission[]> {
    return await db.select().from(permissions)
      .where(and(eq(permissions.resource, resource), eq(permissions.action, action)));
  }

  async getPermissions(): Promise<Permission[]> {
    return await db.select().from(permissions).orderBy(permissions.resource, permissions.action);
  }

  async createPermission(insertPermission: InsertPermission): Promise<Permission> {
    const [permission] = await db.insert(permissions).values(insertPermission).returning();
    return permission;
  }

  async updatePermission(id: string, updates: Partial<Permission>): Promise<Permission> {
    const [permission] = await db.update(permissions)
      .set(updates)
      .where(eq(permissions.id, id))
      .returning();
    return permission;
  }

  // RBAC - Role Permissions
  async getRolePermissions(roleId: string): Promise<RolePermission[]> {
    return await db.select().from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId))
      .orderBy(rolePermissions.createdAt);
  }

  async createRolePermission(insertRolePermission: InsertRolePermission): Promise<RolePermission> {
    const [rolePermission] = await db.insert(rolePermissions).values(insertRolePermission).returning();
    return rolePermission;
  }

  async removeRolePermission(roleId: string, permissionId: string): Promise<void> {
    await db.delete(rolePermissions)
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)));
  }

  // RBAC - User Roles
  async getUserRoles(userId: string): Promise<UserRole[]> {
    return await db.select().from(userRoles)
      .where(eq(userRoles.userId, userId))
      .orderBy(userRoles.assignedAt);
  }

  async assignRoleToUser(insertUserRole: InsertUserRole): Promise<UserRole> {
    const [userRole] = await db.insert(userRoles).values(insertUserRole).returning();
    return userRole;
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    await db.delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  }

  // RBAC - Permission Computation and Caching
  async computeUserPermissions(userId: string): Promise<UserPermissions> {
    try {
      // Get all user roles
      const userRolesList = await this.getUserRoles(userId);
      if (userRolesList.length === 0) {
        return {};
      }

      const roleIds = userRolesList.map(ur => ur.roleId);

      // Get all permissions for these roles
      const permissionQuery = await db
        .select({
          resource: permissions.resource,
          action: permissions.action,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
        .where(and(
          sql`${rolePermissions.roleId} IN (${sql.join(roleIds.map(id => sql`${id}`), sql`, `)})`,
          eq(roles.isActive, true)
        ));

      // Group permissions by resource
      const groupedPermissions: UserPermissions = {};
      
      for (const perm of permissionQuery) {
        if (!groupedPermissions[perm.resource]) {
          groupedPermissions[perm.resource] = [];
        }
        if (!groupedPermissions[perm.resource].includes(perm.action)) {
          groupedPermissions[perm.resource].push(perm.action);
        }
      }

      return groupedPermissions;
    } catch (error) {
      console.error(`Failed to compute permissions for user ${userId}:`, error);
      return {};
    }
  }

  async refreshUserPermissionCache(userId: string): Promise<void> {
    try {
      const computedPermissions = await this.computeUserPermissions(userId);
      
      await db.update(users)
        .set({ 
          permissions: computedPermissions,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      console.log(`Refreshed permission cache for user: ${userId}`);
    } catch (error) {
      console.error(`Failed to refresh permission cache for user ${userId}:`, error);
      throw error;
    }
  }

  async getUserPermissionsFromCache(userId: string): Promise<UserPermissions | null> {
    try {
      const [user] = await db.select({ permissions: users.permissions })
        .from(users)
        .where(eq(users.id, userId));
      
      if (!user || !user.permissions) {
        return null;
      }

      return user.permissions as UserPermissions;
    } catch (error) {
      console.error(`Failed to get cached permissions for user ${userId}:`, error);
      return null;
    }
  }

  async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    try {
      // First try to get from cache
      let userPermissions = await this.getUserPermissionsFromCache(userId);
      
      // If not in cache, compute and cache it
      if (!userPermissions) {
        userPermissions = await this.computeUserPermissions(userId);
        await this.refreshUserPermissionCache(userId);
      }

      // Check if user has the specific permission
      const resourcePermissions = userPermissions[resource];
      if (!resourcePermissions) {
        return false;
      }

      return resourcePermissions.includes(action);
    } catch (error) {
      console.error(`Failed to check permission for user ${userId}:`, error);
      return false;
    }
  }
}

export const storage = new DatabaseStorage();
