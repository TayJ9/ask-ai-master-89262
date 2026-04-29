import { cn } from "@/lib/utils";

interface InterviewRoomBackgroundProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Main interview panels: same hue as --interview-surface (see index.css) + defined shadow stack.
 * Overrides default Card border/shadow.
 */
export const interviewRoomCardClassName =
  "rounded-2xl border border-interview-edge/50 bg-interview-surface shadow-[0_0_0_1px_hsl(var(--interview-surface-edge)/0.35),0_2px_6px_rgba(55,45,38,0.06),0_10px_28px_-4px_rgba(55,45,38,0.1),0_22px_56px_-12px_rgba(40,34,28,0.12)] transition-shadow duration-300 hover:shadow-[0_0_0_1px_hsl(var(--interview-surface-edge)/0.5),0_4px_10px_rgba(55,45,38,0.08),0_14px_36px_-4px_rgba(55,45,38,0.1),0_28px_64px_-10px_rgba(40,34,28,0.14)]";

/** Nested callouts (preview tools, etc.) — slightly recessed into the main panel. */
export const interviewRoomInsetPanelClassName =
  "rounded-xl border border-stone-200/40 bg-interview-surface/90";

/**
 * Static light “room” backdrop for the voice interview — no animated meshes (lower GPU cost than AnimatedBackground).
 * Gradient `via` uses the same family as `interview-surface` tokens so the wall and panel read as one material.
 */
export default function InterviewRoomBackground({
  className,
  children,
}: InterviewRoomBackgroundProps) {
  return (
    <div
      className={cn(
        "min-h-screen w-full bg-gradient-to-b from-background via-interview-surface to-[hsl(40_16%_90%)] text-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
