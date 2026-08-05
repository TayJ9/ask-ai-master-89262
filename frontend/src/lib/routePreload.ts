/**
 * Index and AccessGate are eagerly imported in App.tsx (entry bundle).
 * Call sites after access is granted remain for a stable hook if routing changes later.
 */
export function preloadIndexRoute(): void {
  // No-op: home route is already in the initial bundle.
}
