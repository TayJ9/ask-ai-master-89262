import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface AISpeakingIndicatorProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function AISpeakingIndicator({ 
  className,
  size = "md" 
}: AISpeakingIndicatorProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6"
  };

  const baseSize = sizeClasses[size];

  // Inject CSS keyframes once
  useEffect(() => {
    const styleId = 'ai-speaking-indicator-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ai-pulse-ripple {
        0% {
          transform: scale(1);
          opacity: 0.6;
        }
        50% {
          opacity: 0.3;
        }
        100% {
          transform: scale(2.5);
          opacity: 0;
        }
      }
      
      .ai-ripple-1 {
        animation: ai-pulse-ripple 1.5s ease-out infinite;
      }
      
      .ai-ripple-2 {
        animation: ai-pulse-ripple 1.5s ease-out infinite;
        animation-delay: 0.5s;
      }
      
      .ai-ripple-3 {
        animation: ai-pulse-ripple 1.5s ease-out infinite;
        animation-delay: 1s;
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
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* Base icon circle */}
      <div className={cn(
        "absolute rounded-full bg-primary z-10 shadow-lg",
        baseSize
      )} />
      
      {/* Pulsing circles */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* First ripple */}
        <div
          className={cn(
            "absolute rounded-full bg-primary/40 ai-ripple-1",
            baseSize
          )}
        />
        
        {/* Second ripple - delayed */}
        <div
          className={cn(
            "absolute rounded-full bg-primary/30 ai-ripple-2",
            baseSize
          )}
        />
        
        {/* Third ripple - more delayed */}
        <div
          className={cn(
            "absolute rounded-full bg-primary/20 ai-ripple-3",
            baseSize
          )}
        />
      </div>
    </div>
  );
}

