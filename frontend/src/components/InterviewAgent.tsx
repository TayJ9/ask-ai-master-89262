/**
 * InterviewAgent Component
 * ElevenLabs voice interview agent integration using @elevenlabs/react
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiGet } from "@/lib/api";
import { 
  Mic, 
  MicOff, 
  PhoneOff, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  Wifi,
  WifiOff,
  RefreshCw
} from "lucide-react";

interface InterviewAgentProps {
  candidateMajor?: string;
  userId: string;
}

type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error" | "disconnected";

interface TranscriptMessage {
  id: string;
  text: string;
  role: "user" | "agent";
  timestamp: Date;
}

export default function InterviewAgent({ candidateMajor, userId }: InterviewAgentProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [microphoneError, setMicrophoneError] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const tokenRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID || "agent_8601kavsezrheczradx9qmz8qp3e";

  // Initialize ElevenLabs conversation hook
  const conversation = useConversation({
    agentId,
    clientId: userId,
    connectionType: "webrtc",
    region: "us",
    preferHeadphonesForIosDevices: true,
    token: token || undefined, // Pass token when available
  });

  // Fetch token from backend
  const fetchToken = useCallback(async (): Promise<string | null> => {
    try {
      setTokenError(null);
      console.log("[InterviewAgent] Fetching conversation token...");
      
      const response = await apiGet("/api/conversation-token");
      
      if (!response.token) {
        throw new Error("No token received from server");
      }

      console.log("[InterviewAgent] Token fetched successfully");
      setToken(response.token);
      
      // Schedule token refresh before expiration (refresh at 80% of expiry time)
      const expiresIn = response.expiresIn || 900; // Default 15 minutes
      const refreshTime = expiresIn * 0.8 * 1000; // 80% of expiry time in ms
      
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
      }
      
      tokenRefreshTimerRef.current = setTimeout(() => {
        console.log("[InterviewAgent] Token refresh scheduled");
        if (isSessionActive) {
          fetchToken();
        }
      }, refreshTime);

      return response.token;
    } catch (error: any) {
      console.error("[InterviewAgent] Token fetch error:", error);
      const errorMessage = error.message || "Failed to get conversation token. Please try again.";
      setTokenError(errorMessage);
      throw error;
    }
  }, [isSessionActive]);

  // Handle conversation state changes
  useEffect(() => {
    // Monitor conversation status via available properties
    // Note: @elevenlabs/react hook provides status via isSpeaking and other properties
    // Connection status is managed via startSession/endSession calls
    if (conversation && isSessionActive) {
      // Update status based on session state
      if (conversation.isSpeaking !== undefined) {
        // Session is active if we can detect speaking state
        if (connectionStatus === "connecting") {
          setConnectionStatus("connected");
          setMicrophoneError(null);
          retryCountRef.current = 0;
        }
      }
    }
  }, [conversation, isSessionActive, connectionStatus]);

  // Request microphone permission
  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      setMicrophoneError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error: any) {
      console.error("[InterviewAgent] Microphone permission error:", error);
      
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setMicrophoneError(
          "Microphone permission denied. Please allow microphone access in your browser settings and try again."
        );
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        setMicrophoneError("No microphone detected. Please connect a microphone and try again.");
      } else {
        setMicrophoneError(`Microphone error: ${error.message || "Unknown error"}`);
      }
      return false;
    }
  }, []);

  // Start interview session
  const startSession = useCallback(async () => {
    try {
      setConnectionStatus("connecting");
      setTokenError(null);
      setMicrophoneError(null);
      setTranscripts([]);
      retryCountRef.current = 0;

      // Step 1: Request microphone permission
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        setConnectionStatus("error");
        return;
      }

      // Step 2: Fetch token
      const conversationToken = await fetchToken();
      if (!conversationToken) {
        setConnectionStatus("error");
        return;
      }

      // Step 3: Start conversation session
      console.log("[InterviewAgent] Starting conversation session...");
      
      if (!conversationToken) {
        throw new Error("No token available");
      }

      try {
        // Start session - token is passed via hook initialization, not startSession
        // The hook uses the token from initialization
        if (conversation && typeof conversation.startSession === "function") {
          await conversation.startSession();
        } else {
          throw new Error("Conversation hook not available");
        }
        
        setIsSessionActive(true);
        setConnectionStatus("connected");
        console.log("[InterviewAgent] Session started successfully");
      } catch (connectionError: any) {
        console.error("[InterviewAgent] Connection failed:", connectionError);
        setConnectionStatus("error");
        setTokenError("Failed to establish connection. Please check your network and try again.");
        setIsSessionActive(false);
      }
    } catch (error: any) {
      console.error("[InterviewAgent] Start session error:", error);
      setConnectionStatus("error");
      setTokenError(error.message || "Failed to start interview session");
      setIsSessionActive(false);
    }
  }, [conversation, agentId, userId, fetchToken, requestMicrophonePermission]);

  // End interview session
  const endSession = useCallback(async () => {
    try {
      console.log("[InterviewAgent] Ending session...");
      
      if (conversation && typeof conversation.endSession === "function") {
        await conversation.endSession();
      }
      
      setIsSessionActive(false);
      setConnectionStatus("disconnected");
      
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
      
      console.log("[InterviewAgent] Session ended");
    } catch (error: any) {
      console.error("[InterviewAgent] End session error:", error);
      // Force cleanup even if endSession fails
      setIsSessionActive(false);
      setConnectionStatus("disconnected");
    }
  }, [conversation]);

  // Retry connection
  const retryConnection = useCallback(() => {
    if (retryCountRef.current >= maxRetries) {
      setTokenError("Maximum retry attempts reached. Please refresh the page.");
      return;
    }

    retryCountRef.current += 1;
    console.log(`[InterviewAgent] Retry attempt ${retryCountRef.current}/${maxRetries}`);
    
    if (connectionStatus === "error" && !token) {
      // Retry token fetch
      fetchToken().catch(() => {
        setTokenError("Failed to get token. Please try again.");
      });
    } else if (connectionStatus === "error" || connectionStatus === "disconnected") {
      // Retry session start
      startSession();
    }
  }, [connectionStatus, token, fetchToken, startSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
      }
      if (isSessionActive) {
        endSession();
      }
    };
  }, [isSessionActive, endSession]);

  // Get status badge color
  const getStatusBadgeVariant = (status: ConnectionStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "connected":
        return "default";
      case "connecting":
      case "reconnecting":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  // Get status icon
  const getStatusIcon = (status: ConnectionStatus) => {
    switch (status) {
      case "connecting":
      case "reconnecting":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "connected":
        return <CheckCircle2 className="h-4 w-4" />;
      case "error":
        return <AlertCircle className="h-4 w-4" />;
      case "disconnected":
        return <WifiOff className="h-4 w-4" />;
      default:
        return <Wifi className="h-4 w-4" />;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Voice Interview</span>
            <Badge variant={getStatusBadgeVariant(connectionStatus)} className="flex items-center gap-2">
              {getStatusIcon(connectionStatus)}
              <span className="capitalize">{connectionStatus}</span>
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error Messages */}
          {tokenError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{tokenError}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={retryConnection}
                  disabled={retryCountRef.current >= maxRetries}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {microphoneError && (
            <Alert variant="destructive">
              <MicOff className="h-4 w-4" />
              <AlertDescription>{microphoneError}</AlertDescription>
            </Alert>
          )}

          {/* Control Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={startSession}
              disabled={isSessionActive || connectionStatus === "connecting"}
              className="flex-1"
            >
              {connectionStatus === "connecting" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Start Interview
                </>
              )}
            </Button>
            <Button
              onClick={endSession}
              disabled={!isSessionActive}
              variant="destructive"
              className="flex-1"
            >
              <PhoneOff className="h-4 w-4 mr-2" />
              End Interview
            </Button>
          </div>

          {/* Transcript Display */}
          {transcripts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Conversation Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {transcripts.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg ${
                        msg.role === "user"
                          ? "bg-blue-50 dark:bg-blue-950 ml-8"
                          : "bg-gray-50 dark:bg-gray-900 mr-8"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {msg.role === "user" ? "You" : "Interviewer"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {msg.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm">{msg.text}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {transcripts.length === 0 && isSessionActive && (
            <div className="text-center py-8 text-muted-foreground">
              <Mic className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Waiting for conversation to begin...</p>
              <p className="text-sm mt-2">Speak clearly into your microphone</p>
            </div>
          )}

          {/* Idle State */}
          {!isSessionActive && transcripts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Mic className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Ready to start your interview</p>
              <p className="text-sm mt-2">Click "Start Interview" to begin</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

