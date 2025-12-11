/**
 * Audio Visualizer Component
 * Displays real-time audio visualization using volume levels
 */

import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  inputVolume: number;   // 0-1 from user microphone
  outputVolume: number;  // 0-1 from AI audio output
  mode: 'user_speaking' | 'ai_speaking' | 'listening' | 'processing';
  width?: number;
  height?: number;
  barCount?: number;
}

export default function AudioVisualizer({
  inputVolume,
  outputVolume,
  mode,
  width = 400,
  height = 100,
  barCount = 50,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const barsRef = useRef<number[]>(new Array(barCount).fill(0));
  const targetBarsRef = useRef<number[]>(new Array(barCount).fill(0));

  // Determine which volume to use based on mode
  const activeVolume = mode === 'user_speaking' ? inputVolume : 
                       mode === 'ai_speaking' ? outputVolume : 
                       Math.max(inputVolume, outputVolume) * 0.3;

  // Determine color based on mode
  const getColor = () => {
    switch (mode) {
      case 'user_speaking':
        return '#22c55e'; // Green - User Speaking
      case 'ai_speaking':
        return '#3b82f6'; // Blue - AI Speaking
      case 'listening':
        return '#f59e0b'; // Amber - Listening
      case 'processing':
      default:
        return '#6b7280'; // Gray - Processing
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Animation function
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      // Generate target bar heights based on volume with some randomness
      const isActive = mode === 'user_speaking' || mode === 'ai_speaking';
      
      for (let i = 0; i < barCount; i++) {
        if (isActive && activeVolume > 0.01) {
          // Create organic wave-like motion with volume influence
          const wave = Math.sin(Date.now() * 0.003 + i * 0.3) * 0.3 + 0.7;
          const noise = Math.random() * 0.3;
          targetBarsRef.current[i] = activeVolume * wave * (0.7 + noise) * height * 0.8;
        } else {
          // Minimal idle animation
          const idleWave = Math.sin(Date.now() * 0.001 + i * 0.2) * 0.5 + 0.5;
          targetBarsRef.current[i] = 2 + idleWave * 4;
        }
      }

      // Smooth interpolation towards target values
      const smoothing = 0.15;
      for (let i = 0; i < barCount; i++) {
        barsRef.current[i] += (targetBarsRef.current[i] - barsRef.current[i]) * smoothing;
      }

      // Clear canvas with slight fade for trail effect
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)'; // Dark background
      ctx.fillRect(0, 0, width, height);

      // Draw bars
      const barWidth = width / barCount;
      const color = getColor();
      const barGap = 2;

      for (let i = 0; i < barCount; i++) {
        const barHeight = Math.max(2, barsRef.current[i]);
        const x = i * barWidth;
        const y = (height - barHeight) / 2; // Center vertically

        // Create gradient for bars
        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, `${color}60`);

        ctx.fillStyle = gradient;
        
        // Draw rounded bar
        const radius = Math.min(barWidth * 0.3, 3);
        const actualBarWidth = barWidth - barGap;
        
        ctx.beginPath();
        ctx.roundRect(x + barGap / 2, y, actualBarWidth, barHeight, radius);
        ctx.fill();

        // Add glow effect for active modes
        if (isActive && activeVolume > 0.1) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = color;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    };

    // Start animation
    animate();

    // Cleanup
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeVolume, mode, width, height, barCount]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        className="rounded-lg border border-border"
        style={{ width, height, background: 'rgb(15, 23, 42)' }}
      />
      <div className={`flex items-center gap-2 text-xs font-medium ${
        mode === 'user_speaking'
          ? 'text-green-600'
          : mode === 'ai_speaking'
          ? 'text-blue-600'
          : mode === 'processing'
          ? 'text-gray-500'
          : 'text-amber-600'
      }`}>
        <div
          className={`h-2 w-2 rounded-full ${
            mode === 'user_speaking' || mode === 'ai_speaking'
              ? 'animate-pulse'
              : ''
          }`}
          style={{ backgroundColor: getColor() }}
        />
        <span className="capitalize">
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
