/**
 * PERF SUMMARY:
 * - Reduce mesh blobs to 3 and particles to 5; less blur (blur-lg).
 * - Remove grain overlay (SVG feTurbulence is expensive).
 * - Limit will-change to one primary blob layer.
 */
import { useEffect } from "react";

interface AnimatedBackgroundProps {
  className?: string;
  children?: React.ReactNode;
  /** When true, decorative layers are viewport-fixed to prevent bottom-of-page scroll artifacts. */
  fixedDecor?: boolean;
}

export default function AnimatedBackground({ className = "", children, fixedDecor = false }: AnimatedBackgroundProps) {
  // PERF: Inject keyframes once; only 3 blob + 2 particle animations to reduce composite cost.
  useEffect(() => {
    const styleId = 'animated-background-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes mesh-move-1 {
        0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
        33% { transform: translate(40px, -60px) scale(1.15) rotate(5deg); }
        66% { transform: translate(-30px, 40px) scale(0.85) rotate(-5deg); }
      }
      @keyframes mesh-move-2 {
        0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
        33% { transform: translate(-50px, 30px) scale(0.9) rotate(-8deg); }
        66% { transform: translate(60px, -40px) scale(1.1) rotate(8deg); }
      }
      @keyframes mesh-move-3 {
        0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
        33% { transform: translate(35px, 50px) scale(1.12) rotate(6deg); }
        66% { transform: translate(-45px, -35px) scale(0.88) rotate(-6deg); }
      }
      @keyframes mesh-pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 0.9; }
      }
      @keyframes particle-float-1 {
        0%, 100% { transform: translate(0, 0); opacity: 0.3; }
        50% { transform: translate(20px, -25px); opacity: 0.5; }
      }
      @keyframes particle-float-2 {
        0%, 100% { transform: translate(0, 0); opacity: 0.2; }
        50% { transform: translate(-15px, 20px); opacity: 0.4; }
      }
      .mesh-blob-1 {
        animation: mesh-move-1 20s ease-in-out infinite, mesh-pulse 8s ease-in-out infinite;
      }
      .mesh-blob-2 {
        animation: mesh-move-2 18s ease-in-out infinite, mesh-pulse 9s ease-in-out infinite;
        animation-delay: 0s, 2s;
      }
      .mesh-blob-3 {
        animation: mesh-move-3 22s ease-in-out infinite, mesh-pulse 8.5s ease-in-out infinite;
        animation-delay: 0s, 4s;
      }
      .particle-1 { animation: particle-float-1 25s ease-in-out infinite; }
      .particle-2 { animation: particle-float-2 28s ease-in-out infinite; animation-delay: 3s; }
      @media (prefers-reduced-motion: reduce) {
        .mesh-blob-1, .mesh-blob-2, .mesh-blob-3, .particle-1, .particle-2 { animation: none; }
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) existingStyle.remove();
    };
  }, []);

  const decorLayers = (
    <>
      {/* PERF: 3 blobs only; blur-lg instead of blur-2xl; will-change on first blob only. */}
      <div className="absolute inset-0 overflow-hidden z-[1]">
        <div
          className="mesh-blob-1 absolute w-[700px] h-[700px] rounded-full blur-lg will-change-transform"
          style={{
            background: 'radial-gradient(circle, hsl(30, 100%, 68%) 0%, hsl(30, 100%, 58%) 25%, hsl(30, 100%, 48%) 50%, transparent 70%)',
            top: '-15%',
            left: '-15%',
            transform: 'translateZ(0)',
          }}
        />
        <div
          className="mesh-blob-2 absolute w-[650px] h-[650px] rounded-full blur-lg"
          style={{
            background: 'radial-gradient(circle, hsl(20, 100%, 68%) 0%, hsl(20, 100%, 58%) 25%, hsl(20, 100%, 48%) 50%, transparent 70%)',
            top: '-10%',
            right: '-10%',
            transform: 'translateZ(0)',
          }}
        />
        <div
          className="mesh-blob-3 absolute w-[680px] h-[680px] rounded-full blur-lg"
          style={{
            background: 'radial-gradient(circle, hsl(45, 100%, 65%) 0%, hsl(45, 100%, 55%) 25%, hsl(45, 100%, 45%) 50%, transparent 70%)',
            bottom: '-15%',
            left: '5%',
            transform: 'translateZ(0)',
          }}
        />
      </div>

      {/* PERF: 5 particles only (was 14) to reduce composite layers. */}
      <div className="absolute inset-0 overflow-hidden z-[2]">
        <div className="particle-1 absolute w-4 h-4 rounded-full bg-white/40" style={{ top: '20%', left: '15%' }} />
        <div className="particle-2 absolute w-3 h-3 rounded-full bg-white/45" style={{ top: '60%', right: '20%' }} />
        <div className="particle-1 absolute w-3.5 h-3.5 rounded-full bg-white/35" style={{ bottom: '30%', left: '25%' }} />
        <div className="particle-2 absolute w-3 h-3 rounded-full bg-white/40" style={{ top: '45%', right: '35%' }} />
        <div className="particle-1 absolute w-3 h-3 rounded-full bg-white/35" style={{ bottom: '40%', right: '15%' }} />
      </div>

      <div
        className="absolute inset-0 dark:hidden z-[3]"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.2) 100%)',
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block z-[3]"
        style={{
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.5) 0%, rgba(30, 41, 59, 0.4) 50%, rgba(15, 23, 42, 0.5) 100%)',
        }}
      />
    </>
  );

  /* When fixedDecor is true, decor is in a fixed viewport box; omit overflow-hidden on root
     to avoid bottom-of-page clipping/paint artifacts during scroll (Results page). */
  return (
    <div
      className={`relative min-h-screen ${fixedDecor ? '' : 'overflow-hidden'} ${className}`}
      style={{ backgroundColor: '#D4A574', transform: 'translateZ(0)' }}
    >
      {fixedDecor ? (
        <div
          className="fixed inset-0 w-full pointer-events-none z-0"
          style={{ height: '100vh' }}
          aria-hidden
        >
          {decorLayers}
        </div>
      ) : (
        decorLayers
      )}

      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

