import { storage } from "../server/storage";
import type { InsertPermission, InsertRole, InsertRolePermission } from "../shared/schema";

// Standard permissions for each resource
const STANDARD_PERMISSIONS = {
  TASKS: ['create', 'read', 'update', 'delete', 'assign', 'approve'],
  PROJECTS: ['create', 'read', 'update', 'delete', 'manage_team'],
  USERS: ['read', 'invite', 'update', 'deactivate', 'manage_roles'],
  ANALYTICS: ['view_own', 'view_team', 'view_all', 'export'],
  SYSTEM: ['manage_integrations', 'manage_settings', 'audit_logs']
};

// Predefined role configurations
const PREDEFINED_ROLES = {
  'super_admin': {
    name: 'Super Admin',
    description: 'Full system access with all permissions',
    permissions: [
      // All TASKS permissions
      'tasks:create', 'tasks:read', 'tasks:update', 'tasks:delete', 'tasks:assign', 'tasks:approve',
      // All PROJECTS permissions
      'projects:create', 'projects:read', 'projects:update', 'projects:delete', 'projects:manage_team',
      // All USERS permissions
      'users:read', 'users:invite', 'users:update', 'users:deactivate', 'users:manage_roles',
      // All ANALYTICS permissions
      'analytics:view_own', 'analytics:view_team', 'analytics:view_all', 'analytics:export',
      // All SYSTEM permissions
      'system:manage_integrations', 'system:manage_settings', 'system:audit_logs'
    ]
  },
  'manager': {
    name: 'Manager',
    description: 'Team management, reporting, and user administration',
    permissions: [
      // Task management
      'tasks:read', 'tasks:update', 'tasks:assign', 'tasks:approve',
      // Project oversight
      'projects:create', 'projects:read', 'projects:update', 'projects:manage_team',
      // Team management
      'users:read', 'users:invite', 'users:update',
      // Analytics access
      'analytics:view_own', 'analytics:view_team', 'analytics:export'
    ]
  },
  'lead': {
    name: 'Lead',
    description: 'Task assignment and project oversight',
    permissions: [
      // Task assignment and management
      'tasks:create', 'tasks:read', 'tasks:update', 'tasks:assign',
      // Project management
      'projects:create', 'projects:read', 'projects:update',
      // User oversight
      'users:read',
      // Team analytics
      'analytics:view_own', 'analytics:view_team'
    ]
  },
  'va_operator': {
    name: 'VA/Operator',
    description: 'Task execution and basic reporting',
    permissions: [
      // Task execution
      'tasks:read', 'tasks:update',
      // Basic project access
      'projects:read',
      // Self-view only
      'users:read',
      // Own analytics
      'analytics:view_own'
    ]
  },
  'viewer': {
    name: 'Viewer',
    description: 'Read-only access to system',
    permissions: [
      // Read-only access
      'tasks:read',
      'projects:read',
      'users:read',
      'analytics:view_own'
    ]
  }
};

/**
 * Create all standard permissions in the database
 */
