import { QueryClient } from "@tanstack/react-query";

const getAuthToken = () => localStorage.getItem('auth_token');

async function handleResponse(response: Response) {
  if (!response.ok) {
    // Only redirect on actual authentication errors, not on other errors
    // Check if the error message indicates authentication failure
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    const errorMessage = errorData.error || 'Request failed';
    
    // Only treat as auth error if it's explicitly about tokens or authentication
    const isAuthError = (response.status === 401 || response.status === 403) && 
                       (errorMessage.includes('token') || 
                        errorMessage.includes('authentication') || 
                        errorMessage.includes('unauthorized') ||
                        errorMessage.includes('No token'));
    
    if (isAuthError) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/';
      return;
    }
    
    throw new Error(errorMessage);
  }
  return response.json();
}

const defaultQueryFn = async ({ queryKey }: { queryKey: any[] }) => {
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
    const response = await fetch(queryKey[0] as string, {
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return handleResponse(response);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
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

export async function apiRequest(url: string, method: RequestMethod, body?: any) {
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
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return handleResponse(response);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  }
}
