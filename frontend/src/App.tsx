// Import React first to ensure it's available before lazy components
import React, { useState, useEffect } from "react";
import { Suspense, lazy } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, useLocation } from "wouter";
import { getQueryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AnimatePresence, motion } from "framer-motion";
import { fadeInVariants, defaultFadeTransition } from "@/lib/animations";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import { isReactReady, waitForReact } from "@/lib/reactReady";

// Temporarily disable lazy loading to test if it's causing the React initialization error
// TODO: Re-enable lazy loading once React chunking issue is resolved
import Index from "./pages/Index";
import Results from "./pages/Results";
import NotFound from "./pages/NotFound";
import InterviewPreview from "./pages/InterviewPreview";

// Lazy load route components for better code splitting and performance
// DISABLED TEMPORARILY to fix "Cannot set properties of undefined" error
// const Index = lazy(() => import("./pages/Index"));
// const Results = lazy(() => import("./pages/Results"));
// const NotFound = lazy(() => import("./pages/NotFound"));
// const InterviewPreview = lazy(() => import("./pages/InterviewPreview"));

// Smooth page transition settings - using shared animation config
const transition = defaultFadeTransition;
const pageVariants = fadeInVariants;

const AppContent = () => {
  const [location] = useLocation();
  
  // Debug logging
  console.log("[AppContent] Rendering with location:", location);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        position: "relative",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
          transition={transition}
          style={{
            width: "100%",
            minHeight: "100vh",
            position: "relative",
          }}
        >
          {/* Soft warm background that shows through during transitions */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "#FFF8F0",
              zIndex: -1, // Behind content
              opacity: 0.95, // Slightly reduced to prevent white flash
            }}
          />
          <Switch>
            <Route path="/" component={Index} />
            <Route path="/results" component={Results} />
            <Route path="/interview-preview" component={InterviewPreview} />
            <Route component={NotFound} />
          </Switch>
        </motion.div>
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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{ textAlign: 'center' }}>
            <p>Initializing application...</p>
          </div>
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
