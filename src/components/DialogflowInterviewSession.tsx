import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Volume2, Loader2, Send, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  id: string;
  type: "agent" | "user";
  text: string;
  timestamp: Date;
}

interface DialogflowInterviewSessionProps {
  sessionId: string;
  userId: string;
  role: string;
  difficulty: string;
  resumeText?: string;
  firstQuestion?: string;
  onComplete: (results: any) => void;
}

export default function DialogflowInterviewSession({
  sessionId,
  userId,
  role,
  difficulty,
  resumeText,
  firstQuestion,
  onComplete,
}: DialogflowInterviewSessionProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserInput, setCurrentUserInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInterviewComplete, setIsInterviewComplete] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoVoiceMode, setAutoVoiceMode] = useState(true); // Auto-start recording after AI speaks
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  const sendMessageMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      return apiRequest("/api/dialogflow/send-message", "POST", {
        sessionId,
        userMessage,
      });
    },
    onSuccess: (data) => {
      // Add user message
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        type: "user",
        text: currentUserInput || "User response",
        timestamp: new Date(),
      };

      // Add agent response
      const agentMessage: Message = {
        id: `agent-${Date.now()}`,
        type: "agent",
        text: data.agentResponse,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage, agentMessage]);
      setCurrentUserInput("");

      // Check if interview is complete
      if (data.isInterviewComplete) {
        setIsInterviewComplete(true);
        toast({
          title: "Conversation Complete! 🎉",
          description: "You can now end the conversation to see your results and feedback.",
        });
      }

      // Play agent response as audio automatically for natural conversation
      // Small delay to let the message appear first
      setTimeout(() => {
        playTextAsSpeech(data.agentResponse);
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsProcessing(false);
    },
  });

  const completeInterviewMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/dialogflow/complete-interview", "POST", {
        sessionId,
      });
    },
    onSuccess: (data) => {
      onComplete(data);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete interview.",
        variant: "destructive",
      });
    },
  });

  const playTextAsSpeech = useCallback(async (text: string) => {
    try {
      setIsSpeaking(true);
      
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      
      const data = await apiRequest("/api/ai/text-to-speech", "POST", { text });
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      currentAudioRef.current = audio;
      
      // Add visual feedback while playing
      audio.onplay = () => {
        setIsSpeaking(true);
        console.log("AI is speaking...");
      };
      
      audio.onended = () => {
        setIsSpeaking(false);
        currentAudioRef.current = null;
        console.log("AI finished speaking");
        
        // Auto-start recording after AI finishes speaking (if auto voice mode is on)
        if (autoVoiceMode && !isInterviewComplete && !isProcessing) {
          setTimeout(() => {
            startRecording();
          }, 500); // Small delay to let the user prepare
        }
      };
      
      audio.onerror = () => {
        setIsSpeaking(false);
        currentAudioRef.current = null;
        console.error("Audio playback error");
      };
      
      await audio.play().catch((err) => {
        // Handle autoplay restrictions gracefully
        setIsSpeaking(false);
        console.log("Audio autoplay prevented, user can click to play if needed");
        toast({
          title: "Audio Playback",
          description: "Click the speaker icon to hear the response",
        });
      });
    } catch (error) {
      setIsSpeaking(false);
      console.error("Failed to play audio:", error);
      toast({
        title: "Audio Error",
        description: "Could not play audio response. You can still read the text.",
        variant: "destructive",
      });
    }
  }, [autoVoiceMode, isInterviewComplete, isProcessing, toast]);

  const startRecording = async () => {
    try {
      // Stop any currently playing audio when user starts speaking
      if (currentAudioRef.current && !currentAudioRef.current.paused) {
        currentAudioRef.current.pause();
        setIsSpeaking(false);
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = handleRecordingStop;
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      
      console.log("Recording started");
    } catch (error) {
      console.error("Microphone error:", error);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please check permissions and try again.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current.stream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
        setIsRecording(false);

        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        
        console.log("Recording stopped");
      } catch (error) {
        console.error("Error stopping recording:", error);
      }
    }
  };

  const handleRecordingStop = async () => {
    setIsProcessing(true);
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

    try {
      // Convert audio to text using OpenAI
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        try {
          const base64Audio = reader.result?.toString().split(",")[1];
          const transcriptData = await apiRequest("/api/ai/speech-to-text", "POST", {
            audio: base64Audio,
          });

          setCurrentUserInput(transcriptData.text);
          setRecordingDuration(0);

          // Automatically send the transcript
          sendMessageMutation.mutate(transcriptData.text);
        } catch (error: any) {
          toast({
            title: "Transcription Error",
            description: error.message || "Failed to transcribe audio. Please try typing your answer.",
            variant: "destructive",
          });
          setIsProcessing(false);
        }
      };
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process recording.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  const handleSendText = () => {
    if (!currentUserInput.trim() || isProcessing) return;

    setIsProcessing(true);
    sendMessageMutation.mutate(currentUserInput.trim());
  };

  const handleEndInterview = () => {
    if (confirm("Are you sure you want to end the interview? You'll receive your final feedback.")) {
      completeInterviewMutation.mutate();
    }
  };

  // Initialize with first question from parent
  useEffect(() => {
    if (firstQuestion && messages.length === 0) {
      const initialMessage: Message = {
        id: `agent-${Date.now()}`,
        type: "agent",
        text: firstQuestion,
        timestamp: new Date(),
      };
      setMessages([initialMessage]);
      
      // Play the first message after a short delay for better UX
      setTimeout(() => {
        playTextAsSpeech(firstQuestion);
      }, 800);
    }
  }, [firstQuestion, playTextAsSpeech]);
  
  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Auto-scroll when speaking/processing indicator appears
  useEffect(() => {
    if (isSpeaking || isProcessing) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [isSpeaking, isProcessing]);

  return (
    <div className="min-h-screen p-6 gradient-secondary">
      <div className="max-w-4xl mx-auto space-y-6 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-primary/10 to-secondary/10 p-4 rounded-lg border border-primary/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Volume2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                AI Interview Conversation
              </h2>
              <p className="text-muted-foreground">
                {role.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())} • {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
              </p>
            </div>
          </div>
          <Button
            onClick={handleEndInterview}
            variant="outline"
            disabled={isProcessing || completeInterviewMutation.isPending}
            className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
          >
            {completeInterviewMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            End Conversation
          </Button>
        </div>

        {/* Messages */}
        <Card className="shadow-xl">
          <CardContent className="p-6">
            <div className="space-y-4 max-h-[500px] overflow-y-auto mb-6 p-4 bg-gradient-to-b from-muted/20 to-transparent rounded-lg">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Volume2 className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
                  <p className="text-lg">Starting conversation...</p>
                  <p className="text-sm mt-2">Please wait for the first message.</p>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === "user" ? "justify-end" : "justify-start"} animate-scale-in`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-4 shadow-md transition-all hover:shadow-lg ${
                        message.type === "user"
                          ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-tr-sm"
                          : "bg-gradient-to-br from-background to-muted border border-border rounded-tl-sm"
                      }`}
                    >
                      {message.type === "agent" && (
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <Volume2 className="w-3 h-3 text-primary" />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">AI Interviewer</span>
                        </div>
                      )}
                      <p className={`text-sm leading-relaxed ${message.type === "user" ? "text-white" : ""}`}>
                        {message.text}
                      </p>
                      <p className={`text-xs mt-2 ${message.type === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {isProcessing && (
                <div className="flex justify-start animate-scale-in">
                  <div className="bg-muted rounded-2xl rounded-tl-sm p-4 border border-border">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Processing your response...</span>
                    </div>
                  </div>
                </div>
              )}
              {isSpeaking && (
                <div className="flex justify-start animate-scale-in">
                  <div className="bg-primary/10 rounded-2xl rounded-tl-sm p-4 border border-primary/20">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 animate-pulse text-primary" />
                      <span className="text-sm text-primary font-medium">AI is speaking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            {!isInterviewComplete && (
              <div className="space-y-4 border-t pt-4">
                {/* Status Indicator */}
                <div className="flex items-center justify-center gap-2 text-sm font-medium">
                  {isSpeaking ? (
                    <div className="flex items-center gap-2 text-primary">
                      <Volume2 className="w-4 h-4 animate-pulse" />
                      <span>AI is speaking...</span>
                    </div>
                  ) : isRecording ? (
                    <div className="flex items-center gap-2 text-red-500">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span>Recording your message...</span>
                    </div>
                  ) : isProcessing ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing your message...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-600">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span>Ready - Click mic to speak or type your message</span>
                    </div>
                  )}
                </div>

                {/* Input Container */}
                <div className="flex items-end gap-3">
                  {/* Voice Recording Button - Larger and more prominent */}
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing || isSpeaking}
                    className={`flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl ${
                      isRecording
                        ? "bg-red-500 text-white animate-pulse hover:bg-red-600 scale-110"
                        : isSpeaking
                        ? "bg-muted text-muted-foreground opacity-50"
                        : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground hover:scale-110 hover:shadow-2xl"
                    } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
                    title={
                      isSpeaking 
                        ? "Wait for AI to finish speaking" 
                        : isRecording 
                        ? "Click to stop recording and send" 
                        : "Click to start voice recording"
                    }
                  >
                    {isRecording ? (
                      <MicOff className="w-7 h-7" />
                    ) : (
                      <Mic className="w-7 h-7" />
                    )}
                  </button>

                  {/* Text Input */}
                  <div className="flex-1 relative">
                    <textarea
                      value={currentUserInput}
                      onChange={(e) => setCurrentUserInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (currentUserInput.trim() && !isProcessing && !isRecording) {
                            handleSendText();
                          }
                        }
                      }}
                      placeholder="Type your message here... (Press Enter to send, Shift+Enter for new line)"
                      className="w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary resize-none min-h-[50px] max-h-[150px]"
                      disabled={isProcessing || isRecording}
                      rows={1}
                      style={{ 
                        height: 'auto',
                        minHeight: '50px'
                      }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = `${Math.min(target.scrollHeight, 150)}px`;
                      }}
                    />
                    {isRecording && (
                      <div className="absolute -top-8 left-0 flex items-center gap-2 text-sm text-red-500 font-medium">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        Recording: {Math.floor(recordingDuration / 60)}:
                        {(recordingDuration % 60).toString().padStart(2, "0")}
                      </div>
                    )}
                  </div>

                  {/* Send Button */}
                  <Button
                    onClick={handleSendText}
                    disabled={!currentUserInput.trim() || isProcessing || isRecording}
                    className="flex-shrink-0 w-12 h-12 rounded-full p-0 shadow-lg hover:scale-105 transition-transform"
                    title="Send message"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>

                {/* Voice Mode Toggle and Tips */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="autoVoice"
                      checked={autoVoiceMode}
                      onChange={(e) => setAutoVoiceMode(e.target.checked)}
                      className="w-4 h-4 rounded border-primary"
                    />
                    <label htmlFor="autoVoice" className="text-xs text-muted-foreground cursor-pointer">
                      Auto-start recording after AI speaks
                    </label>
                  </div>
                  <div className="text-xs text-muted-foreground text-right space-y-1">
                    <p>🎤 Voice conversation mode enabled</p>
                    <p>Press Enter to send • Shift+Enter for new line</p>
                  </div>
                </div>
              </div>
            )}

            {isInterviewComplete && (
              <div className="border-t pt-4 text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <p className="font-semibold">Conversation Complete!</p>
                </div>
                <p className="text-muted-foreground">
                  Click "End Conversation" above to see your detailed results and feedback.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

