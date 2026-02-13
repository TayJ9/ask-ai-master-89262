/**
 * PERF SUMMARY (v2):
 * - 3 mesh blobs + 5 particles; blur-lg only.
 * - ALL animated elements get will-change:transform + translateZ(0) for GPU compositing.
 * - Keyframes use translate3d() to guarantee compositor-layer promotion.
 * - Container uses CSS containment to limit layout/paint scope.
 * - prefers-reduced-motion kills all animations.
 *
 * SMOOTHNESS (v3):
 * - Gentler motion: smaller translate deltas, tighter scale (0.96-1.04).
 * - Softer opacity pulse (0.62-0.82) over longer duration to avoid jarring changes.
 * - 6-keyframe paths for smoother drift instead of sharp 3-point triangles.
 * - Longer durations (28-35s) so loop restarts are less frequent.
 * - animation-fill-mode: backwards to prevent mount flash.
 *
 * COLOR (v4):
 * - Slow shade animation (50-60s) on blob gradients so colors shift gradually.
 * - Smoother opacity pulse with 5 keyframes for gradual change.
 * - Blob inner layer structure so gradient animates without affecting blur.
 */
import { useEffect } from "react";

interface AnimatedBackgroundProps {
  className?: string;
  children?: React.ReactNode;
  /** When true, decorative layers are viewport-fixed to prevent bottom-of-page scroll artifacts. */
  fixedDecor?: boolean;
}

