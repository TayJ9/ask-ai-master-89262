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
  // cubic-bezier(0.4, 0, 0.2, 1) - Material Design's standard easing
  const transition = {
    duration: 0.4,
    ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
  };

  // Animation variants for fade + subtle scale
  const variants = {
    initial: {
      opacity: 0,
      scale: 0.98, // Subtle scale for depth
      filter: "blur(4px)", // Subtle blur for premium feel
    },
    animate: {
      opacity: 1,
      scale: 1,
      filter: "blur(0px)",
    },
    exit: {
      opacity: 0,
      scale: 1.02, // Slight scale up on exit for smoothness
      filter: "blur(4px)",
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
