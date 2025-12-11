/**
 * Voice Interview Component using ElevenLabs Conversational AI SDK
 * Clean, production-grade implementation with server-side VAD and optimal latency
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, Volume2, Loader2, X, User, Headphones } from "lucide-react";
import AISpeakingIndicator from "@/components/ui/AISpeakingIndicator";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import AudioVisualizer from "@/components/ui/AudioVisualizer";

interface VoiceInterviewWebSocketProps {
  sessionId: string;
  candidateContext: {
    name: string;
    major: string;
    year: string;
    skills?: string[];
    experience?: string;
    education?: string;
    summary?: string;
  };
  onComplete: (results?: any) => void;
}

interface TranscriptMessage {
  type: 'ai' | 'student';
  text: string;
  isFinal: boolean;
  timestamp: number;
}

type ConversationMode = 'ai_speaking' | 'listening' | 'user_speaking' | 'processing';

export default function VoiceInterviewWebSocket({
  sessionId,
  candidateContext,
  onComplete,
}: VoiceInterviewWebSocketProps) {
  const [statusMessage, setStatusMessage] = useState("Initializing...");
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [inputVolume, setInputVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  
  const volumeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Save interview to backend
  const saveInterview = useCallback(async (convId: string | null) => {
    if (!convId) {
      console.warn('No conversation ID available for saving');
      return;
    }
    
    try {
      console.log(`Saving interview: conversation_id=${convId}, candidate_id=${sessionId}`);
      const response = await fetch(
        `/api/save-interview?conversation_id=${convId}&candidate_id=${sessionId}`,
        {
          method: 'POST',
          headers: {
            'x-api-secret': 'my_secret_interview_key_123',
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to save interview: ${response.statusText}`);
      }
      
      console.log('Interview saved successfully');
    } catch (error) {
      console.error('Error saving interview:', error);
      toast({
        title: "Warning",
        description: "Interview may not have been saved. Please contact support if needed.",
        variant: "destructive",
      });
    }
  }, [sessionId, toast]);

  // Initialize ElevenLabs conversation hook
  const conversation = useConversation({
    onConnect: () => {
      console.log('ElevenLabs SDK connected');
      setStatusMessage("Connected - Interview starting...");
      setHasStarted(true);
    },
    onDisconnect: () => {
      console.log('ElevenLabs SDK disconnected');
      setStatusMessage("Interview ended");
      
      // Save interview on disconnect
      saveInterview(conversationId);
      
      // Stop volume polling
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
      
      onComplete();
    },
    onMessage: (message) => {
      console.log('SDK Message:', message);
      
      // SDK message has { message: string, source: 'user' | 'ai' }
      const text = message.message || '';
      const isAI = message.source === 'ai';
      
      if (text) {
        setTranscripts(prev => {
          // Check if we should update the last message or add a new one
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.type === (isAI ? 'ai' : 'student') && !lastMessage.isFinal) {
            // Update the last message
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, text, isFinal: true }
            ];
          }
          // Add new message
          return [
            ...prev,
            {
              type: isAI ? 'ai' : 'student',
              text,
              isFinal: true,
              timestamp: Date.now(),
            }
          ];
        });
      }
    },
    onError: (error) => {
      console.error('ElevenLabs SDK error:', error);
      const errorMessage = typeof error === 'string' ? error : (error as Error)?.message || 'Connection failed';
      setStatusMessage(`Error: ${errorMessage}`);
      toast({
        title: "Interview Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Derive conversation mode from SDK state
  const getConversationMode = (): ConversationMode => {
    if (conversation.status !== 'connected') {
      return 'processing';
    }
    if (conversation.isSpeaking) {
      return 'ai_speaking';
    }
    // Use input volume to detect user speaking
    if (inputVolume > 0.1) {
      return 'user_speaking';
    }
    return 'listening';
  };

  const conversationMode = getConversationMode();

  // Update status message based on mode
  useEffect(() => {
    if (!hasStarted) return;
    
    switch (conversationMode) {
      case 'ai_speaking':
        setStatusMessage("AI is speaking...");
        break;
      case 'user_speaking':
        setStatusMessage("You are speaking...");
        break;
      case 'listening':
        setStatusMessage("Listening... Speak when ready");
        break;
      case 'processing':
        if (conversation.status === 'connecting') {
          setStatusMessage("Connecting...");
        }
        break;
    }
  }, [conversationMode, hasStarted, conversation.status]);

  // Poll volume levels for visualization
  useEffect(() => {
    if (conversation.status === 'connected' && !volumeIntervalRef.current) {
      volumeIntervalRef.current = setInterval(() => {
        const input = conversation.getInputVolume();
        const output = conversation.getOutputVolume();
        setInputVolume(input);
        setOutputVolume(output);
        
        // Debug log occasionally
        if (Math.random() < 0.05) {
          console.log(`Volume - Input: ${(input * 100).toFixed(0)}%, Output: ${(output * 100).toFixed(0)}%`);
        }
      }, 50); // 20fps for smooth visualization
    }
    
    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
    };
  }, [conversation.status, conversation]);

  // Start interview with signed token
  const startInterview = useCallback(async () => {
    if (isStarting || hasStarted) return;
    
    setIsStarting(true);
    setStatusMessage("Requesting microphone access...");
    
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setStatusMessage("Connecting to interview service...");
      
      // Fetch signed token from backend
      const tokenResponse = await fetch('/api/conversation-token', {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!tokenResponse.ok) {
        throw new Error(`Failed to get conversation token: ${tokenResponse.statusText}`);
      }
      
      const tokenData = await tokenResponse.json();
      console.log('Received conversation token:', { 
        hasToken: !!tokenData.token,
        agentId: tokenData.agentId,
        expiresIn: tokenData.expiresIn 
      });
      
      if (!tokenData.token) {
        throw new Error('No token received from server');
      }
      
      // Store conversation ID if provided
      if (tokenData.conversationId) {
        setConversationId(tokenData.conversationId);
      }
      
      // Start the conversation session with signed URL
      const sessionId = await conversation.startSession({
        signedUrl: tokenData.token,
      });
      
      // The startSession returns a session ID string
      if (sessionId) {
        setConversationId(sessionId);
        console.log('Session started with ID:', sessionId);
      }
      
    } catch (error: any) {
      console.error('Failed to start interview:', error);
      setStatusMessage(`Failed to start: ${error.message}`);
      setIsStarting(false);
      
      if (error.name === 'NotAllowedError') {
        toast({
          title: "Microphone Permission Denied",
          description: "Please allow microphone access to start the interview.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: error.message || "Could not connect to interview service.",
          variant: "destructive",
        });
      }
    }
  }, [isStarting, hasStarted, conversation, toast]);

  // End interview
  const handleEndInterview = useCallback(async () => {
    if (confirm("Are you sure you want to end the interview?")) {
      setStatusMessage("Ending interview...");
      
      try {
        await conversation.endSession();
      } catch (error) {
        console.error('Error ending session:', error);
        // Still call onComplete even if endSession fails
        saveInterview(conversationId);
        onComplete();
      }
    }
  }, [conversation, conversationId, saveInterview, onComplete]);

  // Auto-start interview on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      startInterview();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [startInterview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
      }
      if (conversation.status === 'connected') {
        conversation.endSession().catch(console.error);
      }
    };
  }, [conversation]);

  const isConnected = conversation.status === 'connected';
  const isAiSpeaking = conversation.isSpeaking;

  return (
    <AnimatedBackground className="p-6 flex items-center justify-center">
      <div className="max-w-4xl w-full space-y-6">
        {/* Main Interview Card */}
        <Card className="shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Voice Interview</h2>
                <p className="text-muted-foreground">
                  {candidateContext.major} • {candidateContext.year}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {/* Connection Status Indicator */}
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                  isConnected 
                    ? 'bg-green-100 text-green-700' 
                    : conversation.status === 'connecting'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    isConnected 
                      ? 'bg-green-500 animate-pulse' 
                      : conversation.status === 'connecting'
                      ? 'bg-yellow-500 animate-pulse'
                      : 'bg-gray-400'
                  }`} />
                  {isConnected ? 'Connected' : conversation.status === 'connecting' ? 'Connecting' : 'Disconnected'}
                </div>
                
                <Button
                  onClick={handleEndInterview}
                  variant="outline"
                  disabled={!isConnected && !isStarting}
                >
                  <X className="w-4 h-4 mr-2" />
                  End Interview
                </Button>
              </div>
            </div>

            {/* Status Indicator - Clear visual feedback for each state */}
            <div className="text-center mb-6">
              {!isConnected && !isStarting ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <div className="w-3 h-3 bg-muted-foreground rounded-full" />
                  <span className="font-medium">{statusMessage}</span>
                </div>
              ) : !isConnected ? (
                <div className="flex items-center justify-center gap-2 text-yellow-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">{statusMessage}</span>
                </div>
              ) : isAiSpeaking ? (
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <AISpeakingIndicator size="md" />
                  <span className="font-medium text-lg">AI is speaking...</span>
                </div>
              ) : conversationMode === 'user_speaking' ? (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <User className="w-5 h-5 animate-pulse" />
                  <span className="font-medium text-lg">You are speaking...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-amber-600">
                  <Headphones className="w-5 h-5" />
                  <span className="font-medium text-lg">Listening... Speak when ready</span>
                </div>
              )}
            </div>

            {/* Audio Visualizer */}
            <div className="mb-6 flex justify-center">
              <AudioVisualizer
                inputVolume={inputVolume}
                outputVolume={outputVolume}
                mode={conversationMode}
                width={600}
                height={120}
                barCount={60}
              />
            </div>

            {/* Microphone Status Indicator */}
            <div className="flex flex-col items-center justify-center mb-6">
              <div
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all shadow-2xl cursor-default ${
                  isAiSpeaking
                    ? "bg-blue-500 text-white animate-pulse shadow-blue-500/50"
                    : conversationMode === 'user_speaking'
                    ? "bg-green-500 text-white animate-pulse shadow-green-500/50"
                    : conversationMode === 'processing' || !isConnected
                    ? "bg-muted text-muted-foreground opacity-50"
                    : "bg-amber-500 text-white shadow-amber-500/50"
                }`}
              >
                {isAiSpeaking ? (
                  <Volume2 className="w-16 h-16" />
                ) : conversationMode === 'user_speaking' ? (
                  <Mic className="w-16 h-16 animate-pulse" />
                ) : !isConnected ? (
                  <Loader2 className="w-16 h-16 animate-spin" />
                ) : (
                  <Headphones className="w-16 h-16" />
                )}
              </div>
              <p className={`text-xs mt-2 text-center max-w-xs font-medium ${
                isAiSpeaking
                  ? "text-blue-600"
                  : conversationMode === 'user_speaking'
                  ? "text-green-600"
                  : !isConnected
                  ? "text-muted-foreground"
                  : "text-amber-600"
              }`}>
                {isAiSpeaking
                  ? "AI is speaking"
                  : conversationMode === 'user_speaking'
                  ? "You are speaking"
                  : !isConnected
                  ? "Connecting..."
                  : "Listening - speak naturally"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Transcript Card */}
        <Card className="shadow-xl">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Live Transcript</h3>
            <div className="max-h-96 overflow-y-auto space-y-3">
              {transcripts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Transcript will appear here as the conversation progresses...
                </p>
              ) : (
                transcripts.map((transcript, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg ${
                      transcript.type === 'ai'
                        ? 'bg-blue-50 border-l-4 border-blue-500'
                        : 'bg-green-50 border-l-4 border-green-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {transcript.type === 'ai' ? 'AI Interviewer' : 'You'}
                      </span>
                      {!transcript.isFinal && (
                        <span className="text-xs text-muted-foreground">Typing...</span>
                      )}
                    </div>
                    <p className="text-sm">{transcript.text}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AnimatedBackground>
  );
}
