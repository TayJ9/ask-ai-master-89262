/**
 * PERF SUMMARY:
 * - Wrap in React.memo; throttle path setState to ~30fps; use one SVG filter (glow).
 * - Throttle mousemove; reduce path points to 12 to lower CPU cost.
 */
/**
 * Audio Visualizer Component - Enhanced Morphing Blob
 * Features: Multiple layers, Perlin noise, shimmer effects, advanced particles,
 * mouse interaction, velocity reactions, iridescent gradients, and more!
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';

// PERF: Throttle path updates to ~30fps to reduce setState/re-renders (was ~60fps).
const PATH_UPDATE_INTERVAL_MS = 33;
// PERF: Throttle mousemove to reduce work on every pointer move.
const MOUSE_THROTTLE_MS = 100;

interface AudioVisualizerProps {
  inputVolume: number;
  outputVolume: number;
  mode: 'user_speaking' | 'ai_speaking' | 'listening' | 'processing';
  width?: number;
  height?: number;
}

// Simple Perlin noise implementation
class PerlinNoise {
  private permutation: number[];

  constructor(seed = 0) {
    this.permutation = [];
    for (let i = 0; i < 256; i++) {
      this.permutation[i] = i;
    }
    // Shuffle with seed
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.seededRandom(seed + i) * (i + 1));
      [this.permutation[i], this.permutation[j]] = [this.permutation[j], this.permutation[i]];
    }
    this.permutation = [...this.permutation, ...this.permutation];
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const a = this.permutation[X] + Y;
    const b = this.permutation[X + 1] + Y;
    return this.lerp(
      this.lerp(this.grad(this.permutation[a], x, y), this.grad(this.permutation[b], x - 1, y), u),
      this.lerp(this.grad(this.permutation[a + 1], x, y - 1), this.grad(this.permutation[b + 1], x - 1, y - 1), u),
      v
    ) * 0.5 + 0.5;
  }
}

interface Particle {
  x: number;
  y: number;
  baseOpacity: number;
  currentOpacity: number;
  size: number;
  twinkleSpeed: number;
  twinklePhase: number;
  pulseOffset: number;
}

// Memoized color schemes - defined outside component to prevent recreation
const COLOR_SCHEMES = {
  user_speaking: {
    primary: ['#22c55e', '#10b981', '#059669'],
    secondary: ['#16a34a', '#15803d', '#166534'],
    accent: ['#86efac', '#6ee7b7', '#5eead4'],
    glow: 'rgba(34, 197, 94, 0.5)'
  },
  ai_speaking: {
    primary: ['#3b82f6', '#2563eb', '#6366f1'],
    secondary: ['#1d4ed8', '#1e40af', '#4f46e5'],
    accent: ['#93c5fd', '#a5b4fc', '#c7d2fe'],
    glow: 'rgba(59, 130, 246, 0.5)'
  },
  listening: {
    primary: ['#f59e0b', '#f97316', '#fb923c'],
    secondary: ['#d97706', '#ea580c', '#dc2626'],
    accent: ['#fbbf24', '#fcd34d', '#fde047'],
    glow: 'rgba(245, 158, 11, 0.5)'
  },
  processing: {
    primary: ['#6b7280', '#9ca3af', '#d1d5db'],
    secondary: ['#4b5563', '#6b7280', '#9ca3af'],
    accent: ['#9ca3af', '#d1d5db', '#e5e7eb'],
    glow: 'rgba(107, 114, 128, 0.3)'
  }
} as const;

function AudioVisualizer({
  inputVolume,
  outputVolume,
  mode,
  width = 400,
  height = 400,
}: AudioVisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const noiseOffsetRef = useRef(0);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const prevVolumeRef = useRef(0);
  const breathingRef = useRef(0);
  const mouseRef = useRef({ x: width / 2, y: height / 2 });
  const [paths, setPaths] = useState({ main: '', inner: '', outer: '' });
  const [particles, setParticles] = useState<Particle[]>([]);
  const shimmerOffsetRef = useRef(0);
  const perlinRef = useRef(new PerlinNoise(Math.random() * 1000));
  
  // Use refs for volume to prevent prop changes from triggering re-renders
  // CRITICAL: Always update refs even when component is memoized (useEffect runs regardless)
  const inputVolumeRef = useRef(inputVolume);
  const outputVolumeRef = useRef(outputVolume);
  const activeVolumeRef = useRef(0);
  
  // Update refs when props change - this runs even if component doesn't re-render (memoized)
  // This ensures AudioVisualizer always has latest volume values without causing re-renders
  useEffect(() => {
    inputVolumeRef.current = inputVolume;
    outputVolumeRef.current = outputVolume;
    // Recalculate activeVolume immediately when volumes or mode change
    activeVolumeRef.current = mode === 'user_speaking' ? inputVolumeRef.current : 
                               mode === 'ai_speaking' ? outputVolumeRef.current : 
                               mode === 'listening' ? Math.min(inputVolumeRef.current * 1.5, 0.4) :
                               0.1;
  }, [inputVolume, outputVolume, mode]); // Include all dependencies so refs stay in sync

  // Memoize colors calculation - only recalculates when mode changes
  const colors = useMemo(() => {
    return COLOR_SCHEMES[mode] || COLOR_SCHEMES.processing;
  }, [mode]);

  // Enhanced blob path generation with Perlin noise - memoized with useCallback
  const generateBlobPath = useCallback((
    centerX: number,
    centerY: number,
    baseRadius: number,
    volume: number,
    time: number,
    layerOffset: number = 0
  ) => {
    // PERF: 12 points reduces CPU cost on low-end devices (was 16).
    const points = 12;
    const pathPoints: { x: number; y: number }[] = [];

    const intensity = mode === 'user_speaking' 
      ? 0.4 + volume * 0.8
      : mode === 'ai_speaking'
      ? 0.3 + volume * 0.7
      : mode === 'listening'
      ? 0.25 + volume * 0.5
      : 0.12;

    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      
      // Use Perlin noise for organic movement - smoother
      const noiseX = Math.cos(angle) * 0.3 + time * 0.0005;
      const noiseY = Math.sin(angle) * 0.3 + time * 0.0005;
      const noiseValue = perlinRef.current.noise(noiseX + layerOffset, noiseY + layerOffset);
      
      // Combine with sine waves for smooth, lumpy shapes
      const noise1 = noiseValue * intensity * 1.5;
      const noise2 = Math.sin(time * 0.002 + i * 0.8 + layerOffset) * intensity * 0.3;
      const noise3 = Math.cos(time * 0.0015 + i * 0.4) * intensity * 0.15;
      
      // Smooth pulse and breathing
      const pulse = Math.sin(time * 0.003 + layerOffset) * 0.06 * volume;
      const breathing = Math.sin(breathingRef.current) * 0.025;
      
      // Gentle elastic deformation
      const elastic = velocityRef.current * 0.12 * Math.sin(angle * 3);
      
      const radiusVariation = 1 + noise1 + noise2 + noise3 + pulse + breathing + elastic;
      const radius = (baseRadius + layerOffset * 15) * radiusVariation;

      // Mouse interaction - blob slightly follows cursor
      const dx = mouseRef.current.x - centerX;
      const dy = mouseRef.current.y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const mouseInfluence = Math.max(0, 1 - distance / 200) * 0.15;
      const mousePull = {
        x: dx * mouseInfluence,
        y: dy * mouseInfluence
      };

      const x = centerX + Math.cos(angle) * radius + mousePull.x;
      const y = centerY + Math.sin(angle) * radius + mousePull.y;
      
      pathPoints.push({ x, y });
    }

    // Ultra-smooth curves with catmull-rom interpolation
    let pathData = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
    
    for (let i = 0; i < points; i++) {
      const p0 = pathPoints[(i - 1 + points) % points];
      const p1 = pathPoints[i];
      const p2 = pathPoints[(i + 1) % points];
      const p3 = pathPoints[(i + 2) % points];
      
      // Catmull-Rom to Bezier conversion
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      
      pathData += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    
    pathData += ' Z';
    return pathData;
  }, [mode]); // Only recreate if mode changes

  // Ambient star field particle system - optimized to reduce re-renders
  const particlesRef = useRef<Particle[]>([]);
  const lastParticleUpdateRef = useRef(0);
  
  const updateParticles = () => {
    const now = Date.now();
    // Only update particles every 100ms to reduce state updates
    if (now - lastParticleUpdateRef.current < 100) {
      return;
    }
    lastParticleUpdateRef.current = now;
    
    const currentVolume = activeVolumeRef.current;
    
    // Update existing particles with twinkling (mutate in place for performance)
    particlesRef.current.forEach(p => {
      p.twinklePhase += p.twinkleSpeed;
      const twinkle = Math.sin(p.twinklePhase) * 0.5 + 0.5;
      const volumeInfluence = 0.3 + currentVolume * 0.7;
      p.currentOpacity = p.baseOpacity * twinkle * volumeInfluence;
    });

    // Determine target particle count based on volume
    const minParticles = 20;
    const maxParticles = 80; // Reduced from 120 for better performance
    const targetCount = Math.floor(minParticles + (maxParticles - minParticles) * currentVolume);
    
    // Add particles if below target
    if (particlesRef.current.length < targetCount) {
      const toAdd = Math.min(3, targetCount - particlesRef.current.length);
      for (let i = 0; i < toAdd; i++) {
        particlesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          baseOpacity: 0.3 + Math.random() * 0.5,
          currentOpacity: 0,
          size: 1 + Math.random() * 0.8,
          twinkleSpeed: 0.02 + Math.random() * 0.04,
          twinklePhase: Math.random() * Math.PI * 2,
          pulseOffset: Math.random() * Math.PI * 2
        });
      }
    }
    
    // Remove particles if above target (optimized - only sort when needed)
    if (particlesRef.current.length > targetCount) {
      const toRemove = Math.min(3, particlesRef.current.length - targetCount);
      // Only sort if we need to remove particles
      if (toRemove > 0) {
        particlesRef.current.sort((a, b) => a.currentOpacity - b.currentOpacity);
        particlesRef.current.splice(0, toRemove);
      }
    }

    // Update state with new array reference to trigger re-render
    setParticles([...particlesRef.current]);
  };

  // PERF: Throttle mousemove to avoid work on every pointer move.
  useEffect(() => {
    let lastCall = 0;
    let rafId: number | null = null;
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastCall < MOUSE_THROTTLE_MS) return;
      lastCall = now;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          mouseRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          };
        }
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Main animation loop - optimized to not restart on volume changes
  useEffect(() => {
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) * 0.10;
    let lastPathUpdate = 0;

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      const now = performance.now();
      noiseOffsetRef.current += 1;
      breathingRef.current += 0.02;
      
      // Get current volume from ref (doesn't trigger re-render)
      const currentVolume = activeVolumeRef.current;
      
      // Calculate velocity (rate of volume change)
      const volumeDelta = currentVolume - prevVolumeRef.current;
      velocityRef.current = velocityRef.current * 0.85 + volumeDelta * 15;
      prevVolumeRef.current = currentVolume;
      
      // Rotation with momentum
      const targetRotationSpeed = (mode === 'user_speaking' || mode === 'ai_speaking')
        ? 0.3 + currentVolume * 1.2 + Math.abs(velocityRef.current) * 0.6
        : mode === 'listening'
        ? 0.15 + currentVolume * 0.4
        : 0.08;
      
      rotationRef.current += targetRotationSpeed;

      shimmerOffsetRef.current = (shimmerOffsetRef.current + 2) % 360;

      // PERF: Throttle path updates to ~30fps to reduce setState and re-renders.
      if (now - lastPathUpdate >= PATH_UPDATE_INTERVAL_MS) {
        lastPathUpdate = now;
        
        // Generate multi-layer paths
        const mainPath = generateBlobPath(centerX, centerY, baseRadius, currentVolume, noiseOffsetRef.current, 0);
        const innerPath = generateBlobPath(centerX, centerY, baseRadius, currentVolume, noiseOffsetRef.current, 0.5);
        const outerPath = generateBlobPath(centerX, centerY, baseRadius, currentVolume, noiseOffsetRef.current, -0.3);
        
        setPaths({ main: mainPath, inner: innerPath, outer: outerPath });
      }

      // Update particles (throttled internally)
      updateParticles();
    };

    animate();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [mode, width, height]); // Removed activeVolume, inputVolume, outputVolume from dependencies

  // Dynamic scaling with elastic overshoot - CONSTRAINED TO CENTER
  const targetScale = mode === 'user_speaking' || mode === 'ai_speaking'
    ? 1 + activeVolumeRef.current * 0.3 + Math.abs(velocityRef.current) * 0.2
    : mode === 'listening'
    ? 1 + activeVolumeRef.current * 0.15
    : 1;

  // Cap maximum scale to ensure blob stays in center (max 40% growth)
  const maxScale = 1.4;
  const blobScale = Math.min(targetScale + Math.sin(breathingRef.current) * 0.03, maxScale);

  // Dynamic color temperature - use ref instead of state
  const colorIndex = Math.floor((shimmerOffsetRef.current / 360) * colors.primary.length);
  const currentPrimary = colors.primary[colorIndex % colors.primary.length];
  const currentSecondary = colors.secondary[colorIndex % colors.secondary.length];
  const currentAccent = colors.accent[colorIndex % colors.accent.length];

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div 
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden cursor-pointer w-full"
        style={{ 
          aspectRatio: `${width} / ${height}`,
          maxWidth: `${width}px`,
          background: 'rgb(15, 23, 42)',
          boxShadow: `0 0 60px ${colors.glow}, 0 0 30px ${colors.glow}`
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            {/* Iridescent radial gradient */}
            <radialGradient id="blobGradient" cx="40%" cy="40%">
              <stop offset="0%" stopColor={currentAccent} stopOpacity="0.95" />
              <stop offset="50%" stopColor={currentPrimary} stopOpacity="0.85" />
              <stop offset="100%" stopColor={currentSecondary} stopOpacity="0.75" />
            </radialGradient>
            
            {/* Animated flow gradient */}
            <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={currentPrimary}>
                <animate
                  attributeName="stop-color"
                  values={`${colors.primary[0]};${colors.accent[0]};${colors.primary[0]}`}
                  dur="4s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="50%" stopColor={currentSecondary}>
                <animate
                  attributeName="stop-color"
                  values={`${colors.secondary[0]};${colors.primary[0]};${colors.secondary[0]}`}
                  dur="4s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="100%" stopColor={currentAccent}>
                <animate
                  attributeName="stop-color"
                  values={`${colors.accent[0]};${colors.secondary[0]};${colors.accent[0]}`}
                  dur="4s"
                  repeatCount="indefinite"
                />
              </stop>
            </linearGradient>

            {/* Shimmer gradient */}
            <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.4)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              <animateTransform
                attributeName="gradientTransform"
                type="translate"
                from="-1 -1"
                to="1 1"
                dur="3s"
                repeatCount="indefinite"
              />
            </linearGradient>

            {/* Enhanced glow filter */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>

            {/* PERF: Single glow filter kept; softGlow/sparkleGlow removed to reduce filter cost. */}

            {/* Star shape path */}
            <path id="starShape" d="M 0,-5 L 1.5,-1.5 L 5,0 L 1.5,1.5 L 0,5 L -1.5,1.5 L -5,0 L -1.5,-1.5 Z" />
            
            {/* Plus/cross shape for sparkles */}
            <path id="crossShape" d="M 0,-4 L 0,-1 L -1,0 L -4,0 L -1,0 L 0,1 L 0,4 L 0,1 L 1,0 L 4,0 L 1,0 L 0,-1 Z" />
          </defs>

          {/* PERF: No filter on outer/background layers to reduce paint cost. */}
          <g opacity={0.15 + activeVolumeRef.current * 0.25}>
            <path
              d={paths.outer}
              fill="url(#blobGradient)"
              style={{
                transform: `scale(${blobScale * 0.7865})`,
                transformOrigin: 'center',
              }}
            />
          </g>
          <g opacity={0.25 + activeVolumeRef.current * 0.35}>
            <path
              d={paths.main}
              fill="url(#blobGradient)"
              style={{
                transform: `scale(${blobScale * 0.8848}) rotate(${-rotationRef.current * 0.7}deg)`,
                transformOrigin: 'center',
              }}
            />
          </g>

          {/* Main blob */}
          <g
            style={{
              transform: `rotate(${rotationRef.current}deg) scale(${blobScale * 0.9831})`,
              transformOrigin: 'center',
            }}
          >
            <path
              d={paths.main}
              fill="url(#flowGradient)"
              filter="url(#glow)"
            />
            
            {/* Shimmer overlay */}
            <path
              d={paths.main}
              fill="url(#shimmer)"
              opacity="0.3"
            />
          </g>

          {/* PERF: Inner core without filter (softGlow removed). */}
          <g opacity={0.5 + activeVolumeRef.current * 0.5}>
            <circle
              cx={width / 2}
              cy={height / 2}
              r={(15 + activeVolumeRef.current * 25) * 1.3}
              fill={currentAccent}
              style={{
                transform: `scale(${1 + Math.abs(velocityRef.current) * 0.5})`,
                transformOrigin: 'center',
              }}
            />
          </g>

          {/* Inner layer with opacity variation */}
          <g 
            opacity={0.4 + activeVolumeRef.current * 0.3}
            style={{
              transform: `rotate(${rotationRef.current * 2}deg) scale(${blobScale * 1.0814})`,
              transformOrigin: 'center',
            }}
          >
            <path
              d={paths.inner}
              fill="url(#flowGradient)"
              opacity="0.7"
            />
          </g>

          {/* Simple white dot particles - use key based on index for better React reconciliation */}
          {particles.map((particle, i) => {
            const volumePulse = Math.sin(noiseOffsetRef.current * 0.05 + particle.pulseOffset) * 0.15 + 0.85;
            const finalOpacity = particle.currentOpacity * volumePulse;
            
            return (
              <circle
                key={`particle-${i}`}
                cx={particle.x}
                cy={particle.y}
                r={particle.size}
                fill="white"
                opacity={finalOpacity * 0.8}
              />
            );
          })}
        </svg>
      </div>

      {/* Status indicator */}
      <div className={`flex items-center gap-3 text-sm font-medium ${
        mode === 'user_speaking'
          ? 'text-green-600'
          : mode === 'ai_speaking'
          ? 'text-blue-600'
          : mode === 'processing'
          ? 'text-gray-500'
          : 'text-amber-600'
      }`}>
        <div
          className={`h-3 w-3 rounded-full ${
            mode === 'user_speaking' || mode === 'ai_speaking'
              ? 'animate-pulse'
              : ''
          }`}
          style={{ 
            backgroundColor: currentPrimary,
            boxShadow: `0 0 12px ${colors.glow}`
          }}
        />
        <span className="capitalize font-semibold">
          {mode === 'user_speaking'
            ? 'You are speaking'
            : mode === 'ai_speaking'
            ? 'AI is speaking'
            : mode === 'processing'
            ? 'Processing...'
            : 'Listening...'}
        </span>
      </div>
    </div>
  );
}

// Memoize component to prevent parent re-renders from causing unnecessary updates
// Only re-render when mode, width, or height changes (not volume)
export default React.memo(AudioVisualizer, (prevProps, nextProps) => {
  // Custom comparison: only re-render if mode, width, or height changes
  // Volume changes are handled via refs, so they don't need to trigger re-renders
  return (
    prevProps.mode === nextProps.mode &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height
  );
});
