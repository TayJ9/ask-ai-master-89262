/**
 * Portfolio demo hub — public landing page for resume visitors.
 * Hero, feature grid for navigation, and sample-result try-it previews.
 */

import { ExternalLink } from "lucide-react";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import DemoBelowFoldSections from "@/components/demo/DemoBelowFoldSections";
import { usePageMeta } from "@/hooks/usePageMeta";

const TECH_STACK = [
  "React",
  "TypeScript",
  "Express",
  "ElevenLabs",
  "OpenAI",
  "PostgreSQL",
] as const;

const GITHUB_URL = import.meta.env.VITE_GITHUB_REPO as string | undefined;
const RESUME_URL = import.meta.env.VITE_RESUME_URL as string | undefined;

export default function Demo() {
  usePageMeta({
    title: "Mockly Demo — AI Voice Interview Coach",
    description:
      "Interactive portfolio demo of Mockly: voice-first AI mock interviews with structured STAR-method feedback for students and new grads.",
    imagePath: "/demo/og-preview.webp",
  });

  return (
    <AnimatedBackground
      fixedDecor
      className="flex min-h-screen items-start justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:items-center sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 py-4 sm:gap-10 sm:py-8">
        {/* Hero — plain markup for immediate LCP paint (no opacity fade) */}
        <header className="space-y-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Portfolio demo
          </p>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Mockly
            </span>
            {" "}— voice-first AI mock interviews
          </h1>
          <p className="text-balance mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg">
            Practice realistic voice mock interviews tailored to your resume — then get clear
            feedback on every answer.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {TECH_STACK.map((tech) => (
              <span
                key={tech}
                className="rounded-full border border-border/70 bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm"
              >
                {tech}
              </span>
            ))}
          </div>
          {(GITHUB_URL || RESUME_URL) && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              {GITHUB_URL && (
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  View source on GitHub
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
              {RESUME_URL && (
                <a
                  href={RESUME_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  Back to my resume
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
            </div>
          )}
        </header>

        <DemoBelowFoldSections />
      </div>
    </AnimatedBackground>
  );
}
