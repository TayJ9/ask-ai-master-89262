/**
 * Portfolio demo — stepped AI interviewer walkthrough (mock, no API).
 * Three user-facing steps with optional technical deep dives.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Loader2,
  Server,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ChatGPTVoiceOrb from "@/components/ui/ChatGPTVoiceOrb";
import DemoSubpageShell from "@/components/demo/DemoSubpageShell";
import { useTypewriter } from "@/hooks/useTypewriter";
import { usePageMeta } from "@/hooks/usePageMeta";
import { cn } from "@/lib/utils";
import {
  DEMO_AGENT_DYNAMIC_VARS,
  DEMO_AGENT_FIRST_MESSAGE,
  DEMO_AGENT_GET_RESUME_PROFILE,
  DEMO_AGENT_LISTENING_CAPTION,
  DEMO_AGENT_LISTENING_TECHNICAL,
  DEMO_WALKTHROUGH_STEPS,
  type DemoWalkthroughStepId,
} from "@/mocks/demoAgentWalkthrough";

const TYPEWRITER_MS = 24;
const PROFILE_LOAD_DELAY_MS = 1200;

export default function DemoAgent() {
  const prefersReducedMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const currentStep = DEMO_WALKTHROUGH_STEPS[stepIndex];
  const stepId = currentStep.id as DemoWalkthroughStepId;

  usePageMeta({
    title: "Mockly Demo — How the AI Interviewer Works",
    description:
      "See how Mockly uses your resume to run a voice mock interview — step by step, no microphone required.",
    imagePath: "/demo/interview-ui.webp",
  });

  const questionsReady = stepId === "questions" && profileLoaded;

  const { displayed: typedMessage, isComplete: typewriterDone } = useTypewriter(
    DEMO_AGENT_FIRST_MESSAGE,
    questionsReady,
    TYPEWRITER_MS,
  );

  const handleProfileLoadComplete = useCallback(() => setProfileLoaded(true), []);

  const goToStep = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(DEMO_WALKTHROUGH_STEPS.length - 1, nextIndex));
    setStepIndex(clamped);
    setProfileLoaded(false);
  };

  const handleNext = () => {
    if (stepIndex < DEMO_WALKTHROUGH_STEPS.length - 1) {
      goToStep(stepIndex + 1);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      goToStep(stepIndex - 1);
    }
  };

  useEffect(() => {
    if (stepId !== "questions") return;
    const timer = window.setTimeout(handleProfileLoadComplete, PROFILE_LOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [stepId, handleProfileLoadComplete]);

  const orbMode =
    stepId === "questions" && profileLoaded
      ? "ai_speaking"
      : stepId === "listening"
        ? "listening"
        : "processing";

  const motionEase = [0.33, 1, 0.68, 1] as const;

  return (
    <DemoSubpageShell>
      <Card className="border-white/70 bg-card/95 shadow-lg ring-1 ring-slate-200/70">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-5 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Portfolio demo
            </p>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              How the AI interviewer works
            </h1>
            <p className="text-sm text-muted-foreground">
              A quick look at what happens when you start a voice mock interview.
            </p>
          </div>

          <p className="mb-5 text-sm font-medium text-foreground" aria-live="polite">
            Step {stepIndex + 1} of {DEMO_WALKTHROUGH_STEPS.length}:{" "}
            <span className="text-primary">{currentStep.label}</span>
          </p>

          <AnimatePresence mode="wait">
            <motion.div
              key={stepId}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: motionEase }}
            >
              {stepId === "info-in" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <UserRound className="h-4 w-4 text-primary" aria-hidden />
                    {currentStep.label}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{currentStep.summary}</p>
                  <ul className="space-y-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-foreground">
                    <li>
                      <span className="font-medium">Name:</span> {DEMO_AGENT_DYNAMIC_VARS.first_name}
                    </li>
                    <li>
                      <span className="font-medium">Major:</span> {DEMO_AGENT_DYNAMIC_VARS.major}
                    </li>
                    <li>
                      <span className="font-medium">Resume highlights:</span>{" "}
                      {DEMO_AGENT_DYNAMIC_VARS.resume_highlights}
                    </li>
                  </ul>
                  <TechnicalDetails label="For developers: dynamic variables">
                    <dl className="divide-y divide-border/60 rounded-lg border border-border/60 bg-background/80">
                      {Object.entries(DEMO_AGENT_DYNAMIC_VARS).map(([key, value]) => (
                        <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr]">
                          <dt className="font-mono text-xs font-semibold text-primary">{key}</dt>
                          <dd className="text-sm text-foreground">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </TechnicalDetails>
                </div>
              )}

              {stepId === "questions" && (
                <div className="space-y-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">{currentStep.summary}</p>

                  {!profileLoaded && (
                    <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Loading your resume…
                    </div>
                  )}

                  {profileLoaded && (
                    <div className="flex flex-col items-center">
                      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-blue-600">
                        <div
                          className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600"
                          aria-hidden
                        />
                        AI is speaking…
                      </div>

                      <div className="origin-center scale-[0.82] sm:scale-100">
                        <ChatGPTVoiceOrb mode={orbMode} outputVolume={0.65} size={260} />
                      </div>

                      <div
                        className="mt-5 w-full rounded-xl border border-stone-200/60 bg-stone-50/80 p-4"
                        aria-live="polite"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          First question
                        </p>
                        <p className="mt-2 text-base leading-relaxed text-foreground sm:text-lg">
                          {typedMessage}
                          {!typewriterDone && (
                            <span className="ml-0.5 inline-block h-[1.1em] w-0.5 animate-pulse bg-primary align-text-bottom" />
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  <TechnicalDetails label="For developers: GetResumeProfile API">
                    <ProfileLoadPanel profileLoaded={profileLoaded} />
                  </TechnicalDetails>
                </div>
              )}

              {stepId === "listening" && (
                <div className="space-y-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">{currentStep.summary}</p>

                  <div className="flex flex-col items-center">
                    <div className="mb-4 text-center">
                      <p className="text-sm font-medium text-emerald-700">Listening for your answer</p>
                      <p className="mt-1 max-w-md text-sm text-muted-foreground">
                        {DEMO_AGENT_LISTENING_CAPTION}
                      </p>
                    </div>

                    <div className="origin-center scale-[0.82] sm:scale-100">
                      <ChatGPTVoiceOrb mode={orbMode} inputVolume={0.45} size={260} />
                    </div>
                  </div>

                  <TechnicalDetails label="For developers: server-side voice detection">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {DEMO_AGENT_LISTENING_TECHNICAL}
                    </p>
                  </TechnicalDetails>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-border/50 pt-5">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={handleBack}
              disabled={stepIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            <Button
              className="gap-1.5"
              onClick={handleNext}
              disabled={stepIndex === DEMO_WALKTHROUGH_STEPS.length - 1}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Mock walkthrough — the full app runs a live voice interview with your own resume.
      </p>
    </DemoSubpageShell>
  );
}

function TechnicalDetails({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          aria-expanded={open}
        >
          <Code2 className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{label}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ProfileLoadPanel({ profileLoaded }: { profileLoaded: boolean }) {
  const { tool, method, endpoint, requestBody, response } = DEMO_AGENT_GET_RESUME_PROFILE;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Server className="h-4 w-4 text-primary" aria-hidden />
        Server tool: {tool}
      </div>
      <p className="text-sm text-muted-foreground">
        Before the first question, the agent calls your backend to load structured resume data.
      </p>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-muted/40 px-4 py-2.5">
          <Badge variant="secondary" className="font-mono text-xs">
            {method}
          </Badge>
          <code className="text-xs text-muted-foreground">{endpoint}</code>
          {!profileLoaded && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Calling…
            </span>
          )}
          {profileLoaded && (
            <Badge className="ml-auto bg-emerald-600 text-xs hover:bg-emerald-600">200 OK</Badge>
          )}
        </div>

        <div className="grid gap-0 sm:grid-cols-2">
          <div className="border-b border-border/50 p-4 sm:border-b-0 sm:border-r">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Request
            </p>
            <pre className="overflow-x-auto rounded-lg bg-background/80 p-3 font-mono text-xs text-foreground">
              {JSON.stringify(requestBody, null, 2)}
            </pre>
          </div>
          <div className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Response
            </p>
            <pre
              className={cn(
                "overflow-x-auto rounded-lg bg-background/80 p-3 font-mono text-xs text-foreground transition-opacity",
                profileLoaded ? "opacity-100" : "opacity-40",
              )}
            >
              {JSON.stringify(profileLoaded ? response : { loading: true }, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
