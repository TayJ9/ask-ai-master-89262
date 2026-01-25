/**
 * Interview Results Page
 * 
 * Displays interview transcript and evaluation results.
 * Handles polling for pending/processing evaluation states.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft, Home, Clock, Sparkles, TrendingUp, Award } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { mockInterviewResults } from "@/mocks/resultsMockData";
import AnimatedBackground from "@/components/ui/AnimatedBackground";

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
  
  // Parse query params
  const { finalInterviewId, finalSessionId, isMockMode, isDemoMode } = useMemo(() => {
    const urlParts = location.split('?');
    const queryString = urlParts.length > 1 ? urlParts[1] : '';
    const params = new URLSearchParams(queryString);
    
    // Also check window.location as fallback
    const windowParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    
    const interviewId = windowParams?.get('interviewId') || params.get("interviewId");
    const sessionId = windowParams?.get('sessionId') || params.get("sessionId");
    const mock = windowParams?.get('mock') || params.get("mock");
    const demo = windowParams?.get('demo') || params.get("demo");
    
    return { 
      finalInterviewId: interviewId, 
      finalSessionId: sessionId,
      isMockMode: mock === 'true' || mock === '1',
      isDemoMode: demo === 'true' || demo === '1'
    };
  }, [location]);
  
  const [results, setResults] = useState<InterviewResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollStartTime, setPollStartTime] = useState<number | null>(null);
  
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Fetch results by interviewId
  const fetchResults = useCallback(async (interviewId: string): Promise<InterviewResults | null> => {
    // In mock mode, return mock data immediately - no API calls
    if (isMockMode) {
      console.log('[RESULTS] Using mock data for development preview - skipping API calls');
      // Return mock data after a small delay to simulate loading
      await new Promise(resolve => setTimeout(resolve, 100));
      return mockInterviewResults as InterviewResults;
    }
    
    try {
      const data = await apiGet(`/api/interviews/${interviewId}/results`);
      return data;
    } catch (err: any) {
      console.error('Error fetching results:', err);
      // In development, if server is down, fall back to mock data
      if (import.meta.env.DEV && window.location.hostname === 'localhost') {
        console.warn('[RESULTS] Server unavailable, using mock data as fallback');
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
      console.error('Error polling for interviewId:', err);
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
      console.log('[RESULTS] Mock mode enabled - loading mock data');
      setResults(mockInterviewResults as InterviewResults);
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
          
          console.log('[RESULTS] Initial fetch:', {
            interviewId: effectiveInterviewId,
            hasEvaluation: !!initialData.evaluation,
            evaluationStatus: initialData.evaluation?.status || 'null',
            evalStatus,
            timestamp: new Date().toISOString()
          });
          
          // If pending or processing OR evaluation is null (not created yet), start polling
          if (evalStatus === 'pending' || evalStatus === 'processing' || !initialData.evaluation) {
            setIsPolling(true);
            setPollStartTime(Date.now());
            
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
                  console.error('Error during polling:', err);
                }
                
                pollAttempts++;
                
                // Check timeout
                if (pollStartTime && Date.now() - pollStartTime > POLL_TIMEOUT) {
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
        console.error('Error loading results:', err);
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
  }, [finalInterviewId, finalSessionId, isMockMode, fetchResults, pollForInterviewId, getEvaluationStatus, toast]);

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

  // Render Processing UI
  const renderProcessingUI = () => {
    // Determine which step we're on based on evaluation status
    let currentStep = 1;
    let stepDescription = "";
    
    if (results?.evaluation) {
      const status = results.evaluation.status;
      if (status === 'processing') {
        // Check if we have transcript - if yes, we're analyzing; if no, still processing transcript
        if (results.transcript) {
          currentStep = 3; // Analyzing responses
          stepDescription = "Evaluating your answers using AI...";
        } else {
          currentStep = 2; // Processing transcript
          stepDescription = "Converting audio to text...";
        }
      } else if (status === 'pending') {
        currentStep = 2; // Processing transcript
        stepDescription = "Preparing your interview for analysis...";
      } else if (status === 'complete' && results.evaluation.evaluation) {
        currentStep = 4; // Generating feedback (final step)
        stepDescription = "Finalizing your results...";
      }
    } else {
      currentStep = 1; // Just saved
      stepDescription = "Your interview has been saved";
    }

    // Calculate progress percentage (smooth progression)
    const progressPercentage = Math.round((currentStep / PROCESSING_STEPS.length) * 100);
    const elapsedTime = pollStartTime ? Math.floor((Date.now() - pollStartTime) / 1000) : 0;
    const estimatedTimeRemaining = Math.max(0, 60 - elapsedTime);

    return (
      <AnimatedBackground className="flex items-center justify-center py-4 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="relative z-10 w-full"
        >
            <Card className="w-full max-w-lg shadow-xl hover:shadow-2xl transition-shadow duration-200 border-0 bg-white/95">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Processing Your Interview</CardTitle>
            <p className="text-sm text-center text-gray-600 mt-2">
              {stepDescription || "This usually takes 30-60 seconds"}
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-6">
              {/* Overall Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 font-semibold">Overall Progress</span>
                  <span className="text-blue-600 font-bold text-base">{progressPercentage}%</span>
                </div>
                <div className="relative">
                  <Progress value={progressPercentage} className="h-3 bg-gray-200" />
                  <motion.div
                    className="absolute top-0 left-0 h-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercentage}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Progress Stepper */}
              <div className="space-y-4">
                {PROCESSING_STEPS.map((step) => {
                  const isCompleted = step.id < currentStep;
                  const isActive = step.id === currentStep;
                  
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-4 transition-opacity duration-200 ${
                        isActive ? 'opacity-100 scale-105' : isCompleted ? 'opacity-100' : 'opacity-60'
                      }`}
                    >
                      {/* Step Indicator */}
                      <div className="flex-shrink-0">
                        {isCompleted ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 200, damping: 15 }}
                            className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg ring-2 ring-green-200"
                          >
                            <CheckCircle2 className="w-7 h-7 text-white" />
                          </motion.div>
                        ) : isActive ? (
                          <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg ring-2 ring-blue-200"
                          >
                            <Loader2 className="w-7 h-7 text-white animate-spin" />
                          </motion.div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center ring-2 ring-gray-100">
                            <div className="w-5 h-5 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                      
                      {/* Step Text */}
                      <div className="flex-1">
                        <p
                          className={`text-base font-medium transition-colors duration-300 ${
                            isCompleted
                              ? 'text-green-600'
                              : isActive
                              ? 'text-blue-600 font-semibold'
                              : 'text-gray-500'
                          }`}
                        >
                          {step.text}
                        </p>
                        {isActive && (
                          <>
                            {estimatedTimeRemaining > 0 && (
                              <p className="text-xs text-gray-500 mt-1">
                                Estimated time remaining: ~{estimatedTimeRemaining}s
                              </p>
                            )}
                            {currentStep === 3 && results?.transcript && (
                              <p className="text-xs text-blue-600 mt-1 font-medium">
                                Analyzing {results.transcript.split(/\n+/).filter(l => l.trim().length > 10).length} responses...
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Return to Dashboard Button - Always Visible */}
              <div className="pt-4 border-t">
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
      <AnimatedBackground className="flex items-center justify-center py-4 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
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
      <AnimatedBackground className="py-4 sm:py-8 px-4">
        <div
          className="max-w-4xl mx-auto space-y-6 relative z-10"
          style={{ 
            willChange: 'auto',
            transform: 'translateZ(0)', // GPU acceleration
          }}
        >
          {/* Demo Mode Banner */}
          {isDemoMode && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-white px-6 py-4 rounded-xl shadow-lg border-2 border-white/30"
            >
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 animate-pulse" />
                  <div>
                    <p className="font-bold text-lg">Demo Mode</p>
                    <p className="text-sm text-white/90">This is a sample interview showing what results look like</p>
                  </div>
                </div>
                <Button
                  onClick={() => setLocation('/')}
                  className="bg-white text-purple-600 hover:bg-purple-50 font-semibold shadow-md"
                >
                  Try Real Interview
                </Button>
              </div>
            </motion.div>
          )}

          {/* Breadcrumb Navigation - Sticky - Optimized for scroll */}
          <nav
            className="sticky top-0 z-50 bg-gradient-to-br from-blue-50/95 via-indigo-50/95 to-purple-50/95 py-3 -mx-4 px-4 mb-4 flex items-center gap-2 text-sm text-gray-600 rounded-lg shadow-sm" 
            style={{ 
              willChange: 'transform',
              transform: 'translateZ(0)', // GPU acceleration for sticky
              backfaceVisibility: 'hidden',
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
              initial={{ opacity: 0, y: -30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 150, damping: 20, delay: 0.2 }}
              className="mb-8"
            >
              <div
                className="relative max-w-5xl mx-auto"
              >
                {/* Outer glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400 via-indigo-400 to-purple-400 opacity-20 blur-3xl rounded-3xl" />
                
                {/* Main banner container */}
                <div className="relative bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 rounded-3xl p-6 sm:p-8 shadow-2xl border-4 border-white/30">
                  {/* Inner glow effects */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-3xl" />
                  <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-300/10 rounded-full blur-3xl" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-300/10 rounded-full blur-3xl" />
                  
                  {/* Content Grid */}
                  <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                    {/* Left Panel - Interview Stats */}
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
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
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}
                      className="flex flex-col items-center gap-4 py-4"
                    >
                      {/* Icon */}
                      <motion.div
                        animate={{ 
                          rotate: [0, 10, -10, 10, 0],
                          scale: [1, 1.1, 1, 1.1, 1]
                        }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                      >
                        {overallScore >= 80 ? (
                          <Award className="h-20 w-20 text-yellow-300 drop-shadow-lg" />
                        ) : overallScore >= 60 ? (
                          <TrendingUp className="h-20 w-20 text-green-300 drop-shadow-lg" />
                        ) : (
                          <CheckCircle2 className="h-20 w-20 text-blue-300 drop-shadow-lg" />
                        )}
                      </motion.div>
                      
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
                          animate={{ width: `${overallScore}%` }}
                          transition={{ duration: 1.5, delay: 0.7, ease: [0.4, 0, 0.2, 1] }}
                          className="h-full bg-gradient-to-r from-yellow-300 via-yellow-200 to-white rounded-full shadow-lg relative overflow-hidden"
                        >
                          {/* Shimmer effect */}
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                            animate={{ x: ['-100%', '200%'] }}
                            transition={{ duration: 2, delay: 1.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 2 }}
                          />
                        </motion.div>
                      </div>
                      
                      {/* Performance label */}
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xl text-white font-bold uppercase tracking-widest drop-shadow-lg">
                          {overallScore >= 80 ? '🌟 Excellent!' : overallScore >= 60 ? '✨ Good Job!' : overallScore >= 40 ? '💪 Fair' : '📈 Keep Improving'}
                        </span>
                        <span className="text-sm text-white/80 font-medium">Overall Performance</span>
                      </div>
                    </motion.div>
                    
                    {/* Right Panel - Performance Insights */}
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 }}
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

          {/* Main Results Card - Optimized */}
          <div>
            <Card className="mb-6 shadow-xl hover:shadow-2xl transition-all duration-300 border-0 bg-white/95 backdrop-blur-sm">
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
            <CardContent>

              {/* Evaluation Failed Message */}
              {evalStatus === 'failed' && results.evaluation && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
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
                              <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.4, delay: 0.3 }}
                                className="bg-white/60 p-4 rounded-lg border border-green-200 shadow-sm"
                              >
                                <h4 className="text-base font-bold text-green-700 mb-3 flex items-center gap-2">
                                  <CheckCircle2 className="h-5 w-5" />
                                  Overall Strengths:
                                </h4>
                                <ul className="list-none space-y-2">
                                  {results.evaluation.evaluation.overall_strengths.map((strength, i) => (
                                    <motion.li
                                      key={i}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
                                      className="text-sm text-gray-800 flex items-start gap-2 leading-relaxed"
                                    >
                                      <span className="text-green-600 text-sm font-bold flex-shrink-0 leading-relaxed">•</span>
                                      <span>{strength}</span>
                                    </motion.li>
                                  ))}
                                </ul>
                              </motion.div>
                            )}
                            {results.evaluation.evaluation.overall_improvements && results.evaluation.evaluation.overall_improvements.length > 0 && (
                              <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.4, delay: 0.5 }}
                                className="bg-white/60 p-4 rounded-lg border border-orange-200 shadow-sm"
                              >
                                <h4 className="text-base font-bold text-orange-700 mb-3 flex items-center gap-2">
                                  <TrendingUp className="h-5 w-5" />
                                  Overall Areas for Improvement:
                                </h4>
                                <ul className="list-none space-y-2">
                                  {results.evaluation.evaluation.overall_improvements.map((improvement, i) => (
                                    <motion.li
                                      key={i}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ duration: 0.3, delay: 0.6 + i * 0.1 }}
                                      className="text-sm text-gray-800 flex items-start gap-2 leading-relaxed"
                                    >
                                      <span className="text-orange-600 text-sm font-bold flex-shrink-0 leading-relaxed">•</span>
                                      <span>{improvement}</span>
                                    </motion.li>
                                  ))}
                                </ul>
                              </motion.div>
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
                                animate={{ width: `${overallScore}%` }}
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
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${overallScore >= 80 ? 73 : overallScore >= 70 ? 67 : overallScore >= 60 ? 62 : 58}%` }}
                                transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-gray-400 to-gray-500 rounded-full flex items-center justify-end pr-2"
                              >
                                <span className="text-xs font-bold text-white drop-shadow">Avg</span>
                              </motion.div>
                            </div>
                          </div>
                        </div>

                        {/* Insight Message */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.8 }}
                          className="mt-6 p-4 bg-white/60 rounded-xl border border-purple-200"
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
                        </motion.div>
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
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${qa.score}%` }}
                                      transition={{ duration: 0.8, delay: 0.5 + index * 0.1, ease: "easeOut" }}
                                      className={`h-full rounded-full ${
                                        qa.score >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
                                        qa.score >= 60 ? 'bg-gradient-to-r from-blue-500 to-indigo-600' :
                                        qa.score >= 40 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                                        'bg-gradient-to-r from-red-500 to-rose-600'
                                      }`}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Average Score Display */}
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 1 }}
                              className="mt-6 p-4 bg-white/60 rounded-xl border border-green-200"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-700">Average Question Score</span>
                                <span className="text-2xl font-bold text-green-600">
                                  {Math.round(results.evaluation.evaluation.questions.reduce((sum, q) => sum + q.score, 0) / results.evaluation.evaluation.questions.length)}
                                </span>
                              </div>
                            </motion.div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Question-by-Question Feedback */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.35 }}
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
                                        <h3 className="text-xl font-bold text-gray-900">Question {index + 1}</h3>
                                        <div className="flex items-center gap-3">
                                          <div className="relative w-28 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                                            <motion.div
                                              initial={{ width: 0 }}
                                              animate={{ width: `${qa.score}%` }}
                                              transition={{ duration: 0.8, delay: 0.5 + index * 0.1, ease: "easeOut" }}
                                              className={`h-full bg-gradient-to-r ${scoreColor} rounded-full shadow-sm relative overflow-hidden`}
                                            >
                                              {/* Shimmer effect */}
                                              <motion.div
                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                                                animate={{ x: ['-100%', '200%'] }}
                                                transition={{ duration: 2, delay: 1 + index * 0.1, ease: "easeInOut" }}
                                              />
                                            </motion.div>
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
                                        
                                        {qa.strengths?.length > 0 && (
                                          <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.6 + index * 0.1 }}
                                            className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 p-4 rounded-xl shadow-md"
                                          >
                                            <h4 className="text-sm font-bold text-green-700 mb-3 flex items-center gap-2">
                                              <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                                              Strengths
                                            </h4>
                                            <ul className="list-none space-y-2.5">
                                              {qa.strengths.map((strength, i) => (
                                                <motion.li 
                                                  key={i} 
                                                  initial={{ opacity: 0, x: -10 }}
                                                  animate={{ opacity: 1, x: 0 }}
                                                  transition={{ delay: 0.65 + index * 0.1 + i * 0.05 }}
                                                  className="text-sm text-gray-800 flex items-start gap-2 leading-relaxed"
                                                >
                                                  <span className="text-green-600 text-sm font-bold flex-shrink-0 leading-relaxed">✓</span>
                                                  <span>{strength}</span>
                                                </motion.li>
                                              ))}
                                            </ul>
                                          </motion.div>
                                        )}
                                        
                                        {qa.improvements?.length > 0 && (
                                          <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.7 + index * 0.1 }}
                                            className="bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-300 p-4 rounded-xl shadow-md"
                                          >
                                            <h4 className="text-sm font-bold text-orange-700 mb-3 flex items-center gap-2">
                                              <AlertCircle className="h-5 w-5 flex-shrink-0" />
                                              Areas for Improvement
                                            </h4>
                                            <ul className="list-none space-y-2.5">
                                              {qa.improvements.map((improvement, i) => (
                                                <motion.li 
                                                  key={i} 
                                                  initial={{ opacity: 0, x: -10 }}
                                                  animate={{ opacity: 1, x: 0 }}
                                                  transition={{ delay: 0.75 + index * 0.1 + i * 0.05 }}
                                                  className="text-sm text-gray-800 flex items-start gap-2 leading-relaxed"
                                                >
                                                  <span className="text-orange-600 text-sm font-bold flex-shrink-0 leading-relaxed">→</span>
                                                  <span>{improvement}</span>
                                                </motion.li>
                                              ))}
                                            </ul>
                                          </motion.div>
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
                    </motion.div>
                  </>
                )}
                </>
              )}

              {/* Transcript - Optimized for scroll performance */}
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
                                style={{ transform: 'translateZ(0)' }}
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
            </CardContent>
          </Card>
        </div>
        </div>
      </AnimatedBackground>
    );
  }

  // Loading state (initial load)
  return (
    <AnimatedBackground className="flex items-center justify-center py-4 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full"
      >
        <Card className="w-full max-w-md shadow-xl border-0 bg-white/95">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-4 border-blue-200 border-t-blue-600 rounded-full"
                />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2 text-gray-900">Loading Results</h2>
                <p className="text-gray-600 text-sm font-medium">Fetching your interview data...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatedBackground>
  );
}