export default function AnimatedBackground({ className = "", children, fixedDecor = false }: AnimatedBackgroundProps) {
  // PERF: Inject keyframes once; translate3d forces GPU compositing on every keyframe.
  // Update existing style element so code changes take effect on hot reload.
  useEffect(() => {
    const styleId = 'animated-background-styles';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      /* Smoother 6-keyframe drift paths – gentler translate, tighter scale */
      @keyframes mesh-move-1 {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        20% { transform: translate3d(18px, -28px, 0) scale(1.03) rotate(2deg); }
        40% { transform: translate3d(-12px, 22px, 0) scale(0.98) rotate(-2deg); }
        60% { transform: translate3d(-20px, -15px, 0) scale(1.02) rotate(1deg); }
        80% { transform: translate3d(15px, 18px, 0) scale(0.97) rotate(-1deg); }
      }
      @keyframes mesh-move-2 {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        20% { transform: translate3d(-22px, 14px, 0) scale(0.97) rotate(-3deg); }
        40% { transform: translate3d(28px, -18px, 0) scale(1.04) rotate(3deg); }
        60% { transform: translate3d(12px, 24px, 0) scale(0.98) rotate(-2deg); }
        80% { transform: translate3d(-18px, -12px, 0) scale(1.02) rotate(2deg); }
      }
      @keyframes mesh-move-3 {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        20% { transform: translate3d(16px, 22px, 0) scale(1.04) rotate(2deg); }
        40% { transform: translate3d(-20px, -14px, 0) scale(0.96) rotate(-2deg); }
        60% { transform: translate3d(-14px, 18px, 0) scale(1.01) rotate(1deg); }
        80% { transform: translate3d(20px, -16px, 0) scale(0.99) rotate(-1deg); }
      }
      /* Gentle opacity pulse – 5 keyframes for gradual change, no instant jumps */
      @keyframes mesh-pulse {
        0%, 100% { opacity: 0.65; }
        25% { opacity: 0.72; }
        50% { opacity: 0.8; }
        75% { opacity: 0.72; }
      }
      /* Color shift – slowly animate within orange palette (hue 22–42). */
      @keyframes mesh-color-1a {
        0%, 100% { background: radial-gradient(circle, hsl(28, 88%, 62%) 0%, hsl(30, 85%, 52%) 25%, hsl(26, 82%, 42%) 50%, transparent 70%); }
        25% { background: radial-gradient(circle, hsl(34, 90%, 65%) 0%, hsl(32, 88%, 54%) 25%, hsl(28, 86%, 44%) 50%, transparent 70%); }
        50% { background: radial-gradient(circle, hsl(26, 85%, 58%) 0%, hsl(29, 87%, 48%) 25%, hsl(31, 84%, 38%) 50%, transparent 70%); }
        75% { background: radial-gradient(circle, hsl(31, 90%, 64%) 0%, hsl(27, 86%, 53%) 25%, hsl(29, 88%, 43%) 50%, transparent 70%); }
      }
      @keyframes mesh-color-1b {
        0%, 100% { background: radial-gradient(circle, hsl(38, 92%, 60%) 0%, hsl(36, 90%, 50%) 25%, hsl(34, 88%, 40%) 50%, transparent 70%); }
        25% { background: radial-gradient(circle, hsl(32, 87%, 56%) 0%, hsl(40, 91%, 52%) 25%, hsl(36, 89%, 42%) 50%, transparent 70%); }
        50% { background: radial-gradient(circle, hsl(42, 94%, 64%) 0%, hsl(34, 86%, 48%) 25%, hsl(38, 90%, 38%) 50%, transparent 70%); }
        75% { background: radial-gradient(circle, hsl(36, 89%, 58%) 0%, hsl(38, 91%, 50%) 25%, hsl(32, 85%, 40%) 50%, transparent 70%); }
      }
      @keyframes mesh-color-2a {
        0%, 100% { background: radial-gradient(circle, hsl(24, 86%, 60%) 0%, hsl(26, 84%, 50%) 25%, hsl(23, 82%, 40%) 50%, transparent 70%); }
        25% { background: radial-gradient(circle, hsl(30, 88%, 62%) 0%, hsl(24, 85%, 48%) 25%, hsl(27, 86%, 38%) 50%, transparent 70%); }
        50% { background: radial-gradient(circle, hsl(22, 82%, 54%) 0%, hsl(28, 88%, 52%) 25%, hsl(25, 84%, 42%) 50%, transparent 70%); }
        75% { background: radial-gradient(circle, hsl(27, 90%, 58%) 0%, hsl(23, 83%, 46%) 25%, hsl(29, 87%, 36%) 50%, transparent 70%); }
      }
      @keyframes mesh-color-2b {
        0%, 100% { background: radial-gradient(circle, hsl(34, 82%, 55%) 0%, hsl(32, 78%, 45%) 25%, hsl(30, 80%, 35%) 50%, transparent 70%); }
        25% { background: radial-gradient(circle, hsl(30, 85%, 58%) 0%, hsl(36, 80%, 48%) 25%, hsl(32, 82%, 38%) 50%, transparent 70%); }
        50% { background: radial-gradient(circle, hsl(32, 88%, 52%) 0%, hsl(28, 76%, 42%) 25%, hsl(34, 84%, 32%) 50%, transparent 70%); }
        75% { background: radial-gradient(circle, hsl(28, 79%, 56%) 0%, hsl(33, 86%, 50%) 25%, hsl(31, 81%, 40%) 50%, transparent 70%); }
      }
      @keyframes mesh-color-3a {
        0%, 100% { background: radial-gradient(circle, hsl(31, 91%, 62%) 0%, hsl(29, 89%, 52%) 25%, hsl(27, 87%, 42%) 50%, transparent 70%); }
        25% { background: radial-gradient(circle, hsl(25, 88%, 58%) 0%, hsl(33, 92%, 54%) 25%, hsl(29, 90%, 44%) 50%, transparent 70%); }
        50% { background: radial-gradient(circle, hsl(35, 93%, 66%) 0%, hsl(26, 86%, 48%) 25%, hsl(31, 88%, 38%) 50%, transparent 70%); }
        75% { background: radial-gradient(circle, hsl(29, 90%, 60%) 0%, hsl(27, 85%, 50%) 25%, hsl(33, 91%, 40%) 50%, transparent 70%); }
      }
      @keyframes mesh-color-3b {
        0%, 100% { background: radial-gradient(circle, hsl(29, 85%, 56%) 0%, hsl(27, 82%, 46%) 25%, hsl(31, 84%, 36%) 50%, transparent 70%); }
        25% { background: radial-gradient(circle, hsl(33, 88%, 60%) 0%, hsl(25, 80%, 48%) 25%, hsl(28, 86%, 38%) 50%, transparent 70%); }
        50% { background: radial-gradient(circle, hsl(25, 83%, 52%) 0%, hsl(32, 90%, 54%) 25%, hsl(30, 82%, 42%) 50%, transparent 70%); }
        75% { background: radial-gradient(circle, hsl(31, 87%, 58%) 0%, hsl(29, 84%, 44%) 25%, hsl(26, 85%, 34%) 50%, transparent 70%); }
      }
      /* Opacity crossfade for extra depth */
      @keyframes mesh-fade-a {
        0%, 100% { opacity: 0.5; }
        12.5% { opacity: 0.65; }
        25% { opacity: 0.9; }
        37.5% { opacity: 0.75; }
        50% { opacity: 0.6; }
        62.5% { opacity: 0.7; }
        75% { opacity: 0.85; }
        87.5% { opacity: 0.65; }
      }
      @keyframes mesh-fade-b {
        0%, 100% { opacity: 0.85; }
        12.5% { opacity: 0.7; }
        25% { opacity: 0.55; }
        37.5% { opacity: 0.65; }
        50% { opacity: 0.9; }
        62.5% { opacity: 0.75; }
        75% { opacity: 0.6; }
        87.5% { opacity: 0.8; }
      }
      @keyframes mesh-fade-c {
        0%, 100% { opacity: 0.6; }
        16.6% { opacity: 0.75; }
        33% { opacity: 0.9; }
        50% { opacity: 0.7; }
        66% { opacity: 0.55; }
        83.3% { opacity: 0.7; }
      }
      @keyframes mesh-fade-d {
        0%, 100% { opacity: 0.9; }
        16.6% { opacity: 0.75; }
        33% { opacity: 0.5; }
        50% { opacity: 0.8; }
        66% { opacity: 0.85; }
        83.3% { opacity: 0.65; }
      }
      @keyframes particle-float-1 {
        0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.28; }
        50% { transform: translate3d(12px, -14px, 0); opacity: 0.42; }
      }
      @keyframes particle-float-2 {
        0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.2; }
        50% { transform: translate3d(-10px, 12px, 0); opacity: 0.35; }
      }
      .mesh-blob-1,
      .mesh-blob-2,
      .mesh-blob-3 {
        will-change: transform, opacity;
        backface-visibility: hidden;
        animation-fill-mode: backwards;
      }
      /* Pulse starts immediately (0s delay) so no opacity jump a few seconds after load */
      .mesh-blob-1 {
        animation: mesh-move-1 30s cubic-bezier(0.45, 0, 0.55, 1) infinite,
                   mesh-pulse 18s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        animation-delay: 0s, 0s;
      }
      .mesh-blob-2 {
        animation: mesh-move-2 28s cubic-bezier(0.45, 0, 0.55, 1) infinite,
                   mesh-pulse 20s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        animation-delay: 0s, 0s;
      }
      .mesh-blob-3 {
        animation: mesh-move-3 32s cubic-bezier(0.45, 0, 0.55, 1) infinite,
                   mesh-pulse 22s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        animation-delay: 0s, 0s;
      }
      .mesh-blob-inner {
        will-change: opacity;
        backface-visibility: hidden;
        animation-fill-mode: backwards;
      }
      /* Color shift (50-60s) + opacity crossfade. Warm red/orange only. */
      .mesh-blob-1 .mesh-blob-inner-a {
        animation: mesh-fade-a 50s cubic-bezier(0.4, 0, 0.6, 1) infinite,
                   mesh-color-1a 55s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      .mesh-blob-1 .mesh-blob-inner-b {
        animation: mesh-fade-b 50s cubic-bezier(0.4, 0, 0.6, 1) infinite,
                   mesh-color-1b 58s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        animation-delay: 0s, 12s;
      }
      .mesh-blob-2 .mesh-blob-inner-a {
        animation: mesh-fade-c 55s cubic-bezier(0.4, 0, 0.6, 1) infinite,
                   mesh-color-2a 52s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        animation-delay: 0s, 5s;
      }
      .mesh-blob-2 .mesh-blob-inner-b {
        animation: mesh-fade-d 55s cubic-bezier(0.4, 0, 0.6, 1) infinite,
                   mesh-color-2b 56s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        animation-delay: 0s, 22s;
      }
      .mesh-blob-3 .mesh-blob-inner-a {
        animation: mesh-fade-a 48s cubic-bezier(0.4, 0, 0.6, 1) infinite,
                   mesh-color-3a 54s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        animation-delay: 0s, 8s;
      }
      .mesh-blob-3 .mesh-blob-inner-b {
        animation: mesh-fade-b 48s cubic-bezier(0.4, 0, 0.6, 1) infinite,
                   mesh-color-3b 50s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        animation-delay: 0s, 20s;
      }
      .particle-1,
      .particle-2 {
        will-change: transform, opacity;
        backface-visibility: hidden;
        animation-fill-mode: backwards;
      }
      .particle-1 { animation: particle-float-1 32s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
      .particle-2 { animation: particle-float-2 36s cubic-bezier(0.45, 0, 0.55, 1) infinite; animation-delay: 5s; }
      @media (prefers-reduced-motion: reduce) {
        .mesh-blob-1, .mesh-blob-2, .mesh-blob-3, .mesh-blob-inner, .particle-1, .particle-2 {
          animation: none !important;
          will-change: auto;
        }
      }
    `;

    // Do NOT remove styles on unmount – they're shared by all AnimatedBackground instances.
    // Removing would cause a flash when transitioning between views (roles→resume→voice):
    // old view unmounts → styles removed → brief moment without keyframes → new view mounts → styles re-injected.
  }, []);

  const decorLayers = (
    <>
      {/* PERF: All blobs GPU-composited via will-change + translate3d in keyframes. */}
      <div
        className="absolute inset-0 overflow-hidden z-[1]"
        style={{ contain: 'strict' }}
      >
        <div
          className="mesh-blob-1 absolute w-[700px] h-[700px] rounded-full blur-lg overflow-hidden"
          style={{ top: '-15%', left: '-15%', transform: 'translate3d(0, 0, 0)', opacity: 0.65 }}
        >
          <div className="mesh-blob-inner mesh-blob-inner-a absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, hsl(28, 88%, 62%) 0%, hsl(30, 85%, 52%) 25%, hsl(26, 82%, 42%) 50%, transparent 70%)', opacity: 0.5 }} />
          <div className="mesh-blob-inner mesh-blob-inner-b absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, hsl(38, 92%, 60%) 0%, hsl(36, 90%, 50%) 25%, hsl(34, 88%, 40%) 50%, transparent 70%)', opacity: 0.85 }} />
        </div>
        <div
          className="mesh-blob-2 absolute w-[650px] h-[650px] rounded-full blur-lg overflow-hidden"
          style={{ top: '-10%', right: '-10%', transform: 'translate3d(0, 0, 0)', opacity: 0.65 }}
        >
          <div className="mesh-blob-inner mesh-blob-inner-a absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, hsl(24, 86%, 60%) 0%, hsl(26, 84%, 50%) 25%, hsl(23, 82%, 40%) 50%, transparent 70%)', opacity: 0.6 }} />
          <div className="mesh-blob-inner mesh-blob-inner-b absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, hsl(34, 82%, 55%) 0%, hsl(32, 78%, 45%) 25%, hsl(30, 80%, 35%) 50%, transparent 70%)', opacity: 0.9 }} />
        </div>
        <div
          className="mesh-blob-3 absolute w-[680px] h-[680px] rounded-full blur-lg overflow-hidden"
          style={{ bottom: '-15%', left: '5%', transform: 'translate3d(0, 0, 0)', opacity: 0.65 }}
        >
          <div className="mesh-blob-inner mesh-blob-inner-a absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, hsl(31, 91%, 62%) 0%, hsl(29, 89%, 52%) 25%, hsl(27, 87%, 42%) 50%, transparent 70%)', opacity: 0.5 }} />
          <div className="mesh-blob-inner mesh-blob-inner-b absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, hsl(29, 85%, 56%) 0%, hsl(27, 82%, 46%) 25%, hsl(31, 84%, 36%) 50%, transparent 70%)', opacity: 0.85 }} />
        </div>
      </div>

      {/* PERF: All particles GPU-composited via will-change + translate3d in keyframes. */}
      <div
        className="absolute inset-0 overflow-hidden z-[2]"
        style={{ contain: 'strict' }}
      >
        <div className="particle-1 absolute w-4 h-4 rounded-full bg-white/40" style={{ top: '20%', left: '15%', transform: 'translate3d(0,0,0)' }} />
        <div className="particle-2 absolute w-3 h-3 rounded-full bg-white/45" style={{ top: '60%', right: '20%', transform: 'translate3d(0,0,0)' }} />
        <div className="particle-1 absolute w-3.5 h-3.5 rounded-full bg-white/35" style={{ bottom: '30%', left: '25%', transform: 'translate3d(0,0,0)' }} />
        <div className="particle-2 absolute w-3 h-3 rounded-full bg-white/40" style={{ top: '45%', right: '35%', transform: 'translate3d(0,0,0)' }} />
        <div className="particle-1 absolute w-3 h-3 rounded-full bg-white/35" style={{ bottom: '40%', right: '15%', transform: 'translate3d(0,0,0)' }} />
      </div>

      <div
        className="absolute inset-0 dark:hidden z-[3] transition-opacity duration-700"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.2) 100%)',
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block z-[3] transition-opacity duration-700"
        style={{
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.5) 0%, rgba(30, 41, 59, 0.4) 50%, rgba(15, 23, 42, 0.5) 100%)',
        }}
      />
    </>
  );

  /*
   * CRITICAL: The root wrapper must NOT have `transform` or `will-change: transform`.
   * Either of those creates a new containing block, which breaks `position: fixed`
   * on the decor wrapper -- turning it into `position: absolute` and causing the
   * background to scroll with the content (white-flash artifacts on fast scroll).
   *
   * GPU promotion is applied only to the leaf animated elements (blobs/particles)
   * and to the content wrapper, NOT to this root.
   */
  return (
    <div
      className={`relative min-h-screen ${fixedDecor ? '' : 'overflow-hidden'} ${className}`}
      style={{ backgroundColor: '#E8A052' }}
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

