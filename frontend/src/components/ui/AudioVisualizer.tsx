/**
 * Audio Visualizer Component - Enhanced Morphing Blob
 * Features: Multiple layers, Perlin noise, shimmer effects, advanced particles,
 * mouse interaction, velocity reactions, iridescent gradients, and more!
 */

import { useEffect, useRef, useState } from 'react';

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

export default function AudioVisualizer({
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
  const [shimmerOffset, setShimmerOffset] = useState(0);
  const perlinRef = useRef(new PerlinNoise(Math.random() * 1000));

  const activeVolume = mode === 'user_speaking' ? inputVolume : 
                       mode === 'ai_speaking' ? outputVolume : 
                       mode === 'listening' ? Math.min(inputVolume * 1.5, 0.4) :
                       0.1;

  // Color schemes with iridescent variations
  const getColors = () => {
    const baseColors = {
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
    };
    return baseColors[mode] || baseColors.processing;
  };

  const colors = getColors();

  // Enhanced blob path generation with Perlin noise
  const generateBlobPath = (
    centerX: number,
    centerY: number,
    baseRadius: number,
    volume: number,
    time: number,
    layerOffset: number = 0
  ) => {
    const points = 16; // Fewer points for smoother, lumpier shapes
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
  };

  // Ambient star field particle system - creates/updates starfield based on volume
  const updateParticles = () => {
    setParticles(prev => {
      // Update existing particles with twinkling
      const updated = prev.map(p => {
        // Update twinkle phase
        p.twinklePhase += p.twinkleSpeed;
        
        // Calculate opacity based on twinkle and global volume
        const twinkle = Math.sin(p.twinklePhase) * 0.5 + 0.5; // 0 to 1
        const volumeInfluence = 0.3 + activeVolume * 0.7; // Volume affects brightness
        
        p.currentOpacity = p.baseOpacity * twinkle * volumeInfluence;
        
        return p;
      });

      // Determine target particle count based on volume - EVEN MORE STARS!
      const minParticles = 20;
      const maxParticles = 120;
      const targetCount = Math.floor(minParticles + (maxParticles - minParticles) * activeVolume);
      
      // Add particles if below target
      if (updated.length < targetCount) {
        const toAdd = Math.min(5, targetCount - updated.length); // Add faster
        for (let i = 0; i < toAdd; i++) {
          updated.push({
            x: Math.random() * width,
            y: Math.random() * height,
            baseOpacity: 0.3 + Math.random() * 0.5,
            currentOpacity: 0,
            size: 1 + Math.random() * 0.8, // Tiny dots: 1-1.8px
            twinkleSpeed: 0.02 + Math.random() * 0.04,
            twinklePhase: Math.random() * Math.PI * 2,
            pulseOffset: Math.random() * Math.PI * 2
          });
        }
      }
      
      // Remove particles if above target (fade out the dimmest ones)
      if (updated.length > targetCount) {
        const toRemove = Math.min(4, updated.length - targetCount);
        // Sort by current opacity and remove dimmest
        updated.sort((a, b) => a.currentOpacity - b.currentOpacity);
        updated.splice(0, toRemove);
      }

      return updated;
    });
  };

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        mouseRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Main animation loop
  useEffect(() => {
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) * 0.10;

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      noiseOffsetRef.current += 1;
      breathingRef.current += 0.02;
      
      // Calculate velocity (rate of volume change) - MORE MOMENTUM
      const volumeDelta = activeVolume - prevVolumeRef.current;
      velocityRef.current = velocityRef.current * 0.85 + volumeDelta * 15; // Increased momentum
      prevVolumeRef.current = activeVolume;
      
      // Rotation with momentum - MORE DRAMATIC
      const targetRotationSpeed = (mode === 'user_speaking' || mode === 'ai_speaking')
        ? 0.3 + activeVolume * 1.2 + Math.abs(velocityRef.current) * 0.6
        : mode === 'listening'
        ? 0.15 + activeVolume * 0.4
        : 0.08;
      
      rotationRef.current += targetRotationSpeed;

      // Update shimmer
      setShimmerOffset(prev => (prev + 2) % 360);

      // Generate multi-layer paths
      const mainPath = generateBlobPath(centerX, centerY, baseRadius, activeVolume, noiseOffsetRef.current, 0);
      const innerPath = generateBlobPath(centerX, centerY, baseRadius, activeVolume, noiseOffsetRef.current, 0.5);
      const outerPath = generateBlobPath(centerX, centerY, baseRadius, activeVolume, noiseOffsetRef.current, -0.3);
      
      setPaths({ main: mainPath, inner: innerPath, outer: outerPath });

      // Update particles
      updateParticles();
    };

    animate();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [inputVolume, outputVolume, mode, width, height, activeVolume]);

  // Dynamic scaling with elastic overshoot - CONSTRAINED TO CENTER
  const targetScale = mode === 'user_speaking' || mode === 'ai_speaking'
    ? 1 + activeVolume * 0.3 + Math.abs(velocityRef.current) * 0.2
    : mode === 'listening'
    ? 1 + activeVolume * 0.15
    : 1;

  // Cap maximum scale to ensure blob stays in center (max 40% growth)
  const maxScale = 1.4;
  const blobScale = Math.min(targetScale + Math.sin(breathingRef.current) * 0.03, maxScale);

  // Dynamic color temperature
  const colorIndex = Math.floor((shimmerOffset / 360) * colors.primary.length);
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

            {/* Soft glow for inner core */}
            <filter id="softGlow">
              <feGaussianBlur stdDeviation="8" result="blur"/>
              <feFlood floodColor={currentAccent} floodOpacity="0.8"/>
              <feComposite in2="blur" operator="in"/>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>

            {/* Sparkle glow - intense sharp glow */}
            <filter id="sparkleGlow">
              <feGaussianBlur stdDeviation="2" result="blur1"/>
              <feGaussianBlur stdDeviation="6" result="blur2"/>
              <feMerge>
                <feMergeNode in="blur2"/>
                <feMergeNode in="blur1"/>
                <feMergeNode in="blur1"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>

            {/* Star shape path */}
            <path id="starShape" d="M 0,-5 L 1.5,-1.5 L 5,0 L 1.5,1.5 L 0,5 L -1.5,1.5 L -5,0 L -1.5,-1.5 Z" />
            
            {/* Plus/cross shape for sparkles */}
            <path id="crossShape" d="M 0,-4 L 0,-1 L -1,0 L -4,0 L -1,0 L 0,1 L 0,4 L 0,1 L 1,0 L 4,0 L 1,0 L 0,-1 Z" />
          </defs>

          {/* Outer glow layer */}
          <g opacity={0.15 + activeVolume * 0.25}>
            <path
              d={paths.outer}
              fill="url(#blobGradient)"
              style={{
                transform: `scale(${blobScale * 0.7865})`,
                transformOrigin: 'center',
                filter: 'blur(12px)',
              }}
            />
          </g>

          {/* Background glow layer */}
          <g opacity={0.25 + activeVolume * 0.35}>
            <path
              d={paths.main}
              fill="url(#blobGradient)"
              style={{
                transform: `scale(${blobScale * 0.8848}) rotate(${-rotationRef.current * 0.7}deg)`,
                transformOrigin: 'center',
                filter: 'blur(10px)',
              }}
            />
          </g>

          {/* Main blob */}
          <g
            style={{
              transform: `rotate(${rotationRef.current}deg) scale(${blobScale * 0.9831})`,
              transformOrigin: 'center',
              transition: 'transform 0.1s ease-out',
            }}
          >
            <path
              d={paths.main}
              fill="url(#flowGradient)"
              filter="url(#glow)"
              style={{
                transition: 'd 0.2s ease-out',
              }}
            />
            
            {/* Shimmer overlay */}
            <path
              d={paths.main}
              fill="url(#shimmer)"
              opacity="0.3"
            />
          </g>

          {/* Inner core glow */}
          <g opacity={0.5 + activeVolume * 0.5}>
            <circle
              cx={width / 2}
              cy={height / 2}
              r={(15 + activeVolume * 25) * 1.3}
              fill={currentAccent}
              filter="url(#softGlow)"
              style={{
                transform: `scale(${1 + Math.abs(velocityRef.current) * 0.5})`,
                transformOrigin: 'center',
                transition: 'transform 0.15s ease-out',
              }}
            />
          </g>

          {/* Inner layer with opacity variation */}
          <g 
            opacity={0.4 + activeVolume * 0.3}
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

          {/* Simple white dot particles */}
          {particles.map((particle, i) => {
            const volumePulse = Math.sin(noiseOffsetRef.current * 0.05 + particle.pulseOffset) * 0.15 + 0.85;
            const finalOpacity = particle.currentOpacity * volumePulse;
            
            return (
              <circle
                key={i}
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
