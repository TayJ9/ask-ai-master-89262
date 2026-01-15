/**
 * Centralized API configuration and utilities
 * 
 * Deployment Architecture:
 * - Frontend: Vercel (React/Vite)
 * - Backend: Railway (Node.js/Express)
 * 
 * Environment Variables:
 * - NEXT_PUBLIC_API_URL: Railway backend URL (for Vercel deployments)
 * - VITE_API_URL: Alternative name (for Vite convention)
 * 
 * Falls back to relative URLs for development (when frontend/backend are together)
 */

// Get API base URL from environment variable or use relative URLs for development
export function getApiBaseUrl(): string {
  // Support both VITE_API_URL (Vite convention) and NEXT_PUBLIC_API_URL (Vercel/Next.js convention)
  // Vite exposes env vars prefixed with VITE_ via import.meta.env
  // For Vercel deployments, NEXT_PUBLIC_API_URL should be set to Railway backend URL
  // Example: NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
  const apiUrl = import.meta.env.VITE_API_URL || 
                 import.meta.env.NEXT_PUBLIC_API_URL;
  
  if (apiUrl) {
    // Remove trailing slash if present
    return apiUrl.replace(/\/$/, '');
  }
  
  // Fallback to relative URLs (same origin) for development
  // This works when frontend and backend are on the same domain (e.g., localhost)
  return '';
}

/**
 * Builds a full API URL from a path
 * @param path - API path (e.g., '/api/auth/signin')
 * @returns Full URL (e.g., 'https://api.example.com/api/auth/signin' or '/api/auth/signin')
 */
export function getApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  if (baseUrl) {
    return `${baseUrl}${cleanPath}`;
  }
  
  return cleanPath;
}

/**
 * Error handler for API requests
 * Provides user-friendly error messages
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Handles API response errors and throws user-friendly errors
 */
export async function handleApiResponse(response: Response): Promise<any> {
  if (!response.ok) {
    let errorData: any;
    let errorMessage = 'An error occurred';
    
    try {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        errorData = await response.json();
        errorMessage = errorData.error || errorData.message || `Server error (${response.status})`;
      } else {
        const text = await response.text();
        errorMessage = text || `Server error (${response.status})`;
      }
    } catch (parseError) {
      // If we can't parse the error, use status-based messages
      switch (response.status) {
        case 401:
          errorMessage = 'Authentication required. Please sign in again.';
          break;
        case 403:
          errorMessage = 'You do not have permission to perform this action.';
          break;
        case 404:
          errorMessage = 'The requested resource was not found.';
          break;
        case 500:
          errorMessage = 'Server error. Please try again later.';
          break;
        case 503:
          errorMessage = 'Service temporarily unavailable. Please try again later.';
          break;
        default:
          errorMessage = `Request failed with status ${response.status}`;
      }
    }
    
    throw new ApiError(errorMessage, response.status);
  }
  
  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    return text || {};
  }
  
  return response.json();
}

/**
 * Makes an authenticated API request
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const url = getApiUrl(path);
  const rawToken = localStorage.getItem('auth_token');
  
  // Trim and validate token
  const token = rawToken ? rawToken.trim() : null;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    // Ensure token doesn't already include "Bearer" prefix (safety check)
    let cleanToken = token.trim();
    if (cleanToken.toLowerCase().startsWith('bearer ')) {
      console.warn('[API] Token already includes Bearer prefix, removing it');
      cleanToken = cleanToken.replace(/^bearer\s+/i, '').trim();
    }
    
    // Ensure proper format: "Bearer <token>" (no double Bearer, proper spacing)
    headers['Authorization'] = `Bearer ${cleanToken}`;
  } else if (path !== '/api/auth/signin' && path !== '/api/auth/signup') {
    // Log missing token for non-auth endpoints
    console.warn('[API] No token found for authenticated endpoint:', path);
  }
  
  // Add timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return handleApiResponse(response);
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please check your connection and try again.', 408);
    }
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Network errors
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      throw new ApiError(
        'Unable to connect to the server. Please check your internet connection.',
        0,
        error
      );
    }
    
    throw new ApiError(
      error.message || 'An unexpected error occurred',
      undefined,
      error
    );
  }
}

/**
 * Makes a POST request
 */
export async function apiPost(path: string, body?: any): Promise<any> {
  return apiFetch(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Makes a GET request
 */
export async function apiGet(path: string): Promise<any> {
  return apiFetch(path, {
    method: 'GET',
  });
}

/**
 * Makes a PATCH request
 */
export async function apiPatch(path: string, body?: any): Promise<any> {
  return apiFetch(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Makes a DELETE request
 */
export async function apiDelete(path: string): Promise<any> {
  return apiFetch(path, {
    method: 'DELETE',
  });
}

/**
 * Makes a multipart/form-data POST request (for file uploads)
 */
export async function apiPostFormData(path: string, formData: FormData): Promise<any> {
  const url = getApiUrl(path);
  const rawToken = localStorage.getItem('auth_token');
  
  // Trim and validate token
  const token = rawToken ? rawToken.trim() : null;
  
  // Debug logging for token and header
  if (token) {
    const tokenPreview = token.length > 20 ? `${token.substring(0, 20)}...` : token;
    console.log('[API] Token retrieved:', {
      exists: true,
      length: token.length,
      preview: tokenPreview,
      path: path
    });
  } else {
    console.error('[API] No token found in localStorage for path:', path);
    console.error('[API] localStorage keys:', Object.keys(localStorage));
  }
  
  const headers: HeadersInit = {};
  // Don't set Content-Type for FormData - browser will set it with boundary
  if (token) {
    // Ensure token doesn't already include "Bearer" prefix (safety check)
    let cleanToken = token.trim();
    if (cleanToken.toLowerCase().startsWith('bearer ')) {
      console.warn('[API] Token already includes Bearer prefix, removing it');
      cleanToken = cleanToken.replace(/^bearer\s+/i, '').trim();
    }
    
    // Ensure proper format: "Bearer <token>" (no double Bearer, proper spacing)
    const authHeader = `Bearer ${cleanToken}`;
    headers['Authorization'] = authHeader;
    
    // Log header format for debugging
    console.log('[API] Authorization header set:', {
      format: 'Bearer <token>',
      headerLength: authHeader.length,
      tokenLength: cleanToken.length,
      startsWithBearer: authHeader.startsWith('Bearer '),
      hasDoubleBearer: authHeader.includes('Bearer Bearer'),
      originalTokenLength: token.length
    });
  } else {
    console.warn('[API] No Authorization header will be sent - token is missing');
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds for file uploads
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    // Log response status for debugging
    if (!response.ok) {
      const errorDetails: any = {
        status: response.status,
        statusText: response.statusText,
        path: path,
        hasAuthHeader: !!headers['Authorization']
      };
      
      // For 403 errors, provide helpful debugging info
      if (response.status === 403) {
        console.error('[API] Upload request failed with 403 Forbidden:', errorDetails);
        console.error('[API] Possible causes:');
        console.error('[API]   1. Token is invalid or expired - try signing in again');
        console.error('[API]   2. JWT secret mismatch between frontend/backend environments');
        console.error('[API]   3. Token format issue - check Authorization header format');
        console.error('[API]   4. CORS issue - check if backend allows your origin');
      } else {
        console.error('[API] Upload request failed:', errorDetails);
      }
    }
    
    return handleApiResponse(response);
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new ApiError('Upload timed out. Please try again.', 408);
    }
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError(
      error.message || 'Upload failed. Please try again.',
      undefined,
      error
    );
  }
}

