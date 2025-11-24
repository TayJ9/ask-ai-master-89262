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
  const [conversationState, setConversationState] = useState<'ai_speaking' | 'listening' | 'user_speaking' | 'processing'>('listening');
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
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
        console.log('⏳ Interview starting:', message.message);
        // Clear the timeout since we got a response
        if (interviewStartTimeoutRef.current) {
          clearTimeout(interviewStartTimeoutRef.current);
          interviewStartTimeoutRef.current = null;
        }
        setStatusMessage("Starting interview... Please wait.");
        break;
      case 'interview_started':
        console.log('✅ Interview started successfully:', message.message);
        // Clear the timeout since we got a response
        if (interviewStartTimeoutRef.current) {
          clearTimeout(interviewStartTimeoutRef.current);
          interviewStartTimeoutRef.current = null;
        }
        setIsInterviewActive(true);
        setConversationState('ai_speaking');
        setStatusMessage("Interview started. AI is speaking...");
        
        // Set timeout to prevent stuck state (30 seconds max for AI response)
        if (stateTimeoutRef.current) {
          clearTimeout(stateTimeoutRef.current);
        }
        stateTimeoutRef.current = setTimeout(() => {
          if (conversationState === 'ai_speaking') {
            console.warn('⚠️ State timeout: AI speaking state exceeded 30s, forcing transition to listening');
            setConversationState('listening');
            setStatusMessage("Listening... Please speak your answer.");
          }
        }, 30000);
        
        // Initialize AudioContext early to handle autoplay policies
        if (!audioContextRef.current) {
          console.log('🔊 Pre-initializing AudioContext for interview...');
          audioContextRef.current = new AudioContext({ sampleRate: 24000 });
          if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().then(() => {
              console.log('🔊 AudioContext resumed, ready for playback');
            }).catch((error) => {
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
          console.log('🔄 Conversation state: AI started speaking');
          setConversationState('ai_speaking');
        }
        setTranscripts(prev => {
          const isFinal = message.is_final || false;
          const newText = message.text || '';
          
          // If this is a final transcription with empty text, mark the last non-final entry as final
          if (isFinal && !newText && prev.length > 0) {
            const lastEntry = prev[prev.length - 1];
            if (lastEntry.type === 'ai' && !lastEntry.isFinal) {
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
            // If the last entry is also non-final and from AI, accumulate the text
            if (lastEntry.type === 'ai' && !lastEntry.isFinal) {
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
            if (lastEntry.type === 'ai' && !lastEntry.isFinal) {
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
            type: 'ai',
            text: newText,
            isFinal: isFinal,
            timestamp: Date.now()
          }];
        });
        break;
      case 'student_speech_started':
        console.log('🎤 User started speaking - stopping AI audio and clearing queue');
        setConversationState('user_speaking');
        setStatusMessage("You're speaking...");
        
        // Immediately stop all playing audio
        activeSourcesRef.current.forEach(source => {
          try {
            source.stop();
            source.disconnect();
          } catch (e) {
            // Ignore errors during cleanup
          }
        });
        activeSourcesRef.current = [];
        
        // Clear audio queue to prevent backlog
        const queueSizeBeforeClear = audioQueueRef.current.length;
        audioQueueRef.current = [];
        console.log('🔊 Cleared audio queue:', queueSizeBeforeClear, 'chunks removed');
        
        // Reset playback state
        isPlayingRef.current = false;
        setIsPlaying(false);
        nextPlayTimeRef.current = 0;
        
        // Stop recording if it was active (shouldn't be, but safety check)
        if (isRecording) {
          stopRecording();
        }
        
        console.log('✅ AI audio stopped, ready for user input');
        break;
      case 'ai_response_done':
        console.log('✅ AI response completed');
        // Clear any state timeout
        if (stateTimeoutRef.current) {
          clearTimeout(stateTimeoutRef.current);
          stateTimeoutRef.current = null;
        }
        // Transition to listening state when AI finishes
        if (conversationState === 'ai_speaking') {
          setConversationState('listening');
          setStatusMessage("Listening... Please speak your answer.");
        }
        break;
      case 'ai_audio_done':
        console.log('✅ AI audio stream completed');
        // Clear any state timeout
        if (stateTimeoutRef.current) {
          clearTimeout(stateTimeoutRef.current);
          stateTimeoutRef.current = null;
        }
        // Ensure we transition to listening state
        if (conversationState === 'ai_speaking' && audioQueueRef.current.length === 0) {
          setConversationState('listening');
          setStatusMessage("Listening... Please speak your answer.");
        }
        break;
      case 'student_transcription':
        // Update conversation state when receiving student transcription
        if (conversationState !== 'user_speaking') {
          console.log('🔄 Conversation state: User speaking');
          setConversationState('user_speaking');
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
        console.log('Unknown message type:', message.type);
    }
  }, [toast]);

  // Convert PCM16 to Float32 with proper handling
  const convertPCM16ToFloat32 = useCallback((pcm16Array: Int16Array): Float32Array<ArrayBuffer> => {
    // Create Float32Array with explicit ArrayBuffer to satisfy TypeScript 5.9+ type checking
    // In Web Audio API context, buffers are always ArrayBuffer (not SharedArrayBuffer)
    const buffer = new ArrayBuffer(pcm16Array.length * 4); // 4 bytes per float32
    const float32Array = new Float32Array(buffer);
    for (let i = 0; i < pcm16Array.length; i++) {
      // PCM16 is signed 16-bit: range is -32768 to 32767
      // Convert to float32 range [-1.0, 1.0]
      // Use 32768 to handle the full range including -32768
      float32Array[i] = pcm16Array[i] / 32768.0;
    }
    return float32Array;
  }, []);

  // Process audio queue with improved buffering and timing
  const processAudioQueue = useCallback(async () => {
    // Don't process if user is speaking - they should have priority
    if (conversationState === 'user_speaking') {
      console.log('🔊 Skipping audio processing - user is speaking');
      return;
    }
    
    // Don't process if already playing or queue is empty
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
        setIsPlaying(false);
      }
      return;
    }
    
    // Log queue health
    const queueSize = audioQueueRef.current.length;
    if (queueSize > 30) {
      console.warn('⚠️ Audio queue is large:', queueSize, 'chunks. Consider clearing if user starts speaking.');
    }

    try {
      // Initialize AudioContext with correct sample rate (24000 Hz to match OpenAI)
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        // Add initial buffer delay (100ms) for smooth start
        const currentTime = audioContextRef.current.currentTime;
        nextPlayTimeRef.current = currentTime + 0.1;
        console.log('🎵 AudioContext created, sample rate:', audioContextRef.current.sampleRate);
        console.log('⏱️ Initial buffer delay set to 100ms');
      }

      const audioContext = audioContextRef.current;
      
      // Resume context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Process chunks with minimal accumulation to reduce latency
      // Only accumulate if chunk is very small (< 2400 samples = ~0.05 seconds)
      const minChunkSize = 2400; // Reduced from 4800 to minimize latency
      let accumulatedData: Int16Array | null = null;
      let chunksProcessed = 0;
      const maxChunksToAccumulate = 2; // Reduced from 5 to minimize latency

      while (audioQueueRef.current.length > 0 && chunksProcessed < maxChunksToAccumulate) {
        const arrayBuffer = audioQueueRef.current.shift();
        if (!arrayBuffer) break;

        const pcm16Data = new Int16Array(arrayBuffer);
        
        // If chunk is already large enough, process it immediately
        if (pcm16Data.length >= minChunkSize && !accumulatedData) {
          accumulatedData = pcm16Data;
          break;
        }
        
        if (!accumulatedData) {
          accumulatedData = pcm16Data;
        } else {
          // Concatenate chunks
          const combined = new Int16Array(accumulatedData.length + pcm16Data.length);
          combined.set(accumulatedData, 0);
          combined.set(pcm16Data, accumulatedData.length);
          accumulatedData = combined;
        }
        
        chunksProcessed++;
        
        // If we have enough data, process it
        if (accumulatedData.length >= minChunkSize) {
          break;
        }
      }

      if (!accumulatedData || accumulatedData.length === 0) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        return;
      }

      // Convert PCM16 to Float32
      const float32Data = convertPCM16ToFloat32(accumulatedData);
      
      // Create audio buffer with source sample rate (24kHz from OpenAI)
      // The browser's AudioContext will handle resampling automatically
      const sourceSampleRate = 24000;
      const audioBuffer = audioContext.createBuffer(1, float32Data.length, sourceSampleRate);
      audioBuffer.copyToChannel(float32Data, 0);
      
      // Create and configure source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Use a gain node to prevent clipping and ensure smooth playback
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.95; // Slight reduction to prevent clipping
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Calculate duration based on actual sample rate
      const duration = audioBuffer.duration;
      
      // Schedule playback with precise timing
      const currentTime = audioContext.currentTime;
      
      // Handle timing drift: if nextPlayTime is significantly behind (>100ms), reset it
      const timeDrift = currentTime - nextPlayTimeRef.current;
      if (timeDrift > 0.1) {
        console.warn('⏱️ Timing drift detected:', (timeDrift * 1000).toFixed(0), 'ms. Resetting schedule.');
        nextPlayTimeRef.current = currentTime + 0.01; // Small buffer for reset
      }
      
      const scheduledTime = Math.max(currentTime, nextPlayTimeRef.current);
      
      // Add a tiny buffer (5ms) to prevent scheduling in the past
      const safeStartTime = Math.max(currentTime + 0.005, scheduledTime);
      source.start(safeStartTime);
      
      // Track active source for cleanup
      activeSourcesRef.current.push(source);
      
      // Update next play time for seamless playback
      nextPlayTimeRef.current = safeStartTime + duration;
      
      setIsPlaying(true);
      isPlayingRef.current = true;

      // Cleanup and continue when chunk ends
      source.onended = () => {
        // Remove from active sources
        const index = activeSourcesRef.current.indexOf(source);
        if (index > -1) {
          activeSourcesRef.current.splice(index, 1);
        }
        
        // Disconnect nodes
        source.disconnect();
        gainNode.disconnect();
        
        // Process next chunk if available
        if (audioQueueRef.current.length > 0) {
          isPlayingRef.current = false;
          processAudioQueue();
        } else {
          // Check if any other sources are still playing
          if (activeSourcesRef.current.length === 0) {
            console.log('🔊 All AI audio finished, transitioning to listening state');
            setIsPlaying(false);
            isPlayingRef.current = false;
            nextPlayTimeRef.current = 0;
            
            // Transition to listening state when AI finishes speaking
            if (conversationState === 'ai_speaking') {
              setConversationState('listening');
              setStatusMessage("Listening... Please speak your answer.");
            }
          }
        }
      };
    } catch (error) {
      console.error('Error playing audio chunk:', error);
      setIsPlaying(false);
      isPlayingRef.current = false;
      // Clear active sources on error
      activeSourcesRef.current.forEach(source => {
        try {
          source.stop();
          source.disconnect();
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
      activeSourcesRef.current = [];
      
      // Try next chunk if available
      if (audioQueueRef.current.length > 0) {
        processAudioQueue();
      }
    }
  }, [convertPCM16ToFloat32, conversationState]);

  // Queue audio chunk for playback with size limits
  const queueAudioChunk = useCallback((arrayBuffer: ArrayBuffer) => {
    const MAX_QUEUE_SIZE = 50; // Maximum chunks in queue to prevent overflow
    
    // Check queue size and warn if getting too large
    if (audioQueueRef.current.length >= MAX_QUEUE_SIZE) {
      console.warn('⚠️ Audio queue size limit reached:', audioQueueRef.current.length, 'chunks. Clearing old chunks.');
      // Keep only the most recent chunks
      const chunksToKeep = 30;
      audioQueueRef.current = audioQueueRef.current.slice(-chunksToKeep);
      console.log('🔊 Queue reduced to', audioQueueRef.current.length, 'chunks');
    }
    
    // Log queue size periodically
    if (audioQueueRef.current.length % 10 === 0) {
      console.log('📊 Audio queue size:', audioQueueRef.current.length, 'chunks');
    }
    
    // Add to queue
    audioQueueRef.current.push(arrayBuffer);
    
    // Try to process queue
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

  // Cleanup audio resources
  const cleanupAudio = useCallback(() => {
    // Stop all active sources
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Ignore errors during cleanup
      }
    });
    activeSourcesRef.current = [];
    
    // Clear audio queue
    audioQueueRef.current = [];
    audioBufferQueueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
    nextPlayTimeRef.current = 0;
    
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
              
              console.log('🔊 Received audio chunk, size:', arrayBuffer.byteLength, 'bytes, queue length:', audioQueueRef.current.length);
              // Queue audio chunk for sequential playback
              queueAudioChunk(arrayBuffer);
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

