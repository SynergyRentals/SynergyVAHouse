import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage: string;
    try {
      const text = (await res.text()) || res.statusText;
      errorMessage = `${res.status}: ${text}`;
    } catch (textError) {
      // If res.text() fails, fall back to status text
      errorMessage = `${res.status}: ${res.statusText || 'Unknown error'}`;
    }
    
    // Create error object with status property for throwOnError checks
    const error = new Error(errorMessage) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error(`API request failed: ${method} ${url}`, error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Extract the base URL (first string element) and any query parameters (objects)
    const baseUrl = queryKey[0] as string;
    let url = baseUrl;
    
    // Handle additional string path segments
    const pathSegments = queryKey.slice(1).filter(key => typeof key === 'string') as string[];
    if (pathSegments.length > 0) {
      url = `${baseUrl}/${pathSegments.join('/')}`;
    }
    
    // Handle query parameters from objects in the queryKey
    const queryParams = queryKey.find(key => typeof key === 'object' && key !== null) as Record<string, any> | undefined;
    if (queryParams) {
      const searchParams = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      
      if (searchParams.toString()) {
        url += `?${searchParams.toString()}`;
      }
    }

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    
    try {
      return await res.json();
    } catch (jsonError) {
      console.error('Failed to parse JSON response:', jsonError);
      throw new Error('Invalid JSON response from server');
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
