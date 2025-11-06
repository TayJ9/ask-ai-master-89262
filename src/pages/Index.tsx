import { useState, useEffect } from "react";
import Auth from "@/components/Auth";
import RoleSelection from "@/components/RoleSelection";
import InterviewSession from "@/components/InterviewSession";
import DialogflowInterviewSession from "@/components/DialogflowInterviewSession";
import VoiceInterview from "@/components/VoiceInterview";
import ResumeUpload from "@/components/ResumeUpload";
import SessionHistory from "@/components/SessionHistory";
import { Button } from "@/components/ui/button";
import { LogOut, History } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Index() {
  const [user, setUser] = useState<any>(null);
  const [currentView, setCurrentView] = useState<"roles" | "resume" | "interview" | "dialogflow" | "voice" | "history">("roles");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("medium");
  const [resumeText, setResumeText] = useState<string>("");
  const [dialogflowSessionId, setDialogflowSessionId] = useState<string | null>(null);
  const [firstQuestion, setFirstQuestion] = useState<string>("");
  const [interviewMode, setInterviewMode] = useState<"text" | "voice">("text");
  const [voiceInterviewData, setVoiceInterviewData] = useState<{sessionId: string, audioResponse?: string, agentResponseText?: string} | null>(null);
  const { toast } = useToast();
  
  // Debug logging
  useEffect(() => {
    console.log('Current view:', currentView, 'Selected role:', selectedRole, 'Difficulty:', selectedDifficulty);
  }, [currentView, selectedRole, selectedDifficulty]);

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

  const handleSelectRole = (role: string, difficulty: string, mode: "text" | "voice" = "text") => {
    console.log('handleSelectRole called with:', role, difficulty, mode);
    setSelectedRole(role);
    setSelectedDifficulty(difficulty);
    setInterviewMode(mode);
    // Show resume upload step before starting interview
    setCurrentView("resume");
    console.log('View changed to resume upload');
  };

  const handleResumeUploaded = async (resume: string) => {
    setResumeText(resume);
    
    // Start Dialogflow interview session (text or voice)
    try {
      console.log("Starting interview with resume:", { role: selectedRole, difficulty: selectedDifficulty, mode: interviewMode });
      
      if (interviewMode === "voice") {
        // Voice interview - use voice endpoint
        // Generate session ID (use user.id if available, otherwise generate unique ID)
        const sessionId = user?.id ? `${user.id}-${Date.now()}` : `session-${Date.now()}`;
        const response = await apiRequest("/api/voice-interview/start", "POST", {
          session_id: sessionId,
          role: selectedRole,
          resumeText: resume,
          difficulty: selectedDifficulty,
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
        setDialogflowSessionId(response.sessionId);
        setCurrentView("voice");
      } else {
        // Text interview - use existing endpoint
        const response = await apiRequest("/api/dialogflow/start-interview", "POST", {
          role: selectedRole,
          resumeText: resume,
          difficulty: selectedDifficulty,
        });
        
        console.log("Interview started successfully:", response);
        
        if (!response.sessionId || !response.firstQuestion) {
          throw new Error("Invalid response from server. Missing session ID or first question.");
        }
        
        setDialogflowSessionId(response.sessionId);
        setFirstQuestion(response.firstQuestion);
        setCurrentView("dialogflow");
      }
    } catch (error: any) {
      console.error("Error starting interview:", error);
      toast({
        title: "Failed to Start Interview",
        description: error.message || error.error || "Failed to start interview. Please check your Dialogflow configuration and try again.",
        variant: "destructive",
      });
    }
  };

  const handleSkipResume = async () => {
    // Start Dialogflow interview session without resume
    try {
      console.log("Starting interview without resume:", { role: selectedRole, difficulty: selectedDifficulty, mode: interviewMode });
      
      if (interviewMode === "voice") {
        // Voice interview - use voice endpoint
        // Generate session ID (use user.id if available, otherwise generate unique ID)
        const sessionId = user?.id ? `${user.id}-${Date.now()}` : `session-${Date.now()}`;
        const response = await apiRequest("/api/voice-interview/start", "POST", {
          session_id: sessionId,
          role: selectedRole,
          resumeText: "",
          difficulty: selectedDifficulty,
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
        setDialogflowSessionId(response.sessionId);
        setCurrentView("voice");
      } else {
        // Text interview - use existing endpoint
        const response = await apiRequest("/api/dialogflow/start-interview", "POST", {
          role: selectedRole,
          difficulty: selectedDifficulty,
          // Explicitly pass empty string for resumeText to avoid undefined
          resumeText: "",
        });
        
        console.log("Interview started successfully:", response);
        
        if (!response.sessionId || !response.firstQuestion) {
          throw new Error("Invalid response from server. Missing session ID or first question.");
        }
        
        setDialogflowSessionId(response.sessionId);
        setFirstQuestion(response.firstQuestion);
        setCurrentView("dialogflow");
      }
    } catch (error: any) {
      console.error("Error starting interview:", error);
      toast({
        title: "Failed to Start Interview",
        description: error.message || error.error || "Failed to start interview. Please check your Dialogflow configuration and try again.",
        variant: "destructive",
      });
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
    setDialogflowSessionId(null);
    setFirstQuestion("");
    setVoiceInterviewData(null);
  };

  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <>
      {currentView !== "interview" && currentView !== "dialogflow" && currentView !== "resume" && (
        <div className="fixed top-4 right-4 flex gap-2 z-50">
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
        />
      )}
      
      {currentView === "interview" && (
        <InterviewSession
          role={selectedRole}
          difficulty={selectedDifficulty}
          userId={user.id}
          onComplete={handleCompleteInterview}
        />
      )}

      {currentView === "dialogflow" && dialogflowSessionId && (
        <DialogflowInterviewSession
          sessionId={dialogflowSessionId}
          userId={user.id}
          role={selectedRole}
          difficulty={selectedDifficulty}
          resumeText={resumeText}
          firstQuestion={firstQuestion}
          onComplete={handleCompleteInterview}
        />
      )}

      {currentView === "voice" && dialogflowSessionId && (
        <VoiceInterview
          sessionId={dialogflowSessionId}
          userId={user.id}
          role={selectedRole}
          difficulty={selectedDifficulty}
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
