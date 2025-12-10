/**
 * Voice Interview Component using WebSocket and OpenAI Realtime API
 * Handles real-time bidirectional audio streaming
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Volume2, Loader2, CheckCircle2, X, User, Headphones } from "lucide-react";
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
  const [conversationState, setConversationState] = useState<'ai_speaking' | 'listening' | 'user_speaking' | 'processing'>('listening');
  const pendingTranscriptRef = useRef<TranscriptMessage | null>(null); // Track pending transcript during interruptions
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const isProcessingQueueRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const audioBufferQueueRef = useRef<Float32Array[]>([]);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const isConnectingRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const isMountedRef = useRef(true);
  const candidateContextRef = useRef(candidateContext);
  const interviewStartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingTranscriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessTimeRef = useRef<number>(0); // Watchdog timer for queue processing health
  const queueWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  
  // Timing tracking refs for turn-taking metrics
  const lastAiResponseDoneTimeRef = useRef<number | null>(null);
  const lastStudentSpeechStartedTimeRef = useRef<number | null>(null);
  const lastStudentSpeechEndedTimeRef = useRef<number | null>(null);
  const lastStateTransitionTimeRef = useRef<number>(Date.now());
  const lastStateRef = useRef<'ai_speaking' | 'listening' | 'user_speaking' | 'processing'>('listening');
  
  // Audio chunk metrics tracking
  const audioChunkReceiveTimesRef = useRef<number[]>([]);
  const audioChunkSizesRef = useRef<number[]>([]);
  const lastChunkReceiveTimeRef = useRef<number | null>(null);
  
  // Chunk buffering for incomplete PCM frames
  const pendingAudioBufferRef = useRef<Uint8Array | null>(null);
  const lastChunkTimeRef = useRef<number | null>(null);
  
  // Minimum buffer threshold before starting playback
  const audioBufferAccumulatorRef = useRef<number>(0);
  const MIN_BUFFER_BEFORE_PLAYBACK = 16000; // 0.5s at 16kHz (16000 samples/s * 0.5s * 2 bytes)
  
  // ElevenLabs requires 16kHz PCM16 mono audio
  const ELEVENLABS_SAMPLE_RATE = 16000;
  
  // Detect browser's native sample rate for recording
  const getNativeSampleRate = (): number => {
    const tempContext = new AudioContext();
    const nativeRate = tempContext.sampleRate;
    tempContext.close();
    // Round to nearest supported rate (44.1kHz or 48kHz)
    return nativeRate >= 47000 ? 48000 : 44100;
  };
  
  const NATIVE_SAMPLE_RATE = getNativeSampleRate();
  const currentSampleRateRef = useRef<number>(NATIVE_SAMPLE_RATE);
  
  const { toast } = useToast();
  
  // Update candidateContext ref when it changes
  useEffect(() => {
    // Reduced logging - only log on significant changes
    candidateContextRef.current = candidateContext;
  }, [candidateContext]);
  
  // Log initial candidateContext on mount (keep minimal logging for debugging)
  useEffect(() => {
    // Only log in development mode
    if (import.meta.env.DEV && Math.random() < 0.1) {
      console.log('🎯 VoiceInterviewWebSocket mounted');
    }
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

  // Encode PCM16 to base64 using chunked approach to prevent stack overflow
  const encodePCM16ToBase64 = useCallback((pcm16: Int16Array): string => {
    try {
      const uint8Array = new Uint8Array(pcm16.buffer);
      const chunkSize = 8192; // Process in chunks to avoid stack overflow
      
      // For small arrays, use direct encoding
      if (uint8Array.length <= chunkSize) {
        return btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));
      }
      
      // For large arrays, process in chunks
      let result = '';
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        result += String.fromCharCode.apply(null, Array.from(chunk));
      }
      return btoa(result);
    } catch (error) {
      console.error('❌ Error encoding PCM16 to base64:', error);
      throw new Error('Failed to encode audio data');
    }
  }, []);

  // Helper function to log state transitions
  const logStateTransition = useCallback((newState: 'ai_speaking' | 'listening' | 'user_speaking' | 'processing', reason?: string) => {
    const now = Date.now();
    const previousState = lastStateRef.current;
    const timeSinceLastTransition = now - lastStateTransitionTimeRef.current;
    
    if (previousState !== newState) {
      console.log(`🔄 State transition: ${previousState} → ${newState}${reason ? ` (${reason})` : ''} | Time since last transition: ${timeSinceLastTransition}ms`);
      lastStateRef.current = newState;
      lastStateTransitionTimeRef.current = now;
    }
  }, []);
  
  // Wrapper for setConversationState with logging
  const setConversationStateWithLogging = useCallback((newState: 'ai_speaking' | 'listening' | 'user_speaking' | 'processing' | ((prev: 'ai_speaking' | 'listening' | 'user_speaking' | 'processing') => 'ai_speaking' | 'listening' | 'user_speaking' | 'processing'), reason?: string) => {
    if (typeof newState === 'function') {
      setConversationState(prevState => {
        const result = newState(prevState);
        logStateTransition(result, reason);
        return result;
      });
    } else {
      logStateTransition(newState, reason);
      setConversationState(newState);
    }
  }, [logStateTransition]);

  // Helper function to check if data is JSON (even if it arrives as ArrayBuffer/Blob)
  const isJSONData = useCallback(async (data: ArrayBuffer | Blob | string): Promise<boolean> => {
    if (typeof data === 'string') {
      // Already a string, check if it starts with JSON markers
      const trimmed = data.trim();
      return trimmed.startsWith('{') || trimmed.startsWith('[');
    }
    
    // For ArrayBuffer/Blob, peek at first few bytes
    let buffer: ArrayBuffer;
    if (data instanceof Blob) {
      buffer = await data.slice(0, 10).arrayBuffer();
    } else {
      buffer = data.slice(0, 10);
    }
    
    // Check first byte for JSON markers: { (0x7B) or [ (0x5B)
    const firstByte = new Uint8Array(buffer)[0];
    return firstByte === 0x7B || firstByte === 0x5B; // { or [
  }, []);

  // Convert ArrayBuffer to text string
  const arrayBufferToText = useCallback((buffer: ArrayBuffer): string => {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  }, []);

  // Decode base64 string to ArrayBuffer for audio playback
  const decodeBase64Audio = useCallback((base64: string): ArrayBuffer => {
    // Remove data URL prefix if present (e.g., "data:audio/pcm;base64,")
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    
    // Decode base64 to binary string
    const binaryString = atob(base64Data);
    
    // Convert binary string to ArrayBuffer
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  }, []);

  // Split concatenated JSON strings (e.g., {"ping":1}{"audio":2}) into individual JSON objects
  const splitConcatenatedJSON = useCallback((text: string): string[] => {
    const jsonObjects: string[] = [];
    let depth = 0;
    let start = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) {
        continue;
      }
      
      if (char === '{') {
        if (depth === 0) {
          start = i;
        }
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          // Found a complete JSON object
          jsonObjects.push(text.substring(start, i + 1));
        }
      }
    }
    
    return jsonObjects;
  }, []);

  // Handle WebSocket messages (defined before useEffect to avoid hoisting issues)
  const handleWebSocketMessage = useCallback((message: any) => {
    // Reduced logging - only log important message types
    if (['error', 'interview_started', 'student_speech_started', 'user_started_speaking', 'interruption'].includes(message.type)) {
      console.log('Received message:', message.type);
    }

    switch (message.type) {
      case 'ping':
      case 'pong':
        // Control messages - ignore (no action needed)
        return;
      case 'connected':
        // Reduced logging - only log connection confirmation
        console.log('✓ Server connection confirmed');
        
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
          // Reduced logging - only log in development
          if (import.meta.env.DEV) {
            console.log('📤 Sending start_interview');
          }
          wsRef.current.send(JSON.stringify(startMessage));
          
          // Set a timeout to detect if backend doesn't respond
          if (interviewStartTimeoutRef.current) {
            clearTimeout(interviewStartTimeoutRef.current);
          }
          interviewStartTimeoutRef.current = setTimeout(() => {
            if (!isInterviewActive && wsRef.current?.readyState === WebSocket.OPEN) {
              console.error('⏱️ Timeout: No response from backend after sending start_interview');
              setStatusMessage("Timeout: Server not responding. Please try again.");
              toast({
                title: "Connection Timeout",
                description: "The server didn't respond. This might be a backend issue. Please refresh and try again.",
                variant: "destructive",
              });
            }
          }, 15000); // 15 second timeout
        } else {
          console.error('❌ WebSocket not open, cannot send start_interview');
        }
        break;
      case 'interview_starting':
        // Reduced logging
        // Clear the timeout since we got a response
        if (interviewStartTimeoutRef.current) {
          clearTimeout(interviewStartTimeoutRef.current);
          interviewStartTimeoutRef.current = null;
        }
        setStatusMessage("Starting interview... Please wait.");
        break;
      case 'interview_started':
        // Keep this log as it's important
        console.log('✅ Interview started successfully');
        // Clear the timeout since we got a response
        if (interviewStartTimeoutRef.current) {
          clearTimeout(interviewStartTimeoutRef.current);
          interviewStartTimeoutRef.current = null;
        }
        setIsInterviewActive(true);
        setConversationStateWithLogging('ai_speaking', 'interview_started');
        setStatusMessage("Interview started. AI is speaking...");
        
        // Start continuous microphone stream for VAD (keep it open)
        // MediaRecorder will continuously stream chunks every 250ms
        if (!mediaStreamRef.current && !mediaRecorderRef.current) {
          startRecording().catch((error) => {
            console.error('❌ Failed to start continuous recording:', error);
          });
        } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          // If already recording, ensure we're sending chunks
          resumeRecording();
        }
        
        // Set timeout to prevent stuck state (30 seconds max for AI response)
        if (stateTimeoutRef.current) {
          clearTimeout(stateTimeoutRef.current);
        }
        stateTimeoutRef.current = setTimeout(() => {
          // Use functional update to get current state value, not stale closure value
          setConversationStateWithLogging(currentState => {
            if (currentState === 'ai_speaking') {
              console.warn('⚠️ State timeout: AI speaking state exceeded 30s, forcing transition to listening');
              setStatusMessage("Listening... Please speak your answer.");
              return 'listening';
            }
            return currentState;
          }, 'state_timeout');
        }, 30000);
        
        // Initialize AudioContext early to handle autoplay policies
        // Use native sample rate to match browser capabilities and prevent resampling artifacts
        if (!audioContextRef.current) {
          // Reduced logging
          audioContextRef.current = new AudioContext({ sampleRate: NATIVE_SAMPLE_RATE });
          currentSampleRateRef.current = audioContextRef.current.sampleRate; // Store actual rate
          if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().catch((error) => {
              console.error('❌ Failed to resume AudioContext:', error);
            });
          }
          nextPlayTimeRef.current = 0; // Will be set on first chunk
        }
        break;
      case 'session_started':
        setIsInterviewActive(true);
        setStatusMessage("Interview started. Speak when ready.");
        break;
      case 'transcript':
      case 'ai_transcription':
        // Update conversation state when AI starts speaking
        if (conversationState === 'listening' || conversationState === 'user_speaking') {
          setConversationStateWithLogging('ai_speaking', 'ai_transcription_received');
          // Pause sending audio chunks when AI starts speaking (but keep stream open)
          if (isRecording) {
            pauseRecording();
          }
        }
        setTranscripts(prev => {
          const isFinal = message.is_final || false;
          const newText = message.text || '';
          
          // Defensive check: ensure we have text or this is a final marker
          if (!newText && !isFinal) {
            if (Math.random() < 0.1) {
              console.warn('⚠️ Received empty non-final transcription, skipping');
            }
            return prev;
          }
          
          // Handle late-arriving transcript after interruption
          // If we're in user_speaking state but receive AI transcript, it's likely a late message
          // Still process it to ensure no transcript is lost
          
          // Find the last AI transcription entry (final or non-final)
          const lastAiIndex = prev.length - 1;
          const lastEntry = lastAiIndex >= 0 ? prev[lastAiIndex] : null;
          const isLastEntryAi = lastEntry && lastEntry.type === 'ai';
          
          // Case 1: Final transcription with empty text - mark last non-final as final
          if (isFinal && !newText) {
            if (isLastEntryAi && !lastEntry.isFinal) {
              // Mark the accumulated non-final text as final
              return [
                ...prev.slice(0, -1),
                {
                  ...lastEntry,
                  isFinal: true,
                  timestamp: Date.now()
                }
              ];
            }
            // Check if we have a pending transcript from interruption
            if (pendingTranscriptRef.current && !pendingTranscriptRef.current.isFinal) {
              // Complete the pending transcript
              const completed = {
                ...pendingTranscriptRef.current,
                isFinal: true,
                timestamp: Date.now()
              };
              pendingTranscriptRef.current = null;
              // Clear timeout since we got the final message
              if (pendingTranscriptTimeoutRef.current) {
                clearTimeout(pendingTranscriptTimeoutRef.current);
                pendingTranscriptTimeoutRef.current = null;
              }
              return [...prev, completed];
            }
            // If no non-final entry exists, don't add empty final entry
            return prev;
          }
          
          // Case 2: Non-final transcription - accumulate with last non-final entry
          if (!isFinal && newText) {
            if (isLastEntryAi && !lastEntry.isFinal) {
              // Accumulate text (server sends incremental words)
              const updatedText = lastEntry.text + newText;
              return [
                ...prev.slice(0, -1),
                {
                  ...lastEntry,
                  text: updatedText,
                  timestamp: Date.now()
                }
              ];
            }
            // No existing non-final entry, create new one
            return [...prev, {
              type: 'ai',
              text: newText,
              isFinal: false,
              timestamp: Date.now()
            }];
          }
          
          // Case 3: Final transcription with text
          if (isFinal && newText) {
            if (isLastEntryAi && !lastEntry.isFinal) {
              // Update the last non-final entry with final text
              // Combine accumulated text with final text (final text may be complete or incremental)
              const updatedText = lastEntry.text + newText;
              return [
                ...prev.slice(0, -1),
                {
                  ...lastEntry,
                  text: updatedText,
                  isFinal: true,
                  timestamp: Date.now()
                }
              ];
            }
            // Check if we have a pending transcript from interruption
            if (pendingTranscriptRef.current) {
              // Complete the pending transcript with new text
              const completed = {
                ...pendingTranscriptRef.current,
                text: pendingTranscriptRef.current.text + newText,
                isFinal: true,
                timestamp: Date.now()
              };
              pendingTranscriptRef.current = null;
              // Clear timeout since we got the final message
              if (pendingTranscriptTimeoutRef.current) {
                clearTimeout(pendingTranscriptTimeoutRef.current);
                pendingTranscriptTimeoutRef.current = null;
              }
              return [...prev, completed];
            }
            // No existing non-final entry, create new final entry
            return [...prev, {
              type: 'ai',
              text: newText,
              isFinal: true,
              timestamp: Date.now()
            }];
          }
          
          // Fallback: should not reach here, but add entry if we do
          if (Math.random() < 0.1) {
            console.warn('⚠️ Unexpected transcription case, adding entry anyway');
          }
          return [...prev, {
            type: 'ai',
            text: newText,
            isFinal: isFinal,
            timestamp: Date.now()
          }];
        });
        break;
      case 'interruption': {
        // Explicit interruption event - immediately stop AI audio
        console.log('🛑 Interruption detected - stopping AI audio immediately');
        
        // Immediately stop all playing audio sources
        activeSourcesRef.current.forEach(source => {
          try {
            source.onended = null; // Prevent callbacks
            source.stop();
          } catch (e) {
            // Ignore errors - source may already be stopped
          }
          try {
            source.disconnect();
          } catch (e) {
            // Ignore disconnect errors
          }
        });
        activeSourcesRef.current = [];
        isProcessingQueueRef.current = false;
        
        // Clear audio queue (scheduledAudioQueue) immediately
        const queueSizeBeforeClear = audioQueueRef.current.length;
        audioQueueRef.current = [];
        pendingAudioBufferRef.current = null; // Clear pending buffer on interruption
        audioBufferAccumulatorRef.current = 0; // Reset buffer accumulator on interruption
        if (queueSizeBeforeClear > 0) {
          console.log('🔊 Cleared audio queue:', queueSizeBeforeClear, 'chunks');
        }
        
        // Suspend or stop AudioContext to cut off audio instantly
        if (audioContextRef.current && audioContextRef.current.state === 'running') {
          audioContextRef.current.suspend().catch((error) => {
            console.error('❌ Failed to suspend AudioContext:', error);
          });
        }
        
        // Reset playback state
        isPlayingRef.current = false;
        setIsPlaying(false);
        nextPlayTimeRef.current = 0;
        
        // Set state to listening
        setConversationStateWithLogging('listening', 'interruption');
        setStatusMessage("Listening... Please speak your answer.");
        break;
      }
      case 'user_started_speaking':
      case 'student_speech_started': {
        // Keep this log as it's important for debugging interruptions
        console.log('🎤 User started speaking - stopping AI audio');
        const speechStartTime = Date.now();
        lastStudentSpeechStartedTimeRef.current = speechStartTime;
        
        // Calculate time since AI response done
        if (lastAiResponseDoneTimeRef.current) {
          const timeSinceAiDone = speechStartTime - lastAiResponseDoneTimeRef.current;
          console.log(`⏱️ Turn-taking timing: ${timeSinceAiDone}ms from AI response done to user speech start`);
        }
        
        setConversationStateWithLogging('user_speaking', message.type === 'user_started_speaking' ? 'user_started_speaking' : 'student_speech_started');
        setStatusMessage("You're speaking...");
        
        // Preserve any pending non-final transcript before clearing state
        setTranscripts(prev => {
          const lastEntry = prev.length > 0 ? prev[prev.length - 1] : null;
          if (lastEntry && lastEntry.type === 'ai' && !lastEntry.isFinal) {
            // Save pending transcript for later completion
            pendingTranscriptRef.current = lastEntry;
            
            // Set timeout to complete pending transcript if no final message arrives
            if (pendingTranscriptTimeoutRef.current) {
              clearTimeout(pendingTranscriptTimeoutRef.current);
            }
            pendingTranscriptTimeoutRef.current = setTimeout(() => {
              if (pendingTranscriptRef.current) {
                // Complete the pending transcript after 2 seconds
                setTranscripts(current => {
                  const completed = {
                    ...pendingTranscriptRef.current!,
                    isFinal: true,
                    timestamp: Date.now()
                  };
                  pendingTranscriptRef.current = null;
                  return [...current, completed];
                });
              }
            }, 2000);
            
            // Mark it as final to preserve it
            return [
              ...prev.slice(0, -1),
              {
                ...lastEntry,
                isFinal: true,
                timestamp: Date.now()
              }
            ];
          }
          return prev;
        });
        
        // Immediately stop all playing audio with proper cleanup
        activeSourcesRef.current.forEach(source => {
          try {
            source.onended = null; // Prevent callbacks
            source.stop();
          } catch (e) {
            // Ignore errors - source may already be stopped
          }
          try {
            source.disconnect();
          } catch (e) {
            // Ignore disconnect errors
          }
        });
        activeSourcesRef.current = [];
        isProcessingQueueRef.current = false;
        
        // Clear audio queue to prevent backlog
        const queueSizeBeforeClear = audioQueueRef.current.length;
        audioQueueRef.current = [];
        pendingAudioBufferRef.current = null; // Clear pending buffer on interruption
        audioBufferAccumulatorRef.current = 0; // Reset buffer accumulator on interruption
        if (queueSizeBeforeClear > 0) {
          console.log('🔊 Cleared audio queue:', queueSizeBeforeClear, 'chunks');
        }
        
        // Suspend AudioContext to cut off audio instantly
        if (audioContextRef.current && audioContextRef.current.state === 'running') {
          audioContextRef.current.suspend().catch((error) => {
            console.error('❌ Failed to suspend AudioContext:', error);
          });
        }
        
        // Reset playback state
        isPlayingRef.current = false;
        setIsPlaying(false);
        nextPlayTimeRef.current = 0;
        
        // Resume sending audio chunks (microphone stream stays open for continuous VAD)
        if (mediaStreamRef.current && !isRecording) {
          resumeRecording();
        }
        break;
      }
      case 'student_speech_ended': {
        const speechEndTime = Date.now();
        lastStudentSpeechEndedTimeRef.current = speechEndTime;
        
        // Calculate speech duration
        if (lastStudentSpeechStartedTimeRef.current) {
          const speechDuration = speechEndTime - lastStudentSpeechStartedTimeRef.current;
          console.log(`⏱️ User speech duration: ${speechDuration}ms`);
        }
        
        if (conversationState === 'user_speaking') {
          setConversationStateWithLogging('processing', 'student_speech_ended');
          setStatusMessage("Processing your response...");
        }
        break;
      }
      case 'ai_response_done':
        // Keep this log as it's important
        console.log('✅ AI response completed');
        // Clear any state timeout
        if (stateTimeoutRef.current) {
          clearTimeout(stateTimeoutRef.current);
          stateTimeoutRef.current = null;
        }
        
        // Track timing
        const aiResponseDoneTime = Date.now();
        lastAiResponseDoneTimeRef.current = aiResponseDoneTime;
        
        // Calculate time from user speech end to AI response done
        if (lastStudentSpeechEndedTimeRef.current) {
          const responseTime = aiResponseDoneTime - lastStudentSpeechEndedTimeRef.current;
          console.log(`⏱️ Turn-taking timing: ${responseTime}ms from user speech end to AI response done`);
        }
        
        // Transition to listening state when AI finishes
        if (conversationState === 'ai_speaking') {
          setConversationStateWithLogging('listening', 'ai_response_done');
          setStatusMessage("Listening... Please speak your answer.");
          // Resume sending audio chunks (microphone stream stays open for continuous VAD)
          if (mediaStreamRef.current && !isRecording) {
            resumeRecording();
          }
        }
        break;
      case 'ai_audio_done':
        // Keep this log as it's important
        console.log('✅ AI audio stream completed');
        // Clear any state timeout
        if (stateTimeoutRef.current) {
          clearTimeout(stateTimeoutRef.current);
          stateTimeoutRef.current = null;
        }
        // Ensure we transition to listening state
        if (conversationState === 'ai_speaking' && audioQueueRef.current.length === 0) {
          setConversationStateWithLogging('listening', 'ai_audio_done');
          setStatusMessage("Listening... Please speak your answer.");
          // Resume sending audio chunks (microphone stream stays open for continuous VAD)
          if (mediaStreamRef.current && !isRecording) {
            resumeRecording();
          }
        }
        break;
      case 'student_transcription':
        // Update conversation state when receiving student transcription
        if (conversationState !== 'user_speaking') {
          setConversationStateWithLogging('user_speaking', 'student_transcription_received');
        }
        setTranscripts(prev => {
          const isFinal = message.is_final || false;
          const newText = message.text || '';
          
          // If this is a final transcription with empty text, mark the last non-final entry as final
          if (isFinal && !newText && prev.length > 0) {
            const lastEntry = prev[prev.length - 1];
            if (lastEntry.type === 'student' && !lastEntry.isFinal) {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastEntry,
                  isFinal: true,
                  timestamp: Date.now()
                }
              ];
            }
          }
          
          // If this is a non-final transcription, try to update the last non-final entry
          if (!isFinal && prev.length > 0) {
            const lastEntry = prev[prev.length - 1];
            // If the last entry is also non-final and from student, accumulate the text
            if (lastEntry.type === 'student' && !lastEntry.isFinal) {
              // Accumulate text (server sends incremental words)
              const updatedText = lastEntry.text + newText;
              return [
                ...prev.slice(0, -1),
                {
                  ...lastEntry,
                  text: updatedText,
                  timestamp: Date.now()
                }
              ];
            }
          }
          
          // If this is a final transcription with text, mark the last non-final entry as final and update text
          if (isFinal && newText && prev.length > 0) {
            const lastEntry = prev[prev.length - 1];
            if (lastEntry.type === 'student' && !lastEntry.isFinal) {
              // Update the last entry with final text
              const updatedText = lastEntry.text + newText;
              return [
                ...prev.slice(0, -1),
                {
                  ...lastEntry,
                  text: updatedText,
                  isFinal: true,
                  timestamp: Date.now()
                }
              ];
            }
          }
          
          // Otherwise, add as new entry
          return [...prev, {
            type: 'student',
            text: newText,
            isFinal: isFinal,
            timestamp: Date.now()
          }];
        });
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
      case 'audio':
        // Audio messages are handled in ws.onmessage handler before reaching here
        // This case is kept for logging/debugging purposes
        console.log('[AUDIO-DEBUG] Audio message type received (should be handled in ws.onmessage):', message);
        break;
      case 'agent_chat_response_part':
        // Handle agent chat response parts (may contain transcript or other data)
        // Log it but don't process as audio
        if (import.meta.env.DEV) {
          console.log('[AUDIO-DEBUG] Received agent_chat_response_part:', message);
        }
        // If it contains transcript, we could handle it here, but for now just log
        break;
      default:
        // Log all unknown message types for testing (removed throttling)
        console.log('⚠️ Unknown message type:', message.type, 'Full message:', message);
    }
  }, [toast, conversationState, setConversationStateWithLogging, setIsInterviewActive, setStatusMessage, setIsConnected, candidateContextRef, wsRef, interviewStartTimeoutRef, stateTimeoutRef, pendingTranscriptRef, pendingTranscriptTimeoutRef, setTranscripts, audioQueueRef]);

  // Check if chunk is silence/keepalive packet
  // Note: Size check is now done earlier in bufferAndValidateChunk for performance
  const isSilencePacket = useCallback((arrayBuffer: ArrayBuffer): boolean => {
    // This function now only checks audio content, not size (size check happens earlier)
    // Chunks < 200 bytes are already filtered out before this function is called
    
    // Check if audio content is silence (all zeros or very low amplitude)
    try {
      // CRITICAL: Use DataView with explicit little-endian reading to match main processing
      // This ensures consistent endianness handling throughout the audio pipeline
      const dataView = new DataView(arrayBuffer);
      const sampleCount = arrayBuffer.byteLength / 2;
      
      if (sampleCount === 0) {
        return true;
      }
      
      // Read samples as little-endian Int16 (matching ElevenLabs format)
      const pcm16Data = new Int16Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        pcm16Data[i] = dataView.getInt16(i * 2, true); // true = little-endian
      }
      
      // Calculate RMS (Root Mean Square) to detect silence
      let sumSquares = 0;
      let maxAmplitude = 0;
      for (let i = 0; i < pcm16Data.length; i++) {
        const sample = Math.abs(pcm16Data[i]);
        sumSquares += sample * sample;
        maxAmplitude = Math.max(maxAmplitude, sample);
      }
      
      const rms = Math.sqrt(sumSquares / pcm16Data.length);
      const SILENCE_THRESHOLD = 100; // PCM16 samples below this are considered silence
      
      // If RMS is very low and max amplitude is low, it's silence
      if (rms < SILENCE_THRESHOLD && maxAmplitude < SILENCE_THRESHOLD * 2) {
        return true;
      }
      
      return false;
    } catch (error) {
      // If we can't analyze, assume it's not silence (safer to process)
      return false;
    }
  }, []);

  // Buffer and validate audio chunks - ensures complete PCM frames
  const bufferAndValidateChunk = useCallback((arrayBuffer: ArrayBuffer): ArrayBuffer[] => {
    const MIN_CHUNK_SIZE = 320; // 20ms at 16kHz mono PCM16 (16000 samples/s * 0.02s * 2 bytes = 640 bytes, but 320 is safer minimum)
    const PCM_FRAME_SIZE = 2; // PCM16 = 2 bytes per sample
    
    const now = Date.now();
    const timeSinceLastChunk = lastChunkTimeRef.current ? now - lastChunkTimeRef.current : null;
    lastChunkTimeRef.current = now;
    
    // Filter out silence/keepalive packets early (before logging)
    // Updated threshold from 200 bytes to 100 bytes to filter more aggressively
    // Check size first (fastest check) before doing expensive PCM16 analysis
    const isVerySmallChunk = arrayBuffer.byteLength < 100;
    
    // Combine with pending buffer if exists (before size checks to catch accumulated small chunks)
    let combinedBuffer: Uint8Array;
    if (pendingAudioBufferRef.current) {
      const pending = pendingAudioBufferRef.current;
      const newData = new Uint8Array(arrayBuffer);
      combinedBuffer = new Uint8Array(pending.length + newData.length);
      combinedBuffer.set(pending);
      combinedBuffer.set(newData, pending.length);
      pendingAudioBufferRef.current = null; // Clear pending buffer
      
      // Check if combined buffer is still suspiciously small (accumulated small chunks)
      // Updated threshold to 100 bytes to filter more aggressively
      if (combinedBuffer.length < 100) {
        // Combined buffer is still too small - likely accumulated keepalive packets
        // Clear it and skip this chunk entirely
        // Only log when multiple small chunks are received in sequence
        if (Math.random() < 0.05) {
          console.log(`🔇 Skipping accumulated small packets: ${combinedBuffer.length} bytes (from ${pending.length} + ${newData.length})`);
        }
        return []; // Don't process accumulated small chunks
      }
    } else {
      combinedBuffer = new Uint8Array(arrayBuffer);
      
      // Check incoming chunk size (only if no pending buffer)
      // Reject chunks <100 bytes immediately to prevent scheduling disruption
      if (isVerySmallChunk) {
        // Very small chunks are almost certainly keepalive/silence packets
        // Skip scheduling for chunks <100 bytes to prevent timing disruption
        // Only log when multiple small chunks are received in sequence
        if (Math.random() < 0.05) {
          console.log(`🔇 Skipping very small packet: ${arrayBuffer.byteLength} bytes (<100 bytes threshold)`);
        }
        return []; // Return empty array - don't process silence packets
      }
    }
    
    // Additional silence detection for larger chunks (check combined buffer if it exists)
    // Create a proper ArrayBuffer slice for silence detection
    const bufferForSilenceCheck = combinedBuffer.buffer.slice(combinedBuffer.byteOffset, combinedBuffer.byteOffset + combinedBuffer.length) as ArrayBuffer;
    if (isSilencePacket(bufferForSilenceCheck)) {
      // Only log occasionally to reduce noise
      if (Math.random() < 0.05) {
        console.log(`🔇 Skipping silence packet: ${combinedBuffer.length} bytes`);
      }
      return []; // Return empty array - don't process silence packets
    }
    
    // Log chunk received (only for valid chunks) - reduce frequency to avoid spam
    if (Math.random() < 0.2) {
      console.log(`🔊 Audio chunk received: size=${combinedBuffer.length} bytes, interval=${timeSinceLastChunk || 0}ms, queue=${audioQueueRef.current.length}`);
    }
    
    // Check if byte length is multiple of 2 (required for Int16Array)
    if (combinedBuffer.length % 2 !== 0) {
      console.warn(`⚠️ Invalid chunk size: ${combinedBuffer.length} bytes (not multiple of 2). Buffering for completion.`);
    }
    
    // Check if combined buffer is still incomplete (not multiple of 2)
    if (combinedBuffer.length % 2 !== 0) {
      // Save incomplete chunk for next iteration
      pendingAudioBufferRef.current = combinedBuffer;
      // Only log occasionally to reduce noise
      if (Math.random() < 0.1) {
        console.log(`📦 Buffering incomplete chunk: ${combinedBuffer.length} bytes (waiting for more data)`);
      }
      return []; // Return empty array - no complete frames yet
    }
    
    // Validate minimum chunk size (unless it's a very small final chunk)
    // Updated threshold: only warn if chunk is between 100-320 bytes (passed initial filter but still small)
    if (combinedBuffer.length < MIN_CHUNK_SIZE && combinedBuffer.length >= 100) {
      // Only log occasionally to reduce noise
      if (Math.random() < 0.1) {
        console.warn(`⚠️ Very small chunk: ${combinedBuffer.length} bytes (< ${MIN_CHUNK_SIZE} bytes minimum). Processing anyway.`);
      }
    }
    
    // If we have complete frames, return them
    const completeFrames: ArrayBuffer[] = [];
    
      // Ensure we have complete PCM frames (multiple of 2 bytes)
      if (combinedBuffer.length >= PCM_FRAME_SIZE && combinedBuffer.length % 2 === 0) {
        // Create ArrayBuffer from Uint8Array
        // WebSocket messages always provide ArrayBuffer, not SharedArrayBuffer
        const bufferSlice = combinedBuffer.buffer.slice(combinedBuffer.byteOffset, combinedBuffer.byteOffset + combinedBuffer.length);
        // Type assertion: WebSocket messages always provide ArrayBuffer
        const completeBuffer = bufferSlice as ArrayBuffer;
        completeFrames.push(completeBuffer);
        // Only log occasionally to reduce noise
        if (Math.random() < 0.1) {
          console.log(`✅ Complete PCM frame ready: ${completeBuffer.byteLength} bytes`);
        }
      } else if (combinedBuffer.length > 0) {
      // Still incomplete, buffer it
      pendingAudioBufferRef.current = combinedBuffer;
      // Only log occasionally to reduce noise
      if (Math.random() < 0.1) {
        console.log(`📦 Still incomplete, buffering: ${combinedBuffer.length} bytes`);
      }
      return [];
    }
    
    return completeFrames;
  }, [isSilencePacket]);
  
  // Apply filtering to reduce static-like noise in PCM16 audio
  const applyStaticFilter = useCallback((pcm16Array: Int16Array): Int16Array => {
    // Simple high-frequency filter to reduce static
    // Uses a moving average to smooth out high-frequency noise
    const filtered = new Int16Array(pcm16Array.length);
    const filterSize = 3; // Small filter for minimal latency
    
    for (let i = 0; i < pcm16Array.length; i++) {
      let sum = 0;
      let count = 0;
      const start = Math.max(0, i - Math.floor(filterSize / 2));
      const end = Math.min(pcm16Array.length, i + Math.ceil(filterSize / 2));
      
      for (let j = start; j < end; j++) {
        sum += pcm16Array[j];
        count++;
      }
      filtered[i] = Math.round(sum / count);
    }
    
    // Remove DC bias (center around zero)
    let dcBias = 0;
    for (let i = 0; i < filtered.length; i++) {
      dcBias += filtered[i];
    }
    dcBias = Math.round(dcBias / filtered.length);
    
    if (Math.abs(dcBias) > 10) {
      // Remove significant DC bias
      for (let i = 0; i < filtered.length; i++) {
        filtered[i] -= dcBias;
      }
    }
    
    return filtered;
  }, []);

  // Analyze PCM16 data for static/noise patterns
  const analyzeForStatic = useCallback((pcm16Array: Int16Array): {
    hasStatic: boolean;
    reason?: string;
    noiseLevel: number;
    sampleRange: { min: number; max: number };
    zeroCrossings: number;
  } => {
    if (pcm16Array.length === 0) {
      return { hasStatic: false, noiseLevel: 0, sampleRange: { min: 0, max: 0 }, zeroCrossings: 0 };
    }
    
    let sumSquares = 0;
    let maxAmplitude = 0;
    let minAmplitude = 32767;
    let zeroCrossings = 0;
    let highFreqNoise = 0; // Count rapid sign changes (indicates high-frequency noise)
    let previousSign = 0;
    let signChangeCount = 0;
    
    for (let i = 0; i < pcm16Array.length; i++) {
      const sample = pcm16Array[i];
      const absSample = Math.abs(sample);
      
      sumSquares += sample * sample;
      maxAmplitude = Math.max(maxAmplitude, absSample);
      minAmplitude = Math.min(minAmplitude, absSample);
      
      // Detect zero crossings (sign changes)
      const currentSign = sample >= 0 ? 1 : -1;
      if (i > 0 && currentSign !== previousSign) {
        zeroCrossings++;
        signChangeCount++;
      }
      previousSign = currentSign;
      
      // Detect high-frequency noise (rapid sign changes in small windows)
      if (i > 0 && i % 100 === 0) {
        if (signChangeCount > 50) { // More than 50% sign changes in 100 samples
          highFreqNoise++;
        }
        signChangeCount = 0;
      }
    }
    
    const rms = Math.sqrt(sumSquares / pcm16Array.length);
    const peakToPeak = maxAmplitude - minAmplitude;
    const zeroCrossingRate = zeroCrossings / pcm16Array.length;
    
    // Static detection heuristics (enhanced to catch more patterns):
    // 1. High zero-crossing rate with low RMS (white noise pattern)
    // 2. Very high peak-to-peak range relative to RMS (clipping/distortion)
    // 3. High-frequency noise patterns
    // 4. High amplitude with low RMS (normalization artifacts)
    // 5. Very high amplitude (>31000) indicating near-clipping distortion
    const hasStatic = (
      (zeroCrossingRate > 0.3 && rms < 1000) || // High zero-crossings with low energy = noise
      (peakToPeak > 28000 && rms < 5000) || // Lowered threshold: Large dynamic range with low RMS = distortion
      (highFreqNoise > pcm16Array.length / 200) || // Excessive high-frequency content
      (maxAmplitude > 31000 && rms < 10000) || // High amplitude with low RMS = normalization artifacts
      (maxAmplitude > 32000) // Very high amplitude = near-clipping distortion
    );
    
    let reason: string | undefined;
    if (hasStatic) {
      if (zeroCrossingRate > 0.3 && rms < 1000) {
        reason = `High zero-crossing rate (${zeroCrossingRate.toFixed(3)}) with low RMS (${rms.toFixed(0)}) - white noise pattern`;
      } else if (peakToPeak > 30000 && rms < 5000) {
        reason = `Large peak-to-peak range (${peakToPeak}) with low RMS (${rms.toFixed(0)}) - clipping/distortion`;
      } else if (highFreqNoise > pcm16Array.length / 200) {
        reason = `Excessive high-frequency noise detected`;
      }
    }
    
    return {
      hasStatic,
      reason,
      noiseLevel: rms,
      sampleRange: { min: minAmplitude, max: maxAmplitude },
      zeroCrossings
    };
  }, []);

  // Validate audio content quality
  const validateAudioContent = useCallback((pcm16Array: Int16Array): { valid: boolean; reason?: string } => {
    if (pcm16Array.length === 0) {
      return { valid: false, reason: 'Empty audio data' };
    }
    
    // Check for silent chunk (all zeros or very low amplitude)
    let allZero = true;
    let maxAmplitude = 0;
    let minAmplitude = 32767;
    let sumSquares = 0;
    
    for (let i = 0; i < pcm16Array.length; i++) {
      const sample = Math.abs(pcm16Array[i]);
      sumSquares += sample * sample;
      maxAmplitude = Math.max(maxAmplitude, sample);
      minAmplitude = Math.min(minAmplitude, sample);
      if (sample > 100) {
        allZero = false;
      }
    }
    
    const rms = Math.sqrt(sumSquares / pcm16Array.length);
    const SILENCE_THRESHOLD = 100;
    
    if (allZero || (rms < SILENCE_THRESHOLD && maxAmplitude < SILENCE_THRESHOLD * 2)) {
      return { valid: false, reason: 'Silence detected' };
    }
    
    // Check for corrupted chunk (all same value, unusual patterns)
    if (maxAmplitude === minAmplitude && pcm16Array.length > 10) {
      return { valid: false, reason: 'Corrupted: all samples have same value' };
    }
    
    // Check for clipping or unusual values
    // PCM16 max value is 32767, so values > 30000 are risky
    if (maxAmplitude > 30000) {
      const clippingRisk = ((maxAmplitude / 32767) * 100).toFixed(1);
      console.warn(`[AUDIO-DIAG] ⚠️ HIGH AMPLITUDE WARNING: ${maxAmplitude} (${clippingRisk}% of max PCM16 value)`);
      console.warn(`[AUDIO-DIAG] This may cause clipping. Normalization will be applied automatically.`);
    }
    
    return { valid: true };
  }, []);

  // Simple PCM16 audio processing
  // Backend is now forced to send PCM16 16000Hz, so we can simplify the pipeline

  // Convert PCM16 to Float32 with proper handling and normalization
  // CRITICAL: This conversion must be exact to avoid introducing artifacts
  const convertPCM16ToFloat32 = useCallback((pcm16Array: Int16Array): Float32Array<ArrayBuffer> => {
    // Create Float32Array with explicit ArrayBuffer to satisfy TypeScript 5.9+ type checking
    // In Web Audio API context, buffers are always ArrayBuffer (not SharedArrayBuffer)
    const buffer = new ArrayBuffer(pcm16Array.length * 4); // 4 bytes per float32
    const float32Array = new Float32Array(buffer);
    
    // Normalize to ensure values stay within [-1.0, 1.0] range
    // Use 32768.0 (not 32767) to properly handle -32768 edge case
    // CRITICAL: Division by 32768.0 ensures exact mapping:
    // -32768 -> -1.0, 0 -> 0.0, 32767 -> ~0.999969
    const maxValue = 32768.0;
    let hasInvalidValues = false;
    let clippingCount = 0;
    
    for (let i = 0; i < pcm16Array.length; i++) {
      // PCM16 is signed 16-bit: range is -32768 to 32767
      // Convert to float32 range [-1.0, 1.0]
      let normalized = pcm16Array[i] / maxValue;
      
      // Check for clipping (values outside [-1.0, 1.0])
      // Note: Due to division by 32768, 32767 maps to ~0.999969, which is fine
      // Only -32768 maps exactly to -1.0, which is correct
      if (normalized < -1.0 || normalized > 1.0) {
        clippingCount++;
        // Clamp to [-1.0, 1.0] to prevent any clipping
        normalized = Math.max(-1.0, Math.min(1.0, normalized));
      }
      
      // Check for NaN or Infinity (shouldn't happen but validate)
      if (!isFinite(normalized)) {
        hasInvalidValues = true;
        normalized = 0; // Replace invalid values with silence
      }
      
      float32Array[i] = normalized;
    }
    
    if (hasInvalidValues) {
      console.warn('[AUDIO-DIAG] ⚠️ Invalid values (NaN/Infinity) detected in PCM16 conversion, replaced with silence');
    }
    
    if (clippingCount > 0) {
      console.warn(`[AUDIO-DIAG] ⚠️ Clipping detected in conversion: ${clippingCount} samples out of ${pcm16Array.length} (${(clippingCount/pcm16Array.length*100).toFixed(2)}%)`);
    }
    
    return float32Array;
  }, []);

  // Apply simple low-pass filter to reduce aliasing before resampling
  const applyAntiAliasingFilter = useCallback((data: Float32Array<ArrayBuffer>, sampleRate: number): Float32Array<ArrayBuffer> => {
    // Simple moving average filter for anti-aliasing
    // Cutoff frequency approximately 0.4 * Nyquist frequency (0.4 * sampleRate / 2)
    const filterSize = Math.max(2, Math.floor(sampleRate / 8000)); // Adaptive filter size
    const filtered = new Float32Array(data.length);
    
    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      let count = 0;
      const start = Math.max(0, i - Math.floor(filterSize / 2));
      const end = Math.min(data.length, i + Math.ceil(filterSize / 2));
      
      for (let j = start; j < end; j++) {
        sum += data[j];
        count++;
      }
      filtered[i] = sum / count;
    }
    
    return filtered;
  }, []);

  // Resample Float32Array from source sample rate to target sample rate using improved interpolation
  // This is used to resample ElevenLabs 16kHz audio to browser's native rate before playback
  // Eliminates browser-side resampling which can introduce artifacts
  const resampleFloat32 = useCallback((inputData: Float32Array<ArrayBuffer>, sourceSampleRate: number, targetSampleRate: number): Float32Array<ArrayBuffer> => {
    // Validate input data
    if (!inputData || inputData.length === 0) {
      throw new Error('Empty input data provided for resampling');
    }
    
    // Validate sample rates
    if (sourceSampleRate <= 0 || targetSampleRate <= 0) {
      throw new Error(`Invalid sample rate: source=${sourceSampleRate}, target=${targetSampleRate}`);
    }
    
    if (sourceSampleRate === targetSampleRate) {
      return inputData; // No resampling needed
    }

    // Apply anti-aliasing filter before upsampling to prevent high-frequency artifacts
    let filteredData = inputData;
    if (targetSampleRate > sourceSampleRate) {
      // Only apply anti-aliasing when upsampling (prevents aliasing artifacts)
      filteredData = applyAntiAliasingFilter(inputData, sourceSampleRate);
    }

    // CRITICAL: Calculate resampling ratio correctly
    // ratio = target / source means: for each input sample, we produce (target/source) output samples
    // Example: 16kHz -> 48kHz: ratio = 48/16 = 3.0 (3 output samples per 1 input sample)
    // This maintains the same playback speed (duration) but increases sample count
    const ratio = targetSampleRate / sourceSampleRate;
    const outputLength = Math.ceil(filteredData.length * ratio);
    const buffer = new ArrayBuffer(outputLength * 4); // 4 bytes per float32
    const output = new Float32Array(buffer);

    // Improved cubic interpolation for better quality (smoother than linear)
    // For each output sample, find the corresponding position in the source data
    for (let i = 0; i < outputLength; i++) {
      // Map output position to source position: sourcePos = outputPos / ratio
      // This ensures correct time mapping (e.g., output[3] maps to source[1] when ratio=3)
      const sourcePos = i / ratio;
      const sourceIndex = Math.floor(sourcePos);
      const fraction = sourcePos - sourceIndex;

      if (sourceIndex + 1 < filteredData.length) {
        // Cubic interpolation for smoother resampling (reduces artifacts)
        const p0 = sourceIndex > 0 ? filteredData[sourceIndex - 1] : filteredData[sourceIndex];
        const p1 = filteredData[sourceIndex];
        const p2 = filteredData[sourceIndex + 1];
        const p3 = sourceIndex + 2 < filteredData.length ? filteredData[sourceIndex + 2] : filteredData[sourceIndex + 1];
        
        // Cubic Hermite interpolation
        const t = fraction;
        const t2 = t * t;
        const t3 = t2 * t;
        
        const h1 = 2 * t3 - 3 * t2 + 1;
        const h2 = -2 * t3 + 3 * t2;
        const h3 = t3 - 2 * t2 + t;
        const h4 = t3 - t2;
        
        output[i] = h1 * p1 + h2 * p2 + h3 * (p2 - p0) * 0.5 + h4 * (p3 - p1) * 0.5;
      } else if (sourceIndex < filteredData.length) {
        // Last sample, no interpolation needed
        output[i] = filteredData[sourceIndex];
      } else {
        // Beyond source data, use last sample
        output[i] = filteredData[filteredData.length - 1];
      }
    }

    // Apply gentle smoothing to reduce high-frequency artifacts from resampling
    if (targetSampleRate > sourceSampleRate && output.length > 4) {
      const smoothed = new Float32Array(output.length);
      smoothed[0] = output[0];
      smoothed[output.length - 1] = output[output.length - 1];
      
      for (let i = 1; i < output.length - 1; i++) {
        // Simple 3-point moving average for smoothing
        smoothed[i] = (output[i - 1] + output[i] + output[i + 1]) / 3;
      }
      return smoothed;
    }

    return output;
  }, [applyAntiAliasingFilter]);
  
  // Export raw PCM16 data for external analysis (for debugging static issues)
  const exportPCM16ForAnalysis = useCallback((pcm16Array: Int16Array, chunkId: string) => {
    // Only export occasionally to avoid performance issues
    if (Math.random() < 0.01) {
      try {
        // Create a copy of the buffer to ensure it's an ArrayBuffer (not SharedArrayBuffer)
        const bufferCopy = pcm16Array.buffer.slice(
          pcm16Array.byteOffset,
          pcm16Array.byteOffset + pcm16Array.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([bufferCopy], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pcm16_${chunkId}_${Date.now()}.raw`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`[AUDIO-DIAG] Exported PCM16 data for analysis: ${chunkId}`);
      } catch (error) {
        console.error(`[AUDIO-DIAG] Failed to export PCM16 data:`, error);
      }
    }
  }, []);

  // Process audio queue with improved buffering and timing
  const processAudioQueue = useCallback(async () => {
    // Update watchdog timer - mark that processing is happening
    lastProcessTimeRef.current = Date.now();
    
    // Prevent concurrent processing with lock
    if (isProcessingQueueRef.current) {
      return;
    }
    
    // Don't process if user is speaking - they should have priority
    if (conversationState === 'user_speaking') {
      // Reduced logging - skip verbose logs
      return;
    }
    
    // Don't process if already playing or queue is empty
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
        setIsPlaying(false);
      }
      return;
    }
    
    // Check minimum buffer threshold before starting playback
    // Accumulate at least 0.5s of audio (16000 bytes at 16kHz) before first playback
    // This prevents buffer underrun and stuttering when large chunks arrive after delays
    const totalBufferedBytes = audioQueueRef.current.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    if (totalBufferedBytes < MIN_BUFFER_BEFORE_PLAYBACK && audioBufferAccumulatorRef.current < MIN_BUFFER_BEFORE_PLAYBACK) {
      audioBufferAccumulatorRef.current = totalBufferedBytes;
      console.log(`📦 Buffering audio: ${totalBufferedBytes} bytes (need ${MIN_BUFFER_BEFORE_PLAYBACK} for playback start, ~${(MIN_BUFFER_BEFORE_PLAYBACK / 32000).toFixed(1)}s)`);
      return; // Wait for more audio before starting playback
    }
    
    // Reset accumulator once we've started playing
    if (audioBufferAccumulatorRef.current < MIN_BUFFER_BEFORE_PLAYBACK) {
      audioBufferAccumulatorRef.current = MIN_BUFFER_BEFORE_PLAYBACK;
      console.log(`✅ Audio buffer ready: ${totalBufferedBytes} bytes (~${(totalBufferedBytes / 32000).toFixed(1)}s), starting playback`);
    }
    
    // Set processing lock
    isProcessingQueueRef.current = true;
    
    // Monitor queue health (reduced logging frequency)
    const queueSize = audioQueueRef.current.length;
    // Only log if queue is very large (>25 chunks) and log infrequently
    if (queueSize > 25 && Math.random() < 0.1) {
      console.warn('⚠️ Audio queue is large:', queueSize, 'chunks');
    }

    // Wrap entire function body in try-catch to prevent queue from stopping on any error
    try {
      // Initialize AudioContext with browser's native sample rate
      // CRITICAL: Use native rate to prevent browser-side resampling artifacts
      // Backend will resample to 16kHz before sending to ElevenLabs
      if (!audioContextRef.current) {
        try {
          // Create AudioContext with browser's native sample rate
          audioContextRef.current = new AudioContext({ sampleRate: NATIVE_SAMPLE_RATE });
          const actualSampleRate = audioContextRef.current.sampleRate;
          currentSampleRateRef.current = actualSampleRate; // Store actual rate
          
          console.log(`[AUDIO-DIAG] AudioContext Initialization:`, {
            requestedSampleRate: NATIVE_SAMPLE_RATE,
            actualSampleRate,
            sampleRateMatch: actualSampleRate === NATIVE_SAMPLE_RATE,
            willResample: actualSampleRate !== NATIVE_SAMPLE_RATE,
            state: audioContextRef.current.state,
            note: 'Backend will resample to 16kHz for ElevenLabs'
          });
          
          if (Math.abs(actualSampleRate - NATIVE_SAMPLE_RATE) > 0.1) {
            console.error(`[AUDIO-DIAG] ⚠️ CRITICAL: AudioContext sample rate mismatch!`, {
              requested: NATIVE_SAMPLE_RATE,
              actual: actualSampleRate,
              difference: Math.abs(actualSampleRate - NATIVE_SAMPLE_RATE),
              impact: 'Resampling will introduce artifacts and static'
            });
            console.warn(`[AUDIO-DIAG] Browser may not support ${NATIVE_SAMPLE_RATE}Hz AudioContext. Static may be caused by resampling.`);
          }
          
          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
            console.log(`[AUDIO-DIAG] AudioContext resumed from suspended state`);
          }
          
          // Create analyser node for output visualization (AI audio) if not exists
          if (!outputAnalyserRef.current) {
            const outputAnalyser = audioContextRef.current.createAnalyser();
            outputAnalyser.fftSize = 2048;
            outputAnalyser.smoothingTimeConstant = 0.8;
            outputAnalyserRef.current = outputAnalyser;
          }
          
          // Add initial buffer delay (100ms) - optimized for responsiveness
          const currentTime = audioContextRef.current.currentTime;
          nextPlayTimeRef.current = currentTime + 0.1;
          console.log(`[AUDIO-DIAG] Initial buffer delay set to 100ms`);
        } catch (error) {
          console.error('❌ Failed to create AudioContext:', error);
          console.error(`[AUDIO-DIAG] AudioContext creation failed:`, error);
          isProcessingQueueRef.current = false;
          throw error;
        }
      }

      const audioContext = audioContextRef.current;
      
      // Resume context if suspended (e.g., after an interruption)
      // This ensures audio can play immediately when new chunks arrive
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
          console.log('✅ AudioContext resumed from suspended state (ready for playback)');
        } catch (error) {
          console.error('❌ Failed to resume AudioContext:', error);
          isProcessingQueueRef.current = false;
          throw error;
        }
      }

      // Process chunks individually without accumulation for smoother playback
      // This prevents audio artifacts from concatenation
      const arrayBuffer = audioQueueRef.current.shift();
      if (!arrayBuffer) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        isProcessingQueueRef.current = false;
        return;
      }

      // Validate buffer size
      if (arrayBuffer.byteLength === 0) {
        // Reduced logging - only log occasionally
        if (Math.random() < 0.1) {
          console.warn('⚠️ Received empty audio buffer, skipping');
        }
        isProcessingQueueRef.current = false;
        // Process next chunk immediately (use requestAnimationFrame for better timing)
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }

      // Handle large chunks gracefully - calculate duration and schedule seamlessly
      // Large chunks (e.g., 76kb) arriving after delays should be scheduled at the end
      // of current playback time, not resetting the context
      const chunkSizeBytes = arrayBuffer.byteLength;
      const chunkDurationSeconds = chunkSizeBytes / (ELEVENLABS_SAMPLE_RATE * 2); // PCM16 = 2 bytes/sample
      if (chunkDurationSeconds > 2.0) {
        console.log(`📦 Large chunk received: ${chunkSizeBytes} bytes (~${chunkDurationSeconds.toFixed(2)}s). Will schedule seamlessly.`);
      }

      // Simple PCM16 processing pipeline
      // Backend is forced to send PCM16 16000Hz, so we just read Int16 Little Endian -> Float32 -> Play
      let float32Data: Float32Array<ArrayBuffer>;
      const sourceSampleRate = ELEVENLABS_SAMPLE_RATE; // 16000Hz for PCM16
      
      try {
        // Validate buffer size is multiple of 2 (PCM16 is 2 bytes per sample)
        if (arrayBuffer.byteLength % 2 !== 0) {
          console.error(`❌ Invalid buffer size ${arrayBuffer.byteLength} bytes (not multiple of 2). Skipping chunk.`);
          isProcessingQueueRef.current = false;
          if (audioQueueRef.current.length > 0) {
            requestAnimationFrame(() => processAudioQueue());
          }
          return;
        }
        
        // Read Int16 Little Endian using DataView
        const dataView = new DataView(arrayBuffer);
        const sampleCount = arrayBuffer.byteLength / 2;
        const pcm16Data = new Int16Array(sampleCount);
        
        for (let i = 0; i < sampleCount; i++) {
          pcm16Data[i] = dataView.getInt16(i * 2, true); // true = little-endian
        }
        
        // Convert PCM16 to Float32
        float32Data = convertPCM16ToFloat32(pcm16Data);
      } catch (error) {
        console.error('❌ Error processing audio data:', error);
        isProcessingQueueRef.current = false;
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      // Validate Float32 data
      if (!float32Data || float32Data.length === 0) {
        isProcessingQueueRef.current = false;
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      // Resample to AudioContext's native rate if needed
      const audioContextSampleRate = audioContext.sampleRate;
      let finalFloat32Data = float32Data;
      if (audioContextSampleRate !== sourceSampleRate) {
        finalFloat32Data = resampleFloat32(float32Data, sourceSampleRate, audioContextSampleRate);
      }
      
      // Validate buffer length
      if (finalFloat32Data.length === 0) {
        isProcessingQueueRef.current = false;
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      // Create AudioBuffer
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = audioContext.createBuffer(1, finalFloat32Data.length, audioContextSampleRate);
        audioBuffer.copyToChannel(finalFloat32Data, 0);
      } catch (error) {
        console.error('❌ Failed to create audio buffer:', error);
        isProcessingQueueRef.current = false;
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      // Ensure only one source plays at a time - stop any existing sources
      // This should rarely happen, but protects against race conditions
      if (activeSourcesRef.current.length > 0) {
        console.warn('⚠️ Multiple audio sources detected, stopping previous sources');
        const sourcesToStop = [...activeSourcesRef.current]; // Copy array before clearing
        activeSourcesRef.current = []; // Clear immediately to prevent onended callbacks from interfering
        sourcesToStop.forEach(existingSource => {
          try {
            // Remove onended callback to prevent interference
            existingSource.onended = null;
            existingSource.stop();
          } catch (e) {
            // Ignore errors - source may already be stopped
          }
          try {
            existingSource.disconnect();
          } catch (e) {
            // Ignore disconnect errors
          }
        });
        // Reset playing state since we stopped all sources
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
      
      // ===== AUDIO DATA PATH DIAGNOSTICS =====
      // Stage 5: Playback Setup
      let source: AudioBufferSourceNode;
      let gainNode: GainNode;
      
      try {
        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Use a gain node to prevent clipping and ensure smooth playback
        // CRITICAL: Gain should be <= 1.0 to avoid introducing distortion
        // Reduced to 0.65 to provide more headroom for high-amplitude audio from ElevenLabs
        // This helps prevent static/distortion from loud audio
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0.65; // Reduced from 0.75 to prevent clipping with very loud ElevenLabs audio
        
        // Ensure output analyser exists
        if (!outputAnalyserRef.current) {
          const outputAnalyser = audioContext.createAnalyser();
          outputAnalyser.fftSize = 2048;
          outputAnalyser.smoothingTimeConstant = 0.8;
          outputAnalyserRef.current = outputAnalyser;
        }
        
        // Connect source -> gain -> analyser -> destination for visualization
        source.connect(gainNode);
        gainNode.connect(outputAnalyserRef.current);
        outputAnalyserRef.current.connect(audioContext.destination);
      } catch (error) {
        console.error('❌ Failed to create audio source or gain node:', error);
        isProcessingQueueRef.current = false;
        // Try next chunk
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }

      // Calculate duration based on actual sample rate
      const duration = audioBuffer.duration;
      
      // Schedule playback with precise timing
      const currentTime = audioContext.currentTime;
      
      // Smooth playback scheduling: For large chunks arriving after delays, schedule seamlessly
      // at the end of current playback time instead of resetting the context
      // This prevents stuttering when huge chunks (e.g., 76kb) arrive after long delays
      
      // If nextPlayTime is in the past or very close, schedule from current time
      // Otherwise, schedule seamlessly at the end of the current playback queue
      if (nextPlayTimeRef.current < currentTime - 0.05) {
        // Playback has fallen behind by >50ms - reset to current time for seamless playback
        // This handles cases where large chunks arrive after delays without aggressive resets
        nextPlayTimeRef.current = currentTime + 0.01; // Small buffer to prevent scheduling in the past
      }
      
      // Schedule this chunk at the end of the current playback queue
      // This ensures seamless playback even when large chunks arrive
      const scheduledTime = Math.max(currentTime + 0.01, nextPlayTimeRef.current);
      
      // Add a small buffer (10ms) to prevent scheduling in the past and ensure smooth playback
      const safeStartTime = scheduledTime;
      
      try {
        source.start(safeStartTime);
      } catch (error) {
        console.error('❌ Failed to start audio source:', error);
        // Cleanup on failure
        try {
          source.disconnect();
          gainNode.disconnect();
        } catch (e) {
          // Ignore cleanup errors
        }
        isProcessingQueueRef.current = false;
        // Try next chunk
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      // Track active source for cleanup
      activeSourcesRef.current.push(source);
      
      // Update next play time for seamless playback
      nextPlayTimeRef.current = safeStartTime + duration;
      
      setIsPlaying(true);
      isPlayingRef.current = true;

      // Cleanup and continue when chunk ends
      // Wrap callback in try-catch to ensure next chunk always processes
      source.onended = () => {
        try {
          // Verify this source is still in activeSources (might have been stopped externally)
          const index = activeSourcesRef.current.indexOf(source);
          if (index === -1) {
            // Source was already removed (likely stopped externally), ignore this callback
            return;
          }
          
          // Remove from active sources
          activeSourcesRef.current.splice(index, 1);
          
          // Disconnect nodes with error handling
          try {
            source.stop();
          } catch (e) {
            // Ignore errors - source may already be stopped
          }
          try {
            source.disconnect();
            gainNode.disconnect();
          } catch (e) {
            // Ignore disconnect errors
          }
          
          // Release processing lock and playing state
          isPlayingRef.current = false;
          isProcessingQueueRef.current = false;
          
          // Process next chunk if available using requestAnimationFrame for better timing
          // CRITICAL: Always attempt to process next chunk, even if callback fails
          if (audioQueueRef.current.length > 0) {
            requestAnimationFrame(() => {
              // Ensure processing continues even if there's an error
              try {
                processAudioQueue();
              } catch (error) {
                console.error('❌ Error in processAudioQueue from onended callback:', error);
                // Reset processing lock to allow retry
                isProcessingQueueRef.current = false;
                // Retry after a short delay
                setTimeout(() => {
                  if (audioQueueRef.current.length > 0 && !isProcessingQueueRef.current) {
                    processAudioQueue();
                  }
                }, 100);
              }
            });
          } else {
            // Check if any other sources are still playing
            if (activeSourcesRef.current.length === 0) {
              // Reduced logging - only log state transitions
              setIsPlaying(false);
              isPlayingRef.current = false;
              nextPlayTimeRef.current = 0;
              
              // Transition to listening state when AI finishes speaking
              if (conversationState === 'ai_speaking') {
                setConversationStateWithLogging('listening', 'audio_queue_empty');
                setStatusMessage("Listening... Please speak your answer.");
              }
            }
          }
        } catch (error) {
          // Ensure processing continues even if callback fails
          console.error('❌ Error in source.onended callback:', error);
          isProcessingQueueRef.current = false;
          isPlayingRef.current = false;
          // Retry processing after error
          if (audioQueueRef.current.length > 0) {
            setTimeout(() => {
              if (!isProcessingQueueRef.current) {
                processAudioQueue();
              }
            }, 100);
          }
        }
      };
    } catch (error) {
      // Comprehensive error recovery - ensure queue processing continues
      console.error('❌ Error playing audio chunk:', error);
      console.error('❌ Error details:', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        queueLength: audioQueueRef.current.length,
        isPlaying: isPlayingRef.current,
        audioContextState: audioContextRef.current?.state
      });
      
      setIsPlaying(false);
      isPlayingRef.current = false;
      isProcessingQueueRef.current = false;
      
      // Clear active sources on error
      activeSourcesRef.current.forEach(source => {
        try {
          source.onended = null; // Prevent callbacks
          source.stop();
        } catch (e) {
          // Ignore errors - source may already be stopped
        }
        try {
          source.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      });
      activeSourcesRef.current = [];
      
      // Check audio context state and recover if suspended
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        console.warn('⚠️ AudioContext suspended, attempting to resume...');
        audioContextRef.current.resume().catch(resumeError => {
          console.error('❌ Failed to resume AudioContext:', resumeError);
        });
      }
      
      // Try next chunk - don't stop playback completely
      // Use setTimeout instead of requestAnimationFrame for error recovery to ensure it happens
      if (audioQueueRef.current.length > 0) {
        setTimeout(() => {
          if (!isProcessingQueueRef.current && audioQueueRef.current.length > 0) {
            processAudioQueue();
          }
        }, 50); // Small delay to allow error state to clear
      } else {
        // Log when queue processing stops unexpectedly
        console.warn('⚠️ Queue processing stopped - no more chunks available');
      }
    }
  }, [convertPCM16ToFloat32, conversationState, validateAudioContent, audioContextRef, setConversationStateWithLogging, setIsPlaying, setStatusMessage, resampleFloat32, analyzeForStatic, exportPCM16ForAnalysis]);

  // Queue audio chunk for playback with aggressive size limits and validation
  const queueAudioChunk = useCallback((arrayBuffer: ArrayBuffer) => {
    const MAX_QUEUE_SIZE = 30; // Reduced from 50 - more aggressive limit
    const WARN_QUEUE_SIZE = 20; // Warn when queue exceeds this
    
    // Buffer and validate chunk - ensures complete PCM frames
    const completeFrames = bufferAndValidateChunk(arrayBuffer);
    
    // If no complete frames yet (buffering), return early
    if (completeFrames.length === 0) {
      return; // Chunk is being buffered, will be processed when complete
    }
    
    // Process each complete frame
    for (const frame of completeFrames) {
      // Track audio chunk metrics
      const now = Date.now();
      audioChunkSizesRef.current.push(frame.byteLength);
      audioChunkReceiveTimesRef.current.push(now);
      
      // Keep only last 100 chunk timestamps for rate calculation
      if (audioChunkReceiveTimesRef.current.length > 100) {
        audioChunkReceiveTimesRef.current.shift();
        audioChunkSizesRef.current.shift();
      }
      
      // Add complete frame to queue
      audioQueueRef.current.push(frame);
    }
    
    // Calculate receive rate if we have enough data (after adding all frames)
    if (audioChunkReceiveTimesRef.current.length >= 10) {
      const now = Date.now();
      const timeSpan = now - audioChunkReceiveTimesRef.current[0];
      const chunkRate = (audioChunkReceiveTimesRef.current.length / timeSpan) * 1000; // chunks per second
      const avgChunkSize = audioChunkSizesRef.current.reduce((a, b) => a + b, 0) / audioChunkSizesRef.current.length;
      
      // Log metrics occasionally (16kHz PCM audio)
      if (Math.random() < 0.1) {
        console.log(`📊 Audio metrics (16kHz PCM): ${chunkRate.toFixed(2)} chunks/s, avg size: ${avgChunkSize.toFixed(0)} bytes, queue: ${audioQueueRef.current.length}`);
        // At 16kHz PCM16: 32000 bytes = 1 second, log if chunk size is unusual
        if (avgChunkSize > 64000) {
          console.warn(`⚠️ Large audio chunks detected: ${avgChunkSize.toFixed(0)} bytes avg (>2s at 16kHz)`);
        }
      }
    }
    
    // Aggressive queue management - drop old chunks when limit exceeded (check once after adding all frames)
    if (audioQueueRef.current.length >= MAX_QUEUE_SIZE) {
      // Keep only the most recent chunks (50% of max)
      const chunksToKeep = Math.floor(MAX_QUEUE_SIZE / 2);
      const dropped = audioQueueRef.current.length - chunksToKeep;
      audioQueueRef.current = audioQueueRef.current.slice(-chunksToKeep);
      console.warn('⚠️ Audio queue limit reached. Dropped', dropped, 'old chunks, kept', chunksToKeep);
    } else if (audioQueueRef.current.length >= WARN_QUEUE_SIZE) {
      // Warn but don't drop yet (only log occasionally to reduce noise)
      if (Math.random() < 0.3) {
        console.warn('⚠️ Audio queue is large:', audioQueueRef.current.length, 'chunks');
      }
    }
    
    // Try to process queue immediately (no setTimeout delay)
    processAudioQueue();
  }, [processAudioQueue, bufferAndValidateChunk]);

  // Pause sending audio chunks (but keep MediaRecorder running for continuous VAD)
  const pauseRecording = useCallback(() => {
    // MediaRecorder continues recording, but we stop sending chunks
    if (mediaRecorderRef.current) {
      const recordingState = (mediaRecorderRef.current as any).__recordingState;
      if (recordingState) {
        recordingState.isRecording = false;
      }
    }
    setIsRecording(false);
    // Don't change status message - microphone is still active, just paused sending
  }, []);

  // Resume sending audio chunks (MediaRecorder is already running)
  const resumeRecording = useCallback(() => {
    // MediaRecorder is already running, just resume sending chunks
    if (mediaRecorderRef.current) {
      const recordingState = (mediaRecorderRef.current as any).__recordingState;
      if (recordingState) {
        recordingState.isRecording = true;
      }
    }
    setIsRecording(true);
    setStatusMessage("Microphone active - speak naturally");
  }, []);

  // Stop recording completely (only used when ending interview)
  const stopRecording = useCallback(() => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      } catch (e) {
        console.error('Error stopping MediaRecorder:', e);
      }
    }
    
    // Stop all tracks (only when ending interview)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    setIsRecording(false);
  }, []);

  // Cleanup audio resources with memory leak prevention
  const cleanupAudio = useCallback(() => {
    // Stop all active sources and prevent callbacks
    activeSourcesRef.current.forEach(source => {
      try {
        source.onended = null; // Prevent callbacks
        source.stop();
      } catch (e) {
        // Ignore errors - source may already be stopped
      }
      try {
        source.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    });
    activeSourcesRef.current = [];
    
    // Clear audio queue
    audioQueueRef.current = [];
    audioBufferQueueRef.current = [];
    pendingAudioBufferRef.current = null; // Clear pending buffer
    audioBufferAccumulatorRef.current = 0; // Reset buffer accumulator
    isPlayingRef.current = false;
    setIsPlaying(false);
    isProcessingQueueRef.current = false;
    nextPlayTimeRef.current = 0;
    
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    stopRecording();
  }, [stopRecording]);

  // Periodic cleanup to prevent memory leaks
  // Watchdog timer to monitor queue processing health
  // RELAXED: Increased timeout to 3-5s to prevent aggressive resets that cause stuttering
  useEffect(() => {
    const WATCHDOG_CHECK_INTERVAL = 3000; // Check every 3 seconds (was 1 second)
    const WATCHDOG_TRIGGER_THRESHOLD = 3000; // Trigger if processing stopped for >3 seconds (was >0ms)
    
    const watchdogInterval = setInterval(() => {
      // Check if queue processing has stopped unexpectedly
      const timeSinceLastProcess = Date.now() - lastProcessTimeRef.current;
      const queueHasItems = audioQueueRef.current.length > 0;
      const shouldBeProcessing = queueHasItems && !isProcessingQueueRef.current && !isPlayingRef.current && conversationState !== 'user_speaking';
      
      // Only trigger if processing has stopped for >3 seconds (relaxed from immediate trigger)
      // This prevents aggressive resets that cause stuttering when large chunks arrive after delays
      if (shouldBeProcessing && timeSinceLastProcess > WATCHDOG_TRIGGER_THRESHOLD) {
        console.warn('⚠️ Queue processing watchdog: Processing stopped unexpectedly. Restarting...', {
          queueLength: audioQueueRef.current.length,
          timeSinceLastProcess: timeSinceLastProcess + 'ms',
          isProcessingQueue: isProcessingQueueRef.current,
          isPlaying: isPlayingRef.current,
          conversationState
        });
        // Reset processing lock and restart
        isProcessingQueueRef.current = false;
        lastProcessTimeRef.current = Date.now();
        // Use setTimeout to avoid calling processAudioQueue directly in dependency array
        setTimeout(() => {
          if (audioQueueRef.current.length > 0 && !isProcessingQueueRef.current) {
            processAudioQueue();
          }
        }, 0);
      }
    }, WATCHDOG_CHECK_INTERVAL); // Check every 3 seconds (relaxed from 1 second)
    
    return () => clearInterval(watchdogInterval);
  }, [conversationState]);

  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      // Monitor and cleanup if sources accumulate
      if (activeSourcesRef.current.length > 5) {
        console.warn('⚠️ Multiple audio sources detected, cleaning up:', activeSourcesRef.current.length);
        cleanupAudio();
      }
      
      // Monitor queue size - more aggressive limit
      if (audioQueueRef.current.length > 30) {
        console.warn('⚠️ Audio queue growing large, clearing old chunks:', audioQueueRef.current.length);
        audioQueueRef.current = audioQueueRef.current.slice(-15); // Keep only 15 most recent
      }
      
      // Monitor pending transcript timeout
      if (pendingTranscriptRef.current) {
        // If pending transcript exists for more than 5 seconds, complete it
        const age = Date.now() - (pendingTranscriptRef.current.timestamp || 0);
        if (age > 5000) {
          setTranscripts(prev => {
            const completed = {
              ...pendingTranscriptRef.current!,
              isFinal: true,
              timestamp: Date.now()
            };
            pendingTranscriptRef.current = null;
            if (pendingTranscriptTimeoutRef.current) {
              clearTimeout(pendingTranscriptTimeoutRef.current);
              pendingTranscriptTimeoutRef.current = null;
            }
            return [...prev, completed];
          });
        }
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(cleanupInterval);
  }, [cleanupAudio]);

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
        // CRITICAL: Set binaryType to 'arraybuffer' to receive raw binary PCM16 data
        // This ensures we get Int16Array directly, not Base64 strings or Blobs
        ws.binaryType = 'arraybuffer';
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
            // CRITICAL: Check if data is JSON BEFORE treating as binary audio
            // JSON messages can arrive as ArrayBuffer/Blob, so check content, not just type
            const isJSON = await isJSONData(event.data);
            
            if (isJSON) {
              // This is a JSON message (control message or audio_event with base64)
              // May contain multiple concatenated JSON objects (e.g., {"ping":1}{"audio":2})
              let textData: string;
              
              if (typeof event.data === 'string') {
                textData = event.data;
              } else {
                // Convert ArrayBuffer/Blob to text
                const buffer = event.data instanceof Blob 
                  ? await event.data.arrayBuffer() 
                  : event.data;
                textData = arrayBufferToText(buffer);
              }
              
              // Split concatenated JSON strings into individual objects
              const jsonObjects = splitConcatenatedJSON(textData);
              
              if (jsonObjects.length === 0) {
                console.warn('[AUDIO-DEBUG] No valid JSON objects found in:', textData.substring(0, 200));
                return;
              }
              
              // Process each JSON object individually
              for (const jsonString of jsonObjects) {
                try {
                  const message = JSON.parse(jsonString);
                  
                  // Handle audio messages with base64 audio payloads (audio_event or audio type)
                  if ((message.type === 'audio_event' && message.audio) || (message.type === 'audio' && (message.audio || message.audio_base_64 || message.audio_event?.audio_base_64 || message.audio_event?.audio))) {
                    console.log('[AUDIO-DEBUG] Received audio message, decoding base64...');
                    // Extract base64 audio from various possible locations
                    const base64Audio = message.audio || message.audio_base_64 || message.audio_event?.audio_base_64 || message.audio_event?.audio;
                    if (base64Audio) {
                      const audioBuffer = decodeBase64Audio(base64Audio);
                      // Queue the decoded audio for playback
                      queueAudioChunk(audioBuffer);
                    }
                  } else {
                    // Control message - handle via handleWebSocketMessage
                    handleWebSocketMessage(message);
                  }
                } catch (parseError) {
                  console.error('[AUDIO-DEBUG] Failed to parse JSON object:', parseError);
                  console.error('[AUDIO-DEBUG] JSON string:', jsonString.substring(0, 200));
                }
              }
              return; // Don't process as binary audio
            }
            
            // Not JSON - treat as binary audio data
            if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
              // Binary audio data from AI
              // CRITICAL: With binaryType='arraybuffer', we should receive ArrayBuffer directly
              // But handle Blob case for compatibility
              const arrayBuffer = event.data instanceof Blob 
                ? await event.data.arrayBuffer() 
                : event.data;
              
              // CRITICAL: Verify we have raw binary data, not Base64 string
              // ArrayBuffer.byteLength should match the actual data size
              if (!(arrayBuffer instanceof ArrayBuffer)) {
                console.error('[AUDIO-DIAG] ❌ CRITICAL: Received non-ArrayBuffer data:', typeof event.data);
                return;
              }
              
              // Hex dump logger: Check first 10 bytes to definitively identify format
              // MP3 files start with FF FB (ID3 header) or FF F3/F2 (MPEG frame sync)
              // PCM/ulaw data looks random
              if (arrayBuffer.byteLength >= 10) {
                const firstBytes = new Uint8Array(arrayBuffer.slice(0, 10));
                const hexDump = Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                console.log('[AUDIO-DEBUG] First 10 bytes:', hexDump, 
                  arrayBuffer.byteLength >= 2 && firstBytes[0] === 0xFF && (firstBytes[1] === 0xFB || firstBytes[1] === 0xF3 || firstBytes[1] === 0xF2) 
                    ? '← MP3 detected!' 
                    : arrayBuffer.byteLength >= 2 && firstBytes[0] === 0x7B
                    ? '← JSON detected (should have been caught earlier!)'
                    : '← PCM/ulaw (or other format)');
              }
              
              // Track chunk receive timing
              const now = Date.now();
              lastChunkReceiveTimeRef.current = now;
              
              // ===== AUDIO DATA PATH DIAGNOSTICS =====
              // Stage 1: WebSocket Reception
              const chunkId = `chunk_${now}_${Math.random().toString(36).substr(2, 9)}`;
              console.log(`[AUDIO-DIAG] Stage 1 - WebSocket Reception:`, {
                chunkId,
                size: arrayBuffer.byteLength,
                isMultipleOf2: arrayBuffer.byteLength % 2 === 0,
                expectedSamples: arrayBuffer.byteLength / 2,
                expectedDurationMs: (arrayBuffer.byteLength / 2 / ELEVENLABS_SAMPLE_RATE) * 1000,
                timeSinceLastChunk: lastChunkReceiveTimeRef.current ? now - lastChunkReceiveTimeRef.current : null
              });
              
              // Quick integrity check: sample first few bytes to detect obvious corruption
              if (arrayBuffer.byteLength >= 4) {
                const view = new DataView(arrayBuffer);
                const firstSample = view.getInt16(0, true); // little-endian
                const secondSample = view.getInt16(2, true);
                const sampleRange = Math.abs(firstSample) + Math.abs(secondSample);
                
                // Check for suspicious patterns (all zeros, all max, alternating pattern)
                const isSuspicious = (
                  (firstSample === 0 && secondSample === 0) ||
                  (Math.abs(firstSample) === 32767 && Math.abs(secondSample) === 32767) ||
                  (firstSample === secondSample && Math.abs(firstSample) > 10000)
                );
                
                if (isSuspicious && Math.random() < 0.1) {
                  console.warn(`[AUDIO-DIAG] Suspicious pattern detected in first samples:`, {
                    chunkId,
                    firstSample,
                    secondSample,
                    sampleRange
                  });
                }
              }
              
              // Log unusually large chunks (16kHz thresholds)
              // At 16kHz PCM16: 64000 bytes = 2 seconds
              if (arrayBuffer.byteLength > 64000) {
                console.warn(`⚠️ Unusually large audio chunk: ${arrayBuffer.byteLength} bytes (>2 seconds at 16kHz)`);
              }
              
              // Validate chunk before queuing (will be buffered if incomplete)
              if (arrayBuffer.byteLength % 2 !== 0) {
                console.warn(`⚠️ Invalid chunk size before queuing: ${arrayBuffer.byteLength} bytes (not multiple of 2). Will be buffered.`);
              }
              
              // Store chunk ID for tracking through pipeline
              (arrayBuffer as any).__chunkId = chunkId;
              
              // Queue audio chunk for sequential playback (buffering happens inside)
              queueAudioChunk(arrayBuffer);
            } else if (typeof event.data === 'string') {
              // Text message (should have been caught by JSON check, but handle as fallback)
              // This is a fallback for edge cases where string data wasn't detected as JSON
              try {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
              } catch (parseError) {
                console.error('[AUDIO-DEBUG] Failed to parse text message as JSON:', parseError);
                console.error('[AUDIO-DEBUG] Raw text:', event.data.substring(0, 200));
              }
            } else {
              // Unknown data type
              console.warn('[AUDIO-DEBUG] Received unknown data type:', typeof event.data, event.data);
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
      
      // Clear interview start timeout
      if (interviewStartTimeoutRef.current) {
        clearTimeout(interviewStartTimeoutRef.current);
        interviewStartTimeoutRef.current = null;
      }
      
      // Clear state timeout
      if (stateTimeoutRef.current) {
        clearTimeout(stateTimeoutRef.current);
        stateTimeoutRef.current = null;
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

  // Start continuous microphone recording using MediaRecorder (Full Duplex)
  const startRecording = useCallback(async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: NATIVE_SAMPLE_RATE,
          channelCount: 1,
        }
      });

      mediaStreamRef.current = stream;

      // Create AudioContext for visualization (analyser node)
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: NATIVE_SAMPLE_RATE });
        currentSampleRateRef.current = audioContextRef.current.sampleRate;
        console.log(`[AUDIO] AudioContext created with sample rate: ${currentSampleRateRef.current}Hz`);
      } else {
        currentSampleRateRef.current = audioContextRef.current.sampleRate;
        console.log(`[AUDIO] Using existing AudioContext with sample rate: ${currentSampleRateRef.current}Hz`);
      }

      const audioContext = audioContextRef.current;
      const source = audioContext.createMediaStreamSource(stream);
      
      // Create analyser node for input visualization
      const inputAnalyser = audioContext.createAnalyser();
      inputAnalyser.fftSize = 2048;
      inputAnalyser.smoothingTimeConstant = 0.8;
      inputAnalyserRef.current = inputAnalyser;
      source.connect(inputAnalyser);
      inputAnalyser.connect(audioContext.destination);

      // Create MediaRecorder for continuous streaming
      // Use WebM Opus codec for better compatibility and smaller file sizes
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 64000
      };

      // Fallback to default if WebM Opus not supported
      let mediaRecorder: MediaRecorder;
      if (MediaRecorder.isTypeSupported(options.mimeType)) {
        mediaRecorder = new MediaRecorder(stream, options);
      } else {
        console.warn('WebM Opus not supported, using default codec');
        mediaRecorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = mediaRecorder;

      // Handle data availability - send chunks immediately as binary
      const recordingStateRef = { isRecording: true };
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          // Only send if WebSocket is open and we're in active recording state
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && recordingStateRef.isRecording) {
            // Send blob directly as binary - backend handles binary audio
            wsRef.current.send(event.data);
            console.log(`📤 Sent audio chunk: ${event.data.size} bytes (binary)`);
          }
        }
      };
      
      // Store recording state ref for pause/resume control
      (mediaRecorderRef.current as any).__recordingState = recordingStateRef;

      // Handle errors
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        toast({
          title: "Recording Error",
          description: "An error occurred while recording audio.",
          variant: "destructive",
        });
      };

      // Start recording with 250ms timeslice for continuous streaming
      // This sends chunks every 250ms automatically
      mediaRecorder.start(250);
      console.log('🎤 MediaRecorder started with 250ms timeslice - continuous streaming enabled');

      setIsRecording(true);
      setStatusMessage("Microphone active - speak naturally");

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
  }, [toast]);

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

  // Auto-resume sending audio chunks when AI finishes speaking
  // Note: Microphone stream stays open continuously for VAD
  useEffect(() => {
    if (!isPlaying && isInterviewActive && !isRecording && !isProcessing && mediaStreamRef.current) {
      // Small delay before resuming to send chunks
      const timer = setTimeout(() => {
        if (!isPlayingRef.current && mediaStreamRef.current) {
          resumeRecording();
        }
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [isPlaying, isInterviewActive, isRecording, isProcessing, resumeRecording]);

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

            {/* Status Indicator - Clear visual feedback for each state */}
            <div className="text-center mb-6">
              {!isConnected ? (
                <div className="flex items-center justify-center gap-2 text-yellow-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">{statusMessage}</span>
                </div>
              ) : conversationState === 'ai_speaking' || isPlaying ? (
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <AISpeakingIndicator size="md" />
                  <span className="font-medium text-lg">🤖 AI is speaking...</span>
                </div>
              ) : conversationState === 'user_speaking' ? (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <User className="w-5 h-5 animate-pulse" />
                  <span className="font-medium text-lg">🎤 You are speaking...</span>
                </div>
              ) : conversationState === 'processing' ? (
                <div className="flex items-center justify-center gap-2 text-purple-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium text-lg">⚙️ Processing your response...</span>
                </div>
              ) : conversationState === 'listening' ? (
                <div className="flex items-center justify-center gap-2 text-amber-600">
                  <Headphones className="w-5 h-5" />
                  <span className="font-medium text-lg">👂 Listening... Speak when ready</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <div className="w-3 h-3 bg-muted-foreground rounded-full" />
                  <span className="font-medium">{statusMessage}</span>
                </div>
              )}
            </div>

            {/* Audio Visualizer */}
            <div className="mb-6 flex justify-center">
              <AudioVisualizer
                inputAnalyser={inputAnalyserRef.current}
                outputAnalyser={outputAnalyserRef.current}
                mode={conversationState}
                width={600}
                height={120}
                barCount={60}
              />
            </div>

            {/* Microphone Status Indicator - Clear visual feedback */}
            {/* Note: Microphone is always on for continuous VAD - automatic, no manual controls */}
            <div className="flex flex-col items-center justify-center mb-6">
              <div
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all shadow-2xl cursor-default ${
                  conversationState === 'ai_speaking' || isPlaying
                    ? "bg-blue-500 text-white animate-pulse shadow-blue-500/50"
                    : conversationState === 'user_speaking'
                    ? "bg-green-500 text-white animate-pulse shadow-green-500/50"
                    : conversationState === 'processing'
                    ? "bg-purple-500 text-white shadow-purple-500/50"
                    : conversationState === 'listening'
                    ? "bg-amber-500 text-white shadow-amber-500/50"
                    : !isConnected || !isInterviewActive
                    ? "bg-muted text-muted-foreground opacity-50"
                    : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
                }`}
                title={
                  conversationState === 'ai_speaking'
                    ? "AI is speaking - microphone active (VAD listening)"
                    : conversationState === 'user_speaking'
                    ? "You are speaking - microphone active"
                    : conversationState === 'listening'
                    ? "Listening - microphone ready, speak when ready"
                    : conversationState === 'processing'
                    ? "Processing your response..."
                    : "Microphone ready"
                }
              >
                {conversationState === 'ai_speaking' || isPlaying ? (
                  <Volume2 className="w-16 h-16" />
                ) : conversationState === 'user_speaking' ? (
                  <Mic className="w-16 h-16 animate-pulse" />
                ) : conversationState === 'processing' ? (
                  <Loader2 className="w-16 h-16 animate-spin" />
                ) : (
                  <Headphones className="w-16 h-16" />
                )}
              </div>
              <p className={`text-xs mt-2 text-center max-w-xs font-medium ${
                conversationState === 'ai_speaking'
                  ? "text-blue-600"
                  : conversationState === 'user_speaking'
                  ? "text-green-600"
                  : conversationState === 'processing'
                  ? "text-purple-600"
                  : conversationState === 'listening'
                  ? "text-amber-600"
                  : "text-muted-foreground"
              }`}>
                {conversationState === 'ai_speaking'
                  ? "AI is speaking - microphone listening"
                  : conversationState === 'user_speaking'
                  ? "You are speaking - microphone active"
                  : conversationState === 'processing'
                  ? "Processing your response..."
                  : conversationState === 'listening'
                  ? "Listening - speak naturally"
                  : "Microphone is always active"}
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

