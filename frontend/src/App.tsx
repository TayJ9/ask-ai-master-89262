/**
 * PERF SUMMARY:
 * - devLog in AppContent (dev-only logging).
 * - Static style objects to avoid allocation on every render.
 * - GPU compositing (translateZ(0)) on white overlay for smooth animation.
 */
// Import React first to ensure it's available before lazy components
import React, { useState, useEffect, useRef } from "react";
import { Suspense, lazy } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, useLocation } from "wouter";
import { getQueryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AnimatePresence, motion } from "framer-motion";
import { fadeInVariants, defaultFadeTransition } from "@/lib/animations";
import { devLog } from "@/lib/utils";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import AccessGateGuard from "@/components/AccessGateGuard";
import { isReactReady, waitForReact } from "@/lib/reactReady";

// Route-level code splitting — each page loads only when navigated to
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const InterviewPreview = lazy(() => import("./pages/InterviewPreview"));
const LoginPreview = lazy(() => import("./pages/LoginPreview"));
const AccessGate = lazy(() => import("./pages/AccessGate"));
const Terms = lazy(() => import("./pages/Terms"));
const Results = lazy(() => import("./pages/Results"));

const RouteLoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background px-4">
    <p className="text-sm text-muted-foreground">Loading page…</p>
  </div>
);

// Smooth page transition settings - using shared animation config
const transition = defaultFadeTransition;
const pageVariants = fadeInVariants;

const PAGE_WRAPPER_STYLE: React.CSSProperties = {
  width: "100%",
  minHeight: "100vh",
  position: "relative",
};
const OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "hsl(var(--background))",
  zIndex: 9998,
  pointerEvents: "none",
  transform: "translateZ(0)", // GPU compositing for smooth animation
};

const AppContent = () => {
  const [location] = useLocation();
  const prevLocation = useRef(location);
  const [showWhiteOverlay, setShowWhiteOverlay] = useState(false);

  useEffect(() => {
    if (location !== prevLocation.current) {
      prevLocation.current = location;
      setShowWhiteOverlay(true);
      const t = setTimeout(() => setShowWhiteOverlay(false), 400);
      return () => clearTimeout(t);
    }
  }, [location]);

  devLog.log("[AppContent] Rendering with location:", location);

  return (
    <div className="relative min-h-screen w-full bg-background">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
          transition={transition}
          style={PAGE_WRAPPER_STYLE}
        >
          <div className="app-page-tint" aria-hidden="true" />
          <Suspense fallback={<RouteLoadingFallback />}>
            <AccessGateGuard>
              <Switch>
                <Route path="/gate" component={AccessGate} />
                <Route path="/" component={Index} />
                <Route path="/results" component={Results} />
                <Route path="/interview-preview" component={InterviewPreview} />
                <Route path="/login-preview" component={LoginPreview} />
                <Route path="/terms" component={Terms} />
                <Route component={NotFound} />
              </Switch>
            </AccessGateGuard>
          </Suspense>
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {showWhiteOverlay && (
          <motion.div
            key="white-overlay"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ exit: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } }}
            style={OVERLAY_STYLE}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const App = () => {
  const [reactReady, setReactReady] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  useEffect(() => {
    // Wait for React to be ready before initializing QueryClient
    const initialize = async () => {
      try {
        // Check if React is already ready
        if (isReactReady()) {
          setReactReady(true);
          return;
        }

        // Wait for React to be ready (max 5 seconds)
        await waitForReact(5000);
        setReactReady(true);
      } catch (error) {
        console.error('[App] Failed to wait for React:', error);
        setInitError(error instanceof Error ? error : new Error(String(error)));
        // Still try to render - might work in some cases
        setReactReady(true);
      }
    };

    initialize();
  }, []);

  // Show loading state while waiting for React
  if (!reactReady) {
    return (
      <AppErrorBoundary>
        <div className="flex min-h-screen items-center justify-center bg-background font-sans text-muted-foreground">
          <p className="text-center text-sm">Initializing application…</p>
        </div>
      </AppErrorBoundary>
    );
  }

  // Get QueryClient after React is ready
  const queryClient = getQueryClient();

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
        <Toaster />
      </QueryClientProvider>
    </AppErrorBoundary>
  );
};

export default App;
