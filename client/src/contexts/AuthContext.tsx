/**
 * Authentication Context
 *
 * Manages JWT-based authentication state:
 * - Access tokens (stored in memory)
 * - Refresh tokens (stored in localStorage)
 * - Automatic token refresh before expiration
 * - Login/logout functionality
 * - User profile management
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface User {
  id: string;
  email?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: string;
  department?: string;
  profileImageUrl?: string;
  timezone: string;
  preferences?: any;
  authType?: 'jwt' | 'apikey' | 'slack' | 'replit' | 'dev-fallback';
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithSlack: () => void;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_REFRESH_INTERVAL = 10 * 60 * 1000; // Refresh every 10 minutes
const REFRESH_TOKEN_KEY = 'refresh_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Decode JWT payload (without verification - server verifies)
   */
  const decodeJWT = (token: string): any => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  /**
   * Check if token is expired or will expire soon
   */
  const isTokenExpiringSoon = (token: string, bufferMinutes = 2): boolean => {
    const payload = decodeJWT(token);
    if (!payload?.exp) return true;

    const expirationTime = payload.exp * 1000; // Convert to milliseconds
    const bufferTime = bufferMinutes * 60 * 1000;
    return Date.now() >= expirationTime - bufferTime;
  };

  /**
   * Store tokens
   */
  const setTokens = useCallback((newAccessToken: string, newRefreshToken: string) => {
    setAccessToken(newAccessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
  }, []);

  /**
   * Clear tokens
   */
  const clearTokens = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, []);

  /**
   * Fetch user profile
   */
  const fetchUser = useCallback(async (token: string): Promise<User | null> => {
    try {
      const response = await fetch('/api/auth/user', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }

      return await response.json();
    } catch (error) {
      console.error('[Auth] Failed to fetch user:', error);
      return null;
    }
  }, []);

  /**
   * Refresh access token using refresh token
   */
  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      return null;
    }

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);

      return data.accessToken;
    } catch (error) {
      console.error('[Auth] Token refresh failed:', error);
      clearTokens();
      return null;
    }
  }, [setTokens, clearTokens]);

  /**
   * Login with email and password
   */
  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
    } catch (error) {
      console.error('[Auth] Login failed:', error);
      throw error;
    }
  }, [setTokens]);

  /**
   * Login with Slack OAuth
   */
  const loginWithSlack = useCallback(() => {
    window.location.href = '/api/auth/slack/authorize';
  }, []);

  /**
   * Logout (revoke current refresh token)
   */
  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    try {
      if (refreshToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch (error) {
      console.error('[Auth] Logout error:', error);
    } finally {
      clearTokens();
    }
  }, [clearTokens]);

  /**
   * Logout from all devices
   */
  const logoutAllDevices = useCallback(async () => {
    if (!accessToken) return;

    try {
      await fetch('/api/auth/logout-all', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (error) {
      console.error('[Auth] Logout all devices error:', error);
    } finally {
      clearTokens();
    }
  }, [accessToken, clearTokens]);

  /**
   * Refresh authentication state
   */
  const refreshAuth = useCallback(async () => {
    // If we have a valid access token that's not expiring soon, use it
    if (accessToken && !isTokenExpiringSoon(accessToken)) {
      const userData = await fetchUser(accessToken);
      if (userData) {
        setUser(userData);
        return;
      }
    }

    // Otherwise, try to refresh
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      const userData = await fetchUser(newAccessToken);
      if (userData) {
        setUser(userData);
      }
    }
  }, [accessToken, fetchUser, refreshAccessToken]);

  /**
   * Initialize authentication on mount
   */
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);

      // Check if we're returning from Slack OAuth
      const urlParams = new URLSearchParams(window.location.search);
      const urlAccessToken = urlParams.get('access_token');
      const urlRefreshToken = urlParams.get('refresh_token');

      if (urlAccessToken && urlRefreshToken) {
        // Store tokens from OAuth redirect
        setTokens(urlAccessToken, urlRefreshToken);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // Try to restore session
      await refreshAuth();

      setIsLoading(false);
    };

    initAuth();
  }, []); // Only run once on mount

  /**
   * Set up automatic token refresh
   */
  useEffect(() => {
    if (!accessToken) return;

    const refreshInterval = setInterval(async () => {
      if (isTokenExpiringSoon(accessToken)) {
        await refreshAccessToken();
      }
    }, TOKEN_REFRESH_INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [accessToken, refreshAccessToken]);

  const value: AuthContextType = {
    user,
    accessToken,
    isLoading,
    isAuthenticated: !!user && !!accessToken,
    login,
    loginWithSlack,
    logout,
    logoutAllDevices,
    refreshAuth,
    setTokens,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 */
export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

/**
 * HOC to require authentication
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> {
  return function AuthenticatedComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuthContext();

    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      );
    }

    if (!isAuthenticated) {
      window.location.href = '/login';
      return null;
    }

    return <Component {...props} />;
  };
}
