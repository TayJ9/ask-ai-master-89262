/**
 * Interview Results Page
 * 
 * Displays interview transcript and evaluation results.
 * Handles polling for pending/processing evaluation states.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
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

// Processing steps for the progress stepper
const PROCESSING_STEPS = [
  { id: 1, text: "Interview Saved", completed: true },
  { id: 2, text: "Transcribing Audio...", completed: false },
  { id: 3, text: "Generating Feedback...", completed: false },
];

const POLL_INTERVAL = 3000; // 3 seconds
const POLL_TIMEOUT = 60000; // 60 seconds

export default function Results() {
  const [location] = useLocation();
  const [, navigate] = useRoute("/");
  const { toast } = useToast();
  
  // Navigate helper
  const goToDashboard = () => {
    localStorage.removeItem('candidate_context');
    navigate('/');
  };
  
  // Parse query params
  const { finalInterviewId, finalSessionId } = useMemo(() => {
    const urlParts = location.split('?');
    const queryString = urlParts.length > 1 ? urlParts[1] : '';
    const params = new URLSearchParams(queryString);
    
    // Also check window.location as fallback
    const windowParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    
    const interviewId = windowParams?.get('interviewId') || params.get("interviewId");
    const sessionId = windowParams?.get('sessionId') || params.get("sessionId");
    
    return { finalInterviewId: interviewId, finalSessionId: sessionId };
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
    try {
      const data = await apiGet(`/api/interviews/${interviewId}/results`);
      return data;
    } catch (err: any) {
      console.error('Error fetching results:', err);
      throw err;
    }
  }, []);

  // Poll for interviewId by sessionId (fallback)
  const pollForInterviewId = useCallback(async (sessionId: string): Promise<string | null> => {
    try {
      const data = await apiGet(`/api/interviews/by-session/${sessionId}`);
      return data.interviewId || null;
    } catch (err: any) {
      console.error('Error polling for interviewId:', err);
      return null;
    }
  }, []);

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
  }, [finalInterviewId, finalSessionId, fetchResults, pollForInterviewId, getEvaluationStatus, toast]);

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
    if (results?.evaluation) {
      if (results.evaluation.status === 'processing') {
        currentStep = 2; // Transcribing
      } else if (results.evaluation.status === 'pending') {
        currentStep = 2; // Still transcribing or starting processing
      }
    } else {
      currentStep = 1; // Just saved
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Processing Your Interview</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-6">
              {/* Progress Stepper */}
              <div className="space-y-4">
                {PROCESSING_STEPS.map((step) => {
                  const isCompleted = step.id < currentStep || (step.id === currentStep && step.completed);
                  const isActive = step.id === currentStep && !step.completed;
                  
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

              {/* Return to Dashboard Button - Always Visible */}
              <div className="pt-4 border-t">
                <Button 
                  onClick={handleReturnToDashboard}
                  variant="outline"
                  className="w-full"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Return to Dashboard
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Render Error UI
  if (error && !results) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Unable to Load Results</h2>
                <p className="text-gray-600 text-sm mb-4">{error}</p>
                <div className="flex gap-2 justify-center">
                  <Button onClick={handleRetry} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                  <Button onClick={handleReturnToDashboard} variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Return to Dashboard
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show Processing UI if pending/processing
  if ((evalStatus === 'pending' || evalStatus === 'processing' || isPolling) && results) {
    return renderProcessingUI();
  }

  // Show Results UI if completed or if we have data (even if evaluation failed)
  if (results && (evalStatus === 'completed' || evalStatus === 'failed' || results.interview)) {
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
              {/* Interview Info */}
              {results.interview?.durationSeconds && (
                <p className="text-gray-600 text-sm mb-4">
                  Duration: {Math.floor((results.interview.durationSeconds || 0) / 60)}m {(results.interview.durationSeconds || 0) % 60}s
                </p>
              )}

              {/* Evaluation Failed Message */}
              {evalStatus === 'failed' && results.evaluation && (
                <Card className="mb-6 border-orange-200 bg-orange-50">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center gap-4">
                      <AlertCircle className="h-8 w-8 text-orange-600" />
                      <div className="text-center">
                        <h3 className="text-lg font-semibold mb-2 text-orange-800">Evaluation Unavailable</h3>
                        <p className="text-gray-700 text-sm mb-2">
                          We encountered an issue generating your feedback. Your interview transcript is available below.
                        </p>
                        {results.evaluation.error && (
                          <p className="text-gray-600 text-xs font-mono bg-white p-2 rounded border border-orange-200">
                            {results.evaluation.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Complete Evaluation Results */}
              {hasCompleteFeedback && results.evaluation?.evaluation && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>Evaluation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Overall Strengths and Improvements */}
                    {(results.evaluation.evaluation.overall_strengths?.length || results.evaluation.evaluation.overall_improvements?.length) && (
                      <div className="mb-6 space-y-4">
                        {results.evaluation.evaluation.overall_strengths && results.evaluation.evaluation.overall_strengths.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-green-700 mb-2">Overall Strengths:</h4>
                            <ul className="list-disc list-inside text-sm text-gray-700">
                              {results.evaluation.evaluation.overall_strengths.map((strength, i) => (
                                <li key={i}>{strength}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {results.evaluation.evaluation.overall_improvements && results.evaluation.evaluation.overall_improvements.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-orange-700 mb-2">Overall Areas for Improvement:</h4>
                            <ul className="list-disc list-inside text-sm text-gray-700">
                              {results.evaluation.evaluation.overall_improvements.map((improvement, i) => (
                                <li key={i}>{improvement}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Per-Question Evaluation */}
                    <div className="space-y-6">
                      {results.evaluation.evaluation.questions?.map((qa, index) => (
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

              {/* Transcript */}
              {results.interview?.transcript && (
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

              {/* Return to Dashboard Button */}
              <div className="mt-6 flex justify-center">
                <Button 
                  onClick={handleReturnToDashboard}
                  variant="outline"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Loading state (initial load)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Loading Results</h2>
              <p className="text-gray-600 text-sm">Please wait...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
