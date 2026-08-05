import type { ReactNode } from "react";
import { useEffect } from "react";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import DemoBanner from "@/components/demo/DemoBanner";
import { markDemoFromHub } from "@/lib/demoMode";

interface DemoSubpageShellProps {
  children: ReactNode;
  /** Max width class for inner content. */
  maxWidth?: string;
}

export default function DemoSubpageShell({
  children,
  maxWidth = "max-w-3xl",
}: DemoSubpageShellProps) {
  useEffect(() => {
    markDemoFromHub();
  }, []);

  return (
    <AnimatedBackground
      fixedDecor
      className="flex min-h-screen flex-col items-center px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(3.75rem,calc(env(safe-area-inset-top)+3.25rem))] sm:px-6 sm:pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))]"
    >
      <DemoBanner className="fixed inset-x-0 top-0 z-[100]" />
      <div className={`w-full ${maxWidth} space-y-4 py-4 sm:py-6`}>{children}</div>
    </AnimatedBackground>
  );
}
