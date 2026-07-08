/**
 * Interview Results Page
 * 
 * Displays interview transcript and evaluation results.
 * Handles polling for pending/processing evaluation states.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, AlertTriangle, XCircle, RefreshCw, ArrowLeft, Home, Clock, Sparkles, TrendingUp, Award, FileText, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiGet } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { mockInterviewResults, mockInterviewResultsBusiness } from "@/mocks/resultsMockData";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import MocklyProgressWordmark from "@/components/MocklyProgressWordmark";
import { cn, devLog } from "@/lib/utils";
// Dev-only fixtures for UI render verification (enhanced vs legacy evaluation shape)
import fixtureEnhanced from "@/__fixtures__/evaluation_enhanced.json";
import fixtureLegacy from "@/__fixtures__/evaluation_legacy.json";
import { checkFixturesRenderable } from "@/__fixtures__/validateFixtures";

if (import.meta.env.DEV) {
  const { enhanced, legacy } = checkFixturesRenderable(fixtureEnhanced, fixtureLegacy);
  if (!enhanced.ok) devLog.warn("[FIXTURES] Enhanced fixture validation:", enhanced.errors);
  if (!legacy.ok) devLog.warn("[FIXTURES] Legacy fixture validation:", legacy.errors);
}

interface InterviewResults {
  interview: {
    id: string;
    conversationId: string | null;
    agentId: string;
    transcript: string | null;
    durationSeconds: number | null;
    startedAt: string | null;
    endedAt: string | null;
    status: string;
    createdAt: string;
  };
  evaluation: {
    status: string;
    overallScore: number | null;
    evaluation: {
      overall_score: number;
      overall_strengths?: string[];
      overall_improvements?: string[];
      questions: Array<{
        question: string;
        answer: string;
        score: number;
        strengths: string[];
        improvements: string[];
        // Optional fields for enhanced coaching UI; safe for older evaluations
        question_type?: "behavioral" | "technical" | "situational" | "informational";
        star_breakdown?: {
          situation: "strong" | "weak" | "missing";
          task: "strong" | "weak" | "missing";
          action: "strong" | "weak" | "missing";
          result: "strong" | "weak" | "missing";
        };
        improvement_quote?: string;
        sample_better_answer?: string;
        vagueness_flags?: string[];
        score_capped?: boolean;
      }>;
    } | null;
    error: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  metadata: {
    userId: string;
    userEmail: string | null;
  };
}

const POLL_TIMEOUT = 240000; // 4 minutes, covering backend retries and LLM latency
const EVALUATION_POLL_DELAYS_MS = [2000, 5000, 10000];

const getEvaluationPollDelay = (attempt: number): number => {
  return EVALUATION_POLL_DELAYS_MS[Math.min(attempt, EVALUATION_POLL_DELAYS_MS.length - 1)];
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
};

/** Readiness labels — text-only, tuned for the dark score hero. */
function getReadinessLabel(score: number): { label: string; colorClass: string } {
  if (score >= 90) return { label: "Interview ready", colorClass: "text-emerald-200/95" };
  if (score >= 70) return { label: "Competitive", colorClass: "text-sky-200/95" };
  return { label: "Keep practicing", colorClass: "text-amber-200/95" };
}

/** Section shell — matches Auth / home / resume cards (border + card token). */
const RESULTS_CARD =
  "rounded-2xl border border-border/80 bg-card/95 text-card-foreground shadow-sm";
const RESULTS_INSET = "rounded-xl border border-border/60 bg-muted/25";
const RESULTS_INSET_EMPHASIS = "rounded-xl border border-border/50 bg-card";
const LOADING_CARD = cn(RESULTS_CARD, "w-full overflow-visible");
const LOADING_SCREEN_SHELL =
  "flex min-h-[100dvh] items-center justify-center px-4 py-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]";
const LOADING_SCREEN_FRAME = "relative z-10 mx-auto w-full max-w-lg";
const RESULTS_PAGE_SHELL =
  "min-h-[100dvh] px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8";
const RESULTS_CARD_HEADER = "p-4 pb-3 sm:p-6 sm:pb-3";
const RESULTS_CARD_CONTENT = "p-4 pt-0 sm:p-6 sm:pt-0";

function FeedbackListItem({
  children,
  dotClassName,
}: {
  children: React.ReactNode;
  dotClassName: string;
}) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed text-foreground/95">
      <span
        className={cn("mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full", dotClassName)}
        aria-hidden
      />
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

/** Shared Mockly wordmark block for initial loading and processing screens. */
function ResultsLoadingWordmark({
  progress,
  statusLine,
  animateStatus = false,
  statusKey,
}: {
  progress: number;
  statusLine: string;
  animateStatus?: boolean;
  statusKey?: string | number;
}) {
  return (
    <div className="space-y-2 overflow-visible text-center sm:space-y-1">
      <MocklyProgressWordmark progress={progress} />
      <div className="relative min-h-5 px-1 sm:px-2">
        {animateStatus ? (
          <AnimatePresence mode="wait">
            <motion.p
              key={statusKey}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-balance text-sm font-medium text-foreground"
            >
              {statusLine}
            </motion.p>
          </AnimatePresence>
        ) : (
          <p className="text-balance text-sm font-medium text-foreground">{statusLine}</p>
        )}
      </div>
    </div>
  );
}

function scoreBarClass(score: number): string {
  if (score >= 80) return "from-primary to-primary/85";
  if (score >= 60) return "from-sky-500 to-sky-600";
  if (score >= 40) return "from-amber-500 to-amber-600";
  return "from-destructive/90 to-destructive";
}

function scoreAccentBorder(score: number): string {
  if (score >= 80) return "border-l-4 border-l-primary";
  if (score >= 60) return "border-l-4 border-l-sky-500";
  if (score >= 40) return "border-l-4 border-l-amber-500";
  return "border-l-4 border-l-destructive";
}

type EvaluatedQuestion = NonNullable<
  NonNullable<InterviewResults["evaluation"]>["evaluation"]
>["questions"][number];

/** Fire once when element nears viewport — lazy-mount below-the-fold sections. */
function useInViewOnce(rootMargin = "300px 0px") {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

/** Defer Framer Motion until after first paint so LCP elements render statically. */
function useDeferredAnimations() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setReady(true);
    };
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(enable);
    });
    const timeout = window.setTimeout(enable, 2500);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, []);

  return ready;
}

