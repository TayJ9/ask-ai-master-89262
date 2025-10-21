// Security configuration and utilities
import type { SecurityHeaders, RateLimitConfig } from '@/types';

// Security headers configuration
export const securityHeaders: SecurityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// Content Security Policy
export const cspDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", 'https://*.supabase.co', 'https://api.lovable.app'],
  'media-src': ["'self'", 'data:', 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

// Rate limiting configuration
export const rateLimitConfig: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
};

// Input sanitization
export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
};

// XSS protection
export const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

// CSRF protection
export const generateCSRFToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Password strength validation
export const validatePasswordStrength = (password: string): {
  isValid: boolean;
  score: number;
  feedback: string[];
} => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push('Password should be at least 8 characters long');

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Password should contain lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Password should contain uppercase letters');

  if (/\d/.test(password)) score += 1;
  else feedback.push('Password should contain numbers');

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
  else feedback.push('Password should contain special characters');

  return {
    isValid: score >= 4,
    score,
    feedback,
  };
};

// Session security
export const validateSession = (session: any): boolean => {
  if (!session || !session.user) return false;
  
  // Check if session is expired (24 hours)
  const sessionAge = Date.now() - new Date(session.expires_at).getTime();
  return sessionAge < 24 * 60 * 60 * 1000;
};

// API security
export const validateApiKey = (apiKey: string): boolean => {
  // Basic validation - in production, use proper API key validation
  return apiKey && apiKey.length >= 32 && /^[a-zA-Z0-9]+$/.test(apiKey);
};

// File upload security
export const validateFileUpload = (file: File): {
  isValid: boolean;
  error?: string;
} => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['audio/webm', 'audio/mp3', 'audio/wav'];
  
  if (file.size > maxSize) {
    return { isValid: false, error: 'File too large' };
  }
  
  if (!allowedTypes.includes(file.type)) {
    return { isValid: false, error: 'Invalid file type' };
  }
  
  return { isValid: true };
};

// Environment validation
export const validateEnvironment = (): boolean => {
  const requiredVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ];
  
  return requiredVars.every(varName => {
    const value = import.meta.env[varName];
    return value && value.length > 0;
  });
};

// Security logging
export const logSecurityEvent = (event: string, details: any): void => {
  console.warn(`Security Event: ${event}`, {
    timestamp: new Date().toISOString(),
    details,
    userAgent: navigator.userAgent,
  });
};

// Content Security Policy builder
export const buildCSP = (): string => {
  return Object.entries(cspDirectives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
};
