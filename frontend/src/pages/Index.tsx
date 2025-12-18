import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Auth from "@/components/Auth";
import RoleSelection from "@/components/RoleSelection";
import InterviewSession from "@/components/InterviewSession";
import VoiceInterview from "@/components/VoiceInterview";
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
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [currentView, setCurrentView] = useState<"roles" | "resume" | "interview" | "voice" | "history">("roles");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [resumeText, setResumeText] = useState<string>("");
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [firstQuestion, setFirstQuestion] = useState<string>("");
  const [interviewMode, setInterviewMode] = useState<"text" | "voice">("voice");
  const [voiceInterviewData, setVoiceInterviewData] = useState<{sessionId: string, audioResponse?: string, agentResponseText?: string} | null>(null);
  const [candidateContext, setCandidateContext] = useState<{firstName: string; name?: string; major: string; year: string; sessionId?: string; skills?: string[]; experience?: string; education?: string; summary?: string; resumeText?: string; resumeSource?: string} | null>(null);
  const { toast } = useToast();
  
  // Debug logging
  useEffect(() => {
    console.log('Current view:', currentView, 'Selected role:', selectedRole);
  }, [currentView, selectedRole]);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
    }
    // Hydrate candidate context from localStorage as a safety net
    try {
      const storedContext = localStorage.getItem('candidate_context');
      if (storedContext && !candidateContext) {
        const parsed = JSON.parse(storedContext);
        setCandidateContext(parsed);
      }
    } catch (e) {
      console.warn('Failed to hydrate candidate_context', e);
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
    console.log('handleSelectRole called with:', role, mode);
    setSelectedRole(role);
    setInterviewMode("voice"); // Always use voice mode
    // Show resume upload step before starting interview
    setCurrentView("resume");
    console.log('View changed to resume upload');
  };

  const handleResumeUploaded = async (resume: string, candidateInfo?: { firstName: string; major: string; year: string; sessionId?: string; resumeSource?: string }) => {
    setResumeText(resume);
    
    // Store candidate info for voice interview
    if (candidateInfo) {
      setCandidateContext({
        firstName: candidateInfo.firstName,
        name: candidateInfo.firstName,
        major: candidateInfo.major,
        year: candidateInfo.year,
        sessionId: candidateInfo.sessionId,
        resumeText: resume,
        resumeSource: candidateInfo.resumeSource || "unknown"
      });
      // Persist to localStorage to survive view changes/reloads
      try {
        localStorage.setItem('candidate_context', JSON.stringify({
          firstName: candidateInfo.firstName,
          name: candidateInfo.firstName,
          major: candidateInfo.major,
          year: candidateInfo.year,
          sessionId: candidateInfo.sessionId,
          resumeText: resume,
          resumeSource: candidateInfo.resumeSource || "unknown"
        }));
      } catch (e) {
        console.warn('Failed to persist candidate_context', e);
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
    
    // Navigate to results route
    setLocation(`/results?${params.toString()}`);
    
    toast({
      title: "Interview Complete!",
      description: "Loading your results...",
    });
  };

  const handleBackHome = () => {
    setCurrentView("roles");
    setSelectedRole("");
    setResumeText("");
    setVoiceSessionId(null);
    setFirstQuestion("");
    setVoiceInterviewData(null);
    setCandidateContext(null);
  };

  const handlePracticeAgain = () => {
    setCurrentView("roles");
    setSelectedRole("");
    setResumeText("");
    setVoiceSessionId(null);
    setFirstQuestion("");
    setVoiceInterviewData(null);
    setCandidateContext(null);
  };

  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <>
      {currentView !== "interview" && (
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
      
      {currentView === "interview" && (
        <InterviewSession
          role={selectedRole}
          difficulty="medium"
          userId={user.id}
          onComplete={handleCompleteInterview}
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
              handleCompleteInterview({
                sessionId: candidateContext.sessionId,
                conversationId: undefined, // Will be populated from the interview data
              });
            }}
            isActive={currentView === "voice"}
          />
        </VoiceInterviewErrorBoundary>
      )}
      
      {/* Fallback VoiceInterview for cases without candidateContext */}
      {currentView === "voice" && voiceSessionId && !candidateContext?.sessionId && (
        <VoiceInterview
          sessionId={voiceSessionId}
          userId={user.id}
          role={selectedRole}
          difficulty="medium"
          resumeText={resumeText}
          initialAudioResponse={voiceInterviewData?.audioResponse}
          initialAgentText={voiceInterviewData?.agentResponseText}
          onComplete={handleCompleteInterview}
        />
      )}
      
      {currentView === "history" && (
        <SessionHistory userId={user.id} onBack={() => setCurrentView("roles")} />
      )}

    </>
  );
}
