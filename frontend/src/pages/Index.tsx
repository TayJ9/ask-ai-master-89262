/**
 * PERF SUMMARY:
 * - useCallback for handlers passed to children (onSelectRole, onResumeUploaded, onComplete, onInterviewEnd, onBack) to avoid unnecessary re-renders of memoized RoleSelection, ResumeUpload, VoiceInterviewWebSocket.
 */
import { useState, useEffect, useCallback, startTransition } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { fadeInVariants, defaultFadeTransition } from "@/lib/animations";
import Auth from "@/components/Auth";
import RoleSelection from "@/components/RoleSelection";
import VoiceInterviewWebSocket from "@/components/VoiceInterviewWebSocket";
import VoiceInterviewErrorBoundary from "@/components/VoiceInterviewErrorBoundary";
import ResumeUpload from "@/components/ResumeUpload";
import SessionHistory from "@/components/SessionHistory";
import { Button } from "@/components/ui/button";
import { LogOut, History, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { debugLog, shouldDebugEleven } from "@/lib/wsDebug";
import { devLog } from "@/lib/utils";
import { generateClientSessionId } from "@/lib/sessionId";
import {
  type CandidateContext,
  type ResumeUploadCandidateInfo,
  parseStoredCandidateContext,
  sanitizeCandidateContextForStorage,
} from "@/lib/candidateContext";

// Smooth internal view transitions - using shared animation config
const viewTransition = defaultFadeTransition;
const viewVariants = fadeInVariants;

const authenticatedViewShell =
  "absolute inset-x-0 bottom-0 top-[calc(3.25rem+env(safe-area-inset-top))] min-h-0 w-full sm:top-[calc(3.5rem+env(safe-area-inset-top))]";

export default function Index() {
  const [location, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [currentView, setCurrentView] = useState<"roles" | "resume" | "interview" | "voice" | "history">("roles");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [resumeText, setResumeText] = useState<string>("");
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [firstQuestion, setFirstQuestion] = useState<string>("");
  const [interviewMode, setInterviewMode] = useState<"text" | "voice">("voice");
  const [voiceInterviewData, setVoiceInterviewData] = useState<{sessionId: string, audioResponse?: string, agentResponseText?: string} | null>(null);
  const [candidateContext, setCandidateContext] = useState<CandidateContext | null>(null);
  const [previousLocation, setPreviousLocation] = useState<string>("");
  const { toast } = useToast();
  
  // Reset all interview-related state and localStorage
  const resetInterviewState = useCallback(() => {
    console.log('Resetting interview state...');
    setCurrentView("roles");
    setSelectedRole("");
    setResumeText("");
    setVoiceSessionId(null);
    setFirstQuestion("");
    setVoiceInterviewData(null);
    setCandidateContext(null);
    // Clear localStorage to prevent stale state
    localStorage.removeItem('candidate_context');
    console.log('Interview state reset complete');
  }, []);

  // Debug logging (dev-only, minimal for INP)
  useEffect(() => {
    if (import.meta.env.DEV && shouldDebugEleven()) {
      devLog.log('[FLIGHT_RECORDER] [SETUP] View changed:', currentView);
    }
  }, [currentView]);

  // Track location changes to detect navigation from results page
  useEffect(() => {
    // If navigating from /results to /, clear interview state
    if (previousLocation.startsWith('/results') && location === '/') {
      devLog.log('Navigating from results page - clearing interview state');
      resetInterviewState();
    }
    setPreviousLocation(location);
  }, [location, previousLocation, resetInterviewState]);

  useEffect(() => {
    // Safely retrieve and parse stored auth data
    try {
      const token = localStorage.getItem('auth_token');
      const storedUser = localStorage.getItem('user');
      if (token && storedUser) {
        const parsedUser = JSON.parse(storedUser);
        // Validate user object has required fields
        if (parsedUser && parsedUser.id && parsedUser.email) {
          setUser(parsedUser);
        } else {
          console.warn('Invalid user data in localStorage, clearing...');
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
        }
      }
    } catch (error) {
      console.error('Error loading user from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
    }
    // Only hydrate candidate context if we're not coming from results page
    // This prevents stale state from persisting after restart
    if (!location.startsWith('/results')) {
      try {
        const storedContext = localStorage.getItem('candidate_context');
        if (storedContext && !candidateContext) {
          const parsed = parseStoredCandidateContext(storedContext);
          if (parsed) {
            setCandidateContext(parsed);
            localStorage.setItem('candidate_context', JSON.stringify(parsed));
          }
        }
      } catch (e) {
        console.warn('Failed to hydrate candidate_context', e);
        localStorage.removeItem('candidate_context');
      }
    }
  }, []);

  const handleAuthSuccess = useCallback((userData: any, _token: string) => {
    setUser(userData);
  }, []);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('candidate_context');
    setUser(null);
    startTransition(() => {
      setCurrentView("roles");
      setSelectedRole("");
    });
  }, []);

  const handleBackToRoles = useCallback(() => {
    startTransition(() => {
      setCurrentView("roles");
      setSelectedRole("");
      setResumeText("");
    });
  }, []);

  const handleViewHistory = useCallback(() => {
    startTransition(() => setCurrentView("history"));
  }, []);

  const handleSelectRole = useCallback((role: string, mode: "text" | "voice" = "voice") => {
    const normalizedRole = role?.trim() || "General Interview";
    // INP: Defer heavy view transition so browser can paint click feedback first
    startTransition(() => {
      setCurrentView("resume");
      setSelectedRole(normalizedRole);
      setInterviewMode("voice");
      setResumeText("");
      setVoiceSessionId(null);
      setFirstQuestion("");
      setVoiceInterviewData(null);
      setCandidateContext(null);
      localStorage.removeItem("candidate_context");
    });
  }, []);

  const handleResumeUploaded = useCallback(async (resume: string, candidateInfo?: ResumeUploadCandidateInfo) => {
    setResumeText(resume);
    
    // Store candidate info for voice interview
    // Priority: candidateInfo.major (from ResumeUpload) > selectedRole (typed input) > "General Interview"
    // Use the major from candidateInfo (entered in ResumeUpload form) as primary source
    // Fall back to selectedRole (typed in Start Interview page) if candidateInfo.major is missing
    // Ensure we never have an empty role - default to "General Interview"
    const interviewRole = (candidateInfo?.major?.trim() || selectedRole?.trim() || "General Interview");
    
    if (candidateInfo) {
      const newCandidateContext: CandidateContext = {
        firstName: candidateInfo.firstName,
        name: candidateInfo.firstName,
        major: interviewRole, // Use calculated role (ResumeUpload major takes priority, typed role as fallback)
        year: candidateInfo.year,
        sessionId: candidateInfo.sessionId,
        resumeText: resume,
        resumeSource: candidateInfo.resumeSource || "unknown",
        resume_summary: candidateInfo.resume_summary,
        resume_highlights: candidateInfo.resume_highlights,
        skills: candidateInfo.skills,
      };
      devLog.log('[FLIGHT_RECORDER] [SETUP] candidateContext updated:', {
        firstName: newCandidateContext.firstName,
        major: newCandidateContext.major,
        year: newCandidateContext.year,
        sessionId: newCandidateContext.sessionId,
        resumeTextLength: newCandidateContext.resumeText?.length || 0,
        resumeSource: newCandidateContext.resumeSource,
        timestamp: new Date().toISOString()
      });
      setCandidateContext(newCandidateContext);
      // Persist to localStorage to survive view changes/reloads
      try {
        const contextToStore = sanitizeCandidateContextForStorage(newCandidateContext);
        localStorage.setItem('candidate_context', JSON.stringify(contextToStore));
        devLog.log('[FLIGHT_RECORDER] [SETUP] candidateContext persisted to localStorage:', {
          sessionId: contextToStore?.sessionId,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        devLog.warn('[FLIGHT_RECORDER] [SETUP] Failed to persist candidate_context', e);
      }

      if (shouldDebugEleven()) {
        // #region agent log
        debugLog({
          hypothesisId: "H1",
          location: "Index.tsx:handleResumeUploaded",
          message: "resume_pipeline_found",
          data: {
            resume_found: !!resume,
            resume_source: candidateInfo.resumeSource || "unknown",
            resume_text_chars: resume?.length || 0,
          },
        });
        // #endregion
      }
    }
    
    // Check authentication before starting interview
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast({
        title: "Authentication Required",
        description: "Please log in to start an interview.",
        variant: "destructive",
      });
      startTransition(() => setCurrentView("roles"));
      return;
    }
    
    // Start voice interview session
    try {
      devLog.log("Starting voice interview with resume:", { role: selectedRole });
      
      // Voice interview - use WebSocket if we have candidate context and sessionId
      if (candidateInfo && candidateInfo.sessionId) {
        setVoiceSessionId(candidateInfo.sessionId);
        startTransition(() => setCurrentView("voice"));
        return;
      }
      
      // Start voice interview — session id must be UUID (save-interview validates format)
      const sessionId = generateClientSessionId();
      const response = await apiRequest("/api/voice-interview/start", "POST", {
        session_id: sessionId,
        role: selectedRole,
        resumeText: resume,
      });
      
      devLog.log("Voice interview started successfully:", response);
      
      if (!response.sessionId) {
        throw new Error("Invalid response from server. Missing session ID.");
      }
      
      // Store voice interview data so VoiceInterview component doesn't need to start again
      setVoiceInterviewData({
        sessionId: response.sessionId,
        audioResponse: response.audioResponse,
        agentResponseText: response.agentResponseText
      });
      setVoiceSessionId(response.sessionId);
      startTransition(() => setCurrentView("voice"));
    } catch (error: any) {
      console.error("Error starting interview:", error);
      const errorMessage = error.message || error.error || "Failed to start interview.";
      
      // Check if it's an authentication error
      if (errorMessage.includes('token') || errorMessage.includes('No token') || errorMessage.includes('401') || errorMessage.includes('403')) {
        toast({
          title: "Authentication Error",
          description: "Your session has expired. Please log in again.",
          variant: "destructive",
        });
        // Clear auth data and redirect
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        setUser(null);
        startTransition(() => setCurrentView("roles"));
      } else {
        toast({
          title: "Failed to Start Interview",
          description: errorMessage + " Please try again.",
          variant: "destructive",
        });
      }
    }
  }, [selectedRole, user, toast]);

  const handleCompleteInterview = useCallback((results?: any) => {
    // Navigate to results page with interviewId in state (preferred) or sessionId as fallback
    const sessionId = voiceSessionId || results?.sessionId;
    const conversationId = results?.conversationId;
    const interviewId = results?.interviewId ?? undefined; // Database ID from save-interview response
    
    devLog.log('[FLIGHT_RECORDER] [TRANSITION] handleCompleteInterview called:', {
      resultsProvided: !!results,
      resultsSessionId: results?.sessionId,
      resultsConversationId: results?.conversationId,
      resultsInterviewId: results?.interviewId,
      voiceSessionId,
      finalSessionId: sessionId,
      finalConversationId: conversationId,
      finalInterviewId: interviewId,
      timestamp: new Date().toISOString()
    });
    
    if (!sessionId && !interviewId) {
      console.error('No sessionId or interviewId available for results navigation');
      toast({
        title: "Error",
        description: "Unable to navigate to results - session ID or interview ID missing",
        variant: "destructive",
      });
      return;
    }
    
    // Build query params
    // Prefer interviewId for direct lookup, fallback to sessionId for polling
    const params = new URLSearchParams();
    if (interviewId) {
      params.set('interviewId', interviewId); // Direct lookup - preferred
      devLog.log('[FLIGHT_RECORDER] [TRANSITION] Using interviewId for direct lookup:', interviewId);
    }
    if (sessionId) {
      params.set('sessionId', sessionId); // Fallback for polling
    }
    if (conversationId) {
      params.set('conversationId', conversationId);
    }
    
    const resultsUrl = `/results?${params.toString()}`;
    devLog.log('[FLIGHT_RECORDER] [TRANSITION] Navigating to results URL:', {
      url: resultsUrl,
      interviewId: interviewId || 'not provided',
      sessionId,
      conversationId: conversationId || 'not provided',
      paramsString: params.toString(),
      timestamp: new Date().toISOString()
    });
    
    // CRITICAL FIX: Ensure query parameters are preserved during navigation
    // Use both wouter's setLocation AND window.history to ensure URL is correct
    // This handles cases where wouter might strip query parameters
    setLocation(resultsUrl);
    
    // Fallback: Also update browser URL directly to ensure query params persist
    // This is a safeguard in case wouter doesn't preserve query strings
    if (typeof window !== 'undefined') {
      const fullUrl = `${window.location.origin}${resultsUrl}`;
      window.history.replaceState({}, '', fullUrl);
      devLog.log('[FLIGHT_RECORDER] [TRANSITION] Updated window.location to:', {
        fullUrl,
        windowLocationHref: window.location.href,
        windowLocationSearch: window.location.search,
        timestamp: new Date().toISOString()
      });
    }
    
    toast({
      title: "Interview Complete!",
      description: "Loading your results...",
    });
  }, [voiceSessionId, toast]);

  const handleBackHome = useCallback(() => {
    resetInterviewState();
  }, [resetInterviewState]);

  const handlePracticeAgain = useCallback(() => {
    resetInterviewState();
  }, [resetInterviewState]);

  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/90 pt-[max(0.625rem,env(safe-area-inset-top))] shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <p className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">
            AI Interview Coach
          </p>
          <div className="flex max-w-[calc(100vw-8rem)] flex-wrap justify-end gap-1.5 sm:gap-2">
            {currentView === "resume" && (
              <Button
                onClick={handleBackToRoles}
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs sm:text-sm"
                aria-label="Go back to role selection"
              >
                <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            )}
            {currentView === "roles" && (
              <Button
                onClick={handleViewHistory}
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs sm:text-sm"
                data-testid="button-view-history"
                aria-label="View interview history"
              >
                <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">History</span>
              </Button>
            )}
            <Button
              onClick={handleSignOut}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs sm:text-sm"
              data-testid="button-signout"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="relative min-h-[100dvh]">
        <AnimatePresence mode="sync" initial={false}>
          {currentView === "roles" && (
            <motion.div
              key="roles"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={viewVariants}
              transition={viewTransition}
              className={authenticatedViewShell}
            >
              <RoleSelection onSelectRole={handleSelectRole} />
            </motion.div>
          )}
          
          {currentView === "resume" && (
            <motion.div
              key="resume"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={viewVariants}
              transition={viewTransition}
              className={authenticatedViewShell}
            >
              <ResumeUpload
                onResumeUploaded={handleResumeUploaded}
                onBack={handleBackToRoles}
              />
            </motion.div>
          )}
          
          {currentView === "voice" && candidateContext && candidateContext.sessionId && (
            <motion.div
              key="voice"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={viewVariants}
              transition={viewTransition}
              className="absolute inset-x-0 top-[3.25rem] min-h-[calc(100vh-3.25rem)] w-full sm:top-14 sm:min-h-[calc(100vh-3.5rem)]"
            >
              {/* VoiceInterviewWebSocket: Always mounted when we have candidateContext, but only visible when currentView === 'voice'.
                  This prevents unmounting during async operations like getUserMedia.
                  Wrapped in ErrorBoundary to catch any errors and show fallback UI. */}
              <VoiceInterviewErrorBoundary onReset={() => startTransition(() => setCurrentView("voice"))}>
                <VoiceInterviewWebSocket
                  sessionId={candidateContext.sessionId}
                  firstName={candidateContext.firstName}
                  major={candidateContext.major}
                  candidateContext={{
                    name: candidateContext.name || candidateContext.firstName,
                    major: candidateContext.major,
                    year: candidateContext.year,
                    skills: candidateContext.skills || [],
                    experience: candidateContext.experience,
                    education: candidateContext.education,
                    summary: candidateContext.summary,
                    resumeText: candidateContext.resumeText,
                    resumeSource: candidateContext.resumeSource,
                    resume_summary: candidateContext.resume_summary,
                    resume_highlights: candidateContext.resume_highlights,
                  }}
                  onComplete={handleCompleteInterview}
                  onInterviewEnd={(data) => {
                    devLog.log('Interview ended via tool call:', data);
                    // Transition to results screen using the same handler
                    // Use sessionId, conversationId, and interviewId from callback data, with fallbacks
                    handleCompleteInterview({
                      sessionId: data?.sessionId || candidateContext.sessionId || voiceSessionId,
                      conversationId: data?.conversationId || undefined,
                      interviewId: data?.interviewId || undefined,
                    });
                  }}
                  isActive={currentView === "voice"}
                />
              </VoiceInterviewErrorBoundary>
            </motion.div>
          )}
          
          {currentView === "history" && (
            <motion.div
              key="history"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={viewVariants}
              transition={viewTransition}
              className="absolute inset-x-0 top-[3.25rem] min-h-[calc(100vh-3.25rem)] w-full sm:top-14 sm:min-h-[calc(100vh-3.5rem)]"
            >
              <SessionHistory userId={user.id} onBack={handleBackToRoles} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
