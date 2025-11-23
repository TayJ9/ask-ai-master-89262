import { useEffect } from "react";

interface AnimatedBackgroundProps {
  className?: string;
  children?: React.ReactNode;
}

export default function AnimatedBackground({ className = "", children }: AnimatedBackgroundProps) {
  // Inject CSS keyframes and styles once
  useEffect(() => {
    const styleId = 'animated-background-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes mesh-move-1 {
        0%, 100% {
          transform: translate(0, 0) scale(1);
        }
        33% {
          transform: translate(30px, -50px) scale(1.1);
        }
        66% {
          transform: translate(-20px, 30px) scale(0.9);
        }
      }
      
      @keyframes mesh-move-2 {
        0%, 100% {
          transform: translate(0, 0) scale(1);
        }
        33% {
          transform: translate(-40px, 20px) scale(0.95);
        }
        66% {
          transform: translate(50px, -30px) scale(1.05);
        }
      }
      
      @keyframes mesh-move-3 {
        0%, 100% {
          transform: translate(0, 0) scale(1);
        }
        33% {
          transform: translate(25px, 40px) scale(1.08);
        }
        66% {
          transform: translate(-35px, -25px) scale(0.92);
        }
      }
      
      @keyframes mesh-move-4 {
        0%, 100% {
          transform: translate(0, 0) scale(1);
        }
        33% {
          transform: translate(-30px, -40px) scale(1.12);
        }
        66% {
          transform: translate(40px, 25px) scale(0.88);
        }
      }
      
      @keyframes mesh-pulse {
        0%, 100% {
          opacity: 0.3;
        }
        50% {
          opacity: 0.5;
        }
      }
      
      @keyframes wave-flow-1 {
        0% {
          transform: translateX(0);
        }
        100% {
          transform: translateX(-100px);
        }
      }
      
      @keyframes wave-flow-2 {
        0% {
          transform: translateX(0);
        }
        100% {
          transform: translateX(100px);
        }
      }
      
      .mesh-blob-1 {
        animation: mesh-move-1 20s ease-in-out infinite, mesh-pulse 8s ease-in-out infinite;
        animation-delay: 0s, 0s;
      }
      
      .mesh-blob-2 {
        animation: mesh-move-2 18s ease-in-out infinite, mesh-pulse 10s ease-in-out infinite;
        animation-delay: 0s, 2s;
      }
      
      .mesh-blob-3 {
        animation: mesh-move-3 22s ease-in-out infinite, mesh-pulse 9s ease-in-out infinite;
        animation-delay: 0s, 4s;
      }
      
      .mesh-blob-4 {
        animation: mesh-move-4 19s ease-in-out infinite, mesh-pulse 11s ease-in-out infinite;
        animation-delay: 0s, 1s;
      }
      
      .wave-layer-1 {
        animation: wave-flow-1 25s linear infinite;
      }
      
      .wave-layer-2 {
        animation: wave-flow-2 30s linear infinite;
      }
      
      @media (prefers-reduced-motion: reduce) {
        .mesh-blob-1,
        .mesh-blob-2,
        .mesh-blob-3,
        .mesh-blob-4 {
          animation: none;
        }
        
        .wave-layer-1,
        .wave-layer-2 {
          animation: none;
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  return (
    <div className={`relative min-h-screen overflow-hidden ${className}`}>
      {/* Gradient Mesh Blobs */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Blob 1 - Top Left */}
        <div
          className="mesh-blob-1 absolute w-[500px] h-[500px] rounded-full blur-3xl will-change-transform"
          style={{
            background: 'radial-gradient(circle, hsl(217, 91%, 60%) 0%, transparent 70%)',
            top: '-10%',
            left: '-10%',
            transform: 'translateZ(0)',
          }}
        />
        
        {/* Blob 2 - Top Right */}
        <div
          className="mesh-blob-2 absolute w-[450px] h-[450px] rounded-full blur-3xl will-change-transform"
          style={{
            background: 'radial-gradient(circle, hsl(262, 83%, 58%) 0%, transparent 70%)',
            top: '-5%',
            right: '-5%',
            transform: 'translateZ(0)',
          }}
        />
        
        {/* Blob 3 - Bottom Left */}
        <div
          className="mesh-blob-3 absolute w-[480px] h-[480px] rounded-full blur-3xl will-change-transform"
          style={{
            background: 'radial-gradient(circle, hsl(217, 91%, 70%) 0%, transparent 70%)',
            bottom: '-10%',
            left: '10%',
            transform: 'translateZ(0)',
          }}
        />
        
        {/* Blob 4 - Bottom Right */}
        <div
          className="mesh-blob-4 absolute w-[420px] h-[420px] rounded-full blur-3xl will-change-transform"
          style={{
            background: 'radial-gradient(circle, hsl(262, 83%, 65%) 0%, transparent 70%)',
            bottom: '-5%',
            right: '5%',
            transform: 'translateZ(0)',
          }}
        />
      </div>

      {/* Wave Pattern Overlay */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        {/* Wave Layer 1 */}
        <svg
          className="wave-layer-1 absolute bottom-0 w-full h-full will-change-transform"
          style={{ transform: 'translateZ(0)' }}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path
            d="M0,60 C300,100 600,20 900,60 C1050,80 1150,40 1200,60 L1200,120 L0,120 Z"
            fill="url(#waveGradient1)"
            opacity="0.6"
          />
          <defs>
            <linearGradient id="waveGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(217, 91%, 60%)" stopOpacity="0.4" />
              <stop offset="50%" stopColor="hsl(262, 83%, 58%)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity="0.4" />
            </linearGradient>
          </defs>
        </svg>

        {/* Wave Layer 2 - Reversed */}
        <svg
          className="wave-layer-2 absolute bottom-0 w-full h-full will-change-transform"
          style={{ transform: 'translateZ(0)' }}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path
            d="M0,80 C300,40 600,100 900,80 C1050,60 1150,100 1200,80 L1200,120 L0,120 Z"
            fill="url(#waveGradient2)"
            opacity="0.5"
          />
          <defs>
            <linearGradient id="waveGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(262, 83%, 58%)" stopOpacity="0.3" />
              <stop offset="50%" stopColor="hsl(217, 91%, 60%)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="hsl(262, 83%, 58%)" stopOpacity="0.3" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Base gradient overlay for smooth blending - Light mode */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background: 'linear-gradient(180deg, hsl(220, 25%, 97%) 0%, hsl(217, 91%, 95%) 100%)',
        }}
      />

      {/* Dark mode overlay */}
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background: 'linear-gradient(180deg, hsl(220, 40%, 8%) 0%, hsl(217, 91%, 15%) 100%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

