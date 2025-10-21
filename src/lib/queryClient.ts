import { QueryClient } from "@tanstack/react-query";

const getAuthToken = () => localStorage.getItem('auth_token');

async function handleResponse(response: Response) {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
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

  const response = await fetch(queryKey[0] as string, {
    headers,
  });
  
  return handleResponse(response);
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

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  return handleResponse(response);
}
