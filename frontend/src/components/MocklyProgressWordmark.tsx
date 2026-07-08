import { cn } from "@/lib/utils";

const WORD = "Mockly";

const WORDMARK_CLASS =
  "inline-block pb-[0.22em] text-4xl font-bold leading-[1.5] tracking-tight sm:text-5xl md:text-6xl";

interface MocklyProgressWordmarkProps {
  /** Loading progress, 0–100. Controls how much of the gradient is revealed left-to-right. */
  progress: number;
  className?: string;
}

/**
 * The "Mockly" wordmark (same gradient as the sign-in page) used as a loading indicator.
 * Starts fully grey and reveals the primary→secondary gradient left-to-right as progress grows.
 *
 * Both layers share one grid cell so font metrics align exactly. A horizontal mask on the
 * gradient layer reveals left-to-right without clipping descenders (unlike overflow-hidden).
 */
export default function MocklyProgressWordmark({ progress, className }: MocklyProgressWordmarkProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const revealMask = `linear-gradient(to right, black ${clamped}%, transparent ${clamped}%)`;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading progress"
      className={cn("inline-grid select-none", className)}
    >
      <span className={cn(WORDMARK_CLASS, "col-start-1 row-start-1 text-muted-foreground/35")}>
        {WORD}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          WORDMARK_CLASS,
          "col-start-1 row-start-1 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
        )}
        style={{
          WebkitMaskImage: revealMask,
          maskImage: revealMask,
        }}
      >
        {WORD}
      </span>
    </div>
  );
}
