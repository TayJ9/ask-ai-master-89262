/**
 * Interview Results Page
 * 
 * Displays interview transcript and evaluation results.
 * Handles polling for webhook delay and evaluation completion.
 */

import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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
  // CRITICAL: Ensure we're parsing from the actual URL, not a stale location value
  const urlParts = location.split('?');
  const queryString = urlParts.length > 1 ? urlParts[1] : '';
  const searchParams = new URLSearchParams(queryString);
  const sessionId = searchParams.get("sessionId");
  const conversationId = searchParams.get("conversationId");
  
  console.log('[FLIGHT_RECORDER] [RESULTS] Page loaded - URL params extracted:', {
    fullLocation: location,
    urlParts: urlParts,
    queryString: queryString,
    searchParamsEntries: Array.from(searchParams.entries()),
    sessionId: sessionId || 'null',
    conversationId: conversationId || 'null',
    windowLocationSearch: typeof window !== 'undefined' ? window.location.search : 'N/A',
    windowLocationHref: typeof window !== 'undefined' ? window.location.href : 'N/A',
    timestamp: new Date().toISOString()
  });
  
  // FALLBACK: If sessionId is missing from URL params, try to get it from window.location
  // This handles cases where wouter's location might not include query params
  const finalSessionId = sessionId || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('sessionId') : null);
  const finalConversationId = conversationId || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('conversationId') : null);
  
  if (finalSessionId !== sessionId || finalConversationId !== conversationId) {
    console.warn('[FLIGHT_RECORDER] [RESULTS] Query params mismatch - using window.location fallback:', {
      wouterSessionId: sessionId,
      windowSessionId: finalSessionId,
      wouterConversationId: conversationId,
      windowConversationId: finalConversationId,
      timestamp: new Date().toISOString()
    });
  }
  
  const [status, setStatus] = useState<'loading' | 'saving' | 'evaluating' | 'complete' | 'error'>('loading');
  const [results, setResults] = useState<InterviewResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const MAX_POLLS = 60; // 60 seconds max (1s intervals)
  const MAX_EVAL_POLLS = 10; // 10 polls = 30 seconds total (3s intervals)

  // Poll for interviewId by sessionId
  // CRITICAL: Use finalSessionId (with fallback to window.location) to ensure we get the correct sessionId
  const pollForInterviewId = async (): Promise<string | null> => {
    const activeSessionId = finalSessionId || sessionId;
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

  // Start polling for interviewId
  useEffect(() => {
    const activeSessionId = finalSessionId || sessionId;
    if (!activeSessionId) {
      console.error('[FLIGHT_RECORDER] [RESULTS] ERROR: No sessionId available from URL params or window.location');
      setError('Session ID is required');
      setStatus('error');
      return;
    }
    
    // Use the active sessionId for all operations
    const effectiveSessionId = activeSessionId;

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
        setResults(resultsData);
        
        // Check if evaluation is null, incomplete, or pending
        // evaluation.evaluation is the actual feedback JSON - check if it exists
        const hasEvaluation = resultsData.evaluation !== null;
        const hasFeedback = resultsData.evaluation?.evaluation !== null;
        const evalStatus = resultsData.evaluation?.status;
        
        if (!hasEvaluation || !hasFeedback || evalStatus === 'pending') {
          // Phase 3: Poll for evaluation completion
          // Show "Analyzing..." state - evaluation is being generated
          setStatus('evaluating');
          
          const pollForEvaluation = async () => {
            while (evalPollCount < MAX_EVAL_POLLS) {
              evalPollCount++;
              await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s
              
              try {
                const updatedResults = await fetchResults(interviewId!);
                setResults(updatedResults);
                
                // Check if evaluation is complete AND feedback exists
                const hasCompleteEvaluation = updatedResults.evaluation?.status === 'complete';
                const hasCompleteFeedback = updatedResults.evaluation?.evaluation !== null;
                
                if (hasCompleteEvaluation && hasCompleteFeedback) {
                  setStatus('complete');
                  return;
                }
                if (updatedResults.evaluation?.status === 'failed') {
                  setError('Evaluation failed. Please contact support.');
                  setStatus('error');
                  return;
                }
              } catch (err) {
                console.error('Error polling for evaluation:', err);
              }
            }
            
            // Timeout after 30 seconds (10 polls * 3s)
            setError('Evaluation is taking longer than expected. Please refresh in a moment.');
            setStatus('error');
          };
          
          pollForEvaluation();
        } else if (evalStatus === 'complete' && hasFeedback) {
          setStatus('complete');
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
      isMountedRef.current = false;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [finalSessionId, sessionId]); // Depend on both to re-run if either changes

  const handleRetry = () => {
    pollCountRef.current = 0;
    setError(null);
    setStatus('loading');
    // Trigger re-poll by updating state
    window.location.reload();
  };

  if (status === 'loading' || status === 'saving' || status === 'evaluating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">
                  {status === 'saving' && 'Saving your interview...'}
                  {status === 'evaluating' && 'Analyzing your interview...'}
                  {status === 'loading' && 'Loading results...'}
                </h2>
                <p className="text-gray-600 text-sm">
                  {status === 'saving' && 'Waiting for interview to be saved...'}
                  {status === 'evaluating' && 'Generating feedback and scores. This may take a few moments...'}
                  {status === 'loading' && 'Please wait...'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  if (!results) {
    return null;
  }

  // Safely handle partial records - evaluation may be null or incomplete
  const evaluation = results.evaluation;
  const hasCompleteFeedback = evaluation?.evaluation !== null && evaluation?.evaluation !== undefined;
  const overallScore = hasCompleteFeedback 
    ? (evaluation?.overallScore || evaluation?.evaluation?.overall_score || null)
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
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
            {results.interview.durationSeconds && (
              <p className="text-gray-600 text-sm mb-4">
                Duration: {Math.floor(results.interview.durationSeconds / 60)}m {results.interview.durationSeconds % 60}s
              </p>
            )}
          </CardContent>
        </Card>

        {evaluation && !hasCompleteFeedback && (
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

        {hasCompleteFeedback && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Evaluation</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Overall Strengths and Improvements */}
              {(evaluation.evaluation.overall_strengths?.length || evaluation.evaluation.overall_improvements?.length) && (
                <div className="mb-6 space-y-4">
                  {evaluation.evaluation.overall_strengths && evaluation.evaluation.overall_strengths.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-green-700 mb-2">Overall Strengths:</h4>
                      <ul className="list-disc list-inside text-sm text-gray-700">
                        {evaluation.evaluation.overall_strengths.map((strength, i) => (
                          <li key={i}>{strength}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {evaluation.evaluation.overall_improvements && evaluation.evaluation.overall_improvements.length > 0 && (
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
                {evaluation.evaluation.questions.map((qa, index) => (
                  <div key={index} className="border-b pb-4 last:border-b-0">
                    <h3 className="font-semibold mb-2">Question {index + 1}</h3>
                    <p className="text-gray-700 mb-2">{qa.question}</p>
                    <p className="text-gray-600 mb-3">{qa.answer}</p>
                    <div className="flex items-center gap-4 mb-3">
                      <span className="text-sm font-medium">Score: {qa.score}/100</span>
                    </div>
                    {qa.strengths.length > 0 && (
                      <div className="mb-2">
                        <h4 className="text-sm font-semibold text-green-700 mb-1">Strengths:</h4>
                        <ul className="list-disc list-inside text-sm text-gray-700">
                          {qa.strengths.map((strength, i) => (
                            <li key={i}>{strength}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {qa.improvements.length > 0 && (
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

        {results.interview.transcript && (
          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm text-gray-700">
                {results.interview.transcript}
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
  );
}

