/**
 * Voice Interview Component using ElevenLabs Conversational AI SDK
 * Clean, production-grade implementation with server-side VAD and optimal latency
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, Volume2, Loader2, X, User, Headphones } from "lucide-react";
import AISpeakingIndicator from "@/components/ui/AISpeakingIndicator";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import AudioVisualizer from "@/components/ui/AudioVisualizer";
import { getApiUrl } from "@/lib/api";
import { debugLog, initElevenWsDebug, shouldDebugEleven, elevenDebugConstants } from "@/lib/wsDebug";

const BUILD_ID = "eleven-resume-logging-v1";

interface VoiceInterviewWebSocketProps {
  sessionId: string;
  firstName: string;
  major: string;
  candidateContext: {
    name: string;
    major: string;
    year: string;
    skills?: string[];
    experience?: string;
    education?: string;
    summary?: string;
    resumeText?: string;
    resumeSource?: string;
  };
  onComplete: (results?: any) => void;
  /** Callback when interview ends via tool call (e.g., MarkInterviewComplete) */
  onInterviewEnd?: (data: { status: string; timestamp: string; reason: string; sessionId?: string; conversationId?: string | null }) => void;
  /** When false, component stays mounted but renders nothing. Prevents unmount during async ops. */
  isActive?: boolean;
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
  firstName,
  major,
  candidateContext,
  onComplete,
  onInterviewEnd,
  isActive = true, // Default to true for backward compatibility
}: VoiceInterviewWebSocketProps) {
  // Try to derive candidate_id from stored user (auth token is already required upstream)
  const candidateId = useMemo(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) return null;
      const parsed = JSON.parse(storedUser);
      return parsed?.id ?? null;
    } catch (e) {
      console.warn('Failed to parse candidate_id from localStorage user', e);
      return null;
    }
  }, []);
  const [statusMessage, setStatusMessage] = useState("Ready to begin");
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isIdle, setIsIdle] = useState(true); // Start in idle state - requires user click
  const [inputVolume, setInputVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isTokenRequesting, setIsTokenRequesting] = useState(false);
  
  // Connection guards to prevent race conditions
  const isStartingRef = useRef(false);
  const hasStartedRef = useRef(false); // Track if interview actually started
  const conversationIdRef = useRef<string | null>(null);
  const lastStartDynamicVarsRef = useRef<Record<string, any> | null>(null);
  const agentIdRef = useRef<string | null>(null);
  const firstAiMessageRef = useRef<string>('');
  const firstAiCheckedRef = useRef(false);
  const firstAiDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const firstAiFinalizedRef = useRef(false);
  const volumeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isInterviewCompleteRef = useRef(false); // Track if interview completed successfully to prevent cleanup from interfering
  
  // Audio quality improvement refs
  const audioChunkBufferRef = useRef<any[]>([]);
  const isAudioBufferingRef = useRef(true);
  const audioBufferStartTimeRef = useRef<number | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const tokenCacheRef = useRef<string | null>(null);
  
  const { toast } = useToast();

  const generateTokenRequestId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `token-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  useEffect(() => {
    if (shouldDebugEleven()) {
      initElevenWsDebug();
    }
  }, []);
  
  // Keep conversationId ref in sync
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  
  // Save interview to backend
  const saveInterview = useCallback(async (convId: string | null, endedBy: 'user' | 'disconnect' = 'disconnect') => {
    // Always call save-interview with sessionId (always available)
    // conversationId is optional (may not be available)
    const authToken = localStorage.getItem('auth_token');
    const agentId = agentIdRef.current || import.meta.env.VITE_ELEVENLABS_AGENT_ID || (() => {
      if (import.meta.env.PROD) {
        console.error('VITE_ELEVENLABS_AGENT_ID must be set in production');
        throw new Error('Agent ID not configured');
      }
      return "agent_8601kavsezrheczradx9qmz8qp3e"; // Dev fallback
    })();
    
    const payload = {
      client_session_id: sessionId, // Always available
      conversation_id: convId || undefined, // Optional - may be null
      ended_by: endedBy,
      agent_id: agentId,
    };

    try {
      console.log('[FLIGHT_RECORDER] [INTERVIEW] Preparing to save interview - payload:', {
        client_session_id: payload.client_session_id,
        conversation_id: payload.conversation_id || 'null/undefined',
        ended_by: payload.ended_by,
        agent_id: payload.agent_id,
        timestamp: new Date().toISOString()
      });
      console.log('[FLIGHT_RECORDER] [INTERVIEW] Waiting for saveInterview() to complete...');
      const response = await fetch(
        getApiUrl(`/api/save-interview`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(payload),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error('[FLIGHT_RECORDER] [INTERVIEW] Save interview FAILED:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error || response.statusText,
          timestamp: new Date().toISOString()
        });
        throw new Error(errorData.error || `Failed to save interview: ${response.statusText}`);
      }
      
      const responseData = await response.json().catch(() => ({}));
      console.log('[FLIGHT_RECORDER] [INTERVIEW] Save complete - response:', {
        status: response.status,
        responseData,
        interviewId: responseData.interviewId || 'not provided',
        timestamp: new Date().toISOString()
      });
      
      // Return the response data including interviewId for direct navigation
      return responseData;
    } catch (error: any) {
      console.error('Error saving interview end state:', error);
      toast({
        title: "Warning",
        description: "Interview end state may not have been saved. Results may be delayed.",
        variant: "destructive",
      });
      // Return null on error - frontend will use fallback polling
      return null;
    }
  }, [sessionId, toast]);

  // Stable callbacks for useConversation (prevents hook re-initialization on re-render)
  const handleConnect = useCallback(() => {
    console.log('[FLIGHT_RECORDER] [INTERVIEW] ElevenLabs SDK connected successfully');
    if (!isMountedRef.current) return;
    
    setStatusMessage("Connected - Interview starting...");
    setIsIdle(false);
    setHasStarted(true);
    hasStartedRef.current = true; // Mark interview as truly started
    setIsStarting(false);
    isStartingRef.current = false;
  }, []);

  const handleDisconnect = useCallback(async (reason: any) => {
    console.error("🔥🔥🔥 CRITICAL: SDK DISCONNECTED 🔥🔥🔥");
    console.error("Reason:", typeof reason === 'object' ? JSON.stringify(reason, null, 2) : reason);
    console.log('[ELEVEN DISCONNECT]', {
      reason,
      hasConversationId: !!conversationIdRef.current,
      lastDynamicVariables: lastStartDynamicVarsRef.current,
    });
    
    // Check for unauthorized/policy violation
    const reasonStr = typeof reason === 'object' ? JSON.stringify(reason) : String(reason);
    if (reasonStr.includes('1008') || reasonStr.includes('Policy Violation')) {
      console.error("⚠️ Disconnect due to Policy Violation or Unauthorized (1008). Check ElevenLabs settings.");
    }

    console.error("Stack Trace:", new Error().stack);
    
    if (!isMountedRef.current) {
      console.log("Component unmounted, ignoring disconnect logic");
      return;
    }
    
    // Check if interview actually started before calling onComplete
    // This prevents unmounting the component if disconnect happens during connection
    const wasInterviewActive = hasStartedRef.current;
    
    // Enhanced detection for agent-initiated disconnect
    // Check multiple formats of the reason parameter:
    // 1. String equality: 'agent_ended' or 'agent'
    // 2. String contains: agent-related keywords (existing logic)
    // 3. WebSocket code: 1000 (normal closure initiated by server)
    // 4. Object property: reason.reason contains agent keywords
    // 5. Completion flag: already completed via tool call
    const isStringAgentEnded = reason === 'agent_ended' || reason === 'agent';
    const isCode1000 = typeof reason === 'object' && reason?.code === 1000;
    const isObjectAgentReason = typeof reason === 'object' && 
                                 (reason?.reason?.toLowerCase?.().includes('agent') ||
                                  reason?.reason?.toLowerCase?.().includes('completed') ||
                                  reason?.reason?.toLowerCase?.().includes('ended'));
    const isStringContainsAgent = reasonStr.toLowerCase().includes('agent') || 
                                  reasonStr.toLowerCase().includes('completed') ||
                                  reasonStr.toLowerCase().includes('finished') ||
                                  reasonStr.toLowerCase().includes('ended') ||
                                  reasonStr.toLowerCase().includes('conversation.end') ||
                                  reasonStr.toLowerCase().includes('interview complete');
    
    const isAgentDisconnect = isStringAgentEnded || 
                              isCode1000 || 
                              isObjectAgentReason || 
                              isStringContainsAgent ||
                              isInterviewCompleteRef.current; // Already completed via tool call
    
    console.log('Disconnect - wasInterviewActive:', wasInterviewActive, 'isAgentDisconnect:', isAgentDisconnect, 'reason:', reasonStr, {
      isStringAgentEnded,
      isCode1000,
      isObjectAgentReason,
      isStringContainsAgent,
      isInterviewCompleteRef: isInterviewCompleteRef.current
    });
    
    // Reset starting state
    setIsStarting(false);
    isStartingRef.current = false;
    
    // Stop volume polling
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    
    // Handle agent-initiated disconnect: IMMEDIATE navigation to results
    if (wasInterviewActive && (isAgentDisconnect || isInterviewCompleteRef.current)) {
      console.log('[FLIGHT_RECORDER] [INTERVIEW] Agent ended the interview. Navigating to results immediately...');
      
      // Mark as complete
      isInterviewCompleteRef.current = true;
      
      // IMMEDIATE navigation - don't wait for anything
      const completeData = { sessionId, conversationId: conversationIdRef.current };
      console.log('[FLIGHT_RECORDER] [TRANSITION] Disconnect - calling onComplete immediately with:', completeData);
      onComplete(completeData);
      
      // Save interview in background (don't await - let it run asynchronously)
      // The save-interview endpoint is idempotent, so calling it multiple times is safe
      const conversationIdForSave = conversationIdRef.current;
      if (!conversationIdForSave) {
        console.warn('[FLIGHT_RECORDER] [INTERVIEW] Disconnect - conversationIdRef is null during agent disconnect save. This is expected if interview ended before conversation_id was assigned.', {
          sessionId,
          timestamp: new Date().toISOString()
        });
      }
      console.log('[FLIGHT_RECORDER] [INTERVIEW] Disconnect - saving interview in background:', {
        sessionId,
        conversationId: conversationIdForSave || 'null',
        hasConversationId: !!conversationIdForSave,
        isAgentDisconnect,
        timestamp: new Date().toISOString()
      });
      saveInterview(conversationIdForSave, 'disconnect').then((saveResponse) => {
        // If save returned interviewId, update completeData for better navigation
        if (saveResponse?.interviewId) {
          console.log('[FLIGHT_RECORDER] [INTERVIEW] Background save returned interviewId:', {
            interviewId: saveResponse.interviewId,
            sessionId,
            timestamp: new Date().toISOString()
          });
          // Note: Navigation already happened, but Results page can use polling fallback
        }
      }).catch((error) => {
        console.error('[FLIGHT_RECORDER] [INTERVIEW] Background save failed:', {
          error,
          sessionId,
          conversationId: conversationIdForSave || 'null',
          hasConversationId: !!conversationIdForSave,
          timestamp: new Date().toISOString()
        });
        // Don't show error to user - they're already on results page
        // The results page polling will handle finding the interview
      });
      
      return; // Exit early - navigation already triggered
    }
    
    // Handle normal disconnect (not agent-initiated) - only if interview was active
    if (wasInterviewActive && !isInterviewCompleteRef.current) {
      // Normal disconnect - save and complete
      setStatusMessage("Saving interview...");
      try {
        const conversationIdForSave = conversationIdRef.current;
        if (!conversationIdForSave) {
          console.warn('[FLIGHT_RECORDER] [INTERVIEW] Disconnect - conversationIdRef is null during normal disconnect save. This may occur if disconnect happened before conversation_id was assigned.', {
            sessionId,
            timestamp: new Date().toISOString()
          });
        }
        console.log('[FLIGHT_RECORDER] [INTERVIEW] Disconnect - saving interview:', {
          sessionId,
          conversationId: conversationIdForSave || 'null',
          hasConversationId: !!conversationIdForSave,
          timestamp: new Date().toISOString()
        });
        // Await save to complete before navigating for normal disconnects
        const saveResponse = await saveInterview(conversationIdForSave, 'disconnect');
        console.log('[FLIGHT_RECORDER] [INTERVIEW] Disconnect - interview saved, navigating to results:', { 
          sessionId,
          conversationId: conversationIdRef.current || 'null',
          interviewId: saveResponse?.interviewId || 'not provided',
          timestamp: new Date().toISOString()
        });
        isInterviewCompleteRef.current = true;
        const completeData = { 
          sessionId, 
          conversationId: conversationIdRef.current,
          interviewId: saveResponse?.interviewId || null // Include interviewId for direct lookup
        };
        console.log('[FLIGHT_RECORDER] [TRANSITION] Disconnect - calling onComplete with:', completeData);
        onComplete(completeData);
      } catch (error) {
        console.error('[FLIGHT_RECORDER] [INTERVIEW] Disconnect - failed to save interview before navigation:', {
          error,
          sessionId,
          conversationId: conversationIdRef.current || 'null',
          timestamp: new Date().toISOString()
        });
        // Still navigate even if save fails - user should see results
        // The save-interview endpoint is idempotent and can be retried
        isInterviewCompleteRef.current = true;
        const completeData = { sessionId, conversationId: conversationIdRef.current };
        console.log('[FLIGHT_RECORDER] [TRANSITION] Disconnect - error path, calling onComplete with:', completeData);
        onComplete(completeData);
      }
    } else if (wasInterviewActive && isInterviewCompleteRef.current) {
      // Interview was already completed - this disconnect is expected (e.g., after tool call)
      console.log('✅ Interview already completed - disconnect is expected, skipping save');
    } else {
      // Disconnect during connection attempt - return to idle state
      console.log('Disconnect during connection - returning to idle state');
      setIsIdle(true);
      setStatusMessage("Connection failed. Click to try again.");
    }
  }, [onComplete, saveInterview, sessionId]);

  const handleMessage = useCallback((message: any) => {
    if (!isMountedRef.current) return;
    console.log('SDK Message:', message);
    
    // Audio buffering: Check if this is an audio message/chunk
    // ElevenLabs SDK may send audio in different formats - check both
    const isAudioMessage = 
      message.type === 'audio' || 
      message.type === 'audio_chunk' ||
      message.audio ||
      (message.data && message.data instanceof ArrayBuffer);
    
    if (isAudioMessage && isAudioBufferingRef.current) {
      // Add to buffer
      audioChunkBufferRef.current.push(message);
      
      // Start timer on first chunk
      if (!audioBufferStartTimeRef.current) {
        audioBufferStartTimeRef.current = Date.now();
        console.log('[AUDIO BUFFER] Started buffering audio chunks');
      }
      
      // Check if we have enough chunks OR timeout reached
      const MIN_AUDIO_CHUNKS = 2; // Wait for 2 chunks
      const MAX_BUFFER_TIME_MS = 300; // Max 300ms buffer delay
      const bufferAge = Date.now() - (audioBufferStartTimeRef.current || 0);
      const hasEnoughChunks = audioChunkBufferRef.current.length >= MIN_AUDIO_CHUNKS;
      const timeoutReached = bufferAge >= MAX_BUFFER_TIME_MS;
      
      if (hasEnoughChunks || timeoutReached) {
        // Release buffer - let SDK handle playback
        console.log(`[AUDIO BUFFER] Releasing buffer: ${audioChunkBufferRef.current.length} chunks, ${bufferAge}ms delay`);
        isAudioBufferingRef.current = false;
        audioBufferStartTimeRef.current = null;
        
        // Process buffered chunks in sequence (small delay between each)
        audioChunkBufferRef.current.forEach((chunk, index) => {
          setTimeout(() => {
            // Forward to original handler - SDK will process these
            // The key is that we've delayed the START of playback
          }, index * 5); // 5ms between chunks
        });
        
        audioChunkBufferRef.current = [];
      } else {
        // Still buffering - don't process this message yet
        console.log(`[AUDIO BUFFER] Buffering chunk ${audioChunkBufferRef.current.length}/${MIN_AUDIO_CHUNKS}`);
        return; // Don't process this message yet
      }
    }
    
    // Reset buffer flag after conversation ends (for next session)
    if (message.type === 'conversation_end' || message.type === 'agent_speech_end') {
      isAudioBufferingRef.current = true; // Reset for next session
      audioChunkBufferRef.current = [];
      audioBufferStartTimeRef.current = null;
    }
    
    // Check for tool_call events (e.g., MarkInterviewComplete)
    if (message.type === 'tool_call' || message.tool_call || message.tool_name) {
      const toolCall = message.tool_call || message;
      const toolName = toolCall.tool_name || message.tool_name;
      
      console.log('Tool call received:', toolCall);
      
      if (toolName === 'MarkInterviewComplete') {
        console.log('Interview completion signal received via tool call');
        
        // Save interview before navigating to results
        const handleInterviewComplete = async () => {
          try {
            setStatusMessage("Saving interview...");
            console.log('Saving interview before navigation...', {
              sessionId,
              conversationId: conversationIdRef.current
            });
            
            // Save interview with 'disconnect' as ended_by since agent called the tool (SDK will disconnect)
            await saveInterview(conversationIdRef.current, 'disconnect');
            
            console.log('Interview saved successfully, triggering navigation to results');
            
            // Mark interview as complete before navigation to prevent cleanup from interfering
            isInterviewCompleteRef.current = true;
            
            // Trigger the onInterviewEnd prop function to switch views
            if (onInterviewEnd) {
              onInterviewEnd({
                status: 'completed',
                timestamp: new Date().toISOString(),
                reason: 'tool_call',
                sessionId: sessionId,
                conversationId: conversationIdRef.current
              });
            }
          } catch (error: any) {
            console.error('Error saving interview before navigation:', error);
            // Still navigate even if save fails - user should see results
            // The save-interview endpoint is idempotent and can be retried
            isInterviewCompleteRef.current = true;
            if (onInterviewEnd) {
              onInterviewEnd({
                status: 'completed',
                timestamp: new Date().toISOString(),
                reason: 'tool_call',
                sessionId: sessionId,
                conversationId: conversationIdRef.current
              });
            }
          }
        };
        
        // Execute async handler
        handleInterviewComplete();
      }
      return; // Don't process tool calls as regular messages
    }
    
    // SDK message has { message: string, source: 'user' | 'ai' }
    const text = message.message || '';
    const isAI = message.source === 'ai';

    if (shouldDebugEleven() && isAI && text && !firstAiFinalizedRef.current) {
      firstAiMessageRef.current += text;
      if (firstAiDebounceTimerRef.current) {
        clearTimeout(firstAiDebounceTimerRef.current);
      }
      const finalize = () => {
        if (firstAiFinalizedRef.current) return;
        const buffer = firstAiMessageRef.current || '';
        if (shouldDebugEleven()) {
          console.log("[FIRST AI FINAL]", { chars: buffer.length, preview: buffer.slice(0, 160) });
        }
        if (buffer.includes('RESUME_PIPELINE_OK')) {
          console.log('[RESUME VARS OK] Agent emitted resume marker');
        } else {
          console.warn('[RESUME VARS NOT USED] Agent template likely missing {{resume_summary}}/{{resume_highlights}} or wrong agent id');
        }
        if (buffer) {
          console.log('[ELEVEN DEBUG] First agent message preview (120 chars max):', buffer.slice(0, 120));
        }
        firstAiCheckedRef.current = true;
        firstAiFinalizedRef.current = true;
      };

      const explicitFinal =
        message?.isFinal ||
        message?.final ||
        message?.type === 'agentresponse' ||
        message?.type === 'agent_response' ||
        message?.type === 'final';

      if (explicitFinal) {
        finalize();
      } else {
        firstAiDebounceTimerRef.current = setTimeout(finalize, 600);
      }
    }
    
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
  }, [onInterviewEnd]);

  const handleError = useCallback((error: any) => {
    console.error("🔥🔥🔥 CRITICAL: SDK ERROR 🔥🔥🔥", error);
    if (!isMountedRef.current) return;
    
    // Reset starting state on error
    setIsStarting(false);
    isStartingRef.current = false;
    
    const errorMessage = typeof error === 'string' ? error : (error as Error)?.message || 'Connection failed';
    setStatusMessage(`Error: ${errorMessage}`);
    toast({
      title: "Interview Error",
      description: errorMessage,
      variant: "destructive",
    });
  }, [toast]);

  // Initialize ElevenLabs conversation hook
  // The SDK will automatically upgrade to WebRTC if available/supported when using signedUrl
  const conversation = useConversation({
    clientTools: null,
    preferHeadphonesForIosDevices: true,
    useWakeLock: true,
    // Let SDK handle WebRTC upgrade automatically - don't force connectionType
    // The signedUrl from get_signed_url endpoint will enable WebRTC if supported
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onMessage: handleMessage,
    onError: handleError,
  });

  // Derive conversation mode from SDK state
  const getConversationMode = (): ConversationMode => {
    if (conversation.status !== 'connected') {
      return 'processing';
    }
    if (conversation.isSpeaking) {
      return 'ai_speaking';
    }
    // Use input volume to detect user speaking - lowered threshold for better sensitivity
    // 0.03 allows detection of quieter speech while avoiding false positives
    if (inputVolume > 0.03) {
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
      }, 50); // 20fps for smooth visualization
    }
    
    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
    };
  }, [conversation.status, conversation]);

  // AudioContext resume function - ensures browser audio pipeline is ready
  const resumeAudioContext = useCallback(async (): Promise<void> => {
    try {
      // Create a temporary AudioContext to resume the browser's audio system
      // This ensures the browser's audio pipeline is ready before SDK starts
      const tempContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (tempContext.state === 'suspended') {
        await tempContext.resume();
        console.log('[AUDIO] Temporary AudioContext resumed - browser audio pipeline ready');
      }
      
      // Play a silent sound to "wake up" the audio system
      // This ensures the browser's audio processing is fully initialized
      const buffer = tempContext.createBuffer(1, 1, 22050);
      const source = tempContext.createBufferSource();
      source.buffer = buffer;
      source.connect(tempContext.destination);
      source.start(0);
      source.stop(0.001);
      
      // Small delay to ensure audio system is ready
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Close temporary context
      await tempContext.close();
      
      console.log('[AUDIO] AudioContext warmup complete');
    } catch (error) {
      console.warn('[AUDIO] AudioContext resume failed (non-critical):', error);
      // Don't fail - SDK may handle this internally
    }
  }, []);

  // Pre-warm microphone permission and connection (reduces initial latency)
  useEffect(() => {
    // Pre-warm microphone access (don't await, just request to cache permission)
    if (!hasStarted && !isStarting) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          // Stop immediately - we just wanted to warm up the permission
          stream.getTracks().forEach(track => track.stop());
          console.log('[PRE-WARM] Microphone permission cached');
        })
        .catch(() => {
          // Ignore errors - user will grant permission when they click Start
        });
    }
  }, [hasStarted, isStarting]);

  // Pre-warm connection token for faster start
  useEffect(() => {
    if (hasStarted || isStarting) return;
    
    // Pre-fetch token after component mounts (with delay to not block render)
    const timer = setTimeout(async () => {
      try {
        const authToken = localStorage.getItem('auth_token');
        if (!authToken) return; // Can't pre-warm without auth
        
        const response = await fetch(getApiUrl('/api/conversation-token'), {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          tokenCacheRef.current = data.signed_url || data.signedUrl;
          console.log('[PRE-WARM] Connection token cached for faster start');
        }
      } catch (error) {
        // Ignore - will fetch on Start click
        console.log('[PRE-WARM] Token pre-warm failed (will fetch on Start)');
      }
    }, 2000); // Wait 2 seconds after mount
    
    return () => clearTimeout(timer);
  }, [hasStarted, isStarting]);

  // Start interview with signed token - with robust unmount handling
  const startInterview = useCallback(async () => {
    // Guard 1: Check ref to prevent race conditions (Strict Mode, double-clicks)
    if (isStartingRef.current) {
      console.log('Start already in progress (ref guard)');
      return;
    }
    
    // Guard 2: Check if already connected or connecting
    if (conversation.status === 'connected' || conversation.status === 'connecting') {
      console.log(`Already ${conversation.status}, skipping start`);
      return;
    }
    
    // Guard 3: Check state (backup)
    if (isStarting || hasStarted) {
      console.log('Start blocked by state guard');
      return;
    }

    if (isTokenRequesting) {
      console.log('[TOKEN REQUEST] Request already in flight - ignoring duplicate start');
      return;
    }

    const normalizedFirstName = firstName?.trim() || '';
    const normalizedMajor = major?.trim() || '';
    const resumeTextForSession = candidateContext?.resumeText || candidateContext?.summary || '';
    const resumeSourceForSession = candidateContext?.resumeSource || 'not_provided';
    const resumeChars = resumeTextForSession?.length || 0;
    const candidateContextPresent = !!candidateContext;
    const resumeExpected = !!candidateContext?.resumeSource || !!candidateContext?.resumeText;

    if (!normalizedFirstName || !normalizedMajor) {
      console.warn('Missing required identity fields for ElevenLabs start', { normalizedFirstName, normalizedMajor });
      toast({
        title: "Missing information",
        description: "Please provide your first name and major before starting the interview.",
        variant: "destructive",
      });
      return;
    }
    
    if (shouldDebugEleven()) {
      console.log('[ELEVEN DEBUG][RESUME pipeline]', {
        resume_found: resumeChars > 0,
        resume_source: resumeSourceForSession,
        resume_text_chars: resumeChars,
      });
      // #region agent log
      debugLog({
        hypothesisId: "H1",
        location: "VoiceInterviewWebSocket.tsx:startInterview",
        message: "resume_pipeline_before_start",
        data: {
          resume_found: resumeChars > 0,
          resume_source: resumeSourceForSession,
          resume_text_chars: resumeChars,
        },
      });
      // #endregion
    }
    
    if (resumeExpected && resumeChars === 0) {
      console.warn('[RESUME LOST BETWEEN VIEWS]', { candidateContextPresent, resumeExpected, resumeChars });
      toast({
        title: "Resume missing",
        description: "Resume missing—please re-upload before starting.",
        variant: "destructive",
      });
      setIsStarting(false);
      isStartingRef.current = false;
      setIsIdle(true);
      setStatusMessage("Ready to begin");
      return;
    }
    
    const requestId = generateTokenRequestId();
    setIsTokenRequesting(true);
    
    // Set both ref and state immediately
    isStartingRef.current = true;
    setIsStarting(true);
    setIsIdle(false);
    setStatusMessage("Requesting microphone access...");
    
    let micStream: MediaStream | null = null;
    
    try {
      // ============================================
      // STEP 1: Request Microphone (with mount check and timeout)
      // ============================================
      console.log('Step 1: Requesting microphone access...');
      
      // FIX #2: Timeout guard on getUserMedia (5 seconds)
      // Browsers can hang indefinitely if permission dialog is ignored
      const MIC_TIMEOUT_MS = 5000;
      
      try {
        const micPromise = navigator.mediaDevices.getUserMedia({ 
          audio: {
            sampleRate: 48000,  // Match Opus encoder expectations (ElevenLabs uses Opus)
            channelCount: 1,
            echoCancellation: true,     // Keep enabled for WebRTC
            noiseSuppression: false,     // Disable - ElevenLabs handles this server-side
            autoGainControl: false,     // Disable - prevents initial gating artifacts
          } 
        });
        
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('TIMEOUT'));
          }, MIC_TIMEOUT_MS);
        });
        
        micStream = await Promise.race([micPromise, timeoutPromise]);
      } catch (micError: any) {
        console.error('Microphone access error:', micError);
        
        // Check for timeout
        if (micError.message === 'TIMEOUT') {
          console.error('Microphone request timeout - browser may have blocked permission dialog');
          throw new Error('Microphone access timed out. Please check your browser settings and allow microphone access.');
        }
        
        throw new Error(
          micError.name === 'NotAllowedError' 
            ? 'Microphone access denied. Please allow microphone access and try again.'
            : micError.name === 'NotFoundError'
            ? 'No microphone found. Please connect a microphone and try again.'
            : `Microphone error: ${micError.message}`
        );
      }
      
      // CRITICAL: Check mount state immediately after mic request
      if (!isMountedRef.current) {
        console.log('Component unmounted during mic request - aborting start');
        micStream.getTracks().forEach(t => t.stop()); // Clean up immediately
        return; // Don't reset refs - finally block handles it
      }
      
      // Release the stream - we just needed permission
      console.log('Microphone access granted, releasing stream...');
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
      
      // Small delay to ensure browser fully releases the mic
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // ============================================
      // STEP 2: Fetch Token (with mount check)
      // ============================================
      if (!isMountedRef.current) {
        console.log('Component unmounted before token fetch - aborting');
          return;
        }
        
      setStatusMessage("Connecting to interview service...");
      console.log('Step 2: Fetching conversation token...', { requestId });
      
      // Check for cached token first
      let cachedSignedUrl = tokenCacheRef.current;
      let tokenData: any = null;
      
      if (cachedSignedUrl) {
        console.log('[TOKEN] Using pre-warmed token');
        tokenData = { signed_url: cachedSignedUrl, signedUrl: cachedSignedUrl };
        tokenCacheRef.current = null; // Clear cache after use
      } else {
        // Fetch token if not cached
        const authToken = localStorage.getItem('auth_token');
        const tokenResponse = await fetch(getApiUrl('/api/conversation-token'), {
          method: 'GET',
          credentials: 'include',
          headers: {
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
            'X-Request-Id': requestId,
          },
        });
        
        // Check mount state after fetch
        if (!isMountedRef.current) {
          console.log('Component unmounted during token fetch - aborting');
          return;
        }

        tokenData = await tokenResponse.json();
        
        if (!tokenResponse.ok) {
          // Handle structured error response
          if (tokenData.error) {
          const errorCode = tokenData.error.code || 'UNKNOWN';
          const errorMessage = tokenData.error.message || tokenResponse.statusText || 'Failed to get conversation token';
          const upstreamStatus = tokenData.error.upstreamStatus;
          
          console.error('[TOKEN REQUEST] Error response:', { 
            status: tokenResponse.status, 
            code: errorCode, 
            message: errorMessage,
            upstreamStatus,
            requestId 
          });
          
          // Provide user-friendly messages based on error code
          if (tokenResponse.status === 429) {
            if (errorCode === 'TOO_MANY_CONCURRENT' || errorMessage.includes('concurrent')) {
              throw new Error('Too many concurrent sessions. Close other sessions and wait 10–30s.');
            } else if (errorCode === 'SYSTEM_BUSY' || errorMessage.includes('busy')) {
              throw new Error('Service busy. Try again in a few seconds.');
            } else {
              throw new Error('Rate limit exceeded. Please wait a moment and try again.');
            }
          }
          
          throw new Error(errorMessage);
          }
          const failureMessage = tokenResponse.statusText || 'Failed to get conversation token';
          throw new Error(failureMessage);
        }
      }
      const successPayload = tokenData.success || tokenData;
      const downstreamRequestId = successPayload.requestId || tokenData.requestId || requestId;
      
      // Extract signed_url from ElevenLabs response (snake_case from API)
      // Backend returns: { signed_url, signedUrl, agentId, clientId }
      const signedUrl = successPayload.signed_url || successPayload.signedUrl || tokenData.signed_url || tokenData.signedUrl;
      
      if (!signedUrl) {
        console.error('[TOKEN] Missing signed_url in response:', { successPayload, tokenData });
        throw new Error('No signed URL received from server for WebRTC connection');
      }
      
      // Validate signed URL structure
      if (typeof signedUrl !== 'string' || signedUrl.length === 0) {
        console.error('[TOKEN] Invalid signed_url format:', { signedUrl, type: typeof signedUrl });
        throw new Error('Invalid signed URL format received from server');
      }
      
      console.log('[WebRTC] Received signed URL:', { 
        requestId: downstreamRequestId,
        hasSignedUrl: !!signedUrl,
        signedUrlLength: signedUrl.length,
        signedUrlPreview: signedUrl.substring(0, 50) + '...',
        agentId: successPayload.agentId || tokenData.agentId,
      });
      if (successPayload.agentId) {
        agentIdRef.current = successPayload.agentId;
      } else if (tokenData.agentId) {
        agentIdRef.current = tokenData.agentId;
      }
      
      
      // ============================================
      // STEP 2.5: Resume AudioContext (CRITICAL - prevents first-packet distortion)
      // ============================================
      console.log('[AUDIO] Resuming AudioContext before session start...');
      await resumeAudioContext();
      
      // ============================================
      // STEP 3: Start SDK Session (with mount check)
      // ============================================
      if (!isMountedRef.current) {
        console.log('Component unmounted before SDK start - aborting');
        return;
      }
      
      const dynamicVariables: Record<string, any> = {
        candidate_id: candidateId || sessionId,
        interview_id: sessionId,
        first_name: normalizedFirstName,
        major: normalizedMajor,
      };

      const resumeSummary = resumeTextForSession ? resumeTextForSession.slice(0, 1500) : '';
      const resumeHighlights = resumeTextForSession ? resumeTextForSession.slice(0, 500) : '';

      if (!resumeTextForSession) {
        console.warn('[ELEVEN DEBUG] No resume text available; sending empty resume fields');
      }

      // ElevenLabs substitution requires matching {{variable_name}} placeholders in the agent template; names are case-sensitive.
      dynamicVariables.resume_attached = resumeChars > 0;
      dynamicVariables.resume_summary = resumeSummary;
      dynamicVariables.resume_highlights = resumeHighlights;

      if (shouldDebugEleven()) {
        dynamicVariables.resume_sentinel = elevenDebugConstants.SENTINEL;
      }

      // Use signedUrl - the SDK will automatically upgrade to WebRTC if available/supported
      // Don't manually override transport - let the SDK handle the upgrade handshake
      console.log('[WebRTC] Starting session with Signed URL...', {
        hasSignedUrl: !!signedUrl,
        signedUrlLength: signedUrl.length,
        signedUrlPreview: signedUrl.substring(0, 50) + '...'
      });
      
      if (!signedUrl) {
        throw new Error('Signed URL is required. Token fetch may have failed.');
      }
      
      const startOptions: any = {
        signedUrl: signedUrl, // Pass signedUrl - SDK handles WebRTC upgrade automatically
        dynamicVariables,
        // Voice settings for consistent quality (prevents pops while maintaining naturalness)
        voiceSettings: {
          stability: 0.6,      // Balanced (0.5-0.75 range) - prevents pops while maintaining naturalness
          similarityBoost: 0.75, // High similarity for consistent voice
          style: 0.0,          // Neutral style
          useSpeakerBoost: true, // Enhance clarity
        },
      };

      lastStartDynamicVarsRef.current = startOptions.dynamicVariables;
      const dynamicKeys = Object.keys(dynamicVariables);
      const dynamicSizes = Object.fromEntries(
        dynamicKeys.map((k) => [k, typeof dynamicVariables[k] === 'string' ? (dynamicVariables[k] as string).length : 0])
      );

      console.log(
        `[ELEVEN START] agentId=${agentIdRef.current || 'unknown'} candidateContext_present=${candidateContextPresent} resume_attached=${resumeChars > 0} resumeText_length=${resumeChars} resume_summary_chars=${resumeSummary.length} resume_highlights_chars=${resumeHighlights.length} dynamicVariables_keys=${dynamicKeys.join(',')} sentinel=${shouldDebugEleven() ? 'on' : 'off'} BUILD_ID=${BUILD_ID}`
      );
      if (shouldDebugEleven()) {
        console.log('[ELEVEN START] dynamicVariables object (redacted lengths only)', {
          keys: dynamicKeys,
          sizes: dynamicSizes,
        });
      }
      console.log('[WebRTC] Step 3: Starting ElevenLabs session with option keys:', Object.keys(startOptions));
      console.log('[WebRTC] Start payload values:', { 
        hasSignedUrl: !!startOptions.signedUrl,
        signedUrlLength: startOptions.signedUrl?.length || 0,
        signedUrlPreview: startOptions.signedUrl ? startOptions.signedUrl.substring(0, 50) + '...' : 'not set',
        dynamic_keys: dynamicKeys 
      });

      if (shouldDebugEleven()) {
        if (!resumeTextForSession) {
          console.warn('[ELEVEN DEBUG] No resume data included in dynamicVariables');
        }
        // #region agent log
        debugLog({
          hypothesisId: "H1",
          location: "VoiceInterviewWebSocket.tsx:startInterview",
          message: resumeTextForSession ? "dynamic_variables_with_resume_candidate" : "dynamic_variables_without_resume",
          data: {
            dynamic_keys: dynamicKeys,
            dynamic_sizes: dynamicSizes,
            resume_text_chars: resumeChars,
            resume_source: resumeSourceForSession,
            resume_attached: !!resumeTextForSession,
            sentinel_included: !!dynamicVariables.resume_sentinel,
          },
        });
        // #endregion
      }
      
      const newSessionId = await conversation.startSession(startOptions);
      
      // Check mount after session start
      if (newSessionId && isMountedRef.current) {
        console.log('[FLIGHT_RECORDER] [INTERVIEW] SDK startSession returned conversationId:', {
          conversationId: newSessionId,
          sessionId: sessionId,
          timestamp: new Date().toISOString()
        });
        setConversationId(newSessionId);
        console.log('[ELEVEN STARTED] convId', newSessionId);
      } else {
        console.log('[FLIGHT_RECORDER] [INTERVIEW] SDK startSession did not return conversationId:', {
          newSessionId: newSessionId || null,
          isMounted: isMountedRef.current,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error: any) {
      console.error('Failed to start interview:', error);
      
      // Clean up any lingering mic stream
      if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
      }
      
      // Only update state if still mounted
      if (isMountedRef.current) {
        setIsStarting(false);
        setIsIdle(true); // Return to idle state so user can retry
        setStatusMessage("Ready to begin");
        
        // Show appropriate error message
        const errorMessage = error.message || "Could not connect to interview service.";
        const isMicError = errorMessage.toLowerCase().includes('microphone') || 
                           error.name === 'NotAllowedError' ||
                           error.name === 'NotFoundError';
        
        toast({
          title: isMicError ? "Microphone Error" : "Connection Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      // Always reset the starting ref and token requesting state when done (success or failure)
      if (isMountedRef.current) {
        isStartingRef.current = false;
        setIsTokenRequesting(false);
      }
    }
  }, [candidateContext, candidateId, conversation, firstName, hasStarted, isStarting, isTokenRequesting, major, resumeAudioContext, sessionId, toast]);

  // End interview
  const handleEndInterview = useCallback(async () => {
    if (confirm("Are you sure you want to end the interview?")) {
      setStatusMessage("Ending interview...");
      
      try {
        if (conversation.status === 'connected') {
          console.log('Attempting to END session...');
          await conversation.endSession();
        }
        
        // Always save interview state before navigating
        setStatusMessage("Saving interview...");
        try {
          console.log('[FLIGHT_RECORDER] [INTERVIEW] User click End - saving interview:', {
            sessionId,
            conversationId: conversationId || 'null',
            timestamp: new Date().toISOString()
          });
          const saveResponse = await saveInterview(conversationId, 'user');
          console.log('[FLIGHT_RECORDER] [INTERVIEW] User click End - interview saved, navigating to results:', {
            sessionId,
            conversationId: conversationId || 'null',
            interviewId: saveResponse?.interviewId || 'not provided',
            timestamp: new Date().toISOString()
          });
          // Mark as complete before navigation to prevent cleanup from interfering
          isInterviewCompleteRef.current = true;
          const completeData = { 
            sessionId, 
            conversationId,
            interviewId: saveResponse?.interviewId || null // Include interviewId for direct lookup
          };
          console.log('[FLIGHT_RECORDER] [TRANSITION] User click End - calling onComplete with:', completeData);
          onComplete(completeData);
        } catch (saveError) {
          console.error('[FLIGHT_RECORDER] [INTERVIEW] User click End - error saving interview:', {
            error: saveError,
            sessionId,
            conversationId: conversationId || 'null',
            timestamp: new Date().toISOString()
          });
          // Still navigate even if save fails - user should see results
          // The save-interview endpoint is idempotent and can be retried
          isInterviewCompleteRef.current = true;
          const completeData = { sessionId, conversationId };
          console.log('[FLIGHT_RECORDER] [TRANSITION] User click End - error path, calling onComplete with:', completeData);
          onComplete(completeData);
        }
      } catch (error) {
        console.error('Error ending session:', error);
        // Still try to save and complete even if endSession fails
        try {
          setStatusMessage("Saving interview...");
          await saveInterview(conversationId, 'user');
          isInterviewCompleteRef.current = true;
          onComplete({ sessionId, conversationId });
        } catch (saveError) {
          console.error('Error saving interview:', saveError);
          isInterviewCompleteRef.current = true;
          onComplete({ sessionId, conversationId });
        }
      }
    }
  }, [conversation, conversationId, sessionId, saveInterview, onComplete]);

  // Handle user click to start interview (requires user gesture for mic access)
  const handleStartClick = useCallback(() => {
    console.log('User clicked Start Interview button');
    startInterview();
  }, [startInterview]);

  // Keep conversation ref in sync for cleanup
  const conversationRef = useRef(conversation);
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  // Cleanup on unmount
  useEffect(() => {
    console.log("🟢 COMPONENT MOUNTED");
    isMountedRef.current = true;
    return () => {
      const isComplete = isInterviewCompleteRef.current;
      console.log("🔴 COMPONENT UNMOUNTED - TRIGGERING CLEANUP", { isInterviewComplete: isComplete });
      isMountedRef.current = false;
      
      // Only clean up volume polling - don't interfere if interview completed successfully
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
      
      // Clean up audio context if it exists
      if (micAudioContextRef.current) {
        try {
          micAudioContextRef.current.close();
          micAudioContextRef.current = null;
        } catch (error) {
          console.warn('[CLEANUP] Error closing AudioContext:', error);
        }
      }
      
      // Reset audio buffer state
      audioChunkBufferRef.current = [];
      isAudioBufferingRef.current = true;
      audioBufferStartTimeRef.current = null;
      
      // If interview completed successfully, skip any cleanup that might interfere with navigation
      // The navigation to /results should proceed without interference
      if (isComplete) {
        console.log("✅ Interview completed - skipping cleanup logic to allow navigation");
        return;
      }
      
      // NOTE: We do NOT automatically end the session here anymore.
      // This prevents accidental disconnections during re-renders or Strict Mode cycles.
      // The session should only end when the user clicks "End Interview" or the SDK disconnects naturally.
    };
  }, []);

  // Removed automatic cleanup on hidden state to prevent premature disconnection
  // The component stays mounted even when hidden (isActive=false) so audio can continue


  const isConnected = conversation.status === 'connected';
  const isAiSpeaking = conversation.isSpeaking;

  // When not active, render nothing but stay mounted
  // This prevents unmounting during async operations like getUserMedia
  if (!isActive) {
    return null;
  }

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

            {/* Idle State - Show Start Interview Button */}
            {isIdle && !isStarting && !isTokenRequesting ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="text-center mb-8">
                  <h3 className="text-xl font-semibold mb-2">Ready to Begin</h3>
                  <p className="text-muted-foreground max-w-md">
                    Click the button below to start your voice interview. 
                    You'll be asked to allow microphone access.
                  </p>
                </div>
                
                <Button
                  onClick={handleStartClick}
                  size="lg"
                  disabled={isTokenRequesting || isStarting}
                  className="w-48 h-48 rounded-full text-xl font-bold shadow-2xl bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Mic className="w-12 h-12" />
                    <span>Start Interview</span>
                  </div>
                </Button>
                
                <p className="text-xs text-muted-foreground mt-4">
                  Make sure you're in a quiet environment
                </p>
              </div>
            ) : (
              <>
            {/* Status Indicator - Clear visual feedback for each state */}
            <div className="text-center mb-6">
                  {!isConnected && isStarting ? (
                <div className="flex items-center justify-center gap-2 text-yellow-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">{statusMessage}</span>
                </div>
                  ) : !isConnected ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <div className="w-3 h-3 bg-muted-foreground rounded-full" />
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

            {/* Audio Visualizer - Enhanced for better visibility */}
            <div className="mb-6 flex flex-col items-center justify-center">
              {/* Microphone Activity Indicator */}
              {isConnected && (
                <div className="flex items-center gap-2 mb-2">
                  <div className={`flex items-center gap-2 ${
                    inputVolume > 0.01 
                      ? 'text-green-500' 
                      : 'text-amber-500'
                  }`}>
                    <div className={`h-2 w-2 rounded-full ${
                      inputVolume > 0.01 
                        ? 'bg-green-500 animate-pulse' 
                        : 'bg-amber-500'
                    }`} />
                    <span className="text-xs font-medium">
                      {inputVolume > 0.01 ? 'Microphone active' : 'Microphone ready'}
                    </span>
                  </div>
                </div>
              )}
              <div className={`transition-all duration-300 ${
                conversationMode === 'user_speaking' 
                  ? 'scale-105 drop-shadow-lg' 
                  : conversationMode === 'ai_speaking'
                  ? 'scale-105 drop-shadow-lg'
                  : ''
              }`}>
                <AudioVisualizer
                  inputVolume={inputVolume}
                  outputVolume={outputVolume}
                  mode={conversationMode}
                  width={700}
                  height={140}
                  barCount={70}
                />
              </div>
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
              </>
            )}
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
