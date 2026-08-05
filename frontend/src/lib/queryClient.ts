import { QueryClient } from "@tanstack/react-query";
import { getApiUrl, handleApiResponse, ApiError } from "./api";
import { isReactReady } from "./reactReady";

const getAuthToken = () => localStorage.getItem('auth_token');

const defaultQueryFn = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
  const path = queryKey[0] as string;
  const url = getApiUrl(path);
  const token = getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      let gateRequired = false;
      try {
        const cloned = response.clone();
        const contentType = cloned.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const data = await cloned.json();
          gateRequired = data?.error === "ACCESS_GATE_REQUIRED";
        }
      } catch {
        // Fall through to gate redirect below.
      }

      const { expireAccessSession } = await import("./authSession");
      expireAccessSession();
      throw new ApiError(
        gateRequired
          ? "Your access session expired. Enter the current hourly code to continue."
          : "Authentication required. Please sign in again.",
        response.status,
      );
    }

    return handleApiResponse(response, path);
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', 408);
    }
    
    throw error;
  }
};

// Lazy initialization: QueryClient singleton
let _queryClient: QueryClient | null = null;

/**
 * Get or create QueryClient instance
 * Ensures React is ready before creating QueryClient to prevent React.Children errors
 */
export function getQueryClient(): QueryClient {
  // Check if React is ready before creating QueryClient
  if (!isReactReady()) {
    console.warn('[QueryClient] React is not ready yet. QueryClient creation may fail.');
    // In production builds, we'll still try to create it, but log the warning
  }
  
  if (!_queryClient) {
    _queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          queryFn: defaultQueryFn,
          staleTime: 1000 * 60,
          retry: 1,
        },
      },
    });
  }
  
  return _queryClient;
}

// Export for backward compatibility - but use getQueryClient() in new code
export const queryClient = getQueryClient();

type RequestMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'GET';

/**
 * Legacy apiRequest function - use apiPost, apiGet, etc. from ./api instead
 * @deprecated Use apiPost, apiGet, apiPatch, apiDelete from './api' instead
 */
export async function apiRequest(path: string, method: RequestMethod, body?: any) {
  const { apiPost, apiGet, apiPatch, apiDelete } = await import('./api');
  
  switch (method) {
    case 'POST':
      return apiPost(path, body);
    case 'GET':
      return apiGet(path);
    case 'PATCH':
      return apiPatch(path, body);
    case 'PUT':
      return apiPost(path, body); // PUT not commonly used, treat as POST
    case 'DELETE':
      return apiDelete(path);
    default:
      throw new ApiError(`Unsupported method: ${method}`);
  }
}
