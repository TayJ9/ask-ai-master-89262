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
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, XCircle, RefreshCw, ArrowLeft, Home, Clock, Sparkles, TrendingUp, Award } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { mockInterviewResults, mockInterviewResultsBusiness } from "@/mocks/resultsMockData";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import { devLog } from "@/lib/utils";
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

// Processing steps for the progress stepper
const PROCESSING_STEPS = [
  { id: 1, text: "Interview Saved", completed: true },
  { id: 2, text: "Processing Transcript...", completed: false },
  { id: 3, text: "Analyzing Responses...", completed: false },
  { id: 4, text: "Generating Feedback...", completed: false },
];

const POLL_INTERVAL = 3000; // 3 seconds
const POLL_TIMEOUT = 60000; // 60 seconds

/** Readiness Score labels for presentation—avoids binary hiring framing. */
function getReadinessLabel(score: number): { label: string; colorClass: string } {
  if (score >= 90) return { label: '🚀 Interview Ready', colorClass: 'text-green-300' };
  if (score >= 70) return { label: '📈 Competitive Candidate', colorClass: 'text-cyan-300' };
  return { label: '🛠️ Needs Practice', colorClass: 'text-amber-300' };
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
  const { finalInterviewId, finalSessionId, isMockMode, isDemoMode, demoVariant, fixtureMode } = useMemo(() => {
    const urlParts = location.split('?');
    const queryString = urlParts.length > 1 ? urlParts[1] : '';
    const params = new URLSearchParams(queryString);
    const windowParams = typeof window !== 'undefined' ? new URLSearchParams(searchString ? '?' + searchString : '') : null;
    
    const interviewId = windowParams?.get('interviewId') || params.get("interviewId");
    const sessionId = windowParams?.get('sessionId') || params.get("sessionId");
    const mock = windowParams?.get('mock') || params.get("mock");
    const demo = windowParams?.get('demo') || params.get("demo");
    const fixture = windowParams?.get('fixture') || params.get("fixture");
    
    return { 
      finalInterviewId: interviewId, 
      finalSessionId: sessionId,
      isMockMode: mock === 'true' || mock === '1',
      isDemoMode: demo === 'true' || demo === '1' || demo === 'business' || demo === 'tech',
      demoVariant: demo === 'business' ? 'business' : 'tech',
      fixtureMode: import.meta.env.DEV && (fixture === 'enhanced' || fixture === 'legacy') ? fixture : null
    };
  }, [location, searchString]);
  
  // PERF: In mock mode, initialize with mock data immediately to skip the loading-spinner
  // render cycle. This eliminates the CLS caused by the brief spinner flash (the non-composited
  // `spin` animation on the SVG icon triggers a layout shift before results replace it).
  // Dev-only: ?fixture=enhanced|legacy loads fixture for UI render verification.
  const getInitialResults = (): InterviewResults | null => {
    if (fixtureMode === 'enhanced') return fixtureEnhanced as InterviewResults;
    if (fixtureMode === 'legacy') return fixtureLegacy as InterviewResults;
    if (isMockMode) return (demoVariant === 'business' ? mockInterviewResultsBusiness : mockInterviewResults) as InterviewResults;
    return null;
  };
  const [results, setResults] = useState<InterviewResults | null>(getInitialResults);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollStartTime, setPollStartTime] = useState<number | null>(null);
  /** Reveal main results content only after paint to avoid showing a half-rendered page. */
  const [contentReady, setContentReady] = useState(false);
  /** Simulated progress for initial loading bar (0–95%, time-based). */
  const [loadingProgress, setLoadingProgress] = useState(0);
  const loadStartTimeRef = useRef<number | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const prevDemoVariantRef = useRef<string | null>(null);
  const hasShownResultsRef = useRef(false);

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
  const fetchResults = useCallback(async (interviewId: string): Promise<InterviewResults | null> => {
    // In mock mode, return mock data immediately - no API calls
    if (isMockMode) {
      devLog.log('[RESULTS] Using mock data for development preview - skipping API calls');
      // Return mock data after a small delay to simulate loading
      await new Promise(resolve => setTimeout(resolve, 100));
      return mockInterviewResults as InterviewResults;
    }
    
    try {
      const data = await apiGet(`/api/interviews/${interviewId}/results`);
      return data;
    } catch (err: any) {
      devLog.error('Error fetching results:', err);
      // In development, if server is down, fall back to mock data
      if (import.meta.env.DEV && window.location.hostname === 'localhost') {
        devLog.warn('[RESULTS] Server unavailable, using mock data as fallback');
        return mockInterviewResults as InterviewResults;
      }
      throw err;
    }
  }, [isMockMode]);

  // Poll for interviewId by sessionId (fallback)
  const pollForInterviewId = useCallback(async (sessionId: string): Promise<string | null> => {
    // In mock mode, return a mock interview ID
    if (isMockMode) {
      return "mock-interview-id-123";
    }
    
    try {
      const data = await apiGet(`/api/interviews/by-session/${sessionId}`);
      return data.interviewId || null;
    } catch (err: any) {
      devLog.error('Error polling for interviewId:', err);
      return null;
    }
  }, [isMockMode]);

  // Determine evaluation status
  const getEvaluationStatus = useCallback((data: InterviewResults | null): 'pending' | 'processing' | 'completed' | 'failed' | null => {
    if (!data) return null;
    
    if (!data.evaluation) return 'pending';
    
    const status = data.evaluation.status;
    const hasFeedback = data.evaluation.evaluation !== null;
    
    if (status === 'complete' && hasFeedback) return 'completed';
    if (status === 'failed') return 'failed';
    if (status === 'pending' || status === 'processing') return 'processing';
    
    return 'pending';
  }, []);

  // Polling hook for pending/processing states
  useEffect(() => {
    if (!isMountedRef.current) return;
    
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
    
    const interviewId = finalInterviewId;
    const sessionId = finalSessionId;
    
    if (!interviewId && !sessionId) {
      setError('No interview ID or session ID provided');
      return;
    }

    let effectiveInterviewId = interviewId;
    let pollCount = 0;
    const maxPolls = Math.floor(POLL_TIMEOUT / POLL_INTERVAL); // ~20 polls in 60 seconds

    const startPolling = async () => {
      // First, get interviewId if we only have sessionId
      if (!effectiveInterviewId && sessionId) {
        setError(null);
        setIsPolling(true);
        
        // Poll for interviewId first
        while (!effectiveInterviewId && pollCount < 30) {
          pollCount++;
          effectiveInterviewId = await pollForInterviewId(sessionId);
          
          if (!effectiveInterviewId) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        if (!effectiveInterviewId) {
          setError('Interview not found. Please try again in a few moments.');
          setIsPolling(false);
          return;
        }
      }

      // Now fetch results
      try {
        const initialData = await fetchResults(effectiveInterviewId!);
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
            const localPollStartTime = Date.now(); // Use local variable to avoid stale closure
            setPollStartTime(localPollStartTime);
            
            let pollAttempts = 0;
            
            const poll = async () => {
              while (pollAttempts < maxPolls && isMountedRef.current) {
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                
                if (!isMountedRef.current) break;
                
                try {
                  const updatedData = await fetchResults(effectiveInterviewId!);
                  if (updatedData) {
                    setResults(updatedData);
                    const updatedStatus = getEvaluationStatus(updatedData);
                    
                    // Stop polling if completed or failed
                    if (updatedStatus === 'completed' || updatedStatus === 'failed') {
                      setIsPolling(false);
                      if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                      }
                      return;
                    }
                  }
                } catch (err) {
                  devLog.error('Error during polling:', err);
                }
                
                pollAttempts++;
                
                // Check timeout using local variable (not stale state)
                if (Date.now() - localPollStartTime > POLL_TIMEOUT) {
                  setIsPolling(false);
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                  }
                  toast({
                    title: "Analysis taking longer than expected",
                    description: "Your interview has been saved. Results will appear when ready.",
                  });
                  return;
                }
              }
              
              // Max polls reached
              setIsPolling(false);
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
              }
            };
            
            poll();
          } else {
            setIsPolling(false);
          }
        }
      } catch (err: any) {
        devLog.error('Error loading results:', err);
        if (err.status === 404) {
          setError('Interview not found');
        } else {
          setError(err.message || 'Failed to load results');
        }
        setIsPolling(false);
      }
    };

    startPolling();

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [finalInterviewId, finalSessionId, isMockMode, demoVariant, fixtureMode, fetchResults, pollForInterviewId, getEvaluationStatus, toast]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const handleRetry = () => {
    setError(null);
    setResults(null);
    setIsPolling(false);
    setPollStartTime(null);
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

  const averageQuestionScore = useMemo(() => {
    if (!results?.evaluation?.evaluation?.questions?.length) return 0;
    return Math.round(
      results.evaluation.evaluation.questions.reduce((sum, q) => sum + q.score, 0) / 
      results.evaluation.evaluation.questions.length
    );
  }, [results?.evaluation?.evaluation?.questions]);

  // Lowest-scoring question that has sample_better_answer (for Better Answer Example card)
  const betterAnswerQuestion = useMemo(() => {
    const questions = results?.evaluation?.evaluation?.questions;
    if (!questions?.length) return null;
    const withSample = questions.filter((q) => q.sample_better_answer && q.sample_better_answer.trim());
    if (withSample.length === 0) return null;
    return withSample.reduce((lowest, q) => (q.score < lowest.score ? q : lowest));
  }, [results?.evaluation?.evaluation?.questions]);

  // Reveal main results content only after the browser has painted (avoids half-rendered flash).
  // When switching demos, delay reveal by 550ms so white overlay hides first, then content animates in.
  const showingResultsUI = !!(results && (evalStatus === 'completed' || evalStatus === 'failed' || results.interview));
  useEffect(() => {
    if (!showingResultsUI) return;
    setContentReady(false);
    const isDemoSwitch = isDemoMode && hasShownResultsRef.current;
    hasShownResultsRef.current = true;
    const delayMs = isDemoSwitch ? 550 : 0;
    const t = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setContentReady(true));
      });
    }, delayMs);
    return () => clearTimeout(t);
  }, [showingResultsUI, isDemoMode, demoVariant]);

  // Smooth time-based progress for processing UI
  const [smoothProgress, setSmoothProgress] = useState(0);
  const processingStartRef = useRef<number | null>(null);

  useEffect(() => {
    const isProcessing = results && (evalStatus === 'pending' || evalStatus === 'processing' || isPolling);
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
  }, [results, evalStatus, isPolling]);

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
      <AnimatedBackground fixedDecor className="flex items-center justify-center py-4 px-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
          className="relative z-10 w-full"
        >
          <Card className="w-full max-w-lg shadow-xl hover:shadow-2xl transition-shadow duration-200 border-0 bg-white/95">
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl text-center">Processing Your Interview</CardTitle>
              <p className="text-sm text-center text-gray-500 mt-1">
                This usually takes 30–60 seconds
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-col gap-5">
                {/* Smooth Progressive Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 font-medium">{stepDescription}</span>
                    <span className="text-blue-600 font-bold tabular-nums">{displayProgress}%</span>
                  </div>
                  <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${displayProgress}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                    {/* Shimmer effect */}
                    <motion.div
                      className="absolute inset-y-0 left-0 w-full"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                        backgroundSize: '200% 100%',
                      }}
                      animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>
                </div>

                {/* Step Indicators - Compact */}
                <div className="space-y-3">
                  {PROCESSING_STEPS.map((step) => {
                    const isCompleted = step.id < currentStep;
                    const isActive = step.id === currentStep;
                    
                    return (
                      <div
                        key={step.id}
                        className={`flex items-center gap-3 transition-all duration-300 ${
                          isActive ? 'opacity-100' : isCompleted ? 'opacity-100' : 'opacity-40'
                        }`}
                      >
                        <div className="flex-shrink-0">
                          {isCompleted ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 260, damping: 18 }}
                            >
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                            </motion.div>
                          ) : isActive ? (
                            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                          )}
                        </div>
                        <span
                          className={`text-sm font-medium transition-colors duration-300 ${
                            isCompleted
                              ? 'text-green-600'
                              : isActive
                              ? 'text-blue-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {step.text}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Return to Dashboard Button */}
                <div className="pt-3 border-t">
                  <Button 
                    onClick={handleReturnToDashboard}
                    variant="outline"
                    className="w-full transition-colors duration-200 hover:shadow-lg hover:bg-gray-50 hover:border-gray-400 text-gray-700 hover:text-gray-900 font-semibold border-2"
                    aria-label="Return to dashboard"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Return to Dashboard
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
      <AnimatedBackground fixedDecor className="flex items-center justify-center py-4 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
          className="relative z-10 w-full"
        >
          <Card className="w-full max-w-md shadow-xl hover:shadow-2xl transition-shadow duration-200 border-0 bg-white/95">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2 text-gray-900">Unable to Load Results</h2>
                <p className="text-gray-600 text-sm mb-6">{error}</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button 
                    onClick={handleRetry} 
                    variant="default"
                    className="min-w-[120px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-xl transition-shadow duration-200 text-white font-semibold"
                    aria-label="Retry loading results"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                  <Button 
                    onClick={handleReturnToDashboard} 
                    variant="outline"
                    className="min-w-[120px] transition-colors duration-200 hover:shadow-lg hover:bg-gray-50 hover:border-gray-400 text-gray-700 hover:text-gray-900 font-semibold border-2"
                    aria-label="Return to dashboard"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Dashboard
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

  // Show Processing UI if pending/processing
  if ((evalStatus === 'pending' || evalStatus === 'processing' || isPolling) && results) {
    return renderProcessingUI();
  }

  // Show Results UI if completed or if we have data (even if evaluation failed)
  if (results && (evalStatus === 'completed' || evalStatus === 'failed' || results.interview)) {
    return (
      <AnimatedBackground fixedDecor className="py-4 sm:py-8 px-4">
        <AnimatePresence>
          {showWhiteTransition && (
            <motion.div
              key="demo-transition-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed inset-0 bg-white z-[9999] pointer-events-none"
              aria-hidden="true"
              style={{ transform: 'translateZ(0)' }}
            />
          )}
        </AnimatePresence>
        <motion.div
          className="relative z-10 min-h-full"
          initial={false}
          animate={{ opacity: contentReady ? 1 : 0 }}
          transition={{ duration: 0.4, ease: [0.33, 1, 0.68, 1] }}
          style={{ pointerEvents: contentReady ? 'auto' : 'none' }}
          aria-hidden={!contentReady}
        >
        <div
          key={demoVariant}
          className="max-w-4xl mx-auto space-y-6 relative z-10 pb-16"
        >
          {/* Demo Mode Banner */}
          {isDemoMode && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={contentReady ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
              transition={{ duration: 0.55 }}
              className={`bg-gradient-to-r ${demoVariant === 'business' ? 'from-teal-500 via-emerald-500 to-green-600' : 'from-purple-500 via-pink-500 to-rose-500'} text-white px-6 py-4 rounded-xl shadow-lg border-2 border-white/30`}
            >
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 animate-pulse" />
                  <div>
                    <p className="font-bold text-lg">
                      {demoVariant === 'business' ? 'Non-Technical Demo' : 'Technical Demo'}
                    </p>
                    <p className="text-sm text-white/90">
                      {demoVariant === 'business'
                        ? 'A sample interview for marketing, business administration, and similar roles—no technical jargon.'
                        : 'A sample interview for software engineering and technical roles.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setLocation(`/results?mock=true&interviewId=demo&demo=${demoVariant === 'business' ? 'tech' : 'business'}`)}
                    variant="secondary"
                    className={`group font-semibold shadow-md transition-[transform,box-shadow,background-color,border-color] duration-300 ease-out hover:scale-[1.03] ${
                      demoVariant === 'business'
                        ? 'bg-purple-100 text-purple-700 hover:bg-purple-200 hover:text-purple-800 border-2 border-purple-300 hover:shadow-lg'
                        : 'bg-teal-100 text-teal-700 hover:bg-teal-200 hover:text-teal-800 border-2 border-teal-300 hover:shadow-lg'
                    }`}
                  >
                    <span className="group-hover:font-bold">
                      {demoVariant === 'business' ? 'See Technical Demo' : 'See Non-Technical Demo'}
                    </span>
                  </Button>
                  <Button
                    onClick={() => setLocation('/')}
                    className="group bg-white text-purple-600 hover:bg-purple-50 font-semibold shadow-md hover:shadow-lg transition-[transform,box-shadow,background-color] duration-300 ease-out hover:scale-[1.03]"
                  >
                    <span className="group-hover:font-bold">
                      Try Real Interview
                    </span>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Breadcrumb Navigation - Sticky - Optimized for scroll */}
          <nav
            className="sticky top-0 z-50 bg-gradient-to-br from-blue-50/95 via-indigo-50/95 to-purple-50/95 py-3 -mx-4 px-4 mb-4 flex items-center gap-2 text-sm text-gray-600 rounded-lg shadow-sm" 
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
              className="h-auto p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors duration-200 rounded-lg font-medium"
              aria-label="Return to dashboard"
            >
              <Home className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <span className="text-gray-400">/</span>
            <span className="text-gray-900 font-semibold">Interview Results</span>
            </nav>

          {/* Overall Score Badge - Wide Hero Banner */}
          {overallScore !== null && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={contentReady ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
              transition={{ duration: 0.55, ease: [0.33, 1, 0.68, 1], delay: 0.2 }}
              className="mb-8"
            >
              <div
                className="relative max-w-5xl mx-auto"
              >
                {/* Main banner container -- no outer glow div; it caused a visible
                    misaligned arc outside the rounded corners. The gradient + shadow-2xl
                    + border provide all the depth needed. */}
                <div className="relative bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 rounded-3xl p-6 sm:p-8 shadow-2xl ring-1 ring-white/20 overflow-hidden">
                  {/* Inner glow -- no rounded-3xl; parent overflow-hidden clips it */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                  <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-300/10 rounded-full blur-2xl" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-300/10 rounded-full blur-2xl" />
                  
                  {/* Content Grid */}
                  <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                    {/* Left Panel - Interview Stats */}
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={contentReady ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
                      transition={{ duration: 0.5, delay: 0.3, ease: [0.33, 1, 0.68, 1] }}
                      className="flex flex-col gap-3 text-white"
                    >
                      <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 border border-white/20">
                        <div className="w-10 h-10 rounded-lg bg-blue-400/30 flex items-center justify-center">
                          <CheckCircle2 className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">Questions</p>
                          <p className="text-xl font-bold">{results.evaluation?.evaluation?.questions?.length || 0} Answered</p>
                        </div>
                      </div>
                      {results.interview?.durationSeconds && (
                        <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 border border-white/20">
                          <div className="w-10 h-10 rounded-lg bg-purple-400/30 flex items-center justify-center">
                            <Clock className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">Duration</p>
                            <p className="text-xl font-bold">
                              {Math.floor((results.interview.durationSeconds || 0) / 60)}m {(results.interview.durationSeconds || 0) % 60}s
                            </p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                    
                    {/* Center Panel - Score */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={contentReady ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                      transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}
                      className="flex flex-col items-center gap-4 py-4"
                    >
                      {/* Icon -- static to avoid infinite Framer Motion repaints */}
                      <div>
                        {overallScore >= 80 ? (
                          <Award className="h-20 w-20 text-yellow-300 drop-shadow-lg" />
                        ) : overallScore >= 60 ? (
                          <TrendingUp className="h-20 w-20 text-green-300 drop-shadow-lg" />
                        ) : (
                          <CheckCircle2 className="h-20 w-20 text-blue-300 drop-shadow-lg" />
                        )}
                      </div>
                      
                      {/* Readiness Score label */}
                      <span className="text-sm text-white/80 font-medium uppercase tracking-wide">Readiness Score</span>
                      
                      {/* Score */}
                      <div className="flex items-baseline gap-2">
                        <span className="text-7xl sm:text-8xl font-black text-white drop-shadow-2xl">
                          {overallScore}
                        </span>
                        <span className="text-3xl sm:text-4xl text-white/90 font-bold mb-2">/100</span>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="w-full max-w-xs bg-white/20 rounded-full h-4 overflow-hidden shadow-inner">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={contentReady ? { width: `${overallScore}%` } : { width: 0 }}
                          transition={{ duration: 1.5, delay: 0.7, ease: [0.4, 0, 0.2, 1] }}
                          className="h-full bg-gradient-to-r from-yellow-300 via-yellow-200 to-white rounded-full shadow-lg"
                        />
                      </div>
                      
                      {/* Readiness status label */}
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-xl font-bold uppercase tracking-widest drop-shadow-lg ${getReadinessLabel(overallScore).colorClass}`}>
                          {getReadinessLabel(overallScore).label}
                        </span>
                      </div>
                    </motion.div>
                    
                    {/* Right Panel - Performance Insights */}
                    <motion.div 
                      initial={{ opacity: 0, x: 10 }}
                      animate={contentReady ? { opacity: 1, x: 0 } : { opacity: 0, x: 10 }}
                      transition={{ duration: 0.5, delay: 0.35, ease: [0.33, 1, 0.68, 1] }}
                      className="flex flex-col gap-3 text-white"
                    >
                      <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 border border-white/20">
                        <div className="w-10 h-10 rounded-lg bg-green-400/30 flex items-center justify-center">
                          <TrendingUp className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">Percentile</p>
                          <p className="text-xl font-bold">
                            Top {overallScore >= 90 ? '10' : overallScore >= 80 ? '20' : overallScore >= 70 ? '30' : overallScore >= 60 ? '40' : '50'}%
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 border border-white/20">
                        <div className="w-10 h-10 rounded-lg bg-yellow-400/30 flex items-center justify-center">
                          <Sparkles className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">Avg Score</p>
                          <p className="text-xl font-bold">
                            {overallScore >= 80 ? '+12' : overallScore >= 70 ? '+8' : overallScore >= 60 ? '+5' : '+2'} vs Avg
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Results Header Card -- standalone, no giant wrapper.
              PERF: Removed the monolithic 9,773px Card + backdrop-blur-sm that
              was causing white-flash checkerboarding during fast scroll and
              hiding the animated background behind an opaque white wall. */}
          <Card className="mb-6 shadow-xl border-0 bg-white/90">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-3xl sm:text-4xl mb-2 font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                    Interview Results
                  </CardTitle>
                  {results.interview?.durationSeconds && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                      <Clock className="h-4 w-4" />
                      <span>
                        Duration: {Math.floor((results.interview.durationSeconds || 0) / 60)}m {(results.interview.durationSeconds || 0) % 60}s
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Each section is now its own card so the animated background shows between them */}
          <div className="space-y-6">

              {/* Evaluation Failed Message */}
              {evalStatus === 'failed' && results.evaluation && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={contentReady ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.55 }}
                >
                  <Card className="mb-6 border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 shadow-md hover:shadow-lg transition-shadow duration-300">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center ring-4 ring-orange-200">
                          <AlertCircle className="h-8 w-8 text-orange-600" />
                        </div>
                        <div className="text-center">
                          <h3 className="text-xl font-bold mb-2 text-orange-900">Evaluation Unavailable</h3>
                          <p className="text-gray-700 text-sm mb-3 leading-relaxed">
                            We encountered an issue generating your feedback. Your interview transcript is available below.
                          </p>
                          {results.evaluation.error && (
                            <p className="text-gray-600 text-xs font-mono bg-white p-3 rounded-lg border border-orange-200 shadow-sm">
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
                      <Card className="mb-6 border-2 border-blue-300 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 shadow-lg hover:shadow-2xl hover:ring-2 hover:ring-indigo-200 transition-shadow duration-200 relative overflow-hidden" style={{ transform: 'translateZ(0)' }}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/20 rounded-full blur-2xl -mr-16 -mt-16" />
                        <CardHeader className="relative z-10">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                              <Sparkles className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <CardTitle className="text-2xl font-bold text-gray-900">Overall Interview Feedback</CardTitle>
                              <p className="text-sm text-gray-600 mt-1 font-medium">Summary of your performance across all questions</p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="relative z-10">
                          <div className="space-y-5">
                            {results.evaluation.evaluation.overall_strengths && results.evaluation.evaluation.overall_strengths.length > 0 && (
                              <div
                                className="bg-white/60 p-4 rounded-lg border border-green-200 shadow-sm"
                                style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                              >
                                <h4 className="text-base font-bold text-green-700 mb-3 flex items-center gap-2">
                                  <CheckCircle2 className="h-5 w-5" />
                                  Overall Strengths:
                                </h4>
                                <ul className="list-none space-y-2">
                                  {results.evaluation.evaluation.overall_strengths.map((strength, i) => (
                                    <li
                                      key={i}
                                      className="text-sm text-gray-800 flex items-start gap-2 leading-relaxed"
                                    >
                                      <span className="text-green-600 text-sm font-bold flex-shrink-0 leading-relaxed">•</span>
                                      <span>{strength}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {results.evaluation.evaluation.overall_improvements && results.evaluation.evaluation.overall_improvements.length > 0 && (
                              <div
                                className="bg-white/60 p-4 rounded-lg border border-orange-200 shadow-sm"
                                style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                              >
                                <h4 className="text-base font-bold text-orange-700 mb-3 flex items-center gap-2">
                                  <TrendingUp className="h-5 w-5" />
                                  Overall Areas for Improvement:
                                </h4>
                                <ul className="list-none space-y-2">
                                  {results.evaluation.evaluation.overall_improvements.map((improvement, i) => (
                                    <li
                                      key={i}
                                      className="text-sm text-gray-800 flex items-start gap-2 leading-relaxed"
                                    >
                                      <span className="text-orange-600 text-sm font-bold flex-shrink-0 leading-relaxed">•</span>
                                      <span>{improvement}</span>
                                    </li>
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
                    <Card className="mb-6 border-2 border-purple-300 bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 shadow-lg hover:shadow-xl transition-shadow duration-200">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-md">
                            <TrendingUp className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <CardTitle className="text-2xl font-bold text-gray-900">Performance Comparison</CardTitle>
                            <p className="text-sm text-gray-600 mt-1 font-medium">How you stack up against other candidates</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Your Score */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-gray-700">Your Score</span>
                              <span className="text-2xl font-bold text-purple-600">{overallScore}</span>
                            </div>
                            <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={contentReady ? { width: `${overallScore}%` } : { width: 0 }}
                                transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-end pr-2"
                              >
                                <span className="text-xs font-bold text-white drop-shadow">You</span>
                              </motion.div>
                            </div>
                          </div>

                          {/* Average Score */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-gray-700">Average Score</span>
                              <span className="text-2xl font-bold text-gray-500">
                                {overallScore >= 80 ? 73 : overallScore >= 70 ? 67 : overallScore >= 60 ? 62 : 58}
                              </span>
                            </div>
                            <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                              <div
                                className="h-full bg-gradient-to-r from-gray-400 to-gray-500 rounded-full flex items-center justify-end pr-2"
                                style={{ 
                                  width: `${overallScore >= 80 ? 73 : overallScore >= 70 ? 67 : overallScore >= 60 ? 62 : 58}%`,
                                  transform: 'translateZ(0)',
                                  willChange: 'auto'
                                }}
                              >
                                <span className="text-xs font-bold text-white drop-shadow">Avg</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Insight Message */}
                        <div
                          className="mt-6 p-4 bg-white/60 rounded-xl border border-purple-200"
                          style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Sparkles className="h-4 w-4 text-purple-600" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 mb-1">
                                {overallScore >= 80 ? '🎉 Outstanding Performance!' : overallScore >= 70 ? '👏 Above Average!' : overallScore >= 60 ? '✓ Good Start!' : '💪 Room for Growth'}
                              </p>
                              <p className="text-sm text-gray-700 leading-relaxed">
                                {overallScore >= 80 
                                  ? `You scored ${overallScore - (overallScore >= 80 ? 73 : 67)} points higher than the average candidate. You're in the top 20% of all interviewees!`
                                  : overallScore >= 70
                                  ? `You're ${overallScore - 67} points above average. Keep refining your answers to reach the top tier.`
                                  : overallScore >= 60
                                  ? `You're ${overallScore - 62} points above average. Focus on providing more specific examples in your responses.`
                                  : `You're ${overallScore - 58} points above average. Review the feedback below to improve your interview skills.`
                                }
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
                        <Card className="mb-6 border-2 border-green-300 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 shadow-lg hover:shadow-xl transition-shadow duration-200">
                          <CardHeader>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
                                <Award className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <CardTitle className="text-2xl font-bold text-gray-900">Skills Breakdown</CardTitle>
                                <p className="text-sm text-gray-600 mt-1 font-medium">Performance across different question categories</p>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              {results.evaluation.evaluation.questions.map((qa, index) => (
                                <div
                                  key={index}
                                  className="space-y-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold text-gray-700">Question {index + 1}</span>
                                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                                      qa.score >= 80 ? 'bg-green-100 text-green-700' :
                                      qa.score >= 60 ? 'bg-blue-100 text-blue-700' :
                                      qa.score >= 40 ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-red-100 text-red-700'
                                    }`}>
                                      {qa.score}/100
                                    </span>
                                  </div>
                                  <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        qa.score >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
                                        qa.score >= 60 ? 'bg-gradient-to-r from-blue-500 to-indigo-600' :
                                        qa.score >= 40 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                                        'bg-gradient-to-r from-red-500 to-rose-600'
                                      }`}
                                      style={{ 
                                        width: `${qa.score}%`,
                                        transform: 'translateZ(0)',
                                        willChange: 'auto'
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Average Score Display */}
                            <div
                              className="mt-6 p-4 bg-white/60 rounded-xl border border-green-200"
                              style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-700">Average Question Score</span>
                                <span className="text-2xl font-bold text-green-600">
                                  {averageQuestionScore}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Question-by-Question Feedback */}
                      <div
                        style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                      >
                        <Card className="mb-6 shadow-lg border-0 bg-white/95">
                          <CardHeader>
                            <CardTitle className="text-2xl font-bold text-gray-900">Question-by-Question Feedback</CardTitle>
                            <p className="text-sm text-gray-600 mt-1 font-medium">Detailed feedback for each interview question</p>
                          </CardHeader>
                          <CardContent>
                          <div className="space-y-5">
                            {results.evaluation.evaluation.questions.map((qa, index) => {
                              const scoreColor = qa.score >= 80 ? 'from-green-500 to-emerald-600' : qa.score >= 60 ? 'from-blue-500 to-indigo-600' : qa.score >= 40 ? 'from-yellow-500 to-orange-500' : 'from-red-500 to-rose-600';
                              return (
                                <div
                                  key={index}
                                >
                                  <Card className="border-l-8 bg-gradient-to-r from-white to-gray-50/50 shadow-md hover:shadow-2xl transition-shadow duration-200 relative overflow-hidden group"
                                    style={{
                                      borderLeftColor: qa.score >= 80 ? '#10b981' : qa.score >= 60 ? '#3b82f6' : qa.score >= 40 ? '#f59e0b' : '#ef4444',
                                      transform: 'translateZ(0)', // GPU acceleration
                                      willChange: 'auto',
                                    }}
                                  >
                                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${scoreColor} opacity-100 transition-width duration-200 group-hover:w-2`} />
                                    <CardContent className="pt-6 pl-6">
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <h3 className="text-xl font-bold text-gray-900">Question {index + 1}</h3>
                                          {qa.question_type && (
                                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                              qa.question_type === "behavioral" ? "bg-amber-100 text-amber-800" :
                                              qa.question_type === "technical" ? "bg-blue-100 text-blue-800" :
                                              qa.question_type === "situational" ? "bg-purple-100 text-purple-800" :
                                              "bg-slate-100 text-slate-700"
                                            }`}>
                                              {qa.question_type.charAt(0).toUpperCase() + qa.question_type.slice(1)}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <div className="relative w-28 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full bg-gradient-to-r ${scoreColor} rounded-full shadow-sm`}
                                              style={{ 
                                                width: `${qa.score}%`,
                                                transform: 'translateZ(0)',
                                                willChange: 'auto'
                                              }}
                                            />
                                          </div>
                                          <span className={`text-sm font-bold px-4 py-1.5 rounded-full whitespace-nowrap shadow-sm bg-gradient-to-r ${scoreColor} text-white`}>
                                            {qa.score}/100
                                          </span>
                                        </div>
                                      </div>
                                
                                      <div className="space-y-4">
                                        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 p-4 rounded-lg border border-gray-200 shadow-sm">
                                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Question:</p>
                                          <p className="text-gray-900 font-semibold leading-relaxed">{qa.question}</p>
                                        </div>
                                        
                                        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 p-4 rounded-lg border border-gray-200 shadow-sm">
                                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Your Answer:</p>
                                          <p className="text-gray-800 leading-relaxed">{qa.answer}</p>
                                        </div>

                                        {qa.star_breakdown && (
                                          <div className="bg-gradient-to-br from-amber-50 via-orange-50/60 to-amber-50/80 border border-amber-200/80 p-5 rounded-xl shadow-sm">
                                            <h4 className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                                              <Sparkles className="h-4 w-4 text-amber-600" />
                                              STAR Breakdown
                                            </h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                              {(["situation", "task", "action", "result"] as const).map((key) => {
                                                const val = qa.star_breakdown![key];
                                                const label = key.charAt(0).toUpperCase() + key.slice(1);
                                                const isStrong = val === "strong";
                                                const isWeak = val === "weak";
                                                const isMissing = val === "missing";
                                                const Icon = isStrong ? CheckCircle2 : isWeak ? AlertTriangle : XCircle;
                                                const cardClass = isStrong
                                                  ? "bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200/80 text-emerald-800 shadow-sm"
                                                  : isWeak
                                                  ? "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200/80 text-amber-800 shadow-sm"
                                                  : "bg-gradient-to-br from-slate-50 to-gray-100 border-slate-200/80 text-slate-600 shadow-sm";
                                                const iconClass = isStrong ? "text-emerald-600" : isWeak ? "text-amber-600" : "text-slate-400";
                                                const badgeClass = isStrong
                                                  ? "bg-emerald-100 text-emerald-700"
                                                  : isWeak
                                                  ? "bg-amber-100 text-amber-700"
                                                  : "bg-slate-100 text-slate-600";
                                                return (
                                                  <div
                                                    key={key}
                                                    className={`flex flex-col items-center justify-center py-4 px-3 rounded-xl border ${cardClass} transition-all duration-200 hover:shadow-md`}
                                                  >
                                                    <Icon className={`h-8 w-8 mb-2 ${iconClass}`} strokeWidth={2.5} />
                                                    <span className="text-sm font-semibold text-inherit">{label}</span>
                                                    <span className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-full ${badgeClass}`}>
                                                      {val.toUpperCase()}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                        
                                        {qa.strengths?.length > 0 && (
                                          <div
                                            className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 p-4 rounded-xl shadow-md"
                                            style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                                          >
                                            <h4 className="text-sm font-bold text-green-700 mb-3 flex items-center gap-2">
                                              <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                                              Strengths
                                            </h4>
                                            <ul className="list-none space-y-2.5">
                                              {qa.strengths.map((strength, i) => (
                                                <li 
                                                  key={i} 
                                                  className="text-sm text-gray-800 flex items-start gap-2 leading-relaxed"
                                                >
                                                  <span className="text-green-600 text-sm font-bold flex-shrink-0 leading-relaxed">✓</span>
                                                  <span>{strength}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        
                                        {qa.improvements?.length > 0 && (
                                          <div
                                            className="bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-300 p-4 rounded-xl shadow-md"
                                            style={{ transform: 'translateZ(0)', willChange: 'auto' }}
                                          >
                                            <h4 className="text-sm font-bold text-orange-700 mb-3 flex items-center gap-2">
                                              <AlertCircle className="h-5 w-5 flex-shrink-0" />
                                              Areas for Improvement
                                            </h4>
                                            {qa.improvement_quote && (
                                              <div className="mb-3 p-3 bg-white/60 rounded-lg border border-orange-200">
                                                <p className="text-xs font-bold text-orange-700 mb-1">You said:</p>
                                                <p className="text-sm text-gray-800 italic">&ldquo;{qa.improvement_quote}&rdquo;</p>
                                              </div>
                                            )}
                                            <ul className="list-none space-y-2.5">
                                              {qa.improvements.map((improvement, i) => (
                                                <li 
                                                  key={i} 
                                                  className="text-sm text-gray-800 flex items-start gap-2 leading-relaxed"
                                                >
                                                  <span className="text-orange-600 text-sm font-bold flex-shrink-0 leading-relaxed">→</span>
                                                  <span>{improvement}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Better Answer Example card - lowest-scoring question with sample_better_answer */}
                    {betterAnswerQuestion && (
                      <div>
                        <Card className="mb-6 border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 shadow-lg hover:shadow-xl transition-shadow duration-200">
                          <CardHeader>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
                                <Sparkles className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <CardTitle className="text-2xl font-bold text-gray-900">Better Answer Example</CardTitle>
                                <p className="text-sm text-gray-600 mt-1 font-medium">A stronger way to answer this question</p>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              <div className="bg-white/60 p-4 rounded-lg border border-indigo-200">
                                <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">Question</p>
                                <p className="text-gray-900 font-semibold leading-relaxed">{betterAnswerQuestion.question}</p>
                              </div>
                              {betterAnswerQuestion.answer && (
                                <div className="bg-gray-50/80 p-4 rounded-lg border border-gray-200">
                                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Your Answer (excerpt)</p>
                                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
                                    {betterAnswerQuestion.answer.length > 200
                                      ? `${betterAnswerQuestion.answer.slice(0, 200)}...`
                                      : betterAnswerQuestion.answer}
                                  </p>
                                </div>
                              )}
                              <div className="bg-green-50/80 p-4 rounded-lg border-2 border-green-300">
                                <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">Stronger Example</p>
                                <p className="text-gray-800 leading-relaxed">{betterAnswerQuestion.sample_better_answer}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </>
                )}
                </>
              )}

              {/* PERF: Transcript list - for very long transcripts (e.g. 30+ blocks), consider virtualization (e.g. react-window) to keep scroll smooth. */}
              {results.interview?.transcript && (
                <div>
                  <Card className="shadow-lg border-0 bg-white/95">
                    <CardHeader>
                      <CardTitle className="text-2xl font-bold text-gray-900">Interview Transcript</CardTitle>
                      <p className="text-sm text-gray-600 mt-1 font-medium">Full conversation transcript with speaker labels</p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {formatTranscript(results.interview.transcript).split('\n\n').map((paragraph, i) => {
                          // Check if this paragraph starts with a speaker label
                          const speakerMatch = paragraph.match(/^(Interviewer|Candidate|User|AI|Agent):\s*(.*)$/i);
                          if (speakerMatch) {
                            const [, speaker, text] = speakerMatch;
                            // Determine if it's AI/Interviewer or User/Candidate
                            const isAI = /^(Interviewer|AI|Agent)$/i.test(speaker);
                            const isUser = /^(Candidate|User)$/i.test(speaker);
                            
                            return (
                              <div
                                key={i}
                                className={`p-4 rounded-xl shadow-md hover:shadow-lg transition-shadow duration-200 ${
                                  isAI 
                                    ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-l-4 border-blue-500 mr-6 sm:mr-12' 
                                    : isUser 
                                    ? 'bg-gradient-to-br from-purple-50 to-pink-50 border-r-4 border-purple-500 ml-6 sm:ml-12' 
                                    : 'bg-gradient-to-br from-gray-50 to-gray-100 border-l-4 border-gray-400'
                                }`}
                                style={{ 
                                  transform: 'translateZ(0)',
                                  willChange: 'auto',
                                  contain: 'layout style paint'
                                }}
                              >
                                <div className="flex items-start gap-3">
                                  <span 
                                    className={`font-bold text-xs sm:text-sm uppercase tracking-wide px-2.5 py-1 rounded-lg flex-shrink-0 ${
                                      isAI 
                                        ? 'text-blue-700 bg-blue-100' 
                                        : isUser 
                                        ? 'text-purple-700 bg-purple-100' 
                                        : 'text-gray-700 bg-gray-100'
                                    }`}
                                  >
                                    {isAI ? '🤖 AI' : isUser ? '👤 You' : speaker}
                                  </span>
                                  <p className="text-sm text-gray-800 flex-1 leading-relaxed font-medium">{text}</p>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <p
                              key={i}
                              className="mb-3 text-sm text-gray-700 leading-relaxed"
                            >
                              {paragraph}
                            </p>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Return to Dashboard Button */}
              <div
                className="mt-8 flex justify-center"
              >
                <Button 
                  onClick={handleReturnToDashboard}
                  variant="outline"
                  size="lg"
                  className="min-w-[220px] bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-500 shadow-md hover:shadow-xl transition-shadow duration-200 font-semibold text-gray-700 hover:text-gray-900"
                  aria-label="Return to dashboard"
                >
                  <ArrowLeft className="h-5 w-5 mr-2" />
                  Return to Dashboard
                </Button>
              </div>
          </div>{/* end space-y-6 sections wrapper */}
        </div>
        </motion.div>
      </AnimatedBackground>
    );
  }

  // Loading state (initial load) - simulated progress bar
  return (
    <AnimatedBackground fixedDecor className="flex items-center justify-center py-4 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="w-full shadow-xl border-0 bg-white/95">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-6">
              <div className="text-center w-full">
                <h2 className="text-2xl font-bold mb-2 text-gray-900">Loading Results</h2>
                <p className="text-gray-600 text-sm font-medium mb-4">Fetching your interview data...</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 font-semibold">Progress</span>
                    <span className="text-blue-600 font-bold">{Math.round(loadingProgress)}%</span>
                  </div>
                  <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${loadingProgress}%` }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatedBackground>
  );
}
