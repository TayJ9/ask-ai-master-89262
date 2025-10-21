import { useCallback } from 'react';
import { useToast } from './use-toast';

interface ErrorHandlerOptions {
  showToast?: boolean;
  logError?: boolean;
  fallbackMessage?: string;
}

export const useErrorHandler = () => {
  const { toast } = useToast();

  const handleError = useCallback((
    error: unknown,
    options: ErrorHandlerOptions = {}
  ) => {
    const {
      showToast = true,
      logError = true,
      fallbackMessage = 'An unexpected error occurred'
    } = options;

    // Sanitize error message
    let errorMessage = fallbackMessage;
    if (error instanceof Error) {
      errorMessage = error.message.replace(/[<>]/g, '');
    } else if (typeof error === 'string') {
      errorMessage = error.replace(/[<>]/g, '');
    }

    // Log error for debugging
    if (logError) {
      console.error('Error handled:', error);
    }

    // Show user-friendly toast
    if (showToast) {
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }

    return errorMessage;
  }, [toast]);

  return { handleError };
};
