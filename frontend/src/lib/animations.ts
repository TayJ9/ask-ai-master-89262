/**
 * Shared animation configurations for consistent, smooth transitions
 * Optimized easing curves for natural, polished feel
 */

import { Variants, Transition } from "framer-motion";

/**
 * Premium easing curves optimized for smooth fade-ins
 * easeOutCubic: Natural deceleration - feels smooth and polished
 */
export const smoothEasing = [0.33, 1, 0.68, 1] as [number, number, number, number]; // easeOutCubic
export const gentleEasing = [0.25, 0.1, 0.25, 1] as [number, number, number, number]; // easeInOut

/**
 * Standard transition timings
 */
export const transitions = {
  fast: { duration: 0.2, ease: smoothEasing },
  normal: { duration: 0.3, ease: smoothEasing },
  slow: { duration: 0.4, ease: smoothEasing },
} as const;

/**
 * Fade-in variants - optimized for smooth appearance
 * Uses easeOut for natural deceleration
 */
export const fadeInVariants: Variants = {
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

/**
 * Fade-in with subtle scale - adds depth without pulse
 * Very subtle scale (0.99 to 1) prevents visual artifacts
 */
export const fadeInScaleVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.99, // Very subtle - prevents pulse
  },
  animate: {
    opacity: 1,
    scale: 1,
  },
  exit: {
    opacity: 0,
    scale: 0.99,
  },
};

/**
 * Fade-in with subtle upward movement - smooth entrance
 */
export const fadeInUpVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8, // Reduced from 20 for smoother feel
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: -8,
  },
};

/**
 * Stagger container for sequential fade-ins
 */
export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.05, // Small delay between children
    },
  },
};

/**
 * Default transition for fade-ins
 */
export const defaultFadeTransition: Transition = {
  duration: 0.3,
  ease: smoothEasing,
};