async function seedPermissions(): Promise<Map<string, string>> {
  console.log('🔐 Seeding permissions...');
  
  const permissionMap = new Map<string, string>(); // resource:action -> id mapping
  
  for (const [resource, actions] of Object.entries(STANDARD_PERMISSIONS)) {
    for (const action of actions) {
      const resourceLower = resource.toLowerCase();
      const permissionKey = `${resourceLower}:${action}`;
      
      const permissionData: InsertPermission = {
        resource: resourceLower,
        action: action,
        description: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resourceLower}`
      };
      
      try {
        // Check if permission already exists
        const existingPermissions = await storage.getPermissionsByResourceAction(resourceLower, action);
        if (existingPermissions.length > 0) {
          permissionMap.set(permissionKey, existingPermissions[0].id);
          continue;
        }
        
        // Create new permission
        const permission = await storage.createPermission(permissionData);
        permissionMap.set(permissionKey, permission.id);
        console.log(`  ✓ Created permission: ${permissionKey}`);
      } catch (error) {
        console.error(`  ❌ Failed to create permission ${permissionKey}:`, error);
      }
    }
  }
  
  console.log(`🔐 Permissions seeded: ${permissionMap.size} total`);
  return permissionMap;
}

/**
 * Create all predefined roles and assign permissions
 */
async function seedRoles(permissionMap: Map<string, string>): Promise<Map<string, string>> {
  console.log('👥 Seeding roles...');
  
  const roleMap = new Map<string, string>(); // role_name -> role_id mapping
  
  for (const [roleKey, roleConfig] of Object.entries(PREDEFINED_ROLES)) {
    try {
      // Check if role already exists
      const existingRole = await storage.getRoleByName(roleConfig.name);
      let role;
      
      if (existingRole) {
        role = existingRole;
        console.log(`  ✓ Role already exists: ${roleConfig.name}`);
      } else {
        // Create new role
        const roleData: InsertRole = {
          name: roleConfig.name,
          description: roleConfig.description,
          isActive: true
        };
        
        role = await storage.createRole(roleData);
        console.log(`  ✓ Created role: ${roleConfig.name}`);
      }
      
      roleMap.set(roleKey, role.id);
      
      // Assign permissions to role
      let assignedCount = 0;
      for (const permissionKey of roleConfig.permissions) {
        const permissionId = permissionMap.get(permissionKey);
        if (!permissionId) {
          console.warn(`  ⚠️ Permission not found: ${permissionKey}`);
          continue;
        }
        
        // Check if role-permission relationship already exists
        const existing = await storage.getRolePermissions(role.id);
        const hasPermission = existing.some(rp => rp.permissionId === permissionId);
        
        if (!hasPermission) {
          const rolePermissionData: InsertRolePermission = {
            roleId: role.id,
            permissionId: permissionId
          };
          
          await storage.createRolePermission(rolePermissionData);
          assignedCount++;
        }
      }
      
      console.log(`  ✓ Assigned ${assignedCount} new permissions to ${roleConfig.name}`);
      
    } catch (error) {
      console.error(`  ❌ Failed to create role ${roleConfig.name}:`, error);
    }
  }
  
  console.log(`👥 Roles seeded: ${roleMap.size} total`);
  return roleMap;
}

/**
 * Migrate existing users to new RBAC system
 * Maps existing role field to new role assignments
 */
async function migrateExistingUsers(roleMap: Map<string, string>): Promise<void> {
  console.log('🔄 Migrating existing users to RBAC system...');
  
  const users = await storage.getAllUsers();
  let migratedCount = 0;
  
  for (const user of users) {
    try {
      // Check if user already has role assignments
      const existingRoles = await storage.getUserRoles(user.id);
      if (existingRoles.length > 0) {
        console.log(`  ✓ User ${user.name} already has role assignments`);
        continue;
      }
      
      // Map existing role field to new role system
      let targetRoleKey: string | null = null;
      const currentRole = user.role.toLowerCase();
      
      if (currentRole.includes('admin') || currentRole.includes('super')) {
        targetRoleKey = 'super_admin';
      } else if (currentRole.includes('manager')) {
        targetRoleKey = 'manager';
      } else if (currentRole.includes('lead')) {
        targetRoleKey = 'lead';
      } else if (currentRole.includes('va') || currentRole.includes('operator') || currentRole.includes('assistant')) {
        targetRoleKey = 'va_operator';
      } else {
        // Default to viewer for unknown roles
        targetRoleKey = 'viewer';
      }
      
      const roleId = roleMap.get(targetRoleKey);
      if (!roleId) {
        console.error(`  ❌ Could not find role ID for ${targetRoleKey}`);
        continue;
      }
      
      // Assign role to user
      await storage.assignRoleToUser({
        userId: user.id,
        roleId: roleId,
        assignedBy: user.id, // Self-assigned during migration
        assignedAt: new Date()
      });
      
      migratedCount++;
      console.log(`  ✓ Migrated user ${user.name}: ${user.role} -> ${PREDEFINED_ROLES[targetRoleKey].name}`);
      
    } catch (error) {
      console.error(`  ❌ Failed to migrate user ${user.name}:`, error);
    }
  }
  
  console.log(`🔄 User migration completed: ${migratedCount} users migrated`);
}

/**
 * Refresh permission cache for all users
 */
async function refreshAllPermissionCaches(): Promise<void> {
  console.log('🔄 Refreshing permission caches for all users...');
  
  const users = await storage.getAllUsers();
  let refreshedCount = 0;
  
  for (const user of users) {
    try {
      await storage.refreshUserPermissionCache(user.id);
      refreshedCount++;
    } catch (error) {
      console.error(`  ❌ Failed to refresh cache for user ${user.name}:`, error);
    }
  }
  
  console.log(`🔄 Permission caches refreshed for ${refreshedCount} users`);
}

/**
 * Main RBAC seeding function
 */
export async function seedRBAC(): Promise<void> {
  try {
    console.log('🚀 Starting RBAC system seeding...');
    
    // Step 1: Create all permissions
    const permissionMap = await seedPermissions();
    
    // Step 2: Create roles and assign permissions
    const roleMap = await seedRoles(permissionMap);
    
    // Step 3: Migrate existing users
    await migrateExistingUsers(roleMap);
    
    // Step 4: Refresh permission caches
    await refreshAllPermissionCaches();
    
    console.log('✨ RBAC system seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ RBAC seeding failed:', error);
    throw error;
  }
}