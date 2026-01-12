import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AnimatePresence, motion } from "framer-motion";
import Index from "./pages/Index";
import Results from "./pages/Results";
import NotFound from "./pages/NotFound";

// Cinematic dip-to-black transition settings
// Slower, more deliberate timing for premium feel
const transition = {
  duration: 0.8, // Significantly slower for cinematic effect
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number], // Smooth easeInOut curve
};

// Cinematic fade-to-black animation variants
// Pages fade out to black, then new page fades in from black
const pageVariants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
  exit: {
    opacity: 0,
  },
};

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
          {/* Black background that shows through when content fades out */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#000000",
              zIndex: -1, // Behind content, visible when content opacity is 0
            }}
          />
          <Switch>
            <Route path="/" component={Index} />
            <Route path="/results" component={Results} />
            <Route component={NotFound} />
          </Switch>
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
