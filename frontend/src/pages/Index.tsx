import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
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
  const [candidateContext, setCandidateContext] = useState<{firstName: string; name?: string; major: string; year: string; sessionId?: string; skills?: string[]; experience?: string; education?: string; summary?: string; resumeText?: string; resumeSource?: string} | null>(null);
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

  // Debug logging
  useEffect(() => {
    console.log('[FLIGHT_RECORDER] [SETUP] View changed:', {
      currentView,
      selectedRole,
      candidateContextExists: !!candidateContext,
      candidateContextSessionId: candidateContext?.sessionId || null,
      timestamp: new Date().toISOString()
    });
  }, [currentView, selectedRole, candidateContext]);

  // Track location changes to detect navigation from results page
  useEffect(() => {
    // If navigating from /results to /, clear interview state
    if (previousLocation.startsWith('/results') && location === '/') {
      console.log('Navigating from results page - clearing interview state');
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
          const parsed = JSON.parse(storedContext);
          setCandidateContext(parsed);
        }
      } catch (e) {
        console.warn('Failed to hydrate candidate_context', e);
      }
    }
  }, []);

  const handleAuthSuccess = (userData: any, token: string) => {
    setUser(userData);
  };

  const handleSignOut = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('candidate_context');
    setUser(null);
    setCurrentView("roles");
    setSelectedRole("");
  };

  const handleSelectRole = (role: string, mode: "text" | "voice" = "voice") => {
    // Ensure role is never empty - default to "General Interview"
    const normalizedRole = role?.trim() || "General Interview";
    console.log('handleSelectRole called with:', normalizedRole, mode);
    // Clear any previous interview state before starting new interview
    resetInterviewState();
    setSelectedRole(normalizedRole);
    setInterviewMode("voice"); // Always use voice mode
    // Show resume upload step before starting interview
    setCurrentView("resume");
    console.log('View changed to resume upload');
  };

  const handleResumeUploaded = async (resume: string, candidateInfo?: { firstName: string; major: string; year: string; sessionId?: string; resumeSource?: string }) => {
    setResumeText(resume);
    
    // Store candidate info for voice interview
    // Priority: candidateInfo.major (from ResumeUpload) > selectedRole (typed input) > "General Interview"
    // Use the major from candidateInfo (entered in ResumeUpload form) as primary source
    // Fall back to selectedRole (typed in Start Interview page) if candidateInfo.major is missing
    // Ensure we never have an empty role - default to "General Interview"
    const interviewRole = (candidateInfo?.major?.trim() || selectedRole?.trim() || "General Interview");
    
    if (candidateInfo) {
      const newCandidateContext = {
        firstName: candidateInfo.firstName,
        name: candidateInfo.firstName,
        major: interviewRole, // Use calculated role (ResumeUpload major takes priority, typed role as fallback)
        year: candidateInfo.year,
        sessionId: candidateInfo.sessionId,
        resumeText: resume,
        resumeSource: candidateInfo.resumeSource || "unknown"
      };
      console.log('[FLIGHT_RECORDER] [SETUP] candidateContext updated:', {
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
        const contextToStore = {
          firstName: candidateInfo.firstName,
          name: candidateInfo.firstName,
          major: interviewRole, // Use calculated role (ResumeUpload major takes priority, typed role as fallback)
          year: candidateInfo.year,
          sessionId: candidateInfo.sessionId,
          resumeText: resume,
          resumeSource: candidateInfo.resumeSource || "unknown"
        };
        localStorage.setItem('candidate_context', JSON.stringify(contextToStore));
        console.log('[FLIGHT_RECORDER] [SETUP] candidateContext persisted to localStorage:', {
          sessionId: contextToStore.sessionId,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.warn('[FLIGHT_RECORDER] [SETUP] Failed to persist candidate_context', e);
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
      setCurrentView("roles");
      return;
    }
    
    // Start voice interview session
    try {
      console.log("Starting voice interview with resume:", { role: selectedRole });
      
      // Voice interview - use WebSocket if we have candidate context and sessionId
      if (candidateInfo && candidateInfo.sessionId) {
        // Use WebSocket-based voice interview
        setVoiceSessionId(candidateInfo.sessionId);
        setCurrentView("voice");
        return;
      }
      
      // Start voice interview
      // Generate session ID (use user.id if available, otherwise generate unique ID)
      const sessionId = user?.id ? `${user.id}-${Date.now()}` : `session-${Date.now()}`;
      const response = await apiRequest("/api/voice-interview/start", "POST", {
        session_id: sessionId,
        role: selectedRole,
        resumeText: resume,
      });
      
      console.log("Voice interview started successfully:", response);
      
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
      setCurrentView("voice");
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
        setCurrentView("roles");
      } else {
        toast({
          title: "Failed to Start Interview",
          description: errorMessage + " Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleSkipResume = async () => {
    // Check authentication before starting interview
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast({
        title: "Authentication Required",
        description: "Please log in to start an interview.",
        variant: "destructive",
      });
      setCurrentView("roles");
      return;
    }
    
    // Start voice interview session without resume
    try {
      console.log("Starting voice interview without resume:", { role: selectedRole });
      
      // For voice interviews without resume, we still need candidate info
      toast({
        title: "Information Required",
        description: "Please provide your name, major, and year for voice interviews.",
        variant: "destructive",
      });
      return;
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
        setCurrentView("roles");
      } else {
        toast({
          title: "Failed to Start Interview",
          description: errorMessage + " Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleCompleteInterview = (results?: any) => {
    // Navigate to results page with sessionId and conversationId as query params
    const sessionId = voiceSessionId || results?.sessionId;
    const conversationId = results?.conversationId;
    console.log('[FLIGHT_RECORDER] [TRANSITION] handleCompleteInterview called:', {
      resultsProvided: !!results,
      resultsSessionId: results?.sessionId,
      resultsConversationId: results?.conversationId,
      voiceSessionId,
      finalSessionId: sessionId,
      finalConversationId: conversationId,
      timestamp: new Date().toISOString()
    });
    
    if (!sessionId) {
      console.error('No sessionId available for results navigation');
      toast({
        title: "Error",
        description: "Unable to navigate to results - session ID missing",
        variant: "destructive",
      });
      return;
    }
    
    // Build query params
    const params = new URLSearchParams();
    params.set('sessionId', sessionId);
    if (conversationId) {
      params.set('conversationId', conversationId);
    }
    
    const resultsUrl = `/results?${params.toString()}`;
    console.log('[FLIGHT_RECORDER] [TRANSITION] Navigating to results URL:', {
      url: resultsUrl,
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
      console.log('[FLIGHT_RECORDER] [TRANSITION] Updated window.location to:', {
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
  };

  const handleBackHome = () => {
    resetInterviewState();
  };

  const handlePracticeAgain = () => {
    resetInterviewState();
  };

  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <>
      {(
        <div className="fixed top-4 right-4 flex gap-2 z-50">
          {currentView === "resume" && (
            <Button
              onClick={() => {
                setCurrentView("roles");
                setSelectedRole("");
                setResumeText("");
              }}
              variant="outline"
              className="gap-2 bg-card shadow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          )}
          {currentView === "roles" && (
            <Button
              onClick={() => setCurrentView("history")}
              variant="outline"
              className="gap-2 bg-card shadow-md"
              data-testid="button-view-history"
            >
              <History className="w-4 h-4" />
              History
            </Button>
          )}
          <Button
            onClick={handleSignOut}
            variant="outline"
            className="gap-2 bg-card shadow-md"
            data-testid="button-signout"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      )}

      {currentView === "roles" && <RoleSelection onSelectRole={handleSelectRole} />}
      
      {currentView === "resume" && (
        <ResumeUpload
          onResumeUploaded={handleResumeUploaded}
          onSkip={handleSkipResume}
          onBack={() => {
            setCurrentView("roles");
            setSelectedRole("");
            setResumeText("");
          }}
        />
      )}
      
      {/* VoiceInterviewWebSocket: Always mounted when we have candidateContext, but only visible when currentView === 'voice'.
          This prevents unmounting during async operations like getUserMedia.
          Wrapped in ErrorBoundary to catch any errors and show fallback UI. */}
      {candidateContext && candidateContext.sessionId && (
        <VoiceInterviewErrorBoundary onReset={() => setCurrentView("voice")}>
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
            }}
            onComplete={handleCompleteInterview}
            onInterviewEnd={(data) => {
              console.log('Interview ended via tool call:', data);
              // Transition to results screen using the same handler
              // Use sessionId and conversationId from callback data, with fallbacks
              handleCompleteInterview({
                sessionId: data?.sessionId || candidateContext.sessionId || voiceSessionId,
                conversationId: data?.conversationId || undefined,
              });
            }}
            isActive={currentView === "voice"}
          />
        </VoiceInterviewErrorBoundary>
      )}
      
      {currentView === "history" && (
        <SessionHistory userId={user.id} onBack={() => setCurrentView("roles")} />
      )}

    </>
  );
}
