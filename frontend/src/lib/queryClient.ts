import { QueryClient } from "@tanstack/react-query";

const getAuthToken = () => localStorage.getItem('auth_token');

async function handleResponse(response: Response) {
  if (!response.ok) {
    // Only redirect on actual authentication errors, not on other errors
    // Check if the error message indicates authentication failure
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      // If response is not JSON, try to get text
      const text = await response.text().catch(() => 'Request failed');
      errorData = { error: text || 'Request failed' };
    }
    
    const errorMessage = errorData.error || 'Request failed';
    
    console.log(`Error response: status=${response.status}, message=${errorMessage}`);
    
    // Only treat as auth error if it's explicitly a 401/403 status AND about tokens
    // If it's a 500 with "No token provided", it's likely a backend error, not auth
    const isAuthError = (response.status === 401 || response.status === 403) && 
                       (errorMessage.includes('token') || 
                        errorMessage.includes('authentication') || 
                        errorMessage.includes('unauthorized') ||
                        errorMessage.includes('No token'));
    
    if (isAuthError) {
      console.log('Detected authentication error, clearing token and redirecting');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/';
      return;
    }
    
    // For 500 errors with "No token provided", this is likely a backend/proxy issue
    if (response.status === 500 && errorMessage.includes('No token provided')) {
      console.error('Got 500 error with "No token provided" - this is likely a backend issue');
      throw new Error('Server error: Unable to process request. Please check if the Python backend is running.');
    }
    
    throw new Error(errorMessage);
  }
  return response.json();
}

const defaultQueryFn = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
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
  } else {
    console.error('No auth token found when making request to:', url);
    throw new Error('No authentication token found. Please log in again.');
  }

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    console.log(`Making ${method} request to ${url}`, { hasToken: !!token, bodyKeys: body ? Object.keys(body) : [] });
    
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    console.log(`Response status for ${url}:`, response.status);
    return handleResponse(response);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    console.error(`Error in apiRequest for ${url}:`, error);
    throw error;
  }
}
