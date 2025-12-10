/**
 * Audio Visualizer Component
 * Displays real-time audio waveform visualization using HTML Canvas
 */

import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  inputAnalyser?: AnalyserNode | null;
  outputAnalyser?: AnalyserNode | null;
  mode: 'user_speaking' | 'ai_speaking' | 'listening' | 'processing';
  width?: number;
  height?: number;
  barCount?: number;
}

export default function AudioVisualizer({
  inputAnalyser,
  outputAnalyser,
  mode,
  width = 400,
  height = 100,
  barCount = 50,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // Determine which analyser to use based on mode
  // Use input analyser for user speaking, output analyser for AI speaking
  // For listening/processing, prefer output analyser (may show AI audio if any)
  const activeAnalyser = mode === 'user_speaking' ? inputAnalyser : outputAnalyser;

  // Determine color based on mode
  const getColor = () => {
    switch (mode) {
      case 'user_speaking':
        return '#22c55e'; // Green - User Speaking
      case 'ai_speaking':
        return '#3b82f6'; // Blue - AI Speaking
      case 'listening':
      case 'processing':
      default:
        return '#6b7280'; // Gray - Inactive/Listening
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeAnalyser) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Create data array for frequency data
    const bufferLength = activeAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    dataArrayRef.current = dataArray;

    // Animation function
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      // Get frequency data
      activeAnalyser.getByteFrequencyData(dataArray);

      // Clear canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, width, height);

      // Draw bars
      const barWidth = width / barCount;
      const color = getColor();
      
      // Calculate average volume for overall visualization
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Draw bars based on frequency data
      for (let i = 0; i < barCount; i++) {
        // Map frequency bin index to data array
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const barHeight = (dataArray[dataIndex] / 255) * height * 0.8;

        // Add some smoothing and visual appeal
        const x = i * barWidth;
        const y = height - barHeight;

        // Create gradient for bars
        const gradient = ctx.createLinearGradient(x, 0, x, height);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, `${color}80`);

        ctx.fillStyle = gradient;
        ctx.fillRect(x + barWidth * 0.1, y, barWidth * 0.8, barHeight);

        // Add glow effect for active modes
        if (mode === 'user_speaking' || mode === 'ai_speaking') {
          ctx.shadowBlur = 10;
          ctx.shadowColor = color;
        }
      }

      // Draw waveform overlay (optional - shows overall volume)
      if (mode === 'user_speaking' || mode === 'ai_speaking') {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 255.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
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
  }, [activeAnalyser, mode, width, height, barCount]);

  // Show placeholder when no analyser is available
  if (!activeAnalyser) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-muted"
        style={{ width, height }}
      >
        <span className="text-sm text-muted-foreground">No audio data</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        className="rounded-lg border border-border bg-background"
        style={{ width, height }}
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div
          className="h-2 w-2 rounded-full"
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

