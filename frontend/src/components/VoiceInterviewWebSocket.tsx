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
  const audioChunksRef = useRef<Float32Array[]>([]);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const isProcessingQueueRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const audioBufferQueueRef = useRef<Float32Array[]>([]);
  const isConnectingRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const isMountedRef = useRef(true);
  const candidateContextRef = useRef(candidateContext);
  const interviewStartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingTranscriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
  const MIN_BUFFER_BEFORE_PLAYBACK = 3200; // 100ms at 16kHz (16000 samples/s * 0.1s * 2 bytes)
  
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

  // Handle WebSocket messages (defined before useEffect to avoid hoisting issues)
  const handleWebSocketMessage = useCallback((message: any) => {
    // Reduced logging - only log important message types
    if (['error', 'interview_started', 'student_speech_started'].includes(message.type)) {
      console.log('Received message:', message.type);
    }

    switch (message.type) {
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
        
        setConversationStateWithLogging('user_speaking', 'student_speech_started');
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
        
        // Reset playback state
        isPlayingRef.current = false;
        setIsPlaying(false);
        nextPlayTimeRef.current = 0;
        
        // Stop recording if it was active (shouldn't be, but safety check)
        if (isRecording) {
          stopRecording();
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
      default:
        // Log all unknown message types for testing (removed throttling)
        console.log('⚠️ Unknown message type:', message.type, 'Full message:', message);
    }
  }, [toast]);

  // Check if chunk is silence/keepalive packet
  // Note: Size check is now done earlier in bufferAndValidateChunk for performance
  const isSilencePacket = useCallback((arrayBuffer: ArrayBuffer): boolean => {
    // This function now only checks audio content, not size (size check happens earlier)
    // Chunks < 200 bytes are already filtered out before this function is called
    
    // Check if audio content is silence (all zeros or very low amplitude)
    try {
      const pcm16Data = new Int16Array(arrayBuffer);
      if (pcm16Data.length === 0) {
        return true;
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
    // Check size first (fastest check) before doing expensive PCM16 analysis
    const isVerySmallChunk = arrayBuffer.byteLength < 200;
    
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
      // This catches cases where multiple small chunks combine to pass the initial check
      if (combinedBuffer.length < 200) {
        // Combined buffer is still too small - likely accumulated keepalive packets
        // Clear it and skip this chunk entirely
        if (Math.random() < 0.01) {
          console.log(`🔇 Skipping accumulated small packets: ${combinedBuffer.length} bytes (from ${pending.length} + ${newData.length})`);
        }
        return []; // Don't process accumulated small chunks
      }
    } else {
      combinedBuffer = new Uint8Array(arrayBuffer);
      
      // Check incoming chunk size (only if no pending buffer)
      if (isVerySmallChunk) {
        // Very small chunks are almost certainly keepalive/silence packets
        // Only log occasionally to reduce noise
        if (Math.random() < 0.01) {
          console.log(`🔇 Skipping very small packet: ${arrayBuffer.byteLength} bytes`);
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
    // Only warn if chunk is suspiciously small but passed silence check (shouldn't happen often)
    if (combinedBuffer.length < MIN_CHUNK_SIZE && combinedBuffer.length >= 200) {
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
    
    // Static detection heuristics:
    // 1. High zero-crossing rate with low RMS (white noise pattern)
    // 2. Very high peak-to-peak range relative to RMS (clipping/distortion)
    // 3. High-frequency noise patterns
    const hasStatic = (
      (zeroCrossingRate > 0.3 && rms < 1000) || // High zero-crossings with low energy = noise
      (peakToPeak > 30000 && rms < 5000) || // Large dynamic range with low RMS = distortion
      (highFreqNoise > pcm16Array.length / 200) // Excessive high-frequency content
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

  // Resample Float32Array from source sample rate to target sample rate using linear interpolation
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

    const ratio = targetSampleRate / sourceSampleRate;
    const outputLength = Math.ceil(inputData.length * ratio);
    const buffer = new ArrayBuffer(outputLength * 4); // 4 bytes per float32
    const output = new Float32Array(buffer);

    // Linear interpolation resampling
    for (let i = 0; i < outputLength; i++) {
      const sourcePos = i / ratio;
      const sourceIndex = Math.floor(sourcePos);
      const fraction = sourcePos - sourceIndex;

      if (sourceIndex + 1 < inputData.length) {
        // Linear interpolation between two samples
        const sample1 = inputData[sourceIndex];
        const sample2 = inputData[sourceIndex + 1];
        output[i] = sample1 + (sample2 - sample1) * fraction;
      } else if (sourceIndex < inputData.length) {
        // Last sample, no interpolation needed
        output[i] = inputData[sourceIndex];
      } else {
        // Beyond source data, use last sample
        output[i] = inputData[inputData.length - 1];
      }
    }

    return output;
  }, []);
  
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
    // Accumulate at least 100ms of audio (3200 bytes at 16kHz) before first playback
    const totalBufferedBytes = audioQueueRef.current.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    if (totalBufferedBytes < MIN_BUFFER_BEFORE_PLAYBACK && audioBufferAccumulatorRef.current < MIN_BUFFER_BEFORE_PLAYBACK) {
      audioBufferAccumulatorRef.current = totalBufferedBytes;
      console.log(`📦 Buffering audio: ${totalBufferedBytes} bytes (need ${MIN_BUFFER_BEFORE_PLAYBACK} for playback start)`);
      return; // Wait for more audio before starting playback
    }
    
    // Reset accumulator once we've started playing
    if (audioBufferAccumulatorRef.current < MIN_BUFFER_BEFORE_PLAYBACK) {
      audioBufferAccumulatorRef.current = MIN_BUFFER_BEFORE_PLAYBACK;
      console.log(`✅ Audio buffer ready: ${totalBufferedBytes} bytes, starting playback`);
    }
    
    // Set processing lock
    isProcessingQueueRef.current = true;
    
    // Monitor queue health (reduced logging frequency)
    const queueSize = audioQueueRef.current.length;
    // Only log if queue is very large (>25 chunks) and log infrequently
    if (queueSize > 25 && Math.random() < 0.1) {
      console.warn('⚠️ Audio queue is large:', queueSize, 'chunks');
    }

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
      
      // Resume context if suspended
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
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

      // Validate buffer size is reasonable (not too large)
      // PCM16 is 2 bytes per sample, so 64000 bytes = 32000 samples = 2 seconds at 16kHz
      const maxBufferSize = 64000; // 2 seconds at 16kHz (32000 samples * 2 bytes)
      if (arrayBuffer.byteLength > maxBufferSize) {
        console.warn('⚠️ Received unusually large audio buffer:', arrayBuffer.byteLength, 'bytes. Processing anyway.');
      }

      // Validate buffer size is multiple of 2 before creating Int16Array
      if (arrayBuffer.byteLength % 2 !== 0) {
        console.error(`❌ RangeError prevented: Invalid buffer size ${arrayBuffer.byteLength} bytes (not multiple of 2). Skipping chunk.`);
        isProcessingQueueRef.current = false;
        // Try next chunk
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }

      // ===== AUDIO DATA PATH DIAGNOSTICS =====
      // Stage 2: Buffer Processing
      const chunkId = (arrayBuffer as any).__chunkId || 'unknown';
      
      // Create Int16Array with error handling
      let pcm16Data: Int16Array;
      try {
        pcm16Data = new Int16Array(arrayBuffer);
        
        console.log(`[AUDIO-DIAG] Stage 2 - PCM16 Array Creation:`, {
          chunkId,
          bufferSize: arrayBuffer.byteLength,
          sampleCount: pcm16Data.length,
          expectedSamples: arrayBuffer.byteLength / 2,
          matches: pcm16Data.length === arrayBuffer.byteLength / 2
        });
      } catch (error) {
        console.error('❌ RangeError creating Int16Array:', error);
        console.error(`   Buffer size: ${arrayBuffer.byteLength} bytes`);
        console.error(`   Buffer size % 2: ${arrayBuffer.byteLength % 2}`);
        isProcessingQueueRef.current = false;
        // Try next chunk - don't stop playback
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      // Validate sample count
      if (pcm16Data.length === 0) {
        console.warn(`[AUDIO-DIAG] Empty PCM16 data:`, { chunkId });
        isProcessingQueueRef.current = false;
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }

      // ===== STATIC DETECTION: Analyze PCM16 data for noise patterns =====
      const staticAnalysis = analyzeForStatic(pcm16Data);
      if (staticAnalysis.hasStatic) {
        console.warn(`[AUDIO-DIAG] ⚠️ STATIC DETECTED in PCM16 data:`, {
          chunkId,
          reason: staticAnalysis.reason,
          noiseLevel: staticAnalysis.noiseLevel,
          sampleRange: staticAnalysis.sampleRange,
          zeroCrossings: staticAnalysis.zeroCrossings
        });
        
        // Export raw PCM16 data for external analysis if static is detected
        exportPCM16ForAnalysis(pcm16Data, chunkId);
      }

      // Validate audio content quality
      const validation = validateAudioContent(pcm16Data);
      if (!validation.valid) {
        console.log(`🔇 Skipping invalid audio chunk: ${validation.reason} (${pcm16Data.length} samples)`);
        isProcessingQueueRef.current = false;
        // Try next chunk - skip corrupted/silent chunks
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      // Log PCM16 sample range for debugging
      const minSample = Math.min(...Array.from(pcm16Data));
      const maxSample = Math.max(...Array.from(pcm16Data));
      const avgSample = Array.from(pcm16Data).reduce((a, b) => a + Math.abs(b), 0) / pcm16Data.length;
      
      // ===== CLIPPING PREVENTION: Normalize high-amplitude audio =====
      // If max amplitude is too high (>30000), normalize to prevent clipping
      const MAX_SAFE_AMPLITUDE = 30000; // Leave headroom below 32767
      let normalizedPcm16Data = pcm16Data;
      let normalizationApplied = false;
      let normalizationFactor = 1.0;
      
      if (Math.abs(maxSample) > MAX_SAFE_AMPLITUDE || Math.abs(minSample) > MAX_SAFE_AMPLITUDE) {
        // Calculate normalization factor to bring max amplitude to safe level
        const peakAmplitude = Math.max(Math.abs(maxSample), Math.abs(minSample));
        normalizationFactor = MAX_SAFE_AMPLITUDE / peakAmplitude;
        
        console.warn(`[AUDIO-DIAG] ⚠️ HIGH AMPLITUDE DETECTED: ${peakAmplitude} (max safe: ${MAX_SAFE_AMPLITUDE})`);
        console.warn(`[AUDIO-DIAG] Applying normalization factor: ${normalizationFactor.toFixed(4)} to prevent clipping`);
        
        // Create normalized copy
        normalizedPcm16Data = new Int16Array(pcm16Data.length);
        for (let i = 0; i < pcm16Data.length; i++) {
          normalizedPcm16Data[i] = Math.round(pcm16Data[i] * normalizationFactor);
        }
        normalizationApplied = true;
        
        const normalizedMax = Math.max(...Array.from(normalizedPcm16Data));
        const normalizedMin = Math.min(...Array.from(normalizedPcm16Data));
        console.log(`[AUDIO-DIAG] After normalization: max=${normalizedMax}, min=${normalizedMin}`);
      }
      
      console.log(`[AUDIO-DIAG] Stage 2 - PCM16 Analysis:`, {
        chunkId,
        sampleCount: pcm16Data.length,
        minSample,
        maxSample,
        avgAmplitude: avgSample.toFixed(2),
        range: maxSample - minSample,
        durationMs: (pcm16Data.length / ELEVENLABS_SAMPLE_RATE) * 1000,
        normalizationApplied,
        normalizationFactor: normalizationApplied ? normalizationFactor.toFixed(4) : 1.0,
        peakAmplitude: Math.max(Math.abs(maxSample), Math.abs(minSample))
      });

      // ===== AUDIO DATA PATH DIAGNOSTICS =====
      // Stage 3: PCM16 to Float32 Conversion
      // Use normalized data if normalization was applied
      let float32Data: Float32Array<ArrayBuffer>;
      try {
        float32Data = convertPCM16ToFloat32(normalizedPcm16Data);
        
        // Verify conversion correctness
        const float32Min = Math.min(...Array.from(float32Data));
        const float32Max = Math.max(...Array.from(float32Data));
        const float32Avg = Array.from(float32Data).reduce((a, b) => a + Math.abs(b), 0) / float32Data.length;
        const outOfRange = Array.from(float32Data).filter(v => v < -1.0 || v > 1.0).length;
        
        console.log(`[AUDIO-DIAG] Stage 3 - Float32 Conversion:`, {
          chunkId,
          sampleCount: float32Data.length,
          matchesPCM16: float32Data.length === pcm16Data.length,
          minValue: float32Min.toFixed(6),
          maxValue: float32Max.toFixed(6),
          avgAmplitude: float32Avg.toFixed(6),
          outOfRangeSamples: outOfRange,
          hasClipping: outOfRange > 0
        });
        
        if (outOfRange > 0) {
          console.warn(`[AUDIO-DIAG] ⚠️ CLIPPING DETECTED: ${outOfRange} samples out of [-1.0, 1.0] range`);
        }
      } catch (error) {
        console.error('❌ Error converting PCM16 to Float32:', error);
        console.error(`   Chunk size: ${arrayBuffer.byteLength} bytes`);
        console.error(`   Sample count: ${pcm16Data.length}`);
        isProcessingQueueRef.current = false;
        // Try next chunk - skip corrupted chunk
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      // Validate buffer size before creating
      if (float32Data.length === 0) {
        console.warn(`[AUDIO-DIAG] Empty float32 data:`, { chunkId });
        isProcessingQueueRef.current = false;
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      // ===== AUDIO DATA PATH DIAGNOSTICS =====
      // Stage 4: Resample to AudioContext's native rate (eliminates browser-side resampling)
      // ElevenLabs sends 16kHz audio, but AudioContext is at NATIVE_SAMPLE_RATE
      // Resample on frontend to avoid browser-side resampling artifacts
      const sourceSampleRate = ELEVENLABS_SAMPLE_RATE; // ElevenLabs sends 16kHz
      const audioContextSampleRate = audioContext.sampleRate;
      const needsResampling = audioContextSampleRate !== sourceSampleRate;
      
      // Resample Float32 data to match AudioContext's native sample rate
      let resampledFloat32Data = float32Data;
      if (needsResampling) {
        console.log(`[AUDIO-DIAG] Resampling audio from ${sourceSampleRate}Hz to ${audioContextSampleRate}Hz to match AudioContext`);
        const startTime = Date.now();
        resampledFloat32Data = resampleFloat32(float32Data, sourceSampleRate, audioContextSampleRate);
        const resampleTime = Date.now() - startTime;
        console.log(`[AUDIO-DIAG] Resampling complete: ${float32Data.length} samples → ${resampledFloat32Data.length} samples (${resampleTime}ms)`);
      }
      
      // Validate buffer size is reasonable (max 10 seconds at target rate)
      const maxSamples = audioContextSampleRate * 10;
      let finalFloat32Data = resampledFloat32Data;
      if (finalFloat32Data.length > maxSamples) {
        console.warn('⚠️ Audio buffer unusually large:', finalFloat32Data.length, 'samples (', (finalFloat32Data.length / audioContextSampleRate).toFixed(2), 'seconds). Truncating to', maxSamples, 'samples.');
        finalFloat32Data = finalFloat32Data.slice(0, maxSamples);
      }
      
      // Validate buffer length before creating AudioBuffer
      if (finalFloat32Data.length === 0) {
        console.warn(`[AUDIO-DIAG] Empty float32 data after resampling:`, { chunkId });
        isProcessingQueueRef.current = false;
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      let audioBuffer: AudioBuffer;
      try {
        // Create AudioBuffer at AudioContext's native sample rate (no browser resampling needed)
        audioBuffer = audioContext.createBuffer(1, finalFloat32Data.length, audioContextSampleRate);
        audioBuffer.copyToChannel(finalFloat32Data, 0);
        
        console.log(`[AUDIO-DIAG] Stage 4 - AudioBuffer Creation:`, {
          chunkId,
          bufferSampleRate: audioBuffer.sampleRate,
          audioContextSampleRate,
          sourceSampleRate,
          resampled: needsResampling,
          bufferLength: audioBuffer.length,
          bufferDuration: audioBuffer.duration.toFixed(3) + 's',
          numberOfChannels: audioBuffer.numberOfChannels,
          matchesFloat32: audioBuffer.length === finalFloat32Data.length,
          note: needsResampling ? 'Resampled on frontend - no browser resampling' : 'No resampling needed'
        });
      } catch (error) {
        console.error('❌ Failed to create audio buffer:', error);
        console.error(`[AUDIO-DIAG] Buffer creation failed:`, {
          chunkId,
          float32Length: finalFloat32Data.length,
          sourceSampleRate,
          audioContextSampleRate
        });
        isProcessingQueueRef.current = false;
        // Try next chunk
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
        // Reduced further to 0.75 to provide more headroom for high-amplitude audio
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0.75; // Reduced from 0.85 to prevent clipping with high-amplitude audio
        
        console.log(`[AUDIO-DIAG] Stage 5 - Playback Setup:`, {
          chunkId,
          gainValue: gainNode.gain.value,
          bufferSampleRate: audioBuffer.sampleRate,
          audioContextSampleRate: audioContext.sampleRate,
          bufferDuration: audioBuffer.duration.toFixed(3) + 's',
          playbackRate: source.playbackRate.value
        });
        
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
      } catch (error) {
        console.error('❌ Failed to create audio source or gain node:', error);
        console.error(`[AUDIO-DIAG] Playback setup failed:`, {
          chunkId,
          error
        });
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
      
      // Handle timing drift: if nextPlayTime is significantly behind (>50ms), reset it aggressively
      // Increased threshold from 20ms to 50ms to reduce false positives from normal timing variations
      const timeDrift = currentTime - nextPlayTimeRef.current;
      if (timeDrift > 0.05) {
        // If drift is significant (>50ms), reset scheduling and drop old chunks
        const driftMs = timeDrift * 1000;
        if (driftMs > 100) {
          // Severe drift (>100ms) - drop old chunks to catch up
          const chunksToDrop = Math.min(Math.floor(driftMs / 50), audioQueueRef.current.length);
          if (chunksToDrop > 0) {
            audioQueueRef.current.splice(0, chunksToDrop);
            console.warn('⏱️ Severe timing drift:', driftMs.toFixed(0), 'ms. Dropped', chunksToDrop, 'old chunks.');
          }
        } else {
          // Only log timing drift warnings occasionally to reduce noise
          if (Math.random() < 0.2) {
            console.warn('⏱️ Timing drift detected:', driftMs.toFixed(0), 'ms. Resetting schedule.');
          }
        }
        nextPlayTimeRef.current = currentTime + 0.01; // Small buffer for reset
      }
      
      const scheduledTime = Math.max(currentTime, nextPlayTimeRef.current);
      
      // Add a small buffer (10ms) to prevent scheduling in the past and ensure smooth playback
      const safeStartTime = Math.max(currentTime + 0.01, scheduledTime);
      
      try {
        source.start(safeStartTime);
        
        console.log(`[AUDIO-DIAG] Stage 6 - Playback Started:`, {
          chunkId,
          scheduledTime: safeStartTime.toFixed(3),
          currentTime: currentTime.toFixed(3),
          delay: (safeStartTime - currentTime).toFixed(3) + 's',
          duration: duration.toFixed(3) + 's',
          nextPlayTime: nextPlayTimeRef.current.toFixed(3)
        });
      } catch (error) {
        console.error('❌ Failed to start audio source:', error);
        console.error(`[AUDIO-DIAG] Playback start failed:`, {
          chunkId,
          error,
          scheduledTime: safeStartTime,
          currentTime
        });
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
      source.onended = () => {
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
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
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
      };
    } catch (error) {
      console.error('❌ Error playing audio chunk:', error);
      setIsPlaying(false);
      isPlayingRef.current = false;
      isProcessingQueueRef.current = false;
      
      // Clear active sources on error
      activeSourcesRef.current.forEach(source => {
        try {
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
      
      // Try next chunk if available using requestAnimationFrame
      if (audioQueueRef.current.length > 0) {
        requestAnimationFrame(() => processAudioQueue());
      }
    }
  }, [convertPCM16ToFloat32, conversationState, validateAudioContent]);

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

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaStreamRef.current) {
      // Update recording state ref
      const recordingState = (mediaStreamRef.current as any).__recordingState;
      if (recordingState) {
        recordingState.isRecording = false;
      }
      
      // Stop AudioWorkletNode if used
      const workletNode = (mediaStreamRef.current as any).__workletNode;
      if (workletNode) {
        try {
          workletNode.port.postMessage('stop');
          workletNode.disconnect();
        } catch (e) {
          // Ignore errors
        }
      }
      
      // Stop all tracks
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      
      // Disconnect processor if exists (ScriptProcessorNode fallback)
      const processor = (mediaStreamRef.current as any).__processor;
      if (processor && !workletNode) {
        const source = (mediaStreamRef.current as any).__source;
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
            } else {
              // JSON message
              const rawData = event.data.toString();
              // Reduced logging - only log important messages in development
              if (import.meta.env.DEV && Math.random() < 0.05) {
                console.log('📨 Received WebSocket message:', rawData.substring(0, 100));
              }
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

  // Start recording microphone using AudioWorkletNode (replaces deprecated ScriptProcessorNode)
  const startRecording = useCallback(async () => {
    try {
      // Request microphone access with native sample rate
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: NATIVE_SAMPLE_RATE,
          channelCount: 1,
        }
      });

      mediaStreamRef.current = stream;

      // Create AudioContext for processing raw audio with native sample rate
      // Note: AudioContext is shared between playback and recording to ensure consistency
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: NATIVE_SAMPLE_RATE });
        currentSampleRateRef.current = audioContextRef.current.sampleRate; // Store actual rate
        console.log(`[AUDIO] AudioContext created with sample rate: ${currentSampleRateRef.current}Hz`);
      } else {
        // Update sample rate ref if AudioContext already exists (from playback initialization)
        currentSampleRateRef.current = audioContextRef.current.sampleRate;
        console.log(`[AUDIO] Using existing AudioContext with sample rate: ${currentSampleRateRef.current}Hz`);
      }

      const audioContext = audioContextRef.current;
      const source = audioContext.createMediaStreamSource(stream);
      
      const recordingStateRef = { isRecording: true };
      let processor: ScriptProcessorNode | AudioWorkletNode | null = null;
      let workletNode: AudioWorkletNode | null = null;
      
      // Try to use AudioWorkletNode (modern approach, no deprecation warning)
      try {
        // Load the audio worklet processor from public folder
        await audioContext.audioWorklet.addModule('/audio-processor.worklet.js');
        
        // Create AudioWorkletNode
        workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        
        // Handle messages from the worklet
        workletNode.port.onmessage = (e) => {
          if (e.data.type === 'audioData') {
            if (!recordingStateRef.isRecording || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
              return;
            }

            const inputData = e.data.data;
            
            // Convert to PCM16
            const pcm16 = convertToPCM16(inputData);
            
            // Send as base64 encoded audio chunk with sample rate (using chunked encoding to prevent stack overflow)
            const base64 = encodePCM16ToBase64(pcm16);
            
            wsRef.current.send(JSON.stringify({
              type: 'audio_chunk',
              audio: base64,
              sampleRate: currentSampleRateRef.current, // Include sample rate for backend resampling
              channels: 1 // Mono audio
            }));
          }
        };
        
        processor = workletNode;
        source.connect(workletNode);
        workletNode.connect(audioContext.destination);
        
      } catch (workletError) {
        // Fallback to ScriptProcessorNode if AudioWorklet is not supported
        console.warn('AudioWorklet not available, falling back to ScriptProcessorNode:', workletError);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        (processor as ScriptProcessorNode).onaudioprocess = (e) => {
          if (!recordingStateRef.isRecording || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
          }

          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert to PCM16
          const pcm16 = convertToPCM16(inputData);
          
          // Send as base64 encoded audio chunk with sample rate (using chunked encoding to prevent stack overflow)
          const base64 = encodePCM16ToBase64(pcm16);
          
          wsRef.current.send(JSON.stringify({
            type: 'audio_chunk',
            audio: base64,
            sampleRate: currentSampleRateRef.current, // Include sample rate for backend resampling
            channels: 1 // Mono audio
          }));
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
      }

      setIsRecording(true);
      setStatusMessage("Recording... Speak now.");
      
      // Store references for cleanup
      (mediaStreamRef.current as any).__processor = processor;
      (mediaStreamRef.current as any).__workletNode = workletNode;
      (mediaStreamRef.current as any).__source = source;
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
  }, [toast, stopRecording, convertToPCM16]);

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
              ) : conversationState === 'user_speaking' ? (
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <User className="w-5 h-5" />
                  <span className="font-medium">{statusMessage}</span>
                </div>
              ) : conversationState === 'listening' ? (
                <div className="flex items-center justify-center gap-2 text-amber-600">
                  <Headphones className="w-5 h-5" />
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
                  <Mic className="w-16 h-16" />
                ) : (
                  <MicOff className="w-16 h-16" />
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

