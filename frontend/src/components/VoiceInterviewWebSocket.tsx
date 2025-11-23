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
  const { toast } = useToast();

  // Get WebSocket URL (works with Replit deployment)
  const getWebSocketUrl = () => {
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
      case 'session_started':
        setIsInterviewActive(true);
        setStatusMessage("Interview started. Speak when ready.");
        break;
      case 'transcript':
        setTranscripts(prev => [...prev, {
          type: message.speaker === 'assistant' ? 'ai' : 'student',
          text: message.text,
          isFinal: message.is_final || false,
          timestamp: Date.now()
        }]);
        break;
      case 'session_ended':
        setIsInterviewActive(false);
        setStatusMessage("Interview completed.");
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }, []);

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
    const connectWebSocket = () => {
      try {
        const wsUrl = getWebSocketUrl();
        console.log('Connecting to WebSocket:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('✓ WebSocket connected');
          setIsConnected(true);
          setStatusMessage("Connected. Starting interview...");
          
          // Send start_interview message
          ws.send(JSON.stringify({
            type: 'start_interview',
            candidateContext: candidateContext
          }));
        };

        ws.onmessage = async (event) => {
          try {
            // Check if it's binary (audio) or text (JSON)
            if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
              // Binary audio data from AI
              const arrayBuffer = event.data instanceof Blob 
                ? await event.data.arrayBuffer() 
                : event.data;
              
              // Play audio chunk
              await playAudioChunk(arrayBuffer);
            } else {
              // JSON message
              const message = JSON.parse(event.data);
              handleWebSocketMessage(message);
            }
          } catch (error) {
            console.error('Error handling WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setStatusMessage("Connection error. Please try again.");
          toast({
            title: "Connection Error",
            description: "Failed to connect to voice server.",
            variant: "destructive",
          });
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          setIsConnected(false);
          setIsInterviewActive(false);
          
          if (event.code !== 1000) {
            setStatusMessage("Connection lost. Please refresh the page.");
            toast({
              title: "Connection Lost",
              description: "The connection to the voice server was lost.",
              variant: "destructive",
            });
          }
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        toast({
          title: "Connection Error",
          description: "Failed to create WebSocket connection.",
          variant: "destructive",
        });
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      stopRecording();
      cleanupAudio();
    };
  }, [candidateContext, handleWebSocketMessage, playAudioChunk, toast, stopRecording, cleanupAudio]);

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
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'end_interview'
        }));
      }
      
      stopRecording();
      cleanupAudio();
      
      if (wsRef.current) {
        wsRef.current.close();
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

