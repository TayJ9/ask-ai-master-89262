/**
 * Shared below-fold Demo markup (no Framer Motion) — used as Suspense fallback and motion wrapper content.
 */

import {
  ArrowRight,
  BarChart3,
  Bot,
  FileText,
  Mic,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import DemoHubCard from "@/components/demo/DemoHubCard";
import { DEMO_FEATURES, type DemoFeatureIcon } from "@/content/demoFeatures";
import { buildDemoHref } from "@/lib/demoMode";

const FEATURE_ICONS: Record<DemoFeatureIcon, LucideIcon> = {
  Mic,
  FileText,
  BarChart3,
  Bot,
};

const DEMO_STOPS = [
  {
    step: 1,
    title: "Sample feedback — Technical",
    description:
      "See a full CS/software engineering evaluation with STAR breakdown, per-question scores, and coaching tips.",
    cta: "View CS interview results",
    path: "/results?mock=true&interviewId=demo&demo=tech",
    image: "/demo/results-tech.png",
    imageWidth: 800,
    imageHeight: 500,
    imageAlt: "Technical interview results with scores and STAR analysis",
    icon: Zap,
    accent: "primary" as const,
  },
  {
    step: 2,
    title: "Sample feedback — Non-technical",
    description:
      "Browse a non-technical marketing interview report with the same structured feedback format.",
    cta: "View non-technical interview results",
    path: "/results?mock=true&interviewId=demo&demo=business",
    image: "/demo/results-business.png",
    imageWidth: 800,
    imageHeight: 500,
    imageAlt: "Non-technical interview results with coaching feedback",
    icon: BarChart3,
    accent: "secondary" as const,
  },
] as const;

export default function DemoBelowFoldSections() {
  const [, setLocation] = useLocation();

  return (
    <>
      <section className="space-y-5" aria-labelledby="how-it-works-heading">
        <div className="text-center">
          <h2 id="how-it-works-heading" className="text-xl font-semibold text-foreground sm:text-2xl">
            How it works
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Talk through interviews, get questions from your resume, and review your scores.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {DEMO_FEATURES.map((feature) => {
            const Icon = FEATURE_ICONS[feature.icon];
            return (
              <DemoHubCard
                key={feature.title}
                compact
                title={feature.title}
                description={feature.blurb}
                cta="See it"
                icon={Icon}
                onCta={() =>
                  setLocation(
                    feature.demoPath ? buildDemoHref(feature.demoPath) : buildDemoHref("/demo/agent"),
                  )
                }
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="try-it-heading">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          <span id="try-it-heading">Try it yourself — sample feedback previews</span>
        </div>

        <div className="grid gap-4 sm:gap-5">
          {DEMO_STOPS.map((stop, index) => (
            <div key={stop.step}>
              <DemoHubCard
                step={stop.step}
                title={stop.title}
                description={stop.description}
                cta={stop.cta}
                icon={stop.icon}
                accent={stop.accent}
                onCta={() => setLocation(buildDemoHref(stop.path))}
                image={{
                  png: stop.image,
                  alt: stop.imageAlt,
                  width: stop.imageWidth,
                  height: stop.imageHeight,
                  loading: index === 0 ? "eager" : "lazy",
                  fetchPriority: index === 0 ? "high" : undefined,
                  decoding: index === 0 ? "sync" : "async",
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <footer className="rounded-2xl border border-white/70 bg-card/90 px-5 py-6 text-center shadow-md ring-1 ring-slate-200/60 sm:px-8">
        <p className="text-base font-semibold text-foreground">Want to try the full app?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign up for a free account to run a real voice interview with personalized feedback.
        </p>
        <Button size="lg" className="mt-4 gap-2" onClick={() => setLocation("/")}>
          Go to Mockly
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </footer>
    </>
  );
}
