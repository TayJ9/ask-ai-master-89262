import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * PageTransition component provides smooth fade transitions between routes.
 * Uses framer-motion for premium, non-linear easing curves.
 * 
 * Features:
 * - Fade in/out with subtle scale effect
 * - Premium easing: ease-in-out with custom cubic-bezier
 * - Proper unmounting to prevent page stacking
 * - 400ms duration (not too fast, not too slow)
 */
export default function PageTransition({ children }: PageTransitionProps) {
  const [location] = useLocation();

  // Premium easing curve: smooth, elegant, non-linear
  // Optimized to prevent double pulse effect
  const transition = {
    duration: 0.3, // Slightly faster for snappier feel
    ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number], // Smooth ease-in-out
  };

  // Animation variants - simplified to prevent double pulse
  // Removed blur and scale to eliminate visual artifacts
  const variants = {
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

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants}
        transition={transition}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
