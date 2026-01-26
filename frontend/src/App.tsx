import React, { Suspense, lazy } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AnimatePresence, motion } from "framer-motion";
import { fadeInVariants, defaultFadeTransition } from "@/lib/animations";

// Lazy load route components for better code splitting and performance
const Index = lazy(() => import("./pages/Index"));
const Results = lazy(() => import("./pages/Results"));
const NotFound = lazy(() => import("./pages/NotFound"));
const InterviewPreview = lazy(() => import("./pages/InterviewPreview"));

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
              justifyContent: 'center', 
              alignItems: 'center', 
              minHeight: '100vh',
              color: '#666'
            }}>
              Loading...
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
  <QueryClientProvider client={queryClient}>
    <AppContent />
    <Toaster />
  </QueryClientProvider>
);

export default App;
