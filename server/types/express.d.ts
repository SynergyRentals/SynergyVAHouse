import type { User as AppUser } from '@shared/schema';

declare global {
  namespace Express {
    // Extend Express Request to include our custom user context
    interface Request {
      // Override the default user property with our application User type
      user?: AppUser & {
        authType?: 'slack' | 'replit' | 'dev-fallback';
      };
      // Add Slack-specific property for webhook authentication
      slackUserId?: string;
    }
    
    // Passport requires a User interface - provide minimal implementation
    interface User {
      id: string;
      [key: string]: any;
    }
  }
}

// Re-export types for convenience
export type AuthenticatedUser = AppUser & {
  authType?: 'slack' | 'replit' | 'dev-fallback';
};

export interface AuthenticatedRequest extends Express.Request {
  user?: AuthenticatedUser;
  slackUserId?: string;
}