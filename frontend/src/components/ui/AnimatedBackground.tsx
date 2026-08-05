import { memo, useEffect } from "react";

interface AnimatedBackgroundProps {
  className?: string;
  children?: React.ReactNode;
  /** When true, decorative layers are viewport-fixed to prevent bottom-of-page scroll artifacts. */
  fixedDecor?: boolean;
}

/** Isolated decor tree — memoized so typing in form children does not re-render SVG/blur layers. */
const AnimatedBackgroundDecor = memo(function AnimatedBackgroundDecor({
  fixedDecor,
}: {
  fixedDecor: boolean;
}) {
  // PERF: Static wave decor only — CSS animations removed to avoid compositor/GPU load app-wide.
  useEffect(() => {
    const styleId = "animated-background-styles";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      .wave-band,
      .wave-edge,
      .wave-haze {
        backface-visibility: hidden;
        animation: none !important;
        will-change: auto;
      }
      @media (max-width: 640px) {
        .wave-band-5, .wave-edge-5 {
          display: none;
        }
      }
    `;

    // Do NOT remove styles on unmount – they're shared by all AnimatedBackground instances.
  }, []);

  const decorLayers = (
    <>
      <div
        className="absolute inset-0 overflow-hidden z-[1]"
        style={{ contain: "strict" }}
      >
        <div
          className="wave-haze absolute -left-[18%] -top-[22%] h-[460px] w-[780px] rounded-full blur-3xl sm:h-[580px] sm:w-[980px]"
          style={{
            background:
              "radial-gradient(ellipse at center, hsl(206 64% 82% / 0.36), hsl(218 48% 88% / 0.2) 45%, transparent 72%)",
          }}
        />
        <div
          className="wave-haze absolute -bottom-[28%] right-[-20%] h-[560px] w-[900px] rounded-full blur-3xl sm:h-[720px] sm:w-[1120px]"
          style={{
            background:
              "radial-gradient(ellipse at center, hsl(215 38% 72% / 0.22), hsl(196 42% 82% / 0.18) 48%, transparent 74%)",
          }}
        />
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="waveGlassBack" x1="-120" y1="80" x2="1560" y2="360" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(212 45% 78% / 0.26)" />
              <stop offset="38%" stopColor="hsl(0 0% 100% / 0.34)" />
              <stop offset="58%" stopColor="hsl(207 48% 87% / 0.42)" />
              <stop offset="100%" stopColor="hsl(220 35% 76% / 0.22)" />
            </linearGradient>
            <linearGradient id="waveGlassMid" x1="-120" y1="250" x2="1560" y2="500" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(199 42% 74% / 0.24)" />
              <stop offset="30%" stopColor="hsl(204 52% 88% / 0.42)" />
              <stop offset="52%" stopColor="hsl(0 0% 100% / 0.28)" />
              <stop offset="100%" stopColor="hsl(218 32% 68% / 0.2)" />
            </linearGradient>
            <linearGradient id="waveGlassFront" x1="-120" y1="520" x2="1560" y2="760" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(220 28% 65% / 0.34)" />
              <stop offset="28%" stopColor="hsl(212 38% 86% / 0.46)" />
              <stop offset="48%" stopColor="hsl(0 0% 100% / 0.22)" />
              <stop offset="78%" stopColor="hsl(217 28% 69% / 0.32)" />
              <stop offset="100%" stopColor="hsl(205 34% 82% / 0.3)" />
            </linearGradient>
            <linearGradient id="waveGlassTop" x1="-160" y1="-80" x2="1560" y2="314" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(0 0% 100% / 0.54)" />
              <stop offset="44%" stopColor="hsl(216 60% 93% / 0.66)" />
              <stop offset="100%" stopColor="hsl(210 34% 72% / 0.18)" />
            </linearGradient>
            <linearGradient id="waveGlassLower" x1="-120" y1="660" x2="1560" y2="880" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(210 44% 94% / 0.58)" />
              <stop offset="34%" stopColor="hsl(0 0% 100% / 0.42)" />
              <stop offset="68%" stopColor="hsl(215 34% 77% / 0.34)" />
              <stop offset="100%" stopColor="hsl(198 36% 88% / 0.54)" />
            </linearGradient>
          </defs>
          <path
            className="wave-band wave-band-1"
            d="M-120 132 C 76 74 238 94 386 188 C 548 292 704 272 884 158 C 1064 44 1238 86 1560 212 L1560 338 C 1300 254 1112 232 940 326 C 738 438 532 416 346 304 C 184 206 46 208 -120 276 Z"
            fill="url(#waveGlassBack)"
            style={{
              filter: "drop-shadow(0 24px 54px hsl(218 34% 45% / 0.08))",
            }}
          />
          <path
            className="wave-edge wave-edge-1"
            d="M-120 132 C 76 74 238 94 386 188 C 548 292 704 272 884 158 C 1064 44 1238 86 1560 212"
            fill="none"
            stroke="hsl(0 0% 100% / 0.34)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            className="wave-band wave-band-2"
            d="M-120 284 C 92 196 300 240 486 366 C 642 472 826 430 1006 296 C 1186 162 1320 174 1560 244 L1560 432 C 1332 360 1180 362 1038 468 C 844 614 620 626 410 498 C 232 390 70 368 -120 454 Z"
            fill="url(#waveGlassMid)"
            style={{
              filter: "drop-shadow(0 30px 70px hsl(204 32% 48% / 0.11))",
            }}
          />
          <path
            className="wave-edge wave-edge-2"
            d="M-120 454 C 70 368 232 390 410 498 C 620 626 844 614 1038 468 C 1180 362 1332 360 1560 432"
            fill="none"
            stroke="hsl(215 32% 58% / 0.12)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            className="wave-band wave-band-3"
            d="M-120 540 C 120 424 298 464 504 574 C 698 678 878 650 1078 492 C 1228 374 1368 386 1560 444 L1560 662 C 1348 604 1210 630 1058 748 C 854 906 632 882 420 756 C 238 648 70 654 -120 742 Z"
            fill="url(#waveGlassFront)"
            style={{
              filter: "drop-shadow(0 -18px 58px hsl(224 30% 44% / 0.13))",
            }}
          />
          <path
            className="wave-edge wave-edge-3"
            d="M-120 540 C 120 424 298 464 504 574 C 698 678 878 650 1078 492 C 1228 374 1368 386 1560 444"
            fill="none"
            stroke="hsl(0 0% 100% / 0.36)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            className="wave-edge wave-edge-3"
            d="M120 484 C 286 470 388 518 504 574 C 698 678 878 650 1078 492"
            fill="none"
            stroke="hsl(0 0% 100% / 0.18)"
            strokeWidth="8"
            strokeLinecap="round"
            style={{
              filter: "blur(2.4px)",
            }}
          />
          <path
            className="wave-band wave-band-4"
            d="M-160 -88 C 328 -66 762 58 1122 188 C 1288 240 1398 188 1560 128 L1560 314 C 1386 390 1258 430 1100 370 C 900 292 664 206 -160 176 Z"
            fill="url(#waveGlassTop)"
            style={{
              filter: "drop-shadow(-22px 30px 58px hsl(216 28% 56% / 0.08))",
            }}
          />
          <path
            className="wave-edge wave-edge-4"
            d="M-160 176 C 664 206 900 292 1100 370 C 1258 430 1386 390 1560 314"
            fill="none"
            stroke="hsl(212 40% 70% / 0.13)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            className="wave-band wave-band-5"
            d="M-120 698 C 96 582 330 620 516 732 C 710 848 902 870 1138 724 C 1280 636 1402 636 1560 704 L1560 940 L-120 940 Z"
            fill="url(#waveGlassLower)"
            style={{
              filter: "drop-shadow(0 -30px 70px hsl(212 34% 46% / 0.13))",
            }}
          />
          <path
            className="wave-edge wave-edge-5"
            d="M-120 698 C 96 582 330 620 516 732 C 710 848 902 870 1138 724 C 1280 636 1402 636 1560 704"
            fill="none"
            stroke="hsl(0 0% 100% / 0.4)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            className="wave-edge wave-edge-5"
            d="M42 646 C 222 610 368 640 516 732 C 710 848 902 870 1138 724 C 1244 660 1346 644 1460 676"
            fill="none"
            stroke="hsl(0 0% 100% / 0.2)"
            strokeWidth="9"
            strokeLinecap="round"
            style={{
              filter: "blur(2.8px)",
            }}
          />
        </svg>
      </div>

      <div
        className="absolute inset-0 overflow-hidden z-[2]"
        style={{ contain: "strict" }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 48% 58% at 50% 38%, hsl(0 0% 100% / 0.72), hsl(214 42% 98% / 0.42) 46%, transparent 76%)",
          }}
        />
      </div>

      <div
        className="absolute inset-0 dark:hidden z-[3] transition-opacity duration-700"
        style={{
          background:
            "linear-gradient(180deg, hsl(210 44% 98% / 0.52) 0%, hsl(214 38% 97% / 0.18) 44%, hsl(218 34% 95% / 0.42) 100%)",
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block z-[3] transition-opacity duration-700"
        style={{
          background:
            "linear-gradient(180deg, hsl(220 40% 8% / 0.72) 0%, hsl(222 34% 12% / 0.56) 50%, hsl(220 40% 8% / 0.7) 100%)",
        }}
      />
    </>
  );

  if (fixedDecor) {
    return (
      <div
        className="fixed inset-0 w-full pointer-events-none z-0"
        style={{ height: "100dvh" }}
        aria-hidden
      >
        {decorLayers}
      </div>
    );
  }

  return decorLayers;
});

function AnimatedBackground({ className = "", children, fixedDecor = false }: AnimatedBackgroundProps) {
  /*
   * CRITICAL: The root wrapper must NOT have `transform` or `will-change: transform`.
   * Either of those creates a new containing block, which breaks `position: fixed`
   * on the decor wrapper -- turning it into `position: absolute` and causing the
   * background to scroll with the content (white-flash artifacts on fast scroll).
   */
  return (
    <div
      className={`relative min-h-screen ${fixedDecor ? "" : "overflow-hidden"} ${className}`}
      style={{
        background:
          "linear-gradient(135deg, hsl(214 42% 98%) 0%, hsl(218 34% 95%) 42%, hsl(205 34% 94%) 100%)",
      }}
    >
      <AnimatedBackgroundDecor fixedDecor={fixedDecor} />

      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default memo(AnimatedBackground);
