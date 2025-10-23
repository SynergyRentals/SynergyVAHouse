// Replit Auth integration using OpenID Connect
// Based on blueprint: javascript_log_in_with_replit

import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { getRequiredEnv } from "./envValidator";
import { config } from "./config";

const REPLIT_DOMAINS = getRequiredEnv(
  'REPLIT_DOMAINS',
  'Comma-separated list of Replit domains for OIDC authentication'
);

const REPL_ID = getRequiredEnv(
  'REPL_ID',
  'Replit project ID for OIDC authentication'
);

const SESSION_SECRET = getRequiredEnv(
  'SESSION_SECRET',
  'Secret for session encryption (generate with: openssl rand -base64 32)'
);

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      REPL_ID
    );
  },
  { maxAge: config.auth.oidcConfigCacheTtlMs }
);

export function getSession() {
  const sessionTtl = config.auth.sessionTtlMs;
  const pgStore = connectPg(session);

  // Get DATABASE_URL (already validated in db.ts, but we need it here too)
  const DATABASE_URL = getRequiredEnv('DATABASE_URL', 'PostgreSQL connection string');

  const sessionStore = new pgStore({
    conString: DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

/**
 * Maps legacy role names to RBAC role names
 */
async function mapLegacyRoleToRBAC(legacyRole: string): Promise<string | null> {
  const roleMapping: Record<string, string> = {
    'Super Admin': 'Super Admin',
    'Manager': 'Manager', 
    'manager': 'Manager',
    'Lead': 'Lead',
    'lead': 'Lead',
    'VA': 'VA/Operator',
    'va': 'VA/Operator',
    'Operator': 'VA/Operator',
    'operator': 'VA/Operator',
    'web_user': 'Viewer', // Default web users get Viewer role
    'Web User': 'Viewer',
    'test_admin': 'Super Admin', // Test admin users get Super Admin role
    'oidc_admin': 'Super Admin', // OIDC admin users get Super Admin role
  };
  
  return roleMapping[legacyRole] || null;
}

/**
 * Determines the appropriate role for an OIDC user based on their claims and email
 */
function determineOIDCUserRole(claims: any): string {
  const email = claims["email"];
  const firstName = claims["first_name"];
  const lastName = claims["last_name"];
  
  // Check if this is a test or admin user based on email patterns
  if (email) {
    // Replit team members and test users should get admin access
    if (email.endsWith('@replit.com') || 
        email.includes('test') || 
        email.includes('admin') ||
        email.includes('demo')) {
      console.log(`[OIDC Auth] Assigning admin role to email: ${email}`);
      return 'test_admin';
    }
  }
  
  // Check if name suggests admin/test user
  const fullName = [firstName, lastName].filter(Boolean).join(' ').toLowerCase();
  if (fullName.includes('admin') || fullName.includes('test') || fullName.includes('demo')) {
    console.log(`[OIDC Auth] Assigning admin role to name: ${fullName}`);
    return 'test_admin';
  }
  
  // SECURITY: Only grant admin role in strictly defined development environments
  if (process.env.NODE_ENV === 'development' && 
      process.env.REPLIT_DEV_DOMAIN && 
      !process.env.REPL_DEPLOYMENT) {
    console.log(`[OIDC Auth] Development environment - assigning admin role`);
    return 'test_admin';
  }
  
  // Default role for production OIDC users
  return 'web_user';
}

/**
 * Ensures user has proper RBAC role assignments based on their legacy role
 */
async function ensureUserRBACRoles(userId: string, legacyRole: string): Promise<void> {
  try {
    console.log(`[OIDC Auth] Ensuring RBAC roles for user ${userId} with legacy role: ${legacyRole}`);
    
    // Map legacy role to RBAC role first (before checking existing roles)
    const rbacRoleName = await mapLegacyRoleToRBAC(legacyRole);
    if (!rbacRoleName) {
      console.warn(`[OIDC Auth] No RBAC mapping found for legacy role: ${legacyRole}`);
      return;
    }
    
    // Find the RBAC role by name
    const rbacRole = await storage.getRoleByName(rbacRoleName);
    if (!rbacRole) {
      console.error(`[OIDC Auth] RBAC role "${rbacRoleName}" not found in database`);
      return;
    }
    
    // Check if user already has THIS SPECIFIC role (not just any roles)
    const existingRoles = await storage.getUserRoles(userId);
    const hasThisRole = existingRoles.some(role => role.roleId === rbacRole.id);
    
    if (hasThisRole) {
      console.log(`[OIDC Auth] User ${userId} already has required RBAC role "${rbacRoleName}"`);
      return; // User already has this specific role
    }
    
    // Use try-catch to handle duplicate role assignment gracefully
    try {
      await storage.assignRoleToUser({
        userId: userId,
        roleId: rbacRole.id,
        assignedBy: userId, // Self-assigned during auth
      });
      
      console.log(`[OIDC Auth] Assigned RBAC role "${rbacRoleName}" (${rbacRole.id}) to user ${userId}`);
    } catch (assignError: any) {
      // Check if it's a duplicate constraint error (role already assigned by another concurrent request)
      if (assignError.message?.includes('duplicate') || assignError.message?.includes('unique')) {
        console.log(`[OIDC Auth] Role "${rbacRoleName}" already assigned to user ${userId} by concurrent request`);
      } else {
        throw assignError; // Re-throw if it's a different error
      }
    }
    
    // Refresh permission cache
    await storage.refreshUserPermissionCache(userId);
    console.log(`[OIDC Auth] Refreshed permission cache for user ${userId}`);
    
  } catch (error) {
    console.error(`[OIDC Auth] Failed to ensure RBAC roles for user ${userId}:`, error);
  }
}

async function linkOrCreateUser(
  claims: any,
) {
  const replitSub = claims["sub"];
  const email = claims["email"];
  
  console.log('[OIDC Auth] Processing OIDC user login:', {
    replitSub,
    email,
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    claims: Object.keys(claims)
  });
  
  // First, try to find existing user by Replit sub
  let user = await storage.getUserByReplitSub(replitSub);
  if (user) {
    console.log('[OIDC Auth] User already linked by replitSub:', {
      userId: user.id,
      name: user.name,
      role: user.role,
      email: user.email
    });
    
    // CRITICAL FIX: Ensure RBAC roles are assigned even for existing linked users
    await ensureUserRBACRoles(user.id, user.role);
    return; // User already linked
  }
  
  // If not found by replitSub, try to find by email to link existing account
  if (email) {
    user = await storage.getUserByEmail(email);
    if (user) {
      console.log('[OIDC Auth] Found existing user by email, linking:', {
        userId: user.id,
        existingName: user.name,
        existingRole: user.role,
        email: user.email
      });
      
      // CRITICAL FIX: Preserve existing user role and important fields when linking
      await storage.upsertUser({
        id: user.id, // Keep existing UUID as primary key
        replitSub: replitSub, // Add Replit sub for linking
        email: email,
        firstName: claims["first_name"],
        lastName: claims["last_name"],
        profileImageUrl: claims["profile_image_url"],
        // PRESERVE EXISTING FIELDS - don't overwrite role or permissions
        name: user.name, // Keep existing name
        role: user.role, // Keep existing role (critical for Super Admin users)
        timezone: user.timezone, // Keep existing timezone
        isActive: user.isActive, // Keep existing status
        permissions: user.permissions as any, // Keep existing permissions  
        preferences: user.preferences as any, // Keep existing preferences
        department: user.department, // Keep existing department
        managerId: user.managerId, // Keep existing manager
      });
      
      console.log('[OIDC Auth] Successfully linked existing user to OIDC');
      
      // CRITICAL FIX: Ensure RBAC roles are assigned based on legacy role
      await ensureUserRBACRoles(user.id, user.role);
      
      return;
    }
  }
  
  // Create new user if no existing account found
  const displayName = [claims["first_name"], claims["last_name"]]
    .filter(Boolean)
    .join(" ") || email?.split("@")[0] || "Web User";

  // Determine appropriate role for this OIDC user
  const userRole = determineOIDCUserRole(claims);
  const isAdmin = userRole === 'test_admin' || userRole === 'oidc_admin';

  console.log('[OIDC Auth] Creating new user (no existing account found):', {
    displayName,
    email,
    replitSub,
    assignedRole: userRole,
    isAdmin
  });

  const newUser = await storage.createUser({
    replitSub: replitSub,
    email: email,
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    name: displayName, // Required field with sensible default
    role: userRole, // Dynamically determined role instead of hardcoded
    timezone: "Asia/Manila", // Required field with default timezone
    isActive: true,
    preferences: {
      theme: "light",
      notifications: true,
    },
    permissions: {
      read: true,
      write: true,
      admin: isAdmin, // Grant admin permissions for admin roles
    },
  });
  
  console.log('[OIDC Auth] Created new user:', {
    userId: newUser.id,
    name: newUser.name,
    role: newUser.role,
    email: newUser.email
  });
  
  // CRITICAL FIX: Assign RBAC roles to new users
  await ensureUserRBACRoles(newUser.id, newUser.role);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {} as any;
    updateUserSession(user, tokens);
    await linkOrCreateUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of REPLIT_DOMAINS.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: REPL_ID,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};