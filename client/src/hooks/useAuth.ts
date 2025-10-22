/**
 * useAuth Hook
 *
 * Provides authentication functionality with support for:
 * - JWT-based authentication (via AuthContext)
 * - Session-based authentication (legacy Replit Auth)
 * - API key management
 * - Automatic fallback for backward compatibility
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "../contexts/AuthContext";

interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  role: string;
  department?: string;
  timezone?: string;
  preferences?: any;
  authType?: 'jwt' | 'apikey' | 'replit' | 'slack' | 'dev-fallback';
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt?: string;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
}

interface CreateApiKeyResponse {
  apiKey: string;
  id: string;
  name: string;
  keyPrefix: string;
  expiresAt?: string;
  createdAt: string;
  message: string;
}

/**
 * Main authentication hook
 * Tries to use JWT auth context first, falls back to session-based auth
 */
export function useAuth() {
  let jwtAuth;

  // Try to use JWT auth context if available
  try {
    jwtAuth = useAuthContext();
  } catch {
    // AuthContext not available, fall back to session-based auth
    jwtAuth = null;
  }

  // Session-based auth fallback (for backward compatibility)
  const { data: sessionUser, isLoading: sessionLoading, error: sessionError } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !jwtAuth, // Only query if JWT auth is not available
    throwOnError: (error: any) => error?.status !== 401,
  });

  // If using JWT auth
  if (jwtAuth) {
    return {
      user: jwtAuth.user,
      isLoading: jwtAuth.isLoading,
      isAuthenticated: jwtAuth.isAuthenticated,
      error: null,
      login: jwtAuth.login,
      loginWithSlack: jwtAuth.loginWithSlack,
      logout: jwtAuth.logout,
      logoutAllDevices: jwtAuth.logoutAllDevices,
      accessToken: jwtAuth.accessToken,
    };
  }

  // Fall back to session-based auth
  return {
    user: sessionUser || null,
    isLoading: sessionLoading,
    isAuthenticated: !!sessionUser && !sessionError,
    error: sessionError,
    login: undefined,
    loginWithSlack: undefined,
    logout: undefined,
    logoutAllDevices: undefined,
    accessToken: null,
  };
}

/**
 * Hook for API key management
 */
export function useApiKeys() {
  const queryClient = useQueryClient();
  const { accessToken } = useAuth();

  // Fetch API keys
  const { data, isLoading, error } = useQuery<{ apiKeys: ApiKey[] }>({
    queryKey: ["/api/auth/api-keys"],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch('/api/auth/api-keys', { headers });
      if (!response.ok) {
        throw new Error('Failed to fetch API keys');
      }
      return response.json();
    },
    enabled: !!accessToken,
  });

  // Create API key mutation
  const createApiKey = useMutation({
    mutationFn: async (params: {
      name: string;
      permissions?: any;
      expiresInDays?: number;
    }) => {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch('/api/auth/api-keys', {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create API key');
      }

      return response.json() as Promise<CreateApiKeyResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/api-keys"] });
    },
  });

  // Revoke API key mutation
  const revokeApiKey = useMutation({
    mutationFn: async (keyId: string) => {
      const headers: HeadersInit = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(`/api/auth/api-keys/${keyId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revoke API key');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/api-keys"] });
    },
  });

  return {
    apiKeys: data?.apiKeys || [],
    isLoading,
    error,
    createApiKey: createApiKey.mutateAsync,
    revokeApiKey: revokeApiKey.mutateAsync,
    isCreating: createApiKey.isPending,
    isRevoking: revokeApiKey.isPending,
  };
}