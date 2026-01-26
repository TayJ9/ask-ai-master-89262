import React, { Suspense, lazy } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AnimatePresence, motion } from "framer-motion";
import { fadeInVariants, defaultFadeTransition } from "@/lib/animations";
import AppErrorBoundary from "@/components/AppErrorBoundary";

// Lazy load route components for better code splitting and performance
// Wrap lazy imports with error handling to catch module loading failures
const Index = lazy(() => 
  import("./pages/Index").catch((error) => {
    console.error("Failed to load Index component:", error);
    throw error;
  })
);
const Results = lazy(() => 
  import("./pages/Results").catch((error) => {
    console.error("Failed to load Results component:", error);
    throw error;
  })
);
const NotFound = lazy(() => 
  import("./pages/NotFound").catch((error) => {
    console.error("Failed to load NotFound component:", error);
    throw error;
  })
);
const InterviewPreview = lazy(() => 
  import("./pages/InterviewPreview").catch((error) => {
    console.error("Failed to load InterviewPreview component:", error);
    throw error;
  })
);

// Smooth page transition settings - using shared animation config
const transition = defaultFadeTransition;
const pageVariants = fadeInVariants;

const AppContent = () => {
  const [location] = useLocation();

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
          <Suspense fallback={
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              justifyContent: 'center', 
              alignItems: 'center', 
              minHeight: '100vh',
              color: '#666',
              gap: '1rem',
              backgroundColor: '#FFF8F0',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                border: '4px solid #f3f4f6',
                borderTop: '4px solid #2563eb',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <p style={{ fontSize: '16px', fontWeight: '500' }}>Loading application...</p>
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          }>
            <Switch>
              <Route path="/" component={Index} />
              <Route path="/results" component={Results} />
              <Route path="/interview-preview" component={InterviewPreview} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <Toaster />
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
