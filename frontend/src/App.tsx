import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AnimatePresence, motion } from "framer-motion";
import Index from "./pages/Index";
import Results from "./pages/Results";
import NotFound from "./pages/NotFound";

// Premium easing curve: smooth, elegant, non-linear
// Using Material Design's standard easing for a polished feel
const transition = {
  duration: 0.4,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

// Animation variants for fade + subtle scale
// Subtle blur and scale effects create depth and premium feel
const pageVariants = {
  initial: {
    opacity: 0,
    scale: 0.98,
    filter: "blur(4px)",
  },
  animate: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
  },
  exit: {
    opacity: 0,
    scale: 1.02,
    filter: "blur(4px)",
  },
};

const AppContent = () => {
  const [location] = useLocation();

  return (
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
        <Switch>
          <Route path="/" component={Index} />
          <Route path="/results" component={Results} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppContent />
    <Toaster />
  </QueryClientProvider>
);

export default App;
