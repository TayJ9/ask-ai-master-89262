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
        if (!audioContextRef.current) {
          // Reduced logging
          audioContextRef.current = new AudioContext({ sampleRate: 16000 });
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

  // Convert PCM16 to Float32 with proper handling and normalization
  const convertPCM16ToFloat32 = useCallback((pcm16Array: Int16Array): Float32Array<ArrayBuffer> => {
    // Create Float32Array with explicit ArrayBuffer to satisfy TypeScript 5.9+ type checking
    // In Web Audio API context, buffers are always ArrayBuffer (not SharedArrayBuffer)
    const buffer = new ArrayBuffer(pcm16Array.length * 4); // 4 bytes per float32
    const float32Array = new Float32Array(buffer);
    
    // Normalize to ensure values stay within [-1.0, 1.0] range
    const maxValue = 32768.0;
    for (let i = 0; i < pcm16Array.length; i++) {
      // PCM16 is signed 16-bit: range is -32768 to 32767
      // Convert to float32 range [-1.0, 1.0] and clamp to prevent clipping
      let normalized = pcm16Array[i] / maxValue;
      // Clamp to [-1.0, 1.0] to prevent any clipping
      normalized = Math.max(-1.0, Math.min(1.0, normalized));
      float32Array[i] = normalized;
    }
    return float32Array;
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
    
    // Set processing lock
    isProcessingQueueRef.current = true;
    
    // Monitor queue health (reduced logging frequency)
    const queueSize = audioQueueRef.current.length;
    // Only log if queue is very large (>25 chunks) and log infrequently
    if (queueSize > 25 && Math.random() < 0.1) {
      console.warn('⚠️ Audio queue is large:', queueSize, 'chunks');
    }

    try {
      // Initialize AudioContext with correct sample rate (16000 Hz to match ElevenLabs)
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContext({ sampleRate: 16000 });
          // Reduced logging - only log sample rate mismatch or on first creation
          const actualSampleRate = audioContextRef.current.sampleRate;
          if (Math.abs(actualSampleRate - 16000) > 100) {
            console.warn('⚠️ AudioContext sample rate mismatch:', actualSampleRate, 'expected 16000');
          }
          
          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
          }
          
          // Add initial buffer delay (100ms) - optimized for responsiveness
          const currentTime = audioContextRef.current.currentTime;
          nextPlayTimeRef.current = currentTime + 0.1;
          // Reduced logging - only log on first initialization
          if (Math.random() < 0.1) {
            console.log('⏱️ Initial buffer delay set to 100ms');
          }
        } catch (error) {
          console.error('❌ Failed to create AudioContext:', error);
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

      const pcm16Data = new Int16Array(arrayBuffer);
      
      // Validate sample count
      if (pcm16Data.length === 0) {
        // Reduced logging
        if (Math.random() < 0.1) {
          console.warn('⚠️ PCM16 data is empty, skipping');
        }
        isProcessingQueueRef.current = false;
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }

      // Convert PCM16 to Float32
      const float32Data = convertPCM16ToFloat32(pcm16Data);
      
      // Validate buffer size before creating
      if (float32Data.length === 0) {
        // Reduced logging
        if (Math.random() < 0.1) {
          console.warn('⚠️ Empty float32 data, skipping buffer creation');
        }
        isProcessingQueueRef.current = false;
        if (audioQueueRef.current.length > 0) {
          requestAnimationFrame(() => processAudioQueue());
        }
        return;
      }
      
      // Create audio buffer with source sample rate (16kHz from ElevenLabs)
      // The browser's AudioContext will handle resampling automatically
      const sourceSampleRate = 16000;
      
      // Validate buffer size is reasonable (max 10 seconds)
      // At 16kHz, 10 seconds = 160,000 samples
      const maxSamples = sourceSampleRate * 10;
      let finalFloat32Data = float32Data;
      if (float32Data.length > maxSamples) {
        console.warn('⚠️ Audio buffer unusually large:', float32Data.length, 'samples (', (float32Data.length / sourceSampleRate).toFixed(2), 'seconds). Truncating to', maxSamples, 'samples.');
        finalFloat32Data = float32Data.slice(0, maxSamples);
      }
      
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = audioContext.createBuffer(1, finalFloat32Data.length, sourceSampleRate);
        audioBuffer.copyToChannel(finalFloat32Data, 0);
      } catch (error) {
        console.error('❌ Failed to create audio buffer:', error);
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
      
      // Create and configure source with error handling
      let source: AudioBufferSourceNode;
      let gainNode: GainNode;
      
      try {
        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Use a gain node to prevent clipping and ensure smooth playback
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0.85; // Reduced from 0.95 to prevent clipping
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
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
      
      // Handle timing drift: if nextPlayTime is significantly behind (>20ms), reset it aggressively
      const timeDrift = currentTime - nextPlayTimeRef.current;
      if (timeDrift > 0.02) {
        // If drift is significant (>20ms), reset scheduling and drop old chunks
        const driftMs = timeDrift * 1000;
        if (driftMs > 100) {
          // Severe drift (>100ms) - drop old chunks to catch up
          const chunksToDrop = Math.min(Math.floor(driftMs / 50), audioQueueRef.current.length);
          if (chunksToDrop > 0) {
            audioQueueRef.current.splice(0, chunksToDrop);
            console.warn('⏱️ Severe timing drift:', driftMs.toFixed(0), 'ms. Dropped', chunksToDrop, 'old chunks.');
          }
        } else {
          console.warn('⏱️ Timing drift detected:', driftMs.toFixed(0), 'ms. Resetting schedule.');
        }
        nextPlayTimeRef.current = currentTime + 0.01; // Small buffer for reset
      }
      
      const scheduledTime = Math.max(currentTime, nextPlayTimeRef.current);
      
      // Add a small buffer (10ms) to prevent scheduling in the past and ensure smooth playback
      const safeStartTime = Math.max(currentTime + 0.01, scheduledTime);
      
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
  }, [convertPCM16ToFloat32, conversationState]);

  // Queue audio chunk for playback with aggressive size limits
  const queueAudioChunk = useCallback((arrayBuffer: ArrayBuffer) => {
    const MAX_QUEUE_SIZE = 30; // Reduced from 50 - more aggressive limit
    const WARN_QUEUE_SIZE = 20; // Warn when queue exceeds this
    
    // Track audio chunk metrics
    const now = Date.now();
    audioChunkSizesRef.current.push(arrayBuffer.byteLength);
    audioChunkReceiveTimesRef.current.push(now);
    
    // Keep only last 100 chunk timestamps for rate calculation
    if (audioChunkReceiveTimesRef.current.length > 100) {
      audioChunkReceiveTimesRef.current.shift();
      audioChunkSizesRef.current.shift();
    }
    
    // Calculate receive rate if we have enough data
    if (audioChunkReceiveTimesRef.current.length >= 10) {
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
    
    // Aggressive queue management - drop old chunks when limit exceeded
    if (audioQueueRef.current.length >= MAX_QUEUE_SIZE) {
      // Keep only the most recent chunks (50% of max)
      const chunksToKeep = Math.floor(MAX_QUEUE_SIZE / 2);
      const dropped = audioQueueRef.current.length - chunksToKeep;
      audioQueueRef.current = audioQueueRef.current.slice(-chunksToKeep);
      console.warn('⚠️ Audio queue limit reached. Dropped', dropped, 'old chunks, kept', chunksToKeep);
    } else if (audioQueueRef.current.length >= WARN_QUEUE_SIZE) {
      // Warn but don't drop yet
      console.warn('⚠️ Audio queue is large:', audioQueueRef.current.length, 'chunks');
    }
    
    // Log when queue exceeds thresholds
    if (audioQueueRef.current.length === 25) {
      console.warn('⚠️ Audio queue reached 25 chunks');
    }
    
    // Add to queue
    audioQueueRef.current.push(arrayBuffer);
    
    // Try to process queue immediately (no setTimeout delay)
    processAudioQueue();
  }, [processAudioQueue]);

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
              if (lastChunkReceiveTimeRef.current) {
                const timeSinceLastChunk = now - lastChunkReceiveTimeRef.current;
                // Log if chunk interval is unusual (>200ms or <10ms)
                if (timeSinceLastChunk > 200 || timeSinceLastChunk < 10) {
                  console.log(`🔊 Audio chunk received: size=${arrayBuffer.byteLength} bytes, interval=${timeSinceLastChunk}ms, queue=${audioQueueRef.current.length}`);
                }
              }
              lastChunkReceiveTimeRef.current = now;
              
              // Log unusually large or small chunks
              if (arrayBuffer.byteLength > 96000) {
                console.warn(`⚠️ Unusually large audio chunk: ${arrayBuffer.byteLength} bytes (>2 seconds at 24kHz)`);
              } else if (arrayBuffer.byteLength < 100) {
                console.warn(`⚠️ Unusually small audio chunk: ${arrayBuffer.byteLength} bytes`);
              }
              
              // Queue audio chunk for sequential playback
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

  // Start recording microphone
  const startRecording = useCallback(async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
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

