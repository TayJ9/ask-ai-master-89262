/**
 * ChatGPTVoiceOrb – High-reactivity voice orb inspired by ChatGPT / Siri.
 *
 * Every layer is driven by a requestAnimationFrame loop so scale, glow
 * intensity, border-radius morphing, and float all respond to audio volume
 * in real time.  Volume is smoothed with an exponential moving average for
 * organic feel.  No CSS keyframe animations are used for the reactive
 * properties – JS writes directly to CSS variables each frame.
 *
 * PERF: will-change: transform on all layers, translate3d for GPU
 * compositing, ref-based volume (zero React re-renders on volume change),
 * React.memo with custom comparator.
 */

import React, { useEffect, useRef, useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrbMode = "user_speaking" | "ai_speaking" | "listening" | "processing";

interface ChatGPTVoiceOrbProps {
  /** Direct volume value (0-1). Takes priority over inputVolume/outputVolume. */
  audioVolume?: number;
  /** Microphone / user input volume (0-1). Used when mode is user_speaking. */
  inputVolume?: number;
  /** AI output volume (0-1). Used when mode is ai_speaking. */
  outputVolume?: number;
  /** Current conversation mode – drives which volume source is active. */
  mode?: OrbMode;
  /** Outer container size in px (default 300). All layers scale proportionally. */
  size?: number;
}

// ---------------------------------------------------------------------------
// Color schemes per mode – matches the old AudioVisualizer palette.
// Each scheme defines the gradients/shadows for every layer.
// ---------------------------------------------------------------------------

interface OrbColorScheme {
  outer: string;   // radial-gradient for outer glow
  middle: string;  // radial-gradient for middle glow
  core: string;    // radial-gradient for core surface
  coreInset: string; // inset box-shadow for core surface
  glow: string;    // rgba color for container glow
}

// ---------------------------------------------------------------------------
// Static star field – generated once, animated purely via CSS keyframes.
// No per-frame JS cost. Volume reactivity is handled by a single CSS variable.
// ---------------------------------------------------------------------------

interface Star {
  x: number;   // % position
  y: number;   // % position
  size: number; // px
  delay: number; // animation-delay seconds
  dur: number;   // animation-duration seconds
  baseOpacity: number;
}

function generateStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 0.8 + Math.random() * 1.5,
      delay: Math.random() * 5,
      dur: 2 + Math.random() * 4,
      baseOpacity: 0.2 + Math.random() * 0.5,
    });
  }
  return stars;
}

const COLOR_SCHEMES: Record<OrbMode, OrbColorScheme> = {
  // Green – user speaking
  user_speaking: {
    outer:
      "radial-gradient(circle, rgba(34, 197, 94, 0.4), rgba(5, 150, 105, 0.12) 60%, transparent 80%)",
    middle:
      "radial-gradient(circle, rgba(16, 185, 129, 0.7), rgba(22, 163, 74, 0.25) 60%, transparent 80%)",
    core:
      "radial-gradient(circle at 35% 35%, #86efac 0%, #22c55e 20%, #059669 65%, #166534 100%)",
    coreInset:
      "inset 0 -20px 40px rgba(5, 100, 50, 0.3), inset 0 0 30px rgba(255, 255, 255, 0.3)",
    glow: "rgba(34, 197, 94, 0.5)",
  },
  // Blue – AI speaking
  ai_speaking: {
    outer:
      "radial-gradient(circle, rgba(0, 102, 255, 0.4), rgba(0, 60, 180, 0.12) 60%, transparent 80%)",
    middle:
      "radial-gradient(circle, rgba(0, 153, 255, 0.7), rgba(0, 100, 220, 0.25) 60%, transparent 80%)",
    core:
      "radial-gradient(circle at 35% 35%, #99CCFF 0%, #66B3FF 20%, #0066FF 65%, #003D99 100%)",
    coreInset:
      "inset 0 -20px 40px rgba(0, 50, 150, 0.3), inset 0 0 30px rgba(255, 255, 255, 0.3)",
    glow: "rgba(59, 130, 246, 0.5)",
  },
  // Amber/Orange – listening
  listening: {
    outer:
      "radial-gradient(circle, rgba(245, 158, 11, 0.4), rgba(217, 119, 6, 0.12) 60%, transparent 80%)",
    middle:
      "radial-gradient(circle, rgba(249, 115, 22, 0.7), rgba(234, 88, 12, 0.25) 60%, transparent 80%)",
    core:
      "radial-gradient(circle at 35% 35%, #fde047 0%, #fbbf24 20%, #f59e0b 65%, #b45309 100%)",
    coreInset:
      "inset 0 -20px 40px rgba(180, 100, 0, 0.3), inset 0 0 30px rgba(255, 255, 255, 0.3)",
    glow: "rgba(245, 158, 11, 0.5)",
  },
  // Gray – processing
  processing: {
    outer:
      "radial-gradient(circle, rgba(107, 114, 128, 0.3), rgba(75, 85, 99, 0.1) 60%, transparent 80%)",
    middle:
      "radial-gradient(circle, rgba(156, 163, 175, 0.5), rgba(107, 114, 128, 0.2) 60%, transparent 80%)",
    core:
      "radial-gradient(circle at 35% 35%, #e5e7eb 0%, #d1d5db 20%, #9ca3af 65%, #6b7280 100%)",
    coreInset:
      "inset 0 -20px 40px rgba(50, 50, 60, 0.3), inset 0 0 30px rgba(255, 255, 255, 0.2)",
    glow: "rgba(107, 114, 128, 0.3)",
  },
};

