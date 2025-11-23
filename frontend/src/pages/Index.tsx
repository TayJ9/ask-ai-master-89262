import { useState, useEffect } from "react";
import Auth from "@/components/Auth";
import RoleSelection from "@/components/RoleSelection";
import InterviewSession from "@/components/InterviewSession";
import VoiceInterview from "@/components/VoiceInterview";
import VoiceInterviewWebSocket from "@/components/VoiceInterviewWebSocket";
import ResumeUpload from "@/components/ResumeUpload";
import SessionHistory from "@/components/SessionHistory";
import { Button } from "@/components/ui/button";
import { LogOut, History, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Index() {
  const [user, setUser] = useState<any>(null);
  const [currentView, setCurrentView] = useState<"roles" | "resume" | "interview" | "voice" | "history">("roles");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [resumeText, setResumeText] = useState<string>("");
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [firstQuestion, setFirstQuestion] = useState<string>("");
  const [interviewMode, setInterviewMode] = useState<"text" | "voice">("text");
  const [voiceInterviewData, setVoiceInterviewData] = useState<{sessionId: string, audioResponse?: string, agentResponseText?: string} | null>(null);
  const [candidateContext, setCandidateContext] = useState<{name: string; major: string; year: string; sessionId?: string; skills?: string[]; experience?: string; education?: string; summary?: string} | null>(null);
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
  }, []);

  const handleAuthSuccess = (userData: any, token: string) => {
    setUser(userData);
  };

  const handleSignOut = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    setUser(null);
    setCurrentView("roles");
    setSelectedRole("");
  };

  const handleSelectRole = (role: string, mode: "text" | "voice" = "text") => {
    console.log('handleSelectRole called with:', role, mode);
    setSelectedRole(role);
    setInterviewMode(mode);
    // Show resume upload step before starting interview
    setCurrentView("resume");
    console.log('View changed to resume upload');
  };

  const handleResumeUploaded = async (resume: string, candidateInfo?: { name: string; major: string; year: string; sessionId?: string }) => {
    setResumeText(resume);
    
    // Store candidate info for voice interview
    if (candidateInfo) {
      setCandidateContext({
        name: candidateInfo.name,
        major: candidateInfo.major,
        year: candidateInfo.year,
        sessionId: candidateInfo.sessionId
      });
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
    
    // Start interview session (text or voice)
    try {
      console.log("Starting interview with resume:", { role: selectedRole, mode: interviewMode });
      
      if (interviewMode === "voice") {
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
      } else {
        // Text interview - use InterviewSession component
        setCurrentView("interview");
      }
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
    
    // Start interview session without resume
    try {
      console.log("Starting interview without resume:", { role: selectedRole, mode: interviewMode });
      
      if (interviewMode === "voice") {
        // For voice interviews without resume, we still need candidate info
        toast({
          title: "Information Required",
          description: "Please provide your name, major, and year for voice interviews.",
          variant: "destructive",
        });
        return;
      } else {
        // Text interview - use InterviewSession component
        setCurrentView("interview");
      }
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
    if (results) {
      toast({
        title: "Interview Complete!",
        description: `Your overall score: ${results.overallScore}/100`,
      });
    }
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

      {currentView === "voice" && voiceSessionId && (
        <>
          {/* Use WebSocket-based voice interview if we have candidate context */}
          {candidateContext && candidateContext.sessionId ? (
            <VoiceInterviewWebSocket
              sessionId={candidateContext.sessionId}
              candidateContext={{
                name: candidateContext.name,
                major: candidateContext.major,
                year: candidateContext.year,
                skills: candidateContext.skills || [],
                experience: candidateContext.experience,
                education: candidateContext.education,
                summary: candidateContext.summary
              }}
              onComplete={handleCompleteInterview}
            />
          ) : (
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
        </>
      )}
      
      {currentView === "history" && (
        <SessionHistory userId={user.id} onBack={() => setCurrentView("roles")} />
      )}
    </>
  );
}
