/**
 * Voice Interview Component using WebSocket and OpenAI Realtime API
 * Handles real-time bidirectional audio streaming
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Volume2, Loader2, CheckCircle2, X } from "lucide-react";
import AISpeakingIndicator from "@/components/ui/AISpeakingIndicator";
import AnimatedBackground from "@/components/ui/AnimatedBackground";

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

export default function VoiceInterviewWebSocket({
  sessionId,
  candidateContext,
  onComplete,
}: VoiceInterviewWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Connecting...");
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const isConnectingRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const isMountedRef = useRef(true);
  const candidateContextRef = useRef(candidateContext);
  const { toast } = useToast();
  
  // Update candidateContext ref when it changes
  useEffect(() => {
    console.log('📝 candidateContext updated:', candidateContext);
    candidateContextRef.current = candidateContext;
  }, [candidateContext]);
  
  // Log initial candidateContext on mount
  useEffect(() => {
    console.log('🎯 VoiceInterviewWebSocket mounted with candidateContext:', candidateContext);
    console.log('🎯 sessionId:', sessionId);
  }, []);

  // Get WebSocket URL - points to Railway backend
  const getWebSocketUrl = () => {
    // Use Railway backend URL from environment variable
    const backendUrl = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL;
    
    if (backendUrl) {
      // Convert HTTP/HTTPS URL to WebSocket URL
      const wsUrl = backendUrl
        .replace(/^http:/, 'ws:')
        .replace(/^https:/, 'wss:');
      return `${wsUrl}/voice`;
    }
    
    // Fallback: use same host (for development when frontend/backend are together)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/voice`;
  };

  // Convert Float32Array to PCM16
  const convertToPCM16 = (float32Array: Float32Array): Int16Array => {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] and convert to 16-bit integer
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    return pcm16;
  };

  // Handle WebSocket messages (defined before useEffect to avoid hoisting issues)
  const handleWebSocketMessage = useCallback((message: any) => {
    console.log('Received message:', message.type);

    switch (message.type) {
      case 'connected':
        console.log('✓ Server connection confirmed:', message.message);
        console.log('📤 Preparing to send start_interview with candidateContext:', candidateContextRef.current);
        
        // Validate candidateContext before sending
        if (!candidateContextRef.current) {
          console.error('❌ candidateContext is null or undefined');
          setStatusMessage("Error: Missing candidate information.");
          toast({
            title: "Error",
            description: "Candidate information is missing. Please try again.",
            variant: "destructive",
          });
          break;
        }
        
        const context = candidateContextRef.current;
        if (!context.name || !context.major || !context.year) {
          console.error('❌ candidateContext missing required fields:', {
            hasName: !!context.name,
            hasMajor: !!context.major,
            hasYear: !!context.year
          });
          setStatusMessage("Error: Incomplete candidate information.");
          toast({
            title: "Error",
            description: "Please provide name, major, and year.",
            variant: "destructive",
          });
          break;
        }
        
        setStatusMessage("Connected. Starting interview...");
        // Send start_interview message after receiving connected confirmation
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const startMessage = {
            type: 'start_interview',
            candidateContext: candidateContextRef.current
          };
          console.log('📤 Sending start_interview message:', JSON.stringify(startMessage, null, 2));
          wsRef.current.send(JSON.stringify(startMessage));
        } else {
          console.error('❌ WebSocket not open, cannot send start_interview');
        }
        break;
      case 'interview_started':
        setIsInterviewActive(true);
        setStatusMessage("Interview started. Speak when ready.");
        break;
      case 'session_started':
        setIsInterviewActive(true);
        setStatusMessage("Interview started. Speak when ready.");
        break;
      case 'transcript':
      case 'ai_transcription':
        setTranscripts(prev => [...prev, {
          type: 'ai',
          text: message.text,
          isFinal: message.is_final || false,
          timestamp: Date.now()
        }]);
        break;
      case 'student_transcription':
        setTranscripts(prev => [...prev, {
          type: 'student',
          text: message.text,
          isFinal: message.is_final || false,
          timestamp: Date.now()
        }]);
        break;
      case 'session_ended':
      case 'interview_ended':
        setIsInterviewActive(false);
        setStatusMessage("Interview completed.");
        break;
      case 'error':
        console.error('Server error:', message.message);
        setStatusMessage(`Error: ${message.message || 'Unknown error'}`);
        toast({
          title: "Interview Error",
          description: message.message || "An error occurred during the interview.",
          variant: "destructive",
        });
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }, [toast]);

  // Play audio chunk (PCM16 format) - defined before useEffect
  const playAudioChunk = useCallback(async (arrayBuffer: ArrayBuffer) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const audioContext = audioContextRef.current;
      
      // Convert PCM16 to Float32
      const pcm16Data = new Int16Array(arrayBuffer);
      const float32Data = new Float32Array(pcm16Data.length);
      
      for (let i = 0; i < pcm16Data.length; i++) {
        float32Data[i] = pcm16Data[i] / (pcm16Data[i] >= 0 ? 32767 : 32768);
      }
      
      // Create audio buffer from Float32 data
      const audioBuffer = audioContext.createBuffer(1, float32Data.length, 24000);
      audioBuffer.copyToChannel(float32Data, 0);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      setIsPlaying(true);
      isPlayingRef.current = true;

      source.onended = () => {
        setIsPlaying(false);
        isPlayingRef.current = false;
      };

      source.start(0);
    } catch (error) {
      console.error('Error playing audio chunk:', error);
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, []);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaStreamRef.current) {
      // Update recording state ref
      const recordingState = (mediaStreamRef.current as any).__recordingState;
      if (recordingState) {
        recordingState.isRecording = false;
      }
      
      // Stop all tracks
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      
      // Disconnect processor if exists
      const processor = (mediaStreamRef.current as any).__processor;
      if (processor) {
        const source = (processor as any).__source;
        if (source) {
          source.disconnect();
        }
        processor.disconnect();
      }
      
      mediaStreamRef.current = null;
    }
    
    setIsRecording(false);
    setStatusMessage("Processing...");
  }, []);

  // Cleanup audio resources
  const cleanupAudio = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    stopRecording();
  }, [stopRecording]);

  // Initialize WebSocket connection
  useEffect(() => {
    isMountedRef.current = true;
    
    const connectWebSocket = () => {
      // Prevent multiple simultaneous connection attempts
      if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
        console.log('WebSocket connection already in progress or connected');
        return;
      }

      // Check if we've exceeded max retries
      if (retryCountRef.current >= maxRetries) {
        console.error('Max retry attempts reached');
        setStatusMessage("Connection failed. Please refresh the page.");
        toast({
          title: "Connection Failed",
          description: "Unable to connect to voice server after multiple attempts. Please refresh the page.",
          variant: "destructive",
        });
        return;
      }

      isConnectingRef.current = true;
      
      try {
        const wsUrl = getWebSocketUrl();
        console.log(`Connecting to WebSocket (attempt ${retryCountRef.current + 1}/${maxRetries}):`, wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('✓ WebSocket connected');
          isConnectingRef.current = false;
          retryCountRef.current = 0; // Reset retry count on successful connection
          setIsConnected(true);
          setStatusMessage("Connecting to server...");
          // Wait for 'connected' message from server before sending start_interview
        };

        ws.onmessage = async (event) => {
          try {
            // Check if it's binary (audio) or text (JSON)
            if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
              // Binary audio data from AI
              const arrayBuffer = event.data instanceof Blob 
                ? await event.data.arrayBuffer() 
                : event.data;
              
              console.log('🔊 Received audio chunk, size:', arrayBuffer.byteLength);
              // Play audio chunk
              await playAudioChunk(arrayBuffer);
            } else {
              // JSON message
              const rawData = event.data.toString();
              console.log('📨 Received WebSocket message (raw):', rawData.substring(0, 200));
              const message = JSON.parse(rawData);
              handleWebSocketMessage(message);
            }
          } catch (error) {
            console.error('❌ Error handling WebSocket message:', error);
            console.error('Raw data:', event.data);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          isConnectingRef.current = false;
          
          // Don't show toast on every error - only on first attempt or final failure
          if (retryCountRef.current === 0) {
            setStatusMessage("Connection error. Retrying...");
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          isConnectingRef.current = false;
          setIsConnected(false);
          setIsInterviewActive(false);
          
          // Only attempt reconnect if:
          // 1. Not a normal closure (code 1000)
          // 2. Component is still mounted
          // 3. We haven't exceeded max retries
          if (event.code !== 1000 && isMountedRef.current && retryCountRef.current < maxRetries) {
            retryCountRef.current += 1;
            const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 10000); // Exponential backoff, max 10s
            
            console.log(`WebSocket closed unexpectedly. Retrying in ${delay}ms... (attempt ${retryCountRef.current}/${maxRetries})`);
            setStatusMessage(`Connection lost. Retrying in ${Math.round(delay / 1000)}s...`);
            
            // Clear any existing retry timeout
            if (retryTimeoutRef.current) {
              clearTimeout(retryTimeoutRef.current);
            }
            
            retryTimeoutRef.current = setTimeout(() => {
              if (isMountedRef.current) {
                connectWebSocket();
              }
            }, delay);
          } else if (event.code !== 1000 && isMountedRef.current) {
            // Final failure - show error
            setStatusMessage("Connection lost. Please refresh the page.");
            toast({
              title: "Connection Lost",
              description: "The connection to the voice server was lost. Please refresh the page.",
              variant: "destructive",
            });
          }
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        isConnectingRef.current = false;
        
        if (retryCountRef.current === 0) {
          toast({
            title: "Connection Error",
            description: "Failed to create WebSocket connection.",
            variant: "destructive",
          });
        }
        
        // Retry on error
        if (isMountedRef.current && retryCountRef.current < maxRetries) {
          retryCountRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 10000);
          
          retryTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connectWebSocket();
            }
          }, delay);
        }
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      
      // Clear retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      // Close WebSocket connection
      if (wsRef.current) {
        // Remove event handlers to prevent reconnection attempts
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      
      stopRecording();
      cleanupAudio();
    };
    // Only run once on mount - use refs for values that might change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start recording microphone
  const startRecording = useCallback(async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
          channelCount: 1,
        }
      });

      mediaStreamRef.current = stream;

      // Create AudioContext for processing
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const audioContext = audioContextRef.current;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      const recordingStateRef = { isRecording: true };
      
      processor.onaudioprocess = (e) => {
        if (!recordingStateRef.isRecording || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert to PCM16
        const pcm16 = convertToPCM16(inputData);
        
        // Send as base64 encoded audio chunk
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        
        wsRef.current.send(JSON.stringify({
          type: 'audio_chunk',
          audio: base64
        }));
      };
      
      // Store recording state ref for cleanup
      (mediaStreamRef.current as any).__recordingState = recordingStateRef;

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      setStatusMessage("Recording... Speak now.");
      
      // Store processor reference for cleanup
      (processor as any).__source = source;
      (mediaStreamRef.current as any).__processor = processor;
      (mediaStreamRef.current as any).__recordingState = recordingStateRef;

    } catch (error: any) {
      console.error('Microphone error:', error);
      setIsRecording(false);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        toast({
          title: "Microphone Access Denied",
          description: "Please allow microphone access to use voice interview.",
          variant: "destructive",
        });
        setStatusMessage("Microphone access denied. Please allow access and refresh.");
      } else {
        toast({
          title: "Microphone Error",
          description: error.message || "Could not access microphone.",
          variant: "destructive",
        });
        setStatusMessage("Microphone error. Please check permissions.");
      }
    }
  }, [toast, stopRecording]);

  // End interview
  const handleEndInterview = useCallback(() => {
    if (confirm("Are you sure you want to end the interview?")) {
      // Clear any pending retry attempts
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      // Reset retry count to prevent reconnection
      retryCountRef.current = maxRetries;
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'end_interview'
        }));
      }
      
      stopRecording();
      cleanupAudio();
      
      if (wsRef.current) {
        // Close with code 1000 (normal closure) to prevent retry attempts
        wsRef.current.close(1000, 'Interview ended by user');
        wsRef.current = null;
      }
      
      setIsInterviewActive(false);
      onComplete();
    }
  }, [stopRecording, cleanupAudio, onComplete]);

  // Auto-start recording when AI finishes speaking
  useEffect(() => {
    if (!isPlaying && isInterviewActive && !isRecording && !isProcessing) {
      // Small delay before auto-starting recording
      const timer = setTimeout(() => {
        if (!isPlayingRef.current) {
          startRecording();
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isPlaying, isInterviewActive, isRecording, isProcessing, startRecording]);

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
              <Button
                onClick={handleEndInterview}
                variant="outline"
                disabled={isProcessing}
              >
                <X className="w-4 h-4 mr-2" />
                End Interview
              </Button>
            </div>

            {/* Status Indicator */}
            <div className="text-center mb-6">
              {isPlaying ? (
                <div className="flex items-center justify-center gap-2 text-primary">
                  <AISpeakingIndicator size="md" />
                  <span className="font-medium">AI is speaking...</span>
                </div>
              ) : isRecording ? (
                <div className="flex items-center justify-center gap-2 text-red-500">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="font-medium">Recording... Speak now</span>
                </div>
              ) : isProcessing ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">Processing...</span>
                </div>
              ) : !isConnected ? (
                <div className="flex items-center justify-center gap-2 text-yellow-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">{statusMessage}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="font-medium">{statusMessage}</span>
                </div>
              )}
            </div>

            {/* Microphone Button */}
            <div className="flex justify-center mb-6">
              <button
                onClick={() => isRecording ? stopRecording() : startRecording()}
                disabled={!isConnected || !isInterviewActive || isPlaying || isProcessing}
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all shadow-2xl ${
                  isRecording
                    ? "bg-red-500 text-white animate-pulse hover:bg-red-600 scale-110"
                    : isPlaying || !isConnected || !isInterviewActive
                    ? "bg-muted text-muted-foreground opacity-50"
                    : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground hover:scale-110"
                } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
              >
                {isRecording ? (
                  <MicOff className="w-16 h-16" />
                ) : (
                  <Mic className="w-16 h-16" />
                )}
              </button>
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
                        {transcript.type === 'ai' ? '🤖 AI Interviewer' : '👤 You'}
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