// ---------------------------------------------------------------------------
// Minimal scoped keyframes – only used for the gentle idle float.
// Everything reactive is driven by JS in the rAF loop.
// ---------------------------------------------------------------------------

const ORB_KEYFRAMES = `
@keyframes orbIdleFloat {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50%      { transform: translate3d(0, -12px, 0); }
}
@keyframes starTwinkle {
  0%, 100% { opacity: var(--star-base); }
  50%      { opacity: var(--star-peak); }
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Exponential moving average – higher alpha = snappier response. */
function lerp(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

/** Clamp value between min and max. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ChatGPTVoiceOrb({
  audioVolume,
  inputVolume = 0,
  outputVolume = 0,
  mode = "listening",
  size = 300,
}: ChatGPTVoiceOrbProps) {
  // DOM refs for direct style mutation (no React re-renders)
  const bgRef = useRef<HTMLDivElement>(null);      // dark background container
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);

  // Static star field – generated once, never re-created
  const stars = useMemo(() => generateStars(60), []);

  // Animation state refs
  const targetVolumeRef = useRef(0);
  const smoothVolumeRef = useRef(0);     // smoothed for scale / glow
  const velocityRef = useRef(0);          // rate of change → drives wobble
  const prevSmoothedRef = useRef(0);
  const timeRef = useRef(0);

  // Volume prop refs – always kept in sync even when React.memo blocks re-renders.
  // The rAF loop reads these directly so slider changes are picked up every frame.
  const audioVolumeRef = useRef(audioVolume);
  const inputVolumeRef = useRef(inputVolume);
  const outputVolumeRef = useRef(outputVolume);
  const modeRef = useRef(mode);

  useEffect(() => { audioVolumeRef.current = audioVolume; }, [audioVolume]);
  useEffect(() => { inputVolumeRef.current = inputVolume; }, [inputVolume]);
  useEffect(() => { outputVolumeRef.current = outputVolume; }, [outputVolume]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // -----------------------------------------------------------------------
  // Main rAF animation loop – drives ALL visual properties every frame
  // -----------------------------------------------------------------------
  useEffect(() => {
    let rafId: number;

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      timeRef.current += 0.016; // ~60fps delta

      const t = timeRef.current;

      // Derive target volume from prop refs every frame (slider-responsive)
      const av = audioVolumeRef.current;
      const m = modeRef.current;
      const target =
        av !== undefined
          ? av
          : m === "user_speaking"
          ? inputVolumeRef.current
          : m === "ai_speaking"
          ? outputVolumeRef.current
          : m === "listening"
          ? Math.min(inputVolumeRef.current * 1.5, 0.4)
          : 0.1; // processing

      // --- Smoothing ---------------------------------------------------
      // Fast attack (0.18), slower release (0.06) → snappy onset, smooth decay
      const alpha = target > smoothVolumeRef.current ? 0.18 : 0.06;
      smoothVolumeRef.current = lerp(smoothVolumeRef.current, target, alpha);
      const vol = smoothVolumeRef.current;

      // Velocity (rate of change) – drives wobble / elastic overshoot
      velocityRef.current = lerp(
        velocityRef.current,
        (vol - prevSmoothedRef.current) * 60, // normalise to per-second
        0.12,
      );
      prevSmoothedRef.current = vol;

      const absVel = Math.abs(velocityRef.current);

      // --- Idle breathing (subtle, always present) ---------------------
      const breathe = Math.sin(t * 1.8) * 0.04 + 1; // 1.0 ± 0.04
      const breatheSlow = Math.sin(t * 0.9) * 0.02;

      // --- Organic wobble via border-radius morphing -------------------
      // 4 independent sine waves at incommensurate frequencies → organic shape
      const wobbleIntensity = clamp(vol * 18 + absVel * 6, 0, 22);
      const r1 = 50 + Math.sin(t * 2.3) * wobbleIntensity;
      const r2 = 50 + Math.sin(t * 3.1 + 1.0) * wobbleIntensity;
      const r3 = 50 + Math.sin(t * 2.7 + 2.0) * wobbleIntensity;
      const r4 = 50 + Math.sin(t * 3.5 + 3.0) * wobbleIntensity;
      const morphRadius = `${r1}% ${100 - r1}% ${r2}% ${100 - r2}% / ${r3}% ${r4}% ${100 - r4}% ${100 - r3}%`;

      // PERF: outer & middle layers are blurred 40-60px – border-radius
      // morphing is completely invisible at that blur level, but the
      // repaint to re-render the blur is very expensive. Only morph the
      // core orb which is crisp and where the wobble is clearly visible.

      // --- Scale per layer (all react, core most, outer least) ---------
      const coreScale = breathe + vol * 0.8 + absVel * 0.15;
      const middleScale = breathe + breatheSlow + vol * 0.5 + absVel * 0.08;
      const outerScale = breathe + breatheSlow + vol * 0.35 + absVel * 0.04;

      // --- Star brightness via CSS custom properties (single write) ----
      const bg = bgRef.current;
      if (bg) {
        const starBase = clamp(0.1 + vol * 0.3, 0.1, 0.4);
        const starPeak = clamp(0.3 + vol * 0.7, 0.3, 1.0);
        bg.style.setProperty("--star-base", String(starBase));
        bg.style.setProperty("--star-peak", String(starPeak));
      }

      // --- Write styles directly (no React setState) -------------------
      // PERF CRITICAL: blurred layers animate ONLY via transform (scale).
      const outer = outerRef.current;
      const middle = middleRef.current;
      const core = coreRef.current;

      if (outer) {
        outer.style.transform = `translate3d(0,0,0) scale(${outerScale})`;
      }

      if (middle) {
        middle.style.transform = `translate3d(0,0,0) scale(${middleScale})`;
      }

      // Morphing core surface
      if (core) {
        core.style.transform = `translate3d(0,0,0) scale(${coreScale})`;
        core.style.borderRadius = morphRadius;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []); // stable – reads from refs only

  // --- Color scheme for current mode ------------------------------------
  const colors = COLOR_SCHEMES[mode] || COLOR_SCHEMES.processing;

  // --- Proportional layer sizes ----------------------------------------
  const outerSize = size;
  const middleSize = size * (200 / 300);
  const coreSize = size * (120 / 300);

  // Shared base for all layers
  const layerBase: React.CSSProperties = {
    position: "absolute",
    borderRadius: "50%",
    backfaceVisibility: "hidden",
  };

  // Glow layers: ONLY transform animates (compositor-only on filtered elems).
  const glowLayerStyle: React.CSSProperties = {
    ...layerBase,
    willChange: "transform",
  };

  // Core (not blurred): safe to animate transform + opacity + border-radius.
  const coreLayerStyle: React.CSSProperties = {
    ...layerBase,
    willChange: "transform, opacity, border-radius",
  };

  return (
    <>
      <style>{ORB_KEYFRAMES}</style>

      {/* Dark space background with star field */}
      <div
        ref={bgRef}
        style={{
          position: "relative",
          width: size + 80,
          height: size + 80,
          borderRadius: 16,
          overflow: "hidden",
          background: "rgb(15, 23, 42)",
          boxShadow: `0 0 60px ${colors.glow}, 0 0 30px ${colors.glow}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // CSS vars for star twinkle – updated by rAF
          ["--star-base" as string]: "0.15",
          ["--star-peak" as string]: "0.4",
        }}
      >
        {/* Star particles – pure CSS animation, zero per-frame JS cost */}
        {stars.map((star, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              borderRadius: "50%",
              background: "white",
              opacity: star.baseOpacity,
              animation: `starTwinkle ${star.dur}s ease-in-out ${star.delay}s infinite`,
              willChange: "opacity",
            }}
          />
        ))}

        {/* Orb container – idle float via CSS keyframe */}
        <div
          ref={containerRef}
          style={{
            position: "relative",
            width: size,
            height: size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "orbIdleFloat 4s ease-in-out infinite",
            zIndex: 1,
          }}
        >
          {/* Layer 1 – Outer Glow (all static except transform) */}
          <div
            ref={outerRef}
            style={{
              ...glowLayerStyle,
              width: outerSize,
              height: outerSize,
              background: colors.outer,
              opacity: 0.45,
              filter: "blur(60px)",
            }}
          />

          {/* Layer 2 – Middle Glow (all static except transform) */}
          <div
            ref={middleRef}
            style={{
              ...glowLayerStyle,
              width: middleSize,
              height: middleSize,
              background: colors.middle,
              opacity: 0.55,
              filter: "blur(40px)",
            }}
          />

          {/* Layer 3 – Core Surface (morphs border-radius) */}
          <div
            ref={coreRef}
            style={{
              ...coreLayerStyle,
              width: coreSize,
              height: coreSize,
              background: colors.core,
              boxShadow: colors.coreInset,
            }}
          />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Memo – shallow comparison allows volume prop changes through so useEffect
// ref-updates fire.  Re-renders are cheap since all visual work is in the
// rAF loop (just ref assignments + static JSX).
// ---------------------------------------------------------------------------

export default React.memo(ChatGPTVoiceOrb);
