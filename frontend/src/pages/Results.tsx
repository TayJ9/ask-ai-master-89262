/**
 * Interview Results Page
 * 
 * Displays interview transcript and evaluation results.
 * Handles polling for webhook delay and evaluation completion.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Step configuration for loading screen
const STEPS = [
  { id: 1, text: "Saving your interview...", delay: 0 },
  { id: 2, text: "Reviewing your responses...", delay: 800 },
  { id: 3, text: "Putting together your feedback...", delay: 1600 },
  { id: 4, text: "Almost done...", delay: 2400 },
];
const MIN_LOAD_TIME = 2500;

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

export default function Results() {
  const [location] = useLocation();
  const [, navigate] = useRoute("/");
  const { toast } = useToast();
  
  // Parse query params from location
  // CRITICAL: Check for interviewId first (direct lookup), then fallback to sessionId (polling)
  // Memoize URL params extraction to prevent infinite re-renders
  // Always use window.location as source of truth since wouter may not preserve query params
  const { finalInterviewId, finalSessionId, finalConversationId } = useMemo(() => {
    // Try wouter's location first
    const urlParts = location.split('?');
    const queryString = urlParts.length > 1 ? urlParts[1] : '';
    const wouterParams = new URLSearchParams(queryString);
    const wouterInterviewId = wouterParams.get("interviewId");
    const wouterSessionId = wouterParams.get("sessionId");
    const wouterConversationId = wouterParams.get("conversationId");
    
    // Always use window.location as source of truth (wouter may strip query params)
    const windowParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const windowInterviewId = windowParams?.get('interviewId') || null;
    const windowSessionId = windowParams?.get('sessionId') || null;
    const windowConversationId = windowParams?.get('conversationId') || null;
    
    // Prefer window.location, fallback to wouter
    const finalInterviewId = windowInterviewId || wouterInterviewId;
    const finalSessionId = windowSessionId || wouterSessionId;
    const finalConversationId = windowConversationId || wouterConversationId;
    
    console.log('[FLIGHT_RECORDER] [RESULTS] Page loaded - URL params extracted:', {
      fullLocation: location,
      wouterParams: {
        interviewId: wouterInterviewId || 'null',
        sessionId: wouterSessionId || 'null',
        conversationId: wouterConversationId || 'null',
      },
      windowParams: {
        interviewId: windowInterviewId || 'null',
        sessionId: windowSessionId || 'null',
        conversationId: windowConversationId || 'null',
      },
      finalParams: {
        interviewId: finalInterviewId || 'null',
        sessionId: finalSessionId || 'null',
        conversationId: finalConversationId || 'null',
      },
      windowLocationSearch: typeof window !== 'undefined' ? window.location.search : 'N/A',
      windowLocationHref: typeof window !== 'undefined' ? window.location.href : 'N/A',
      timestamp: new Date().toISOString()
    });
    
    if (wouterInterviewId !== windowInterviewId || wouterSessionId !== windowSessionId) {
      console.warn('[FLIGHT_RECORDER] [RESULTS] Query params mismatch - using window.location as source of truth:', {
        wouterInterviewId: wouterInterviewId || 'null',
        windowInterviewId: windowInterviewId || 'null',
        wouterSessionId: wouterSessionId || 'null',
        windowSessionId: windowSessionId || 'null',
        timestamp: new Date().toISOString()
      });
    }
    
    return { finalInterviewId, finalSessionId, finalConversationId };
  }, [location]);
  
  const [status, setStatus] = useState<'loading' | 'saving' | 'evaluating' | 'complete' | 'error'>('loading');
  const [results, setResults] = useState<InterviewResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Step-by-step loading state
  const [activeStep, setActiveStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [tempData, setTempData] = useState<InterviewResults | null>(null);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [showResults, setShowResults] = useState(false);
  
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const stepTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const hasStartedLoadingRef = useRef(false);
  const prevInterviewIdRef = useRef<string | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);
  const minTimeElapsedRef = useRef(false);
  const shouldPollRef = useRef<boolean>(!finalInterviewId && !!finalSessionId);
  const shouldShowResultsRef = useRef(false); // Track if results should be shown (persists across remounts)
  const resultsDataRef = useRef<InterviewResults | null>(null); // Persist results data across remounts
  const MAX_POLLS = 60; // 60 seconds max (1s intervals)
  const MAX_EVAL_POLLS = 20; // 20 polls = 60 seconds total (3s intervals) - increased for slower evaluations
  const EVAL_POLL_INTERVAL = 3000; // 3 seconds between polls

  // Poll for interviewId by sessionId
  // CRITICAL: Use finalSessionId (with fallback to window.location) to ensure we get the correct sessionId
  const pollForInterviewId = async (): Promise<string | null> => {
    const activeSessionId = finalSessionId;
    if (!activeSessionId) {
      console.log('[FLIGHT_RECORDER] [RESULTS] pollForInterviewId - no sessionId provided');
      return null;
    }
    
    try {
      console.log('[FLIGHT_RECORDER] [RESULTS] Polling for interviewId by sessionId:', {
        sessionId: activeSessionId,
        finalSessionId,
        wouterSessionId: sessionId,
        timestamp: new Date().toISOString()
      });
      const data = await apiGet(`/api/interviews/by-session/${activeSessionId}`);
      if (data.interviewId) {
        console.log('[FLIGHT_RECORDER] [RESULTS] Found interviewId:', {
          sessionId: activeSessionId,
          interviewId: data.interviewId,
          timestamp: new Date().toISOString()
        });
        return data.interviewId;
      }
      console.log('[FLIGHT_RECORDER] [RESULTS] No interviewId found yet for sessionId:', {
        sessionId: activeSessionId,
        timestamp: new Date().toISOString()
      });
      return null;
    } catch (err: any) {
      console.error('[FLIGHT_RECORDER] [RESULTS] Error polling for interviewId:', {
        sessionId: activeSessionId,
        error: err.message || err,
        status: err.status || 'unknown',
        timestamp: new Date().toISOString()
      });
      console.error('Error polling for interviewId:', err);
      return null;
    }
  };

  // Fetch results by interviewId
  const fetchResults = async (interviewId: string): Promise<InterviewResults | null> => {
    try {
      const data = await apiGet(`/api/interviews/${interviewId}/results`);
      return data;
    } catch (err: any) {
      console.error('Error fetching results:', err);
      throw err;
    }
  };

  // Helper function to check if data is ready and complete
  const isDataReady = (data: InterviewResults | null): boolean => {
    if (!data) {
      console.log('[FLIGHT_RECORDER] [RESULTS] isDataReady: data is null');
      return false;
    }
    
    // If we have interview data, we can show it (even without complete evaluation)
    // The UI already handles showing "Processing..." when evaluation is pending/null
    const hasInterviewData = data.interview !== null && data.interview !== undefined && data.interview.id !== null && data.interview.id !== undefined;
    
    console.log('[FLIGHT_RECORDER] [RESULTS] isDataReady check:', {
      hasData: !!data,
      hasInterview: !!data.interview,
      interviewId: data.interview?.id || 'null',
      hasEvaluation: !!data.evaluation,
      evaluationStatus: data.evaluation?.status || 'null',
      hasInterviewData,
      timestamp: new Date().toISOString()
    });
    
    // If evaluation is complete, that's also ready
    const hasEvaluation = data.evaluation !== null;
    const hasFeedback = data.evaluation?.evaluation !== null;
    const evalStatus = data.evaluation?.status;
    const isComplete = hasEvaluation && hasFeedback && evalStatus === 'complete';
    
    // Show results if we have interview data OR complete evaluation
    const result = hasInterviewData || isComplete;
    console.log('[FLIGHT_RECORDER] [RESULTS] isDataReady result:', result);
    return result;
  };

  // Minimum time timer - ensures loading screen shows for at least 2500ms
  useEffect(() => {
    const timer = setTimeout(() => {
      minTimeElapsedRef.current = true;
      setMinTimeElapsed(true);
    }, MIN_LOAD_TIME);

    return () => clearTimeout(timer);
  }, []);

  // Step progression logic - activates steps at specified delays
  useEffect(() => {
    // Clear any existing timeouts
    stepTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    stepTimeoutsRef.current = [];

    // Activate each step at its specified delay
    STEPS.forEach((step) => {
      if (step.id === 1) {
        // Step 1 is active immediately
        setActiveStep(1);
      } else {
        const timeout = setTimeout(() => {
          // Mark previous step as completed
          setCompletedSteps(prev => new Set([...prev, step.id - 1]));
          // Activate current step
          setActiveStep(step.id);
          // Step 4 will stay active/pulsing until data arrives (handled separately)
        }, step.delay);
        stepTimeoutsRef.current.push(timeout);
      }
    });

    return () => {
      stepTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  // Effect to handle showing results when both conditions are met
  useEffect(() => {
    const dataReady = isDataReady(results) || isDataReady(tempData);
    
    console.log('[FLIGHT_RECORDER] [RESULTS] Effect check:', {
      minTimeElapsed,
      dataReady,
      hasResults: !!results,
      hasTempData: !!tempData,
      resultsReady: isDataReady(results),
      tempDataReady: isDataReady(tempData),
      shouldShowResultsRef: shouldShowResultsRef.current,
      timestamp: new Date().toISOString()
    });
    
    if (minTimeElapsed && dataReady) {
      // If we have tempData and timer is done, move it to results
      // This works even if evaluation is not complete yet
      if (tempData) {
        // Always update results if tempData exists (even if results already exists)
        // This ensures polling updates are reflected in the UI
        if (!results || JSON.stringify(tempData) !== JSON.stringify(results)) {
          console.log('[FLIGHT_RECORDER] [RESULTS] Moving tempData to results');
          setResults(tempData);
          resultsDataRef.current = tempData; // Persist in ref
          // Clear tempData immediately to prevent duplicate processing
          setTempData(null);
          // Mark step 4 as completed when moving data
          setCompletedSteps(prev => new Set([...prev, 4]));
        } else {
          // tempData same as results, just clear it
          setTempData(null);
        }
      } else if (results && isDataReady(results)) {
        // Results already ready, just mark step 4 as completed
        console.log('[FLIGHT_RECORDER] [RESULTS] Results already ready');
        resultsDataRef.current = results; // Persist in ref
        setCompletedSteps(prev => new Set([...prev, 4]));
      }
      
      // Mark that we should show results (persists across remounts)
      shouldShowResultsRef.current = true;
      
      // Show results with fade transition
      // Use a ref check to prevent multiple calls
      if (!showResults) {
        setTimeout(() => {
          console.log('[FLIGHT_RECORDER] [RESULTS] Showing results');
          setShowResults(true);
          setStatus('complete');
        }, 100); // Small delay for smooth transition
      }
    }
  }, [minTimeElapsed, results, tempData, showResults]);
  
  // Initialize showResults from ref on mount (handles remounts)
  useEffect(() => {
    if (shouldShowResultsRef.current && (results || resultsDataRef.current) && !showResults) {
      console.log('[FLIGHT_RECORDER] [RESULTS] Restoring showResults from ref after remount');
      // Restore results from ref if state was reset
      if (!results && resultsDataRef.current) {
        console.log('[FLIGHT_RECORDER] [RESULTS] Restoring results data from ref');
        setResults(resultsDataRef.current);
      }
      setShowResults(true);
      setStatus('complete');
    }
  }, [results, showResults]);

  // Initialize mounted ref on mount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Direct lookup by interviewId (preferred) or polling by sessionId (fallback)
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    // Prevent duplicate loads - check if we've already started loading with these IDs
    if (prevInterviewIdRef.current === finalInterviewId && prevSessionIdRef.current === finalSessionId) {
      console.log('[FLIGHT_RECORDER] [RESULTS] Skipping duplicate load - IDs unchanged:', {
        interviewId: finalInterviewId,
        sessionId: finalSessionId,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Update refs to track current IDs
    prevInterviewIdRef.current = finalInterviewId;
    prevSessionIdRef.current = finalSessionId;
    hasStartedLoadingRef.current = true;
    
    // Strategy 1: Direct lookup by interviewId (if available)
    if (finalInterviewId) {
      console.log('[FLIGHT_RECORDER] [RESULTS] Using direct lookup by interviewId:', finalInterviewId);
      setStatus('loading');
      
      const loadResults = async () => {
        try {
          const data = await fetchResults(finalInterviewId);
          if (data) {
            console.log('[FLIGHT_RECORDER] [RESULTS] Direct lookup successful:', {
              interviewId: finalInterviewId,
              hasEvaluation: !!data.evaluation,
              evaluationStatus: data.evaluation?.status || 'null',
              timestamp: new Date().toISOString()
            });
            
            // CRITICAL: Set ref immediately before any state updates
            // This ensures data persists even if component remounts
            resultsDataRef.current = data;
            
            // Also set tempData for the useEffect to process
            setTempData(data);
            
            // Check if evaluation is complete
            const hasEvaluation = data.evaluation !== null;
            const hasFeedback = data.evaluation?.evaluation !== null;
            const evalStatus = data.evaluation?.status;
            const isComplete = hasEvaluation && hasFeedback && evalStatus === 'complete';
            
            // If minTimeElapsed is already true, move to results immediately
            // This ensures data is shown even if evaluation is pending
            if (minTimeElapsedRef.current) {
              console.log('[FLIGHT_RECORDER] [RESULTS] Min time already elapsed, moving to results immediately');
              setResults(data);
              shouldShowResultsRef.current = true;
              setShowResults(true);
              // Set status based on evaluation state - show data even if evaluation is pending
              if (isComplete) {
                setStatus('complete');
              } else {
                setStatus('evaluating'); // Show data but indicate evaluation is pending
              }
            }
            
            if (isComplete) {
              setCompletedSteps(prev => new Set([...prev, 4]));
            } else if (!hasEvaluation || !hasFeedback || evalStatus === 'pending') {
              // Poll for evaluation completion
              // Don't override status if we already set it above
              if (!minTimeElapsedRef.current) {
                setStatus('evaluating');
              }
              let evalPollCount = 0;
              
              const pollForEvaluation = async () => {
                while (evalPollCount < MAX_EVAL_POLLS) {
                  evalPollCount++;
                  await new Promise(resolve => setTimeout(resolve, EVAL_POLL_INTERVAL));
                  
                  try {
                    const updatedResults = await fetchResults(finalInterviewId);
                    const hasCompleteEvaluation = updatedResults.evaluation?.status === 'complete';
                    const hasCompleteFeedback = updatedResults.evaluation?.evaluation !== null;
                    
                    if (hasCompleteEvaluation && hasCompleteFeedback) {
                      // Update both tempData and results to ensure UI updates
                      setTempData(updatedResults);
                      setResults(updatedResults); // Update results directly so displayResults picks it up
                      resultsDataRef.current = updatedResults; // Persist immediately
                      setCompletedSteps(prev => new Set([...prev, 4]));
                      return;
                    }
                    if (updatedResults.evaluation?.status === 'failed') {
                      // Show interview data even if evaluation failed
                      setTempData(updatedResults);
                      setResults(updatedResults);
                      resultsDataRef.current = updatedResults;
                      setStatus('complete'); // Show results with error message
                      shouldShowResultsRef.current = true;
                      setShowResults(true);
                      return;
                    }
                    
                    // Update both tempData and results to ensure UI updates
                    setTempData(updatedResults);
                    setResults(updatedResults); // Update results directly so displayResults picks it up
                    resultsDataRef.current = updatedResults; // Persist immediately
                  } catch (err) {
                    console.error('Error polling for evaluation:', err);
                  }
                }
                
                // Timeout reached - but we have interview data, so don't show error
                // Just stop polling and let the user see the interview data
                console.log('[FLIGHT_RECORDER] [RESULTS] Evaluation polling timeout - showing interview data without evaluation');
                // Ensure we have the latest data displayed
                if (results || resultsDataRef.current) {
                  setStatus('complete');
                  shouldShowResultsRef.current = true;
                  setShowResults(true);
                  // Note: Evaluation may still be processing - user will see "Processing..." card
                } else {
                  // Only show error if we truly don't have any data
                  setError('Evaluation is taking longer than expected. Please refresh in a moment.');
                  setStatus('error');
                }
              };
              
              pollForEvaluation();
            }
          } else {
            console.warn('[FLIGHT_RECORDER] [RESULTS] Direct lookup returned no data, falling back to polling');
            // Fall through to polling logic
            setStatus('saving');
          }
        } catch (err: any) {
          console.error('[FLIGHT_RECORDER] [RESULTS] Direct lookup failed:', {
            interviewId: finalInterviewId,
            error: err.message || err,
            status: err.status || 'unknown',
            timestamp: new Date().toISOString()
          });
          
          // If 404, fall back to polling by sessionId
          if (err.status === 404 && finalSessionId) {
            console.log('[FLIGHT_RECORDER] [RESULTS] Interview not found by ID, falling back to polling by sessionId');
            // Trigger polling by setting a flag - polling logic below will handle it
            shouldPollRef.current = true;
          } else {
            setError(err.message || 'Failed to load results');
            setStatus('error');
            return;
          }
        }
      };
      
      loadResults().catch((err: any) => {
        // If direct lookup fails with 404 and we have sessionId, trigger polling
        if (err?.status === 404 && finalSessionId) {
          console.log('[FLIGHT_RECORDER] [RESULTS] Direct lookup failed with 404, will use polling fallback');
          shouldPollRef.current = true;
          // Continue to polling logic below
        }
      });
      
      // If direct lookup succeeds, don't start polling
      if (!shouldPollRef.current) {
        return; // Exit early - direct lookup handles its own flow
      }
    }
    
    // Strategy 2: Polling by sessionId (fallback if interviewId not available or direct lookup failed with 404)
    if (!finalSessionId) {
      console.error('[FLIGHT_RECORDER] [RESULTS] No interviewId or sessionId available');
      setError('No interview ID or session ID provided');
      setStatus('error');
      return;
    }
    
    if (!finalInterviewId || shouldPollRef.current) {
      console.log('[FLIGHT_RECORDER] [RESULTS] Using polling fallback by sessionId:', finalSessionId);
      if (!shouldPollRef.current) {
        setStatus('saving');
      }
    }
    
    // Start polling for interviewId
    // Use finalSessionId directly (already extracted from URL params)
    if (!finalSessionId) {
      console.error('[FLIGHT_RECORDER] [RESULTS] ERROR: No sessionId available from URL params or window.location');
      setError('Session ID is required');
      setStatus('error');
      return;
    }
    
    // Use the finalSessionId for all operations
    const effectiveSessionId = finalSessionId;

    let interviewId: string | null = null;
    let evalPollCount = 0;

    const startPolling = async () => {
      // Phase 1: Poll for interviewId (webhook may be delayed)
      setStatus('saving');
      
      while (!interviewId && pollCountRef.current < MAX_POLLS) {
        pollCountRef.current++;
        interviewId = await pollForInterviewId();
        
        if (!interviewId) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
        }
      }

      if (!interviewId) {
        setError('Interview not found. The webhook may be delayed. Please try again in a few moments.');
        setStatus('error');
        return;
      }

      // Phase 2: Fetch results and check evaluation status
      try {
        const resultsData = await fetchResults(interviewId);
        
        // Check if evaluation is null, incomplete, or pending
        // evaluation.evaluation is the actual feedback JSON - check if it exists
        const hasEvaluation = resultsData.evaluation !== null;
        const hasFeedback = resultsData.evaluation?.evaluation !== null;
        const evalStatus = resultsData.evaluation?.status;
        const isComplete = hasEvaluation && hasFeedback && evalStatus === 'complete';
        
        // CRITICAL: Set ref immediately before any state updates
        // This ensures data persists even if component remounts
        resultsDataRef.current = resultsData;
        
        // Also set tempData for the useEffect to process
        setTempData(resultsData);
        
        // If minTimeElapsed is already true, move to results immediately
        if (minTimeElapsedRef.current) {
          console.log('[FLIGHT_RECORDER] [RESULTS] Polling: Min time already elapsed, moving to results immediately');
          setResults(resultsData);
          shouldShowResultsRef.current = true;
          setShowResults(true);
          setStatus('complete');
        }
        
        // Mark step 4 as completed when data arrives (even if not complete yet)
        if (isComplete) {
          setCompletedSteps(prev => new Set([...prev, 4]));
        }
        
        if (!hasEvaluation || !hasFeedback || evalStatus === 'pending') {
          // Phase 3: Poll for evaluation completion
          // Show "Analyzing..." state - evaluation is being generated
          setStatus('evaluating');
          
          const pollForEvaluation = async () => {
            while (evalPollCount < MAX_EVAL_POLLS) {
              evalPollCount++;
              await new Promise(resolve => setTimeout(resolve, EVAL_POLL_INTERVAL));
              
              try {
                const updatedResults = await fetchResults(interviewId!);
                
                // Check if evaluation is complete AND feedback exists
                const hasCompleteEvaluation = updatedResults.evaluation?.status === 'complete';
                const hasCompleteFeedback = updatedResults.evaluation?.evaluation !== null;
                
                if (hasCompleteEvaluation && hasCompleteFeedback) {
                  // Update both tempData and results to ensure UI updates
                  setTempData(updatedResults);
                  setResults(updatedResults); // Update results directly so displayResults picks it up
                  resultsDataRef.current = updatedResults; // Persist immediately
                  // Mark step 4 as completed
                  setCompletedSteps(prev => new Set([...prev, 4]));
                  return;
                }
                if (updatedResults.evaluation?.status === 'failed') {
                  // Show interview data even if evaluation failed
                  setTempData(updatedResults);
                  setResults(updatedResults);
                  resultsDataRef.current = updatedResults;
                  setStatus('complete'); // Show results with error message
                  shouldShowResultsRef.current = true;
                  setShowResults(true);
                  return;
                }
                
                // Update both tempData and results to ensure UI updates
                setTempData(updatedResults);
                setResults(updatedResults); // Update results directly so displayResults picks it up
                resultsDataRef.current = updatedResults; // Persist immediately
              } catch (err) {
                console.error('Error polling for evaluation:', err);
              }
            }
            
            // Timeout reached - but we have interview data, so don't show error
            // Just stop polling and let the user see the interview data
            console.log('[FLIGHT_RECORDER] [RESULTS] Evaluation polling timeout (polling path) - showing interview data without evaluation');
            // Ensure we have the latest data displayed
            if (results || resultsDataRef.current) {
              setStatus('complete');
              shouldShowResultsRef.current = true;
              setShowResults(true);
              // Note: Evaluation may still be processing - user will see "Processing..." card
            } else {
              // Only show error if we truly don't have any data
              setError('Evaluation is taking longer than expected. Please refresh in a moment.');
              setStatus('error');
            }
          };
          
          pollForEvaluation();
        } else if (evalStatus === 'complete' && hasFeedback) {
          // Already handled above
        } else if (evalStatus === 'failed') {
          setError('Evaluation failed. Please contact support.');
          setStatus('error');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load results');
        setStatus('error');
      }
    };

    startPolling();

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [finalInterviewId, finalSessionId]); // Only depend on memoized values - removed sessionId as it's redundant

  const handleRetry = () => {
    pollCountRef.current = 0;
    setError(null);
    setStatus('loading');
    // Trigger re-poll by updating state
    window.location.reload();
  };

  // Step-by-Step Loading Screen Component
  const renderLoadingScreen = () => {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-8 pb-8 px-8">
            <div className="flex flex-col gap-6">
              <div className="text-center mb-2">
                <h2 className="text-2xl font-semibold text-gray-800 mb-2">
                  Getting your results ready
                </h2>
                <p className="text-gray-600 text-sm">
                  This will just take a moment...
                </p>
              </div>
              
              <div className="space-y-4">
                {STEPS.map((step) => {
                  const isCompleted = completedSteps.has(step.id);
                  const isActive = activeStep === step.id && !isCompleted;
                  const isFuture = activeStep < step.id;
                  
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-4 transition-all duration-300 ${
                        isActive ? 'opacity-100' : isCompleted ? 'opacity-100' : 'opacity-60'
                      }`}
                    >
                      {/* Step Indicator */}
                      <div className="flex-shrink-0">
                        {isCompleted ? (
                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-white" />
                          </div>
                        ) : isActive ? (
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                            <div className="w-3 h-3 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                      
                      {/* Step Text */}
                      <div className="flex-1">
                        <p
                          className={`text-sm font-medium transition-colors duration-300 ${
                            isCompleted
                              ? 'text-green-600'
                              : isActive
                              ? 'text-blue-600'
                              : 'text-gray-500'
                          }`}
                        >
                          {step.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Show error screen
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Unable to Load Results</h2>
                <p className="text-gray-600 text-sm mb-4">{error}</p>
                <Button onClick={handleRetry} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Use ref as fallback for results data
  const displayResults = results || resultsDataRef.current;
  
  // Add debug logging
  console.log('[FLIGHT_RECORDER] [RESULTS] Render check:', {
    hasDisplayResults: !!displayResults,
    hasResults: !!results,
    hasResultsDataRef: !!resultsDataRef.current,
    showResults,
    shouldShowResultsRef: shouldShowResultsRef.current,
    interviewId: displayResults?.interview?.id,
    hasTranscript: !!displayResults?.interview?.transcript,
    transcriptLength: displayResults?.interview?.transcript?.length || 0,
    hasEvaluation: !!displayResults?.evaluation,
    evaluationStatus: displayResults?.evaluation?.status || 'null',
    hasEvaluationJson: !!displayResults?.evaluation?.evaluation,
    // Log the actual data structure for debugging
    displayResultsStructure: displayResults ? {
      hasInterview: !!displayResults.interview,
      interviewId: displayResults.interview?.id,
      interviewStatus: displayResults.interview?.status,
      hasEvaluation: !!displayResults.evaluation,
      evaluationStatus: displayResults.evaluation?.status || 'null',
    } : null,
    timestamp: new Date().toISOString()
  });
  
  // Render both loading and results with fade transitions
  // Use ref as fallback to handle remounts where state hasn't updated yet
  const shouldShow = showResults || shouldShowResultsRef.current;
  
  // Ensure displayResults is always available from ref if results state is null
  // This provides an extra safety layer for edge cases
  const effectiveDisplayResults = displayResults || resultsDataRef.current;
  
  // Debug logging for render conditions
  console.log('[FLIGHT_RECORDER] [RESULTS] Render conditions:', {
    shouldShow,
    showResults,
    shouldShowResultsRef: shouldShowResultsRef.current,
    hasEffectiveDisplayResults: !!effectiveDisplayResults,
    hasDisplayResults: !!displayResults,
    hasResults: !!results,
    hasResultsDataRef: !!resultsDataRef.current,
    effectiveDisplayResultsInterviewId: effectiveDisplayResults?.interview?.id,
    willRenderLoading: !shouldShow,
    willRenderResults: !!(effectiveDisplayResults && shouldShow),
    timestamp: new Date().toISOString()
  });
  
  // Safely handle partial records - evaluation may be null or incomplete
  const evaluation = effectiveDisplayResults?.evaluation;
  const hasCompleteFeedback = evaluation?.evaluation !== null && evaluation?.evaluation !== undefined;
  const overallScore = hasCompleteFeedback 
    ? (evaluation?.overallScore || evaluation?.evaluation?.overall_score || null)
    : null;
  
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Loading Screen - conditionally render instead of just hiding */}
      {!shouldShow && (
        <div className="absolute inset-0 z-10 transition-opacity duration-500 opacity-100">
          {renderLoadingScreen()}
        </div>
      )}
      
      {/* Results Screen - render when we have data and should show */}
      {effectiveDisplayResults && shouldShow ? (
        <div className="relative z-20 transition-opacity duration-500 py-8 px-4 opacity-100">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">Interview Results</CardTitle>
              {overallScore !== null && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-lg font-semibold">Score: {overallScore}/100</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* DEBUG: Log what we're trying to render */}
            {(() => {
              console.log('[FLIGHT_RECORDER] [RESULTS] CardContent render check:', {
                hasEffectiveDisplayResults: !!effectiveDisplayResults,
                hasInterview: !!effectiveDisplayResults?.interview,
                interviewId: effectiveDisplayResults?.interview?.id,
                hasDurationSeconds: !!effectiveDisplayResults?.interview?.durationSeconds,
                durationSeconds: effectiveDisplayResults?.interview?.durationSeconds,
                hasTranscript: !!effectiveDisplayResults?.interview?.transcript,
                transcriptLength: effectiveDisplayResults?.interview?.transcript?.length || 0,
                hasEvaluation: !!evaluation,
                evaluationStatus: evaluation?.status || 'null',
                evaluationEvaluation: evaluation?.evaluation,
                condition1_match: !!(effectiveDisplayResults?.interview?.id),
                condition2_match: !!(effectiveDisplayResults && !effectiveDisplayResults?.interview?.durationSeconds && !effectiveDisplayResults?.interview?.transcript && !evaluation),
                condition3_match: !!(effectiveDisplayResults && !effectiveDisplayResults?.interview?.durationSeconds && !effectiveDisplayResults?.interview?.transcript && evaluation === null),
                timestamp: new Date().toISOString()
              });
              return null;
            })()}
            
            {/* Always show interview ID if available */}
            {effectiveDisplayResults?.interview?.id ? (
              <div className="mb-4">
                <p className="text-gray-500 text-xs mb-2 font-mono">
                  Interview ID: {effectiveDisplayResults.interview.id}
                </p>
              </div>
            ) : null}
            
            {/* Show loading state if no data yet */}
            {!effectiveDisplayResults && finalInterviewId && (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600 text-sm">
                  Loading interview results...
                </p>
                <p className="text-gray-500 text-xs mt-2 font-mono">
                  Interview ID: {finalInterviewId}
                </p>
              </div>
            )}
            
            {/* Show duration if available */}
            {effectiveDisplayResults?.interview?.durationSeconds ? (
              <p className="text-gray-600 text-sm mb-4">
                Duration: {Math.floor((effectiveDisplayResults.interview.durationSeconds || 0) / 60)}m {(effectiveDisplayResults.interview.durationSeconds || 0) % 60}s
              </p>
            ) : null}
            
            {/* Always show status message when we have data but no transcript/duration/evaluation */}
            {effectiveDisplayResults && !effectiveDisplayResults?.interview?.durationSeconds && !effectiveDisplayResults?.interview?.transcript && !evaluation ? (
              <div className="text-center py-4">
                <p className="text-gray-600 text-sm mb-2">
                  Interview saved successfully. Processing your results...
                </p>
                {effectiveDisplayResults?.interview?.id && (
                  <p className="text-gray-500 text-xs font-mono">
                    Interview ID: {effectiveDisplayResults.interview.id}
                  </p>
                )}
              </div>
            ) : null}
            
            {/* Fallback: If we have effectiveDisplayResults but none of the above matched, show something */}
            {effectiveDisplayResults && !effectiveDisplayResults?.interview?.durationSeconds && !effectiveDisplayResults?.interview?.transcript && evaluation === null && (
              <div className="text-center py-4">
                <p className="text-gray-600 text-sm">
                  Your interview has been saved. Results are being processed...
                </p>
              </div>
            )}
            
            {/* Final fallback: Always show something if we have effectiveDisplayResults */}
            {effectiveDisplayResults && (
              <div className="text-center py-4 border-t pt-4 mt-4">
                <p className="text-gray-600 text-sm mb-2">
                  Interview ID: {effectiveDisplayResults?.interview?.id || 'Unknown'}
                </p>
                <p className="text-gray-500 text-xs mb-2">
                  Status: {effectiveDisplayResults?.interview?.status || 'Unknown'}
                </p>
                {!effectiveDisplayResults?.interview?.transcript && !evaluation && (
                  <p className="text-gray-500 text-xs mt-2">
                    Processing your results...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Show processing message if no evaluation record exists yet */}
        {effectiveDisplayResults && !evaluation && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2">Processing your interview...</h3>
                  <p className="text-gray-600 text-sm">Your interview has been saved. Evaluation is being prepared.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {effectiveDisplayResults && evaluation && evaluation.status === 'failed' && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <AlertCircle className="h-8 w-8 text-orange-600" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2 text-orange-800">Evaluation Unavailable</h3>
                  <p className="text-gray-700 text-sm mb-2">
                    We encountered an issue generating your feedback. Your interview transcript is available below.
                  </p>
                  {evaluation.error && (
                    <p className="text-gray-600 text-xs font-mono bg-white p-2 rounded border border-orange-200">
                      {evaluation.error}
                    </p>
                  )}
                  <p className="text-gray-600 text-xs mt-2">
                    Please contact support if you need assistance.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {effectiveDisplayResults && evaluation && evaluation.status === 'pending' && !hasCompleteFeedback && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2">Processing your interview...</h3>
                  <p className="text-gray-600 text-sm">Feedback and scores are being generated. This may take a few moments.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {effectiveDisplayResults && evaluation && evaluation.status !== 'failed' && evaluation.status !== 'pending' && !hasCompleteFeedback && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2">Processing your interview...</h3>
                  <p className="text-gray-600 text-sm">Feedback and scores are being generated. This may take a few moments.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {effectiveDisplayResults && hasCompleteFeedback && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Evaluation</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Overall Strengths and Improvements */}
              {(evaluation?.evaluation?.overall_strengths?.length || evaluation?.evaluation?.overall_improvements?.length) && (
                <div className="mb-6 space-y-4">
                  {evaluation?.evaluation?.overall_strengths && evaluation.evaluation.overall_strengths.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-green-700 mb-2">Overall Strengths:</h4>
                      <ul className="list-disc list-inside text-sm text-gray-700">
                        {evaluation.evaluation.overall_strengths.map((strength, i) => (
                          <li key={i}>{strength}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {evaluation?.evaluation?.overall_improvements && evaluation.evaluation.overall_improvements.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-orange-700 mb-2">Overall Areas for Improvement:</h4>
                      <ul className="list-disc list-inside text-sm text-gray-700">
                        {evaluation.evaluation.overall_improvements.map((improvement, i) => (
                          <li key={i}>{improvement}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Per-Question Evaluation */}
              <div className="space-y-6">
                {evaluation?.evaluation?.questions?.map((qa, index) => (
                  <div key={index} className="border-b pb-4 last:border-b-0">
                    <h3 className="font-semibold mb-2">Question {index + 1}</h3>
                    <p className="text-gray-700 mb-2">{qa.question}</p>
                    <p className="text-gray-600 mb-3">{qa.answer}</p>
                    <div className="flex items-center gap-4 mb-3">
                      <span className="text-sm font-medium">Score: {qa.score}/100</span>
                    </div>
                    {qa.strengths?.length > 0 && (
                      <div className="mb-2">
                        <h4 className="text-sm font-semibold text-green-700 mb-1">Strengths:</h4>
                        <ul className="list-disc list-inside text-sm text-gray-700">
                          {qa.strengths.map((strength, i) => (
                            <li key={i}>{strength}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {qa.improvements?.length > 0 && (
                      <div className="mb-2">
                        <h4 className="text-sm font-semibold text-orange-700 mb-1">Areas for Improvement:</h4>
                        <ul className="list-disc list-inside text-sm text-gray-700">
                          {qa.improvements.map((improvement, i) => (
                            <li key={i}>{improvement}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {qa.sample_better_answer && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-md">
                        <h4 className="text-sm font-semibold text-blue-700 mb-1">Sample Better Answer:</h4>
                        <p className="text-sm text-gray-700">{qa.sample_better_answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {effectiveDisplayResults?.interview?.transcript && (
          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm text-gray-700">
                {effectiveDisplayResults?.interview?.transcript}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex justify-center">
          <Button 
            onClick={() => {
              // Clear interview-related localStorage before navigating to prevent stale state
              console.log('Clearing interview state before navigating home');
              localStorage.removeItem('candidate_context');
              navigate('/');
            }} 
            variant="outline"
          >
            Back to Home
          </Button>
        </div>
      </div>
        </div>
      ) : null}
    </div>
  );
}

