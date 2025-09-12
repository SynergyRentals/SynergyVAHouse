// useAuth hook for Replit Auth integration
// Based on blueprint: javascript_log_in_with_replit

import { useQuery } from "@tanstack/react-query";

interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  role: string;
  department?: string;
  authType: 'replit' | 'slack' | 'dev-fallback';
}

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
    retry: false,
    // Return null on 401 to indicate not authenticated
    throwOnError: (error: any) => error?.status !== 401,
  });

  return {
    user: user || null,
    isLoading,
    isAuthenticated: !!user && !error,
    error,
  };
}