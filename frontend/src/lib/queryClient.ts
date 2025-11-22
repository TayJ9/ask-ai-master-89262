import { QueryClient } from "@tanstack/react-query";
import { getApiUrl, handleApiResponse, ApiError } from "./api";

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
    
    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/';
      throw new ApiError('Authentication required. Please sign in again.', response.status);
    }
    
    return handleApiResponse(response);
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

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

type RequestMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

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
