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
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        33% {
          transform: translate(40px, -60px) scale(1.15) rotate(5deg);
        }
        66% {
          transform: translate(-30px, 40px) scale(0.85) rotate(-5deg);
        }
      }
      
      @keyframes mesh-move-2 {
        0%, 100% {
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        33% {
          transform: translate(-50px, 30px) scale(0.9) rotate(-8deg);
        }
        66% {
          transform: translate(60px, -40px) scale(1.1) rotate(8deg);
        }
      }
      
      @keyframes mesh-move-3 {
        0%, 100% {
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        33% {
          transform: translate(35px, 50px) scale(1.12) rotate(6deg);
        }
        66% {
          transform: translate(-45px, -35px) scale(0.88) rotate(-6deg);
        }
      }
      
      @keyframes mesh-move-4 {
        0%, 100% {
          transform: translate(0, 0) scale(1) rotate(0deg);
        }
        33% {
          transform: translate(-40px, -50px) scale(1.18) rotate(-7deg);
        }
        66% {
          transform: translate(50px, 35px) scale(0.82) rotate(7deg);
        }
      }
      
      @keyframes mesh-pulse {
        0%, 100% {
          opacity: 0.5;
        }
        50% {
          opacity: 0.9;
        }
      }
      
      @keyframes particle-float-1 {
        0%, 100% {
          transform: translate(0, 0);
          opacity: 0.3;
        }
        25% {
          transform: translate(20px, -30px);
          opacity: 0.6;
        }
        50% {
          transform: translate(40px, -50px);
          opacity: 0.4;
        }
        75% {
          transform: translate(60px, -30px);
          opacity: 0.5;
        }
      }
      
      @keyframes particle-float-2 {
        0%, 100% {
          transform: translate(0, 0);
          opacity: 0.2;
        }
        25% {
          transform: translate(-25px, 35px);
          opacity: 0.5;
        }
        50% {
          transform: translate(-45px, 60px);
          opacity: 0.3;
        }
        75% {
          transform: translate(-65px, 35px);
          opacity: 0.4;
        }
      }
      
      @keyframes particle-float-3 {
        0%, 100% {
          transform: translate(0, 0);
          opacity: 0.25;
        }
        33% {
          transform: translate(30px, 40px);
          opacity: 0.55;
        }
        66% {
          transform: translate(-20px, -25px);
          opacity: 0.35;
        }
      }
      
      .mesh-blob-1 {
        animation: mesh-move-1 20s ease-in-out infinite, mesh-pulse 8s ease-in-out infinite;
        animation-delay: 0s, 0s;
      }
      
      .mesh-blob-2 {
        animation: mesh-move-2 18s ease-in-out infinite, mesh-pulse 9s ease-in-out infinite;
        animation-delay: 0s, 2s;
      }
      
      .mesh-blob-3 {
        animation: mesh-move-3 22s ease-in-out infinite, mesh-pulse 8.5s ease-in-out infinite;
        animation-delay: 0s, 4s;
      }
      
      .mesh-blob-4 {
        animation: mesh-move-4 19s ease-in-out infinite, mesh-pulse 9.5s ease-in-out infinite;
        animation-delay: 0s, 1s;
      }
      
      .particle-1 {
        animation: particle-float-1 25s ease-in-out infinite;
      }
      
      .particle-2 {
        animation: particle-float-2 28s ease-in-out infinite;
        animation-delay: 3s;
      }
      
      .particle-3 {
        animation: particle-float-3 22s ease-in-out infinite;
        animation-delay: 6s;
      }
      
      @media (prefers-reduced-motion: reduce) {
        .mesh-blob-1,
        .mesh-blob-2,
        .mesh-blob-3,
        .mesh-blob-4,
        .particle-1,
        .particle-2,
        .particle-3 {
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
    <div 
      className={`relative min-h-screen overflow-hidden ${className}`} 
      style={{ 
        backgroundColor: '#D4A574',
        transform: 'translateZ(0)', // GPU acceleration
        willChange: 'auto',
      }}
    >
      {/* Enhanced Gradient Mesh Blobs - Warm Color Palette */}
      <div className="absolute inset-0 overflow-hidden z-[1]">
        {/* Blob 1 - Top Left - Vibrant Orange - Reduced blur for performance */}
        <div
          className="mesh-blob-1 absolute w-[700px] h-[700px] rounded-full blur-2xl will-change-transform"
          style={{
            background: 'radial-gradient(circle, hsl(30, 100%, 68%) 0%, hsl(30, 100%, 58%) 25%, hsl(30, 100%, 48%) 50%, transparent 70%)',
            top: '-15%',
            left: '-15%',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            perspective: '1000px',
          }}
        />
        
        {/* Blob 2 - Top Right - Warm Peach - Reduced blur for performance */}
        <div
          className="mesh-blob-2 absolute w-[650px] h-[650px] rounded-full blur-2xl will-change-transform"
          style={{
            background: 'radial-gradient(circle, hsl(20, 100%, 68%) 0%, hsl(20, 100%, 58%) 25%, hsl(20, 100%, 48%) 50%, transparent 70%)',
            top: '-10%',
            right: '-10%',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            perspective: '1000px',
          }}
        />
        
        {/* Blob 3 - Bottom Left - Golden Yellow - Reduced blur for performance */}
        <div
          className="mesh-blob-3 absolute w-[680px] h-[680px] rounded-full blur-2xl will-change-transform"
          style={{
            background: 'radial-gradient(circle, hsl(45, 100%, 65%) 0%, hsl(45, 100%, 55%) 25%, hsl(45, 100%, 45%) 50%, transparent 70%)',
            bottom: '-15%',
            left: '5%',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            perspective: '1000px',
          }}
        />
        
        {/* Blob 4 - Bottom Right - Coral Red - Reduced blur for performance */}
        <div
          className="mesh-blob-4 absolute w-[620px] h-[620px] rounded-full blur-2xl will-change-transform"
          style={{
            background: 'radial-gradient(circle, hsl(15, 100%, 68%) 0%, hsl(15, 100%, 58%) 25%, hsl(15, 100%, 48%) 50%, transparent 70%)',
            bottom: '-10%',
            right: '0%',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            perspective: '1000px',
          }}
        />
        
        {/* Center Accent Blob - Peachy Orange - Reduced blur for performance */}
        <div
          className="mesh-blob-2 absolute w-[500px] h-[500px] rounded-full blur-2xl will-change-transform"
          style={{
            background: 'radial-gradient(circle, hsl(25, 100%, 72%) 0%, hsl(25, 100%, 62%) 30%, transparent 60%)',
            top: '40%',
            left: '50%',
            transform: 'translate(-50%, -50%) translateZ(0)',
            backfaceVisibility: 'hidden',
            perspective: '1000px',
          }}
        />
      </div>
      
      {/* Floating Particles Layer - Warm Tones */}
      <div className="absolute inset-0 overflow-hidden z-[2]">
        {/* Large Particles - Increased visibility */}
        <div className="particle-1 absolute w-4 h-4 rounded-full bg-white/40 shadow-lg shadow-orange-200/40" style={{ top: '20%', left: '15%' }} />
        <div className="particle-2 absolute w-3 h-3 rounded-full bg-white/45 shadow-lg shadow-amber-200/40" style={{ top: '60%', right: '20%' }} />
        <div className="particle-3 absolute w-3.5 h-3.5 rounded-full bg-white/35 shadow-lg shadow-amber-200/40" style={{ bottom: '30%', left: '25%' }} />
        <div className="particle-1 absolute w-3 h-3 rounded-full bg-white/40 shadow-lg shadow-orange-200/40" style={{ top: '45%', right: '35%' }} />
        <div className="particle-2 absolute w-4 h-4 rounded-full bg-white/35 shadow-lg shadow-red-200/40" style={{ bottom: '40%', right: '15%' }} />
        
        {/* Medium Particles - Warm Enhanced */}
        <div className="particle-3 absolute w-2 h-2 rounded-full bg-amber-300/60 shadow-md shadow-amber-300/40" style={{ top: '35%', left: '40%' }} />
        <div className="particle-1 absolute w-2 h-2 rounded-full bg-orange-300/60 shadow-md shadow-orange-300/40" style={{ top: '70%', left: '60%' }} />
        <div className="particle-2 absolute w-2 h-2 rounded-full bg-yellow-300/60 shadow-md shadow-yellow-300/40" style={{ bottom: '25%', left: '70%' }} />
        <div className="particle-3 absolute w-1.5 h-1.5 rounded-full bg-orange-400/70" style={{ top: '15%', right: '25%' }} />
        <div className="particle-1 absolute w-1.5 h-1.5 rounded-full bg-amber-400/70" style={{ bottom: '50%', left: '45%' }} />
        
        {/* Small Particles - More visible */}
        <div className="particle-2 absolute w-1.5 h-1.5 rounded-full bg-white/30" style={{ top: '25%', left: '55%' }} />
        <div className="particle-3 absolute w-1.5 h-1.5 rounded-full bg-white/30" style={{ top: '55%', left: '30%' }} />
        <div className="particle-1 absolute w-1.5 h-1.5 rounded-full bg-white/30" style={{ bottom: '35%', right: '40%' }} />
        <div className="particle-2 absolute w-1 h-1 rounded-full bg-white/35" style={{ top: '80%', left: '20%' }} />
        <div className="particle-3 absolute w-1 h-1 rounded-full bg-white/35" style={{ top: '10%', left: '75%' }} />
      </div>

      {/* Light overlay - Minimal opacity for maximum color vibrancy */}
      <div
        className="absolute inset-0 dark:hidden z-[3]"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.2) 100%)',
        }}
      />

      {/* Dark mode overlay */}
      <div
        className="absolute inset-0 hidden dark:block z-[3]"
        style={{
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.5) 0%, rgba(30, 41, 59, 0.4) 50%, rgba(15, 23, 42, 0.5) 100%)',
        }}
      />
      
      {/* Subtle grain texture for depth */}
      <div
        className="absolute inset-0 z-[4] opacity-[0.02] mix-blend-overlay"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")',
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

