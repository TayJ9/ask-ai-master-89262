/**
 * React Readiness Utility
 * Ensures React is fully initialized before React-dependent libraries access it
 */

import React from 'react';

/**
 * Check if React is ready (React.Children is available)
 */
export function isReactReady(): boolean {
  try {
    return (
      typeof React !== 'undefined' &&
      React.Children !== undefined &&
      typeof React.Children === 'object'
    );
  } catch {
    return false;
  }
}

/**
 * Wait for React to be ready
 * Polls until React.Children is available
 */
export function waitForReact(maxWaitMs: number = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    // If React is already ready, resolve immediately
    if (isReactReady()) {
      resolve();
      return;
    }
    
    const startTime = Date.now();
    
    const checkReact = () => {
      if (isReactReady()) {
        resolve();
        return;
      }
      
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        reject(new Error(`React not ready after ${maxWaitMs}ms`));
        return;
      }
      
      // Check again in 10ms
      setTimeout(checkReact, 10);
    };
    
    checkReact();
  });
}