function QuestionFeedbackCard({ qa, index }: { qa: EvaluatedQuestion; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card
        className={cn(
          "overflow-hidden rounded-xl border border-border/80 bg-card/95 text-card-foreground shadow-sm",
          scoreAccentBorder(qa.score),
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full touch-manipulation flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pl-5"
            aria-expanded={open}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground sm:text-xl">Question {index + 1}</h3>
              {qa.question_type && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    qa.question_type === "behavioral"
                      ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                      : qa.question_type === "technical"
                        ? "bg-primary/10 text-primary"
                        : qa.question_type === "situational"
                          ? "bg-secondary/15 text-secondary-foreground"
                          : "bg-muted text-muted-foreground",
                  )}
                >
                  {qa.question_type.charAt(0).toUpperCase() + qa.question_type.slice(1)}
                </span>
              )}
              {qa.score_capped && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                  Limited specificity
                </span>
              )}
            </div>
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
              <div className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted sm:w-24 sm:flex-none">
                <div
                  className={cn("h-full rounded-full bg-gradient-to-r", scoreBarClass(qa.score))}
                  style={{ width: `${qa.score}%` }}
                />
              </div>
              <span
                className={cn(
                  "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums",
                  qa.score >= 80
                    ? "bg-primary/10 text-primary"
                    : qa.score >= 60
                      ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                      : qa.score >= 40
                        ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                        : "bg-destructive/10 text-destructive",
                )}
              >
                {qa.score}/100
              </span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                aria-hidden
              />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pl-4 sm:pl-5">
            <div className="space-y-3 border-t border-border/60 pt-4">
              <div className={cn(RESULTS_INSET, "p-4")}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question</p>
                <p className="font-medium leading-relaxed text-foreground">{qa.question}</p>
              </div>

              <div className={cn(RESULTS_INSET, "p-4")}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your answer</p>
                <p className="leading-relaxed text-foreground/90">{qa.answer}</p>
              </div>

              {qa.star_breakdown && (
                <div className={cn(RESULTS_INSET, "border-l-2 border-l-amber-500/40 p-4")}>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4 text-amber-600" aria-hidden />
                    STAR
                  </h4>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                    {(["situation", "task", "action", "result"] as const).map((key) => {
                      const val = qa.star_breakdown![key];
                      const label = key.charAt(0).toUpperCase() + key.slice(1);
                      const isStrong = val === "strong";
                      const isWeak = val === "weak";
                      const Icon = isStrong ? CheckCircle2 : isWeak ? AlertTriangle : XCircle;
                      const cellClass = isStrong
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : isWeak
                          ? "border-amber-500/20 bg-amber-500/5"
                          : "border-border bg-muted/30";
                      const iconClass = isStrong
                        ? "text-emerald-600"
                        : isWeak
                          ? "text-amber-600"
                          : "text-muted-foreground";
                      const badgeClass = isStrong
                        ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                        : isWeak
                          ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                          : "bg-muted text-muted-foreground";
                      return (
                        <div
                          key={key}
                          className={cn("flex flex-col items-center rounded-lg border py-3 px-2 text-center", cellClass)}
                        >
                          <Icon className={cn("mb-1 h-6 w-6", iconClass)} strokeWidth={2.5} />
                          <span className="text-xs font-medium text-foreground">{label}</span>
                          <span className={cn("mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", badgeClass)}>
                            {val.toUpperCase()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {qa.strengths && qa.strengths.length > 0 && (
                <div className={cn(RESULTS_INSET, "border-l-2 border-l-primary/40 p-4")}>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    Strengths
                  </h4>
                  <ul className="list-none space-y-2.5">
                    {qa.strengths.map((strength, i) => (
                      <FeedbackListItem key={i} dotClassName="bg-primary">
                        {strength}
                      </FeedbackListItem>
                    ))}
                  </ul>
                </div>
              )}

              {qa.improvements && qa.improvements.length > 0 && (
                <div className={cn(RESULTS_INSET, "border-l-2 border-l-amber-500/40 p-4")}>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    Improve next
                  </h4>
                  {qa.improvement_quote && (
                    <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">You said</p>
                      <p className="text-sm italic text-foreground/90">&ldquo;{qa.improvement_quote}&rdquo;</p>
                    </div>
                  )}
                  <ul className="list-none space-y-2.5">
                    {qa.improvements.map((improvement, i) => (
                      <FeedbackListItem key={i} dotClassName="bg-amber-600 dark:bg-amber-500">
                        {improvement}
                      </FeedbackListItem>
                    ))}
                  </ul>
                </div>
              )}

              {qa.sample_better_answer && qa.sample_better_answer.trim() && (
                <div className={cn(RESULTS_INSET, "border-l-2 border-l-primary/50 p-4")}>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    Example answer
                  </h4>
                  <p className="leading-relaxed text-foreground/95">{qa.sample_better_answer}</p>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function DetailedFeedbackSection({ questions }: { questions: EvaluatedQuestion[] }) {
  const { ref, inView } = useInViewOnce("400px 0px");

  return (
    <div ref={ref}>
      <Card className={cn(RESULTS_CARD, "mb-6")}>
        <CardHeader className={RESULTS_CARD_HEADER}>
          <CardTitle className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Detailed feedback
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {inView
              ? "Question, answer, and coaching notes — tap a row to expand"
              : `${questions.length} questions — scroll to load coaching notes`}
          </p>
        </CardHeader>
        <CardContent className={RESULTS_CARD_CONTENT}>
          {!inView ? (
            <div className="space-y-3" aria-hidden>
              {questions.map((_, index) => (
                <div
                  key={index}
                  className="h-16 rounded-xl border border-border/60 bg-muted/20"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {questions.map((qa, index) => (
                <QuestionFeedbackCard key={index} qa={qa} index={index} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Format transcript with proper line breaks and speaker labels
const formatTranscript = (transcript: string): string => {
  if (!transcript) return '';
  
  // Try to detect speaker labels (Interviewer:, Candidate:, etc.)
  const speakerPattern = /(Interviewer|Candidate|User|AI|Agent):\s*/gi;
  
  // If we find speaker labels, format with line breaks
  if (speakerPattern.test(transcript)) {
    return transcript
      .replace(/(Interviewer|Candidate|User|AI|Agent):\s*/gi, '\n\n$&')
      .trim()
      .split('\n\n')
      .filter(line => line.trim())
      .join('\n\n');
  }
  
  // If no speaker labels, try to split by sentences and add line breaks
  return transcript
    .replace(/\.\s+/g, '.\n\n')
    .replace(/\?\s+/g, '?\n\n')
    .replace(/!\s+/g, '!\n\n')
    .split('\n\n')
    .filter(line => line.trim())
    .join('\n\n');
};

function InterviewTranscriptContent({ paragraphs }: { paragraphs: string[] }) {
  if (paragraphs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No transcript available for this session.</p>
    );
  }

  return (
    <div className="space-y-2 pr-3">
      {paragraphs.map((paragraph, i) => {
        const speakerMatch = paragraph.match(/^(Interviewer|Candidate|User|AI|Agent):\s*(.*)$/i);
        if (speakerMatch) {
          const [, speaker, text] = speakerMatch;
          const isAI = /^(Interviewer|AI|Agent)$/i.test(speaker);
          const isUser = /^(Candidate|User)$/i.test(speaker);

          return (
            <div
              key={i}
              className={cn(
                "rounded-xl border p-3 sm:p-4",
                isAI
                  ? "ml-0 border-l-2 border-l-primary/70 bg-primary/[0.04] sm:mr-8"
                  : isUser
                    ? "ml-0 border-l-2 border-l-secondary/50 bg-secondary/[0.06] sm:ml-8"
                    : "border-border bg-muted/30",
              )}
              style={{
                transform: "translateZ(0)",
                willChange: "auto",
                contain: "layout style paint",
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:text-xs",
                    isAI
                      ? "bg-primary/10 text-primary"
                      : isUser
                        ? "bg-secondary/15 text-secondary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isAI ? "Interviewer" : isUser ? "You" : speaker}
                </span>
                <p className="flex-1 text-sm font-normal leading-relaxed text-foreground/95">{text}</p>
              </div>
            </div>
          );
        }
        return (
          <p key={i} className="mb-2 text-sm leading-relaxed text-muted-foreground last:mb-0">
            {paragraph}
          </p>
        );
      })}
    </div>
  );
}

export default function Results() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Navigate helper
  const goToDashboard = () => {
    localStorage.removeItem('candidate_context');
    setLocation('/');
  };
  
  // useSearch triggers re-render when URL search changes (e.g. demo switcher); useLocation only has pathname
  const searchString = useSearch();
  const { finalInterviewId, finalSessionId, isMockMode, isDemoMode, demoVariant, fixtureMode, isProcessingPreview } = useMemo(() => {
    const urlParts = location.split('?');
    const queryString = urlParts.length > 1 ? urlParts[1] : '';
    const params = new URLSearchParams(queryString);
    const windowParams = typeof window !== 'undefined' ? new URLSearchParams(searchString ? '?' + searchString : '') : null;
    
    const interviewId = windowParams?.get('interviewId') || params.get("interviewId");
    const sessionId = windowParams?.get('sessionId') || params.get("sessionId");
    const mock = windowParams?.get('mock') || params.get("mock");
    const demo = windowParams?.get('demo') || params.get("demo");
    const fixture = windowParams?.get('fixture') || params.get("fixture");
    const preview = windowParams?.get('preview') || params.get("preview");
    
    return { 
      finalInterviewId: interviewId, 
      finalSessionId: sessionId,
      isMockMode: mock === 'true' || mock === '1',
      isDemoMode: demo === 'true' || demo === '1' || demo === 'business' || demo === 'tech',
      demoVariant: demo === 'business' ? 'business' : 'tech',
      fixtureMode: import.meta.env.DEV && (fixture === 'enhanced' || fixture === 'legacy') ? fixture : null,
      isProcessingPreview: import.meta.env.DEV && preview === 'processing',
    };
  }, [location, searchString]);
  
  // PERF: In mock mode, initialize with mock data immediately to skip the loading-spinner
  // render cycle. This eliminates the CLS caused by the brief spinner flash (the non-composited
  // `spin` animation on the SVG icon triggers a layout shift before results replace it).
  // Dev-only: ?fixture=enhanced|legacy loads fixture for UI render verification.
  const getInitialResults = (): InterviewResults | null => {
    if (isProcessingPreview) {
      const base = mockInterviewResults as InterviewResults;
      return {
        ...base,
        evaluation: {
          ...base.evaluation,
          status: "processing",
          evaluation: null,
        },
      };
    }
    if (fixtureMode === 'enhanced') return fixtureEnhanced as InterviewResults;
    if (fixtureMode === 'legacy') return fixtureLegacy as InterviewResults;
    if (isMockMode) return (demoVariant === 'business' ? mockInterviewResultsBusiness : mockInterviewResults) as InterviewResults;
    return null;
  };
  const [results, setResults] = useState<InterviewResults | null>(getInitialResults);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  /** After poll timeout / max attempts, stop showing full-screen processing (backend may still be working). */
  const [evaluationPollExhausted, setEvaluationPollExhausted] = useState(false);
  /** Session exists but interviewId not linked yet (save still in flight). */
  const [sessionSavePending, setSessionSavePending] = useState(false);
  const [transcriptSheetOpen, setTranscriptSheetOpen] = useState(false);
  /** Reveal main results content only after paint to avoid showing a half-rendered page. */
  const [contentReady, setContentReady] = useState(() => getInitialResults() !== null);
  /** Simulated progress for initial loading bar (0–95%, time-based). */
  const [loadingProgress, setLoadingProgress] = useState(0);
  const loadStartTimeRef = useRef<number | null>(null);

  const prevDemoVariantRef = useRef<string | null>(null);
  const hasShownResultsRef = useRef(false);
  const animationsReady = useDeferredAnimations();

  // White transition when switching between Technical and Non-Technical demos
  const [showWhiteTransition, setShowWhiteTransition] = useState(false);
  useEffect(() => {
    if (!isDemoMode) return;
    const prev = prevDemoVariantRef.current;
    prevDemoVariantRef.current = demoVariant;
    if (prev !== null && prev !== demoVariant) {
      setShowWhiteTransition(true);
      const t = setTimeout(() => setShowWhiteTransition(false), 550);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, demoVariant]);

  // Simulated progress bar for initial loading (time-based, caps at 95%)
  const isInitialLoading = !results && !error && (finalInterviewId || finalSessionId) && !isMockMode && !fixtureMode;
  useEffect(() => {
    if (!isInitialLoading) return;
    if (loadStartTimeRef.current === null) loadStartTimeRef.current = Date.now();
    const interval = setInterval(() => {
      if (!loadStartTimeRef.current) return;
      const elapsedSeconds = (Date.now() - loadStartTimeRef.current) / 1000;
      const progress = Math.min(95, 100 * (1 - Math.exp(-elapsedSeconds / 15)));
      setLoadingProgress(progress);
    }, 150);
    return () => clearInterval(interval);
  }, [isInitialLoading]);

  // Fetch results by interviewId
  const fetchResults = useCallback(async (interviewId: string, signal?: AbortSignal): Promise<InterviewResults | null> => {
    // In mock mode, return mock data immediately - no API calls
    if (isMockMode) {
      devLog.log('[RESULTS] Using mock data for development preview - skipping API calls');
      // Return mock data after a small delay to simulate loading
      await sleep(100, signal);
      return mockInterviewResults as InterviewResults;
    }
    
    try {
      const data = await apiGet(`/api/interviews/${interviewId}/results`, { signal });
      return data;
    } catch (err: any) {
      if (signal?.aborted || err?.statusCode === 499) {
        return null;
      }
      devLog.error('Error fetching results:', err);
      const status = err?.statusCode ?? err?.status;
      const isDevLocalhost =
        import.meta.env.DEV && typeof window !== 'undefined' && window.location.hostname === 'localhost';
      const isTransient =
        status === undefined || status === 502 || status === 503 || status === 504;
      // Dev-only mock fallback for unreachable API — never mask 401/403/404
      if (isDevLocalhost && isTransient) {
        devLog.warn('[RESULTS] Server unavailable, using mock data as fallback');
        return mockInterviewResults as InterviewResults;
      }
      throw err;
    }
  }, [isMockMode]);

  type SessionLookupResult = {
    interviewId: string | null;
    linkStatus: 'linked' | 'pending' | 'not_found';
  };

  // Poll for interviewId by sessionId (fallback)
  const pollForInterviewBySession = useCallback(async (
    sessionId: string,
    signal?: AbortSignal
  ): Promise<SessionLookupResult> => {
    if (isMockMode) {
      return { interviewId: 'mock-interview-id-123', linkStatus: 'linked' };
    }
    
    try {
      const data = await apiGet(`/api/interviews/by-session/${sessionId}`, { signal });
      if (data.interviewId) {
        return { interviewId: data.interviewId, linkStatus: 'linked' };
      }
      return {
        interviewId: null,
        linkStatus: data.linkStatus === 'pending' ? 'pending' : 'pending',
      };
    } catch (err: any) {
      if (signal?.aborted || err?.statusCode === 499) {
        return { interviewId: null, linkStatus: 'not_found' };
      }
      if (err?.statusCode === 404 || err?.status === 404) {
        return { interviewId: null, linkStatus: 'not_found' };
      }
      devLog.error('Error polling for interviewId:', err);
      return { interviewId: null, linkStatus: 'not_found' };
    }
  }, [isMockMode]);

  // Determine evaluation status
  const getEvaluationStatus = useCallback((data: InterviewResults | null): 'pending' | 'processing' | 'completed' | 'failed' | null => {
    if (!data) return null;
    
    if (!data.evaluation) {
      // Interview saved but evaluation never queued (legacy rows) — avoid infinite processing UI
      if (data.interview?.status === 'completed' && data.interview?.transcript) {
        return 'failed';
      }
      return 'pending';
    }
    
    const status = data.evaluation.status;
    const hasFeedback = data.evaluation.evaluation !== null;
    
    if (status === 'complete' && hasFeedback) return 'completed';
    // Row marked complete but no JSON — treat as failed so UI and polling do not spin forever
    if (status === 'complete' && !hasFeedback) return 'failed';
    if (status === 'failed') return 'failed';
    if (status === 'pending' || status === 'processing') return 'processing';

    return 'pending';
  }, []);

  // Polling hook for pending/processing states
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const signal = controller.signal;

    // In mock mode, load mock data immediately and skip polling
    if (isMockMode) {
      devLog.log('[RESULTS] Mock mode enabled - loading', demoVariant === 'business' ? 'business' : 'tech', 'demo');
      setResults((demoVariant === 'business' ? mockInterviewResultsBusiness : mockInterviewResults) as InterviewResults);
      setIsPolling(false);
      return;
    }
    
    // Dev-only: fixture mode uses fixture data, no polling
    if (fixtureMode) {
      devLog.log('[RESULTS] Fixture mode - loading', fixtureMode, 'fixture');
      setResults(fixtureMode === 'enhanced' ? (fixtureEnhanced as InterviewResults) : (fixtureLegacy as InterviewResults));
      setError(null);
      setIsPolling(false);
      return;
    }

    // Dev-only: processing UI preview (?preview=processing)
    if (isProcessingPreview) {
      devLog.log('[RESULTS] Processing preview mode');
      return;
    }
    
    const interviewId = finalInterviewId;
    const sessionId = finalSessionId;
    
    if (!interviewId && !sessionId) {
      setError('No interview ID or session ID provided');
      return;
    }

    setEvaluationPollExhausted(false);
    setSessionSavePending(false);

    let effectiveInterviewId = interviewId;
    let sessionPollCount = 0;
    const SESSION_LINK_MAX_POLLS = 45;

    const startPolling = async () => {
      // First, get interviewId if we only have sessionId
      if (!effectiveInterviewId && sessionId) {
        setError(null);
        setIsPolling(true);
        
        // Poll for interviewId first
        while (!effectiveInterviewId && sessionPollCount < SESSION_LINK_MAX_POLLS && !signal.aborted) {
          sessionPollCount++;
          const lookup = await pollForInterviewBySession(sessionId, signal);
          effectiveInterviewId = lookup.interviewId;
          setSessionSavePending(lookup.linkStatus === 'pending' && !lookup.interviewId);
          
          if (!effectiveInterviewId) {
            await sleep(1000, signal);
          }
        }
        
        if (signal.aborted || cancelled) return;

        setSessionSavePending(false);

        if (!effectiveInterviewId) {
          setError(
            sessionPollCount >= SESSION_LINK_MAX_POLLS
              ? 'Your interview is still being saved. Wait a moment, then tap Retry.'
              : 'Interview not found or not accessible with this account. If you just finished, wait a few seconds and retry.'
          );
          setIsPolling(false);
          return;
        }
      }

      // Now fetch results
      try {
        const initialData = await fetchResults(effectiveInterviewId!, signal);
        if (signal.aborted || cancelled) return;
        if (initialData) {
          setResults(initialData);
          const evalStatus = getEvaluationStatus(initialData);
          
          devLog.log('[RESULTS] Initial fetch:', {
            interviewId: effectiveInterviewId,
            hasEvaluation: !!initialData.evaluation,
            evaluationStatus: initialData.evaluation?.status || 'null',
            evalStatus,
            timestamp: new Date().toISOString()
          });
          
          // If pending or processing OR evaluation is null (not created yet), start polling
          if (evalStatus === 'pending' || evalStatus === 'processing' || !initialData.evaluation) {
            setIsPolling(true);
            const localPollStartTime = Date.now();
            
            let pollAttempts = 0;
            
            const poll = async () => {
              while (!signal.aborted && Date.now() - localPollStartTime <= POLL_TIMEOUT) {
                await sleep(getEvaluationPollDelay(pollAttempts), signal);
                
                if (signal.aborted || cancelled) break;
                
                try {
                  const updatedData = await fetchResults(effectiveInterviewId!, signal);
                  if (signal.aborted || cancelled) break;
                  if (updatedData) {
                    setResults(updatedData);
                    const updatedStatus = getEvaluationStatus(updatedData);
                    
                    // Stop polling if completed or failed
                    if (updatedStatus === 'completed' || updatedStatus === 'failed') {
                      setIsPolling(false);
                      setEvaluationPollExhausted(false);
                      return;
                    }
                  }
                } catch (err) {
                  if (signal.aborted || cancelled) return;
                  devLog.error('Error during polling:', err);
                }
                
                pollAttempts++;
                
                // Check timeout using local variable (not stale state)
                if (Date.now() - localPollStartTime > POLL_TIMEOUT) {
                  setIsPolling(false);
                  setEvaluationPollExhausted(true);
                  toast({
                    title: "Analysis taking longer than expected",
                    description: "Your interview has been saved. Results will appear when ready.",
                  });
                  return;
                }
              }
              
              // Max polls reached
              if (signal.aborted || cancelled) return;
              setIsPolling(false);
              setEvaluationPollExhausted(true);
            };
            
            poll();
          } else {
            setIsPolling(false);
          }
        }
      } catch (err: any) {
        if (signal.aborted || cancelled || err?.name === 'AbortError' || err?.statusCode === 499) {
          return;
        }
        devLog.error('Error loading results:', err);
        // ApiError (from lib/api.ts) exposes HTTP status as `statusCode`; tolerate `status`
        // as a defensive fallback for any non-ApiError shapes.
        const httpStatus = err?.statusCode ?? err?.status;
        if (httpStatus === 404) {
          setError('Interview not found or not accessible with this account.');
        } else {
          setError(err.message || 'Failed to load results');
        }
        setIsPolling(false);
      }
    };

    startPolling();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [finalInterviewId, finalSessionId, isMockMode, demoVariant, fixtureMode, isProcessingPreview, fetchResults, pollForInterviewBySession, getEvaluationStatus, toast]);

  const handleRetry = () => {
    setError(null);
    setResults(null);
    setIsPolling(false);
    // Trigger re-fetch by updating a dependency
    window.location.reload();
  };

  const handleReturnToDashboard = goToDashboard;

  // Determine current status
  const evalStatus = getEvaluationStatus(results);
  const hasCompleteFeedback = results?.evaluation?.evaluation !== null;
  const overallScore = hasCompleteFeedback 
    ? (results?.evaluation?.overallScore || results?.evaluation?.evaluation?.overall_score || null)
    : null;

  // Memoize expensive calculations
  const formattedTranscript = useMemo(() => {
    if (!results?.interview?.transcript) return '';
    return formatTranscript(results.interview.transcript);
  }, [results?.interview?.transcript]);

  const transcriptParagraphs = useMemo(() => {
    if (!formattedTranscript) return [];
    return formattedTranscript.split('\n\n');
  }, [formattedTranscript]);

  const hasTranscript = transcriptParagraphs.length > 0;
  const questionCount = useMemo(() => {
    const evaluatedCount = results?.evaluation?.evaluation?.questions?.length;
    if (evaluatedCount && evaluatedCount > 0) return evaluatedCount;
    return transcriptParagraphs.filter((p) => /^(Interviewer|AI|Agent):/i.test(p)).length;
  }, [results?.evaluation?.evaluation?.questions, transcriptParagraphs]);
  const questionCountLabel =
    questionCount === 1 ? "1 question" : `${questionCount} questions`;

  const averageQuestionScore = useMemo(() => {
    if (!results?.evaluation?.evaluation?.questions?.length) return 0;
    return Math.round(
      results.evaluation.evaluation.questions.reduce((sum, q) => sum + q.score, 0) / 
      results.evaluation.evaluation.questions.length
    );
  }, [results?.evaluation?.evaluation?.questions]);

  // Reveal main results content only after the browser has painted (avoids half-rendered flash).
  // When switching demos, delay reveal by 550ms so white overlay hides first, then content animates in.
  const showingResultsUI = !!(results && (evalStatus === 'completed' || evalStatus === 'failed' || results.interview));
  useEffect(() => {
    if (!showingResultsUI) return;
    const isDemoSwitch = isDemoMode && hasShownResultsRef.current;
    hasShownResultsRef.current = true;
    if (!isDemoSwitch) {
      setContentReady(true);
      return;
    }
    setContentReady(false);
    const t = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setContentReady(true));
      });
    }, 550);
    return () => clearTimeout(t);
  }, [showingResultsUI, isDemoMode, demoVariant]);

  // Lock page scroll while transcript drawer is open (html has overflow-y:auto globally).
  useEffect(() => {
    if (!transcriptSheetOpen) return;

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    const prevBodyPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      body.style.paddingRight = prevBodyPaddingRight;
      window.scrollTo(0, scrollY);
    };
  }, [transcriptSheetOpen]);

  // Smooth time-based progress for processing UI
  const [smoothProgress, setSmoothProgress] = useState(0);
  const processingStartRef = useRef<number | null>(null);

  useEffect(() => {
    const isProcessing =
      results &&
      !evaluationPollExhausted &&
      (evalStatus === 'pending' || evalStatus === 'processing' || isPolling);
    if (!isProcessing) {
      // Reset when not processing
      processingStartRef.current = null;
      setSmoothProgress(0);
      return;
    }

    if (processingStartRef.current === null) processingStartRef.current = Date.now();

    // Determine a base boost from actual evaluation status
    let statusBoost = 0;
    if (results?.evaluation) {
      const status = results.evaluation.status;
      if (status === 'pending') statusBoost = 15;
      else if (status === 'processing') statusBoost = 40;
      else if (status === 'complete') statusBoost = 90;
    }

    const interval = setInterval(() => {
      if (!processingStartRef.current) return;
      const elapsed = (Date.now() - processingStartRef.current) / 1000;
      // Smooth exponential curve: rises quickly at first, then slows down, caps at 92%
      const timeBased = 92 * (1 - Math.exp(-elapsed / 20));
      // Blend time-based progress with status-based boost (whichever is higher)
      const blended = Math.max(timeBased, statusBoost);
      setSmoothProgress(Math.min(92, Math.round(blended)));
    }, 200);

    return () => clearInterval(interval);
  }, [results, evalStatus, isPolling, evaluationPollExhausted]);

  // Render Processing UI
  const renderProcessingUI = () => {
    // Determine step from actual backend status
    let statusStep = 1;
    if (results?.evaluation) {
      const status = results.evaluation.status;
      if (status === 'processing') {
        statusStep = results.interview.transcript ? 3 : 2;
      } else if (status === 'pending') {
        statusStep = 2;
      } else if (status === 'complete' && results.evaluation.evaluation) {
        statusStep = 4;
      }
    }

    // Determine step from time-based progress (auto-advance through steps)
    let timeStep = 1;
    if (smoothProgress >= 75) timeStep = 4;
    else if (smoothProgress >= 45) timeStep = 3;
    else if (smoothProgress >= 15) timeStep = 2;

    // Use whichever is further ahead
    const currentStep = Math.max(statusStep, timeStep);

    const STEP_DESCRIPTIONS: Record<number, string> = {
      1: "Your interview has been saved",
      2: "Preparing your interview for analysis...",
      3: "Evaluating your answers using AI...",
      4: "Finalizing your results...",
    };
    const stepDescription = STEP_DESCRIPTIONS[currentStep] || "";

    const displayProgress = smoothProgress;

    return (
      <AnimatedBackground fixedDecor className={LOADING_SCREEN_SHELL}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
          className={LOADING_SCREEN_FRAME}
        >
          <Card className={LOADING_CARD}>
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
              <CardTitle className="text-center text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">
                Processing your interview
              </CardTitle>
              <p className="mt-1 text-balance text-center text-sm text-muted-foreground">
                This can take a few minutes when feedback needs a retry
              </p>
            </CardHeader>
            <CardContent className="overflow-visible p-4 pt-4 sm:p-6 sm:pt-4">
              <div className="flex flex-col gap-5">
                <ResultsLoadingWordmark
                  progress={Math.min(100, (displayProgress / 92) * 100)}
                  statusLine={stepDescription}
                  animateStatus
                  statusKey={currentStep}
                />

                <div className="border-t border-border pt-3">
                  <Button
                    onClick={handleReturnToDashboard}
                    variant="outline"
                    className="w-full font-medium"
                    aria-label="Return to home"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to home
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatedBackground>
    );
  };

  // Render Error UI
  if (error && !results) {
    return (
      <AnimatedBackground fixedDecor className={LOADING_SCREEN_SHELL}>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
          className={LOADING_SCREEN_FRAME}
        >
          <Card className={cn(RESULTS_CARD, "w-full max-w-md")}>
          <CardContent className="p-4 pt-6 sm:p-6 sm:pt-6">
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <div className="text-center">
                <h2 className="mb-2 text-xl font-semibold text-foreground">Unable to load results</h2>
                <p className="mb-6 text-sm text-muted-foreground">{error}</p>
                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <Button
                    onClick={handleRetry}
                    variant="default"
                    className="min-w-[120px] font-medium"
                    aria-label="Retry loading results"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                  <Button
                    onClick={handleReturnToDashboard}
                    variant="outline"
                    className="min-w-[120px] font-medium"
                    aria-label="Return to home"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to home
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      </AnimatedBackground>
    );
  }

  // Show Processing UI if pending/processing (unless we already gave up polling — then show results + banner)
  if (
    !evaluationPollExhausted &&
    (evalStatus === 'pending' || evalStatus === 'processing' || isPolling) &&
    results
  ) {
    return renderProcessingUI();
  }

  // Show Results UI if completed or if we have data (even if evaluation failed)
  if (results && (evalStatus === 'completed' || evalStatus === 'failed' || results.interview)) {
    return (
      <AnimatedBackground fixedDecor className={RESULTS_PAGE_SHELL}>
        <AnimatePresence>
          {showWhiteTransition && (
            <motion.div
              key="demo-transition-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed inset-0 z-[9999] bg-background pointer-events-none"
              aria-hidden="true"
              style={{ transform: 'translateZ(0)' }}
            />
          )}
        </AnimatePresence>
        <div
          className={cn(
            "relative z-10 min-h-full transition-opacity duration-300",
            contentReady ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          aria-hidden={!contentReady}
        >
        <div
          key={demoVariant}
          className="relative z-10 mx-auto max-w-3xl space-y-6 pb-[max(4rem,env(safe-area-inset-bottom))]"
        >
          {/* Demo Mode Banner */}
          {isDemoMode && (
            <div
              className={cn(
                RESULTS_CARD,
                "border-primary/20 bg-gradient-to-r from-primary/8 via-card to-secondary/8 px-4 py-4 sm:px-6",
                animationsReady && contentReady && "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-500",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground">
                      {demoVariant === "business" ? "Non-technical sample" : "Technical sample"}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {demoVariant === "business"
                        ? "Illustrates marketing, business, and comms-style coaching."
                        : "Illustrates software and analytical interview coaching."}
                    </p>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                  <Button
                    onClick={() =>
                      setLocation(
                        `/results?mock=true&interviewId=demo&demo=${demoVariant === "business" ? "tech" : "business"}`
                      )
                    }
                    variant="outline"
                    size="sm"
                    className="w-full font-medium sm:w-auto"
                  >
                    {demoVariant === "business" ? "View technical sample" : "View non-technical sample"}
                  </Button>
                  <Button onClick={() => setLocation("/")} size="sm" className="w-full font-medium sm:w-auto">
                    Start real interview
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Breadcrumb Navigation - Sticky - Optimized for scroll */}
          <nav
            className="sticky top-[max(0px,env(safe-area-inset-top))] z-50 -mx-4 mb-4 flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-border/70 bg-card/90 px-3 py-2.5 text-sm text-muted-foreground shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/75 sm:-mx-0 sm:px-4"
            style={{ 
              willChange: 'transform',
              transform: 'translate3d(0, 0, 0)',
              backfaceVisibility: 'hidden',
              contain: 'layout style',
            }}
            aria-label="Breadcrumb"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={goToDashboard}
              className="h-auto p-2 font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              aria-label="Return to dashboard"
            >
              <Home className="mr-1 h-4 w-4" />
              Home
            </Button>
            <span className="text-border" aria-hidden>/</span>
            <span className="font-semibold text-foreground">Interview results</span>
            </nav>

          {/* Overall Score Badge - Wide Hero Banner */}
          {overallScore !== null && (
            <div className="mb-8">
              <div className="relative mx-auto max-w-5xl">
                {/* Main banner container -- no outer glow div; it caused a visible
                    misaligned arc outside the rounded corners. The gradient + shadow-2xl
                    + border provide all the depth needed. */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4 shadow-2xl ring-1 ring-white/10 sm:p-6 md:p-8">
                  {/* Restrained highlights — premium SaaS, not loud rainbow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-indigo-500/10" />
                  <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-sky-400/10 blur-2xl sm:h-56 sm:w-56" />
                  <div className="absolute -bottom-10 -left-8 h-40 w-40 rounded-full bg-violet-500/10 blur-2xl sm:h-48 sm:w-48" />

                  {/* Content Grid — score first on mobile, 3-column on md+ */}
                  <div className="relative z-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6 md:items-center">
                    {/* Left Panel - Interview Stats (desktop only) */}
                    <div className="hidden flex-col gap-3 text-white md:flex">
                      <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                          <CheckCircle2 className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Questions</p>
                          <p className="text-xl font-bold">{results.evaluation?.evaluation?.questions?.length || 0} Answered</p>
                        </div>
                      </div>
                      {results.interview?.durationSeconds && (
                        <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                            <Clock className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Duration</p>
                            <p className="text-xl font-bold">
                              {Math.floor((results.interview.durationSeconds || 0) / 60)}m {(results.interview.durationSeconds || 0) % 60}s
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Center Panel - Score (static first paint for LCP) */}
                    <div className="order-1 flex flex-col items-center gap-3 py-2 sm:gap-4 sm:py-4 md:order-none">
                      <div>
                        {overallScore >= 80 ? (
                          <Award className="h-14 w-14 text-amber-200/90 sm:h-16 sm:w-16 md:h-20 md:w-20" />
                        ) : overallScore >= 60 ? (
                          <TrendingUp className="h-14 w-14 text-emerald-200/90 sm:h-16 sm:w-16 md:h-20 md:w-20" />
                        ) : (
                          <CheckCircle2 className="h-14 w-14 text-sky-200/90 sm:h-16 sm:w-16 md:h-20 md:w-20" />
                        )}
                      </div>

                      <span className="text-sm font-medium uppercase tracking-wide text-white/80">Readiness Score</span>

                      <div className="flex items-baseline gap-2">
                        <span className="text-6xl font-black text-white drop-shadow-2xl sm:text-7xl md:text-8xl">
                          {overallScore}
                        </span>
                        <span className="mb-2 text-2xl font-bold text-white/90 sm:text-3xl md:text-4xl">/100</span>
                      </div>

                      <div className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-white/20 shadow-inner sm:h-4">
                        <div
                          className={cn(
                            "h-full rounded-full bg-gradient-to-r from-amber-200/90 via-white/90 to-sky-100/90",
                            animationsReady && "transition-[width] duration-1000 ease-out",
                          )}
                          style={{ width: `${overallScore}%` }}
                        />
                      </div>

                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={cn(
                            "text-center text-base font-semibold tracking-tight drop-shadow-sm sm:text-lg",
                            getReadinessLabel(overallScore).colorClass,
                          )}
                        >
                          {getReadinessLabel(overallScore).label}
                        </span>
                      </div>
                    </div>

                    {/* Right Panel - Performance Insights (desktop only) */}
                    <div className="hidden flex-col gap-3 text-white md:flex">
                      <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                          <TrendingUp className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Percentile</p>
                          <p className="text-xl font-bold">
                            Top {overallScore >= 90 ? "10" : overallScore >= 80 ? "20" : overallScore >= 70 ? "30" : overallScore >= 60 ? "40" : "50"}%
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                          <Sparkles className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Avg Score</p>
                          <p className="text-xl font-bold">
                            {overallScore >= 80 ? "+12" : overallScore >= 70 ? "+8" : overallScore >= 60 ? "+5" : "+2"} vs Avg
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Mobile 2×2 stats grid */}
                    <div className="order-2 grid grid-cols-2 gap-3 text-white md:hidden">
                      <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                          <CheckCircle2 className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Questions</p>
                          <p className="truncate text-base font-bold">{results.evaluation?.evaluation?.questions?.length || 0} Answered</p>
                        </div>
                      </div>
                      {results.interview?.durationSeconds ? (
                        <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                            <Clock className="h-5 w-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Duration</p>
                            <p className="truncate text-base font-bold">
                              {Math.floor((results.interview.durationSeconds || 0) / 60)}m {(results.interview.durationSeconds || 0) % 60}s
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                            <TrendingUp className="h-5 w-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Percentile</p>
                            <p className="truncate text-base font-bold">
                              Top {overallScore >= 90 ? "10" : overallScore >= 80 ? "20" : overallScore >= 70 ? "30" : overallScore >= 60 ? "40" : "50"}%
                            </p>
                          </div>
                        </div>
                      )}
                      {results.interview?.durationSeconds && (
                        <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                            <TrendingUp className="h-5 w-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Percentile</p>
                            <p className="truncate text-base font-bold">
                              Top {overallScore >= 90 ? "10" : overallScore >= 80 ? "20" : overallScore >= 70 ? "30" : overallScore >= 60 ? "40" : "50"}%
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                          <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Avg Score</p>
                          <p className="truncate text-base font-bold">
                            {overallScore >= 80 ? "+12" : overallScore >= 70 ? "+8" : overallScore >= 60 ? "+5" : "+2"} vs Avg
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results Header Card -- standalone, no giant wrapper.
              PERF: Removed the monolithic 9,773px Card + backdrop-blur-sm that
              was causing white-flash checkerboarding during fast scroll and
              hiding the animated background behind an opaque white wall. */}
          <Card className={cn(RESULTS_CARD, "mb-6")}>
            <CardHeader className={RESULTS_CARD_HEADER}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Session
                  </p>
                  <CardTitle className="mb-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    Interview results
                  </CardTitle>
                  {results.interview?.durationSeconds && (
                    <div className="mt-1 hidden items-center gap-2 text-sm font-medium text-muted-foreground sm:flex">
                      <Clock className="h-4 w-4 shrink-0" aria-hidden />
                      <span>
                        {Math.floor((results.interview.durationSeconds || 0) / 60)}m{" "}
                        {(results.interview.durationSeconds || 0) % 60}s
                      </span>
                    </div>
                  )}
                </div>
                {hasTranscript && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 font-medium sm:w-auto"
                    onClick={() => setTranscriptSheetOpen(true)}
                    aria-label="View full interview transcript"
                  >
                    <FileText className="mr-2 h-4 w-4" aria-hidden />
                    View transcript
                    {questionCount > 0 && (
                      <span className="ml-1.5 text-muted-foreground">
                        ({questionCountLabel})
                      </span>
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
          </Card>

          {/* Each section is now its own card so the animated background shows between them */}
          <div className="space-y-6">

              {/* Still waiting after poll timeout — avoid infinite “Generating feedback” screen */}
              {evaluationPollExhausted &&
                !hasCompleteFeedback &&
                (evalStatus === 'pending' || evalStatus === 'processing') && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={contentReady ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.55 }}
                >
                  <Card
                    className={cn(
                      RESULTS_CARD,
                      "mb-6 border-amber-500/25 bg-amber-50/40 dark:bg-amber-950/20"
                    )}
                  >
                    <CardContent className={cn(RESULTS_CARD_CONTENT, "pt-4 sm:pt-6")}>
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
                          <Clock className="h-6 w-6 text-amber-800 dark:text-amber-200" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Feedback is still generating</h3>
                        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                          Analysis is taking longer than usual. Try refreshing this page in a minute or open your
                          dashboard later.
                        </p>
                        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                          {hasTranscript && (
                            <Button variant="outline" size="sm" onClick={() => setTranscriptSheetOpen(true)}>
                              <FileText className="mr-2 h-4 w-4" />
                              View transcript
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh results
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Evaluation Failed Message */}
              {evalStatus === 'failed' && results.evaluation && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={contentReady ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.55 }}
                >
                  <Card
                    className={cn(
                      RESULTS_CARD,
                      "mb-6 border-destructive/20 bg-destructive/[0.06]"
                    )}
                  >
                    <CardContent className={cn(RESULTS_CARD_CONTENT, "pt-4 sm:pt-6")}>
                      <div className="flex flex-col items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                          <AlertCircle className="h-7 w-7 text-destructive" />
                        </div>
                        <div className="text-center">
                          <h3 className="mb-2 text-xl font-semibold text-foreground">Evaluation unavailable</h3>
                          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                            We could not generate scored feedback. You can still review your full interview transcript.
                          </p>
                          {hasTranscript && (
                            <Button variant="outline" size="sm" onClick={() => setTranscriptSheetOpen(true)}>
                              <FileText className="mr-2 h-4 w-4" />
                              View transcript
                            </Button>
                          )}
                          {results.evaluation.error && (
                            <p className="rounded-lg border border-border bg-muted/50 p-3 text-left text-xs font-mono text-muted-foreground">
                              {results.evaluation.error}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Complete Evaluation Results */}
              {hasCompleteFeedback && results.evaluation?.evaluation && (
                <>
                  {/* Overall Feedback Section */}
                  {(results.evaluation.evaluation.overall_strengths?.length || results.evaluation.evaluation.overall_improvements?.length) && (
                    <div>
                      <Card className={cn(RESULTS_CARD, "relative mb-6 overflow-hidden")}>
                        <CardHeader className={RESULTS_CARD_HEADER}>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Sparkles className="h-5 w-5" aria-hidden />
                            </div>
                            <div>
                              <CardTitle className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                                Overall feedback
                              </CardTitle>
                              <p className="mt-1 text-sm text-muted-foreground">Across your full interview</p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className={RESULTS_CARD_CONTENT}>
                          <div className="space-y-4">
                            {results.evaluation.evaluation.overall_strengths && results.evaluation.evaluation.overall_strengths.length > 0 && (
                              <div
                                className={cn(RESULTS_INSET, "border-l-2 border-l-primary/50 p-4")}
                                style={{ transform: "translateZ(0)", willChange: "auto" }}
                              >
                                <h4 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                                  Strengths
                                </h4>
                                <ul className="list-none space-y-2.5">
                                  {results.evaluation.evaluation.overall_strengths.map((strength, i) => (
                                    <FeedbackListItem key={i} dotClassName="bg-primary">
                                      {strength}
                                    </FeedbackListItem>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {results.evaluation.evaluation.overall_improvements && results.evaluation.evaluation.overall_improvements.length > 0 && (
                              <div
                                className={cn(RESULTS_INSET, "border-l-2 border-l-amber-500/50 p-4")}
                                style={{ transform: "translateZ(0)", willChange: "auto" }}
                              >
                                <h4 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                                  <TrendingUp className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                                  Focus next
                                </h4>
                                <ul className="list-none space-y-2.5">
                                  {results.evaluation.evaluation.overall_improvements.map((improvement, i) => (
                                    <FeedbackListItem key={i} dotClassName="bg-amber-600 dark:bg-amber-500">
                                      {improvement}
                                    </FeedbackListItem>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Score Comparison Card - Optimized */}
                  <div>
                    <Card className={cn(RESULTS_CARD, "mb-6")}>
                      <CardHeader className={RESULTS_CARD_HEADER}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                            <TrendingUp className="h-5 w-5" aria-hidden />
                          </div>
                          <div>
                            <CardTitle className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                              Benchmark
                            </CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">Illustrative comparison for this session</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className={RESULTS_CARD_CONTENT}>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">Your score</span>
                              <span className="text-2xl font-bold tabular-nums text-primary">{overallScore}</span>
                            </div>
                            <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${overallScore}%` }}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-muted-foreground">Reference average</span>
                              <span className="text-2xl font-bold tabular-nums text-muted-foreground">
                                {overallScore >= 80 ? 73 : overallScore >= 70 ? 67 : overallScore >= 60 ? 62 : 58}
                              </span>
                            </div>
                            <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-muted-foreground/30"
                                style={{
                                  width: `${overallScore >= 80 ? 73 : overallScore >= 70 ? 67 : overallScore >= 60 ? 62 : 58}%`,
                                  transform: "translateZ(0)",
                                  willChange: "auto",
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div
                          className={cn(RESULTS_INSET, "mt-6 p-4")}
                          style={{ transform: "translateZ(0)", willChange: "auto" }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Sparkles className="h-4 w-4" aria-hidden />
                            </div>
                            <div>
                              <p className="mb-1 text-sm font-semibold text-foreground">
                                {overallScore >= 80
                                  ? "Strong session"
                                  : overallScore >= 70
                                    ? "Solid progress"
                                    : overallScore >= 60
                                      ? "Good foundation"
                                      : "Build from here"}
                              </p>
                              <p className="text-sm leading-relaxed text-muted-foreground">
                                {overallScore >= 80
                                  ? `You scored ${
                                      overallScore - (overallScore >= 80 ? 73 : 67)
                                    } points above the reference average for this view.`
                                  : overallScore >= 70
                                    ? `About ${overallScore - 67} points above the reference average—keep adding specifics.`
                                    : overallScore >= 60
                                      ? `About ${overallScore - 62} points above the reference average. Add concrete examples.`
                                      : `About ${overallScore - 58} points above the reference average. Use the section below to iterate.`}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Per-Question Evaluation Section */}
                  {results.evaluation.evaluation.questions && results.evaluation.evaluation.questions.length > 0 && (
                    <>
                      {/* Skills Breakdown Chart - Optimized */}
                      <div>
                        <Card className={cn(RESULTS_CARD, "mb-6")}>
                          <CardHeader className={RESULTS_CARD_HEADER}>
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Award className="h-5 w-5" aria-hidden />
                              </div>
                              <div>
                                <CardTitle className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                                  Per-question scores
                                </CardTitle>
                                <p className="mt-1 text-sm text-muted-foreground">At a glance by prompt</p>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className={RESULTS_CARD_CONTENT}>
                            <div className="space-y-4">
                              {results.evaluation.evaluation.questions.map((qa, index) => (
                                <div key={index} className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">Question {index + 1}</span>
                                    <span
                                      className={cn(
                                        "rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                                        qa.score >= 80
                                          ? "bg-primary/10 text-primary"
                                          : qa.score >= 60
                                            ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                            : qa.score >= 40
                                              ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                                              : "bg-destructive/10 text-destructive"
                                      )}
                                    >
                                      {qa.score}/100
                                    </span>
                                  </div>
                                  <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={cn("h-full rounded-full bg-gradient-to-r", scoreBarClass(qa.score))}
                                      style={{
                                        width: `${qa.score}%`,
                                        transform: "translateZ(0)",
                                        willChange: "auto",
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div
                              className={cn(RESULTS_INSET, "mt-5 p-4")}
                              style={{ transform: "translateZ(0)", willChange: "auto" }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-foreground">Average across questions</span>
                                <span className="text-2xl font-bold tabular-nums text-primary">
                                  {averageQuestionScore}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <DetailedFeedbackSection questions={results.evaluation.evaluation.questions} />

                  </>
                )}
                </>
              )}

              {/* Return to Dashboard Button */}
              <div
                className="mt-8 flex justify-center"
              >
                <Button
                  onClick={handleReturnToDashboard}
                  variant="outline"
                  size="lg"
                  className="w-full max-w-sm font-medium sm:min-w-[220px] sm:w-auto"
                  aria-label="Return to dashboard"
                >
                  <ArrowLeft className="mr-2 h-5 w-5" />
                  Back to home
                </Button>
              </div>
          </div>{/* end space-y-6 sections wrapper */}
        </div>
        </div>

        <Sheet open={transcriptSheetOpen} onOpenChange={setTranscriptSheetOpen}>
          <SheetContent
            side="right"
            className="flex h-full w-full flex-col gap-0 p-0 pt-[env(safe-area-inset-top)] sm:max-w-xl [&>button]:top-[max(1rem,env(safe-area-inset-top))]"
            aria-describedby="transcript-sheet-description"
          >
            <SheetHeader className="space-y-1 border-b border-border/80 px-4 py-4 text-left sm:px-6 sm:py-5">
              <SheetTitle className="text-xl font-semibold tracking-tight">Interview transcript</SheetTitle>
              <SheetDescription id="transcript-sheet-description">
                Speaker-labeled conversation
                {questionCount > 0 && ` · ${questionCountLabel}`}
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1 px-4 py-4 sm:px-6">
              <InterviewTranscriptContent paragraphs={transcriptParagraphs} />
            </ScrollArea>
            <div className="border-t border-border/80 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              <Button
                variant="outline"
                className="w-full font-medium"
                onClick={() => setTranscriptSheetOpen(false)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to results
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </AnimatedBackground>
    );
  }

  // Loading state (initial load) - simulated progress bar
  const initialStatusLine = sessionSavePending
    ? "Saving your interview…"
    : "Fetching your interview data…";

  return (
    <AnimatedBackground fixedDecor className={LOADING_SCREEN_SHELL}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
        className={LOADING_SCREEN_FRAME}
      >
        <Card className={LOADING_CARD}>
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="text-center text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">
              Loading results
            </CardTitle>
            <p className="mt-1 text-balance text-center text-sm text-muted-foreground">
              Please wait while we retrieve your interview
            </p>
          </CardHeader>
          <CardContent className="overflow-visible p-4 pt-4 sm:p-6 sm:pt-4">
            <ResultsLoadingWordmark
              progress={Math.min(100, (loadingProgress / 95) * 100)}
              statusLine={initialStatusLine}
            />
          </CardContent>
        </Card>
      </motion.div>
    </AnimatedBackground>
  );
}
