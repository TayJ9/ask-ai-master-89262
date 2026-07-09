/**
 * PERF SUMMARY:
 * - Stable keys for transcript list (timestamp + index); PERF note for virtualization if list grows.
 * - Volume interval already threshold-based; ChatGPTVoiceOrb is memoized.
 * - Interview uses InterviewRoomBackground (static) instead of AnimatedBackground to reduce GPU cost.
 */
/**
 * Voice Interview Component using ElevenLabs Conversational AI SDK
 * Clean, production-grade implementation with server-side VAD and optimal latency
 */

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, Loader2, X, User, Headphones, Volume1, VolumeX } from "lucide-react";
import InterviewRoomBackground, {
  interviewRoomCardClassName,
} from "@/components/ui/InterviewRoomBackground";
import ChatGPTVoiceOrb from "@/components/ui/ChatGPTVoiceOrb";
import { getApiUrl, apiPost, ApiError } from "@/lib/api";
import { getYearToDifficulty } from "@/lib/yearToDifficulty";
import { debugLog, initElevenWsDebug, shouldDebugEleven } from "@/lib/wsDebug";
import { motion } from "framer-motion";
import { useAmbientSound } from "@/hooks/useAmbientSound";
import {
  type TranscriptMessage,
  type TranscriptUpdate,
  diagnoseTranscriptUpsert,
  getCurrentLiveTranscriptPair,
  upsertTranscriptMessage,
  extractTranscriptUpdate,
  extractAgentChatResponsePartUpdate,
  extractTentativeAgentDebugUpdate,
  extractAudioAlignmentUpdate,
  shouldApplyAiStreamUpdate,
  shouldIgnoreEmptyAiFinal,
} from "@/lib/transcriptStreaming";
import type { CandidateContext } from "@/lib/candidateContext";

const BUILD_ID = "eleven-resume-logging-v1";

// ============================================================================
// HELPER FUNCTIONS - Defined at top level to prevent TDZ issues
// ============================================================================

/**
 * Generates a unique token request ID for API requests
 */
const generateTokenRequestId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `token-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// ============================================================================
// CONSTANTS - Defined at top level to prevent TDZ issues
// ============================================================================

const MIC_TIMEOUT_MS = 5000;

const PREFERRED_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 16000,
  sampleSize: 16
};

const FALLBACK_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  channelCount: 1
};

const MINIMAL_AUDIO_CONSTRAINTS = { audio: true };

interface VoiceInterviewWebSocketProps {
  sessionId: string;
  firstName: string;
  major: string;
  candidateContext: Omit<CandidateContext, "firstName" | "sessionId"> & { name: string };
  onComplete: (results?: any) => void;
  /** Callback when interview ends via tool call (e.g., MarkInterviewComplete) */
  onInterviewEnd?: (data: { status: string; timestamp: string; reason: string; sessionId?: string; conversationId?: string | null; interviewId?: string | null }) => void;
  /** When false, component stays mounted but renders nothing. Prevents unmount during async ops. */
  isActive?: boolean;
}

function buildTranscriptForSave(messages: TranscriptMessage[]): string | undefined {
  const lines: string[] = [];
  for (const m of messages) {
    const t = (m.text || '').trim();
    if (!t) continue;
    const label = m.type === 'ai' ? 'AI' : 'User';
    lines.push(`${label}: ${t}`);
  }
  const s = lines.join('\n\n');
  return s.length > 0 ? s : undefined;
}

type ConversationMode = 'ai_speaking' | 'listening' | 'user_speaking' | 'processing';

/** Hysteresis: avoids user_speaking ↔ listening flutter near the noise floor */
const MIC_SPEECH_ENTER_LEVEL = 0.04;
const MIC_SPEECH_EXIT_LEVEL = 0.02;

function computeConversationMode(params: {
  status: string;
  isSpeaking: boolean;
  micSpeechLatched: boolean;
  serverProcessing: boolean;
  wasUserSpeaking: boolean;
}): ConversationMode {
  if (params.status !== 'connected') return 'listening';
  if (params.isSpeaking) return 'ai_speaking';
  if (params.micSpeechLatched) return 'user_speaking';
  if (params.serverProcessing) return 'processing';
  if (params.wasUserSpeaking && !params.isSpeaking) return 'processing';
  return 'listening';
}

// Re-renders when streaming text changes on the same bubble.
const TranscriptRow = memo(function TranscriptRow({ transcript }: { transcript: TranscriptMessage }) {
  return (
    <div
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
          <span className="text-xs text-muted-foreground animate-pulse">Speaking...</span>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap">{transcript.text}</p>
    </div>
  );
}, (prev, next) =>
  prev.transcript.text === next.transcript.text &&
  prev.transcript.isFinal === next.transcript.isFinal &&
  prev.transcript.type === next.transcript.type,
);

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
  const transcriptsRef = useRef<TranscriptMessage[]>([]);
  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);
  const [isStarting, setIsStarting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isIdle, setIsIdle] = useState(true); // Start in idle state - requires user click
  // Use refs for volume to prevent frequent re-renders - only update state for UI indicators
  const inputVolumeRef = useRef(0);
  const outputVolumeRef = useRef(0);
  const [inputVolume, setInputVolume] = useState(0); // Only updated for threshold crossings
  const [outputVolume, setOutputVolume] = useState(0); // Only updated for threshold crossings
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isTokenRequesting, setIsTokenRequesting] = useState(false);
  
  // Ambient sound state
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.3);
  
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
  const interviewEndedByRef = useRef<'user' | 'agent' | 'disconnect' | null>(null); // How the interview ended (for save + disconnect races)
  const hasSavedInterviewRef = useRef(false); // Track if interview has been saved to prevent duplicate saves
  const conversationRef = useRef<{ status: string; endSession: () => Promise<void> } | null>(null);
  const savedInterviewIdRef = useRef<string | null>(null); // Last successful save-interview interviewId
  const saveInterviewPromiseRef = useRef<Promise<any> | null>(null); // Store in-flight promise to prevent duplicate saves
  
  // Audio quality improvement refs
  const audioChunkBufferRef = useRef<any[]>([]);
  const isAudioBufferingRef = useRef(true);
  const audioBufferStartTimeRef = useRef<number | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  
  // Latency monitoring refs
  const lastUserSpeechEndTimeRef = useRef<number | null>(null);
  const firstAudioChunkTimeRef = useRef<number | null>(null);
  const lastInputVolumeRef = useRef<number>(0);
  const userSpeechEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasUserSpeakingRef = useRef<boolean>(false); // Track if user was speaking to detect processing state
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Timeout to reset processing state
  const lastIsSpeakingRef = useRef<boolean>(false); // Track previous AI speaking state
  const [serverProcessing, setServerProcessing] = useState(false); // Server-event-driven processing state (more reliable than volume heuristic)
  const serverProcessingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Safety timeout to clear serverProcessing
  const serverProcessingRef = useRef(false);
  serverProcessingRef.current = serverProcessing;

  const conversationModeRef = useRef<ConversationMode>('listening');
  const [conversationMode, setConversationMode] = useState<ConversationMode>('listening');
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const micSpeechLatchedRef = useRef(false);
  const receivedLiveStreamRef = useRef(false);
  const alignmentActiveThisTurnRef = useRef(false);
  const chatPartActiveThisTurnRef = useRef(false);

  const liveTranscriptMessages = useMemo(
    () => getCurrentLiveTranscriptPair(transcripts),
    [transcripts],
  );

  const { toast } = useToast();

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
  const saveInterview = useCallback(async (convId: string | null, endedBy: 'user' | 'agent' | 'disconnect' = 'disconnect') => {
    // If we already have a save in progress, return that promise instead of starting a new one
    if (saveInterviewPromiseRef.current) {
      console.log('[FLIGHT_RECORDER] [INTERVIEW] Save already in progress, reusing existing promise:', {
        sessionId,
        conversationId: convId || 'null',
        endedBy,
        timestamp: new Date().toISOString()
      });
      return saveInterviewPromiseRef.current;
    }
    
    // If we've already successfully saved, return early
    if (hasSavedInterviewRef.current) {
      console.log('[FLIGHT_RECORDER] [INTERVIEW] Interview already saved, skipping duplicate save call:', {
        sessionId,
        conversationId: convId || 'null',
        endedBy,
        timestamp: new Date().toISOString()
      });
      return {
        success: true,
        interviewId: savedInterviewIdRef.current,
        sessionId,
      };
    }
    
    // Create the save promise and store it
    const savePromise = (async () => {
      // Always call save-interview with sessionId (always available)
    // conversationId is optional (may not be available)
    // NOTE: auth token is attached by apiPost/apiFetch from localStorage; no need to read it here.
    // Get agentId with graceful fallback - don't throw error, just warn
    // Backend can handle missing agentId gracefully using getAgentId() fallback
    const agentId = agentIdRef.current || import.meta.env.VITE_ELEVENLABS_AGENT_ID;
    
    if (!agentId) {
      if (import.meta.env.PROD) {
        console.warn('[SAVE-INTERVIEW] VITE_ELEVENLABS_AGENT_ID is missing in production, but attempting to save interview anyway. Backend will use default agent.');
      } else {
        console.log('[SAVE-INTERVIEW] VITE_ELEVENLABS_AGENT_ID is missing in dev mode. Backend will use default agent.');
      }
    }
    
    // Make agent_id optional - backend can infer it if missing
    const clientTranscript = buildTranscriptForSave(transcriptsRef.current);
    const contextFirstName = (firstName || candidateContext?.name || '').trim();
    const contextMajor = (major || candidateContext?.major || '').trim();
    const contextYear = (candidateContext?.year || '').trim();
    const payload: {
      client_session_id: string;
      conversation_id?: string;
      ended_by: string;
      agent_id?: string;
      transcript?: string;
      candidate_context?: {
        first_name: string;
        major: string;
        year: string;
        role?: string;
      };
    } = {
      client_session_id: sessionId, // Always available
      conversation_id: convId || undefined, // Optional - may be null
      ended_by: endedBy,
      // Include agent_id only if available - backend will use getAgentId() fallback if missing
      ...(agentId ? { agent_id: agentId } : {}),
      ...(clientTranscript ? { transcript: clientTranscript } : {}),
      ...(contextFirstName || contextMajor || contextYear
        ? {
            candidate_context: {
              first_name: contextFirstName,
              major: contextMajor,
              year: contextYear,
              ...(contextMajor ? { role: contextMajor } : {}),
            },
          }
        : {}),
    };

    // Retry configuration
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s
    
    let lastError: any = null;
    
    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[FLIGHT_RECORDER] [INTERVIEW] Retry attempt ${attempt}/${MAX_RETRIES} for save-interview`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
          }
          
          console.log('[FLIGHT_RECORDER] [INTERVIEW] Preparing to save interview - payload:', {
            client_session_id: payload.client_session_id,
            conversation_id: payload.conversation_id || 'null/undefined',
            ended_by: payload.ended_by,
            agent_id: payload.agent_id,
            clientTranscriptChars: payload.transcript?.length ?? 0,
            attempt: attempt + 1,
            timestamp: new Date().toISOString()
          });
          console.log('[FLIGHT_RECORDER] [INTERVIEW] Waiting for saveInterview() to complete...');

          // Use shared apiPost so this request benefits from the app-wide 30s abort timeout
          // and consistent error translation (ApiError) instead of a bare fetch.
          let responseData: any;
          try {
            responseData = await apiPost('/api/save-interview', payload);
          } catch (apiError: any) {
            const statusCode = apiError instanceof ApiError ? apiError.statusCode : undefined;

            // Don't retry on 4xx errors (client errors) except 429 (rate limit)
            if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
              console.error('[FLIGHT_RECORDER] [INTERVIEW] Save interview FAILED (client error, no retry):', {
                status: statusCode,
                error: apiError?.message,
                timestamp: new Date().toISOString()
              });
              throw apiError;
            }

            // Retry on 5xx, 429, network errors, and timeouts
            console.error('[FLIGHT_RECORDER] [INTERVIEW] Save interview FAILED (will retry):', {
              status: statusCode ?? 'network/timeout',
              error: apiError?.message,
              attempt: attempt + 1,
              timestamp: new Date().toISOString()
            });
            lastError = apiError;
            continue;
          }

          console.log('[FLIGHT_RECORDER] [INTERVIEW] Save complete - response:', {
            responseData,
            interviewId: responseData?.interviewId || 'not provided',
            attempt: attempt + 1,
            timestamp: new Date().toISOString()
          });

          // Mark as saved only after backend confirms success
          if (responseData?.success) {
            hasSavedInterviewRef.current = true;
            if (responseData?.interviewId) {
              savedInterviewIdRef.current = responseData.interviewId;
            }
          }

          // Return the response data including interviewId for direct navigation
          return responseData;
        } catch (error: any) {
          lastError = error;
          
          // If this is the last attempt, don't continue
          if (attempt === MAX_RETRIES) {
            console.error('[FLIGHT_RECORDER] [INTERVIEW] Save interview FAILED after all retries:', {
              error: error.message || error,
              attempts: attempt + 1,
              timestamp: new Date().toISOString()
            });
            break;
          }
          
          // Log retry attempt
          console.warn(`[FLIGHT_RECORDER] [INTERVIEW] Save interview failed, will retry (attempt ${attempt + 1}/${MAX_RETRIES}):`, error.message || error);
        }
      }
      
      // All retries exhausted
      console.error('Error saving interview end state after retries:', lastError);
      toast({
        title: "Warning",
        description: "Interview end state may not have been saved. Results may be delayed.",
        variant: "destructive",
      });
      // Reset the promise ref on error so we can retry
      saveInterviewPromiseRef.current = null;
      // Return null on error - frontend will use fallback polling
      return null;
    } finally {
      // Clear the promise ref after completion (success or failure)
      // Note: This runs even if we return early from the try block
      if (saveInterviewPromiseRef.current === savePromise) {
        saveInterviewPromiseRef.current = null;
      }
    }
    })();
    
    // Store the promise so concurrent calls can reuse it
    saveInterviewPromiseRef.current = savePromise;
    
    return savePromise;
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

  // Centralized MediaStream cleanup function - defined early so it can be used in other callbacks
  const cleanupMediaStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    try {
      stream.getTracks().forEach(track => {
        if (track.readyState !== 'ended') {
          track.stop();
        }
        // Clear track reference
        track.enabled = false;
      });
      console.log('[CLEANUP] MediaStream tracks stopped');
    } catch (error) {
      console.warn('[CLEANUP] Error stopping MediaStream tracks:', error);
    }
  }, []);

  // AudioContext cleanup function - defined early so it can be used in other callbacks
  const cleanupAudioContext = useCallback(async () => {
    if (micAudioContextRef.current && micAudioContextRef.current.state !== 'closed') {
      try {
        console.log('[CLEANUP] Closing AudioContext');
        await micAudioContextRef.current.close();
        micAudioContextRef.current = null;
        console.log('[CLEANUP] AudioContext closed successfully');
      } catch (error) {
        console.warn('[CLEANUP] Error closing AudioContext:', error);
        micAudioContextRef.current = null; // Clear ref even if close fails
      }
    }
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
    if (serverProcessingTimeoutRef.current) {
      clearTimeout(serverProcessingTimeoutRef.current);
      serverProcessingTimeoutRef.current = null;
    }
    setServerProcessing(false);
    
    // Stop volume polling
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    
    // CRITICAL FIX: Clean up AudioContext on disconnect
    await cleanupAudioContext();
    
    // Agent-initiated disconnect (or MarkInterviewComplete already handled save + navigation)
    if (wasInterviewActive && (isAgentDisconnect || isInterviewCompleteRef.current)) {
      if (isInterviewCompleteRef.current && hasSavedInterviewRef.current) {
        console.log('[FLIGHT_RECORDER] [INTERVIEW] Interview already completed via agent tool — skipping disconnect save/navigation');
        return;
      }

      console.log('[FLIGHT_RECORDER] [INTERVIEW] Agent ended the interview. Saving and navigating...');
      isInterviewCompleteRef.current = true;

      const conversationIdForSave = conversationIdRef.current;
      const endedBy = interviewEndedByRef.current || 'agent';
      console.log('[FLIGHT_RECORDER] [INTERVIEW] Disconnect - saving interview:', {
        sessionId,
        conversationId: conversationIdForSave || 'null',
        endedBy,
        isAgentDisconnect,
        timestamp: new Date().toISOString()
      });

      try {
        const saveResponse = await saveInterview(conversationIdForSave, endedBy);
        const interviewId = saveResponse?.interviewId || savedInterviewIdRef.current;

        if (!interviewId) {
          console.error('[FLIGHT_RECORDER] [INTERVIEW] CRITICAL: saveInterview returned null interviewId');
        }

        const completeData = {
          sessionId,
          conversationId: conversationIdRef.current,
          interviewId: interviewId || null,
        };
        console.log('[FLIGHT_RECORDER] [TRANSITION] Disconnect - calling onComplete with interviewId:', completeData);
        onComplete(completeData);
      } catch (saveError) {
        console.error('[FLIGHT_RECORDER] [INTERVIEW] Background save failed, navigating anyway:', {
          error: saveError,
          sessionId,
          conversationId: conversationIdForSave || 'null',
          timestamp: new Date().toISOString()
        });
        onComplete({
          sessionId,
          conversationId: conversationIdRef.current,
          interviewId: savedInterviewIdRef.current,
        });
      }

      return;
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
          interviewId: saveResponse?.interviewId || savedInterviewIdRef.current || null,
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
        // Still navigate even if save fails - backend should have created interview
        // The save-interview endpoint is idempotent and can be retried
        isInterviewCompleteRef.current = true;
        // Try to get interviewId from error response if available
        let errorInterviewId: string | null = savedInterviewIdRef.current;
        if (error && typeof error === 'object' && 'response' in error) {
          try {
            const errorResponse = await (error as any).response?.json?.();
            errorInterviewId = errorResponse?.interviewId || errorInterviewId;
          } catch {
            // Ignore JSON parse errors
          }
        }
        const completeData = { 
          sessionId, 
          conversationId: conversationIdRef.current,
          interviewId: errorInterviewId,
        };
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
  }, [onComplete, saveInterview, sessionId, cleanupAudioContext]);

  const applyTranscriptUpdate = useCallback((update: TranscriptUpdate) => {
    if (!isMountedRef.current) return;

    const isAiSpeaking = conversationModeRef.current === 'ai_speaking';
    if (
      shouldIgnoreEmptyAiFinal({
        update,
        isAiSpeaking,
        alignmentActive: alignmentActiveThisTurnRef.current,
        chatPartActive: chatPartActiveThisTurnRef.current,
      })
    ) {
      if (import.meta.env.DEV) {
        console.log('[TRANSCRIPT] ignored empty AI final during active stream', {
          alignmentActive: alignmentActiveThisTurnRef.current,
          chatPartActive: chatPartActiveThisTurnRef.current,
          receivedLiveStream: receivedLiveStreamRef.current,
        });
      }
      return;
    }

    if (update.type === 'ai' && update.isFinal) {
      alignmentActiveThisTurnRef.current = false;
      chatPartActiveThisTurnRef.current = false;
    }

    if (
      !shouldApplyAiStreamUpdate({
        update,
        isAiSpeaking,
        alignmentActive: alignmentActiveThisTurnRef.current,
        chatPartActive: chatPartActiveThisTurnRef.current,
      })
    ) {
      if (import.meta.env.DEV) {
        console.log('[TRANSCRIPT] skipped competing stream', {
          streamKind: update.streamKind,
          chars: update.text.length,
          alignmentActive: alignmentActiveThisTurnRef.current,
          chatPartActive: chatPartActiveThisTurnRef.current,
        });
      }
      return;
    }

    if (update.type === 'ai' && update.streamKind === 'alignment' && !update.isFinal) {
      alignmentActiveThisTurnRef.current = true;
    }
    if (
      update.type === 'ai' &&
      update.streamKind === 'chat_part' &&
      !update.isFinal &&
      update.text.trim()
    ) {
      chatPartActiveThisTurnRef.current = true;
    }

    if (update.type === 'ai' && !update.isFinal && update.text.trim()) {
      receivedLiveStreamRef.current = true;
    }

    // SDK onMessage delivers the full AI turn as one final dump. If tentative/alignment
    // already streamed text, prefer finalize-only when the dump has no new content so the
    // bubble does not flash/re-animate. upsertTranscriptMessage also idempotently merges.
    let nextUpdate = update;
    if (
      update.type === 'ai' &&
      update.isFinal &&
      update.streamKind === 'final' &&
      receivedLiveStreamRef.current &&
      !update.text.trim()
    ) {
      nextUpdate = { ...update, finalizeOnly: true };
    }
    if (update.type === 'ai' && update.isFinal) {
      receivedLiveStreamRef.current = false;
    }

    setTranscripts((prev) => {
      const next = upsertTranscriptMessage(prev, nextUpdate);
      if (import.meta.env.DEV) {
        const diag = diagnoseTranscriptUpsert(prev, nextUpdate);
        const afterCounts = {
          ai: next.filter((m) => m.type === 'ai').length,
          student: next.filter((m) => m.type === 'student').length,
          total: next.length,
        };
        console.log('[TRANSCRIPT]', {
          speaker: nextUpdate.type,
          isFinal: nextUpdate.isFinal,
          mergeMode: nextUpdate.mergeMode,
          streamKind: nextUpdate.streamKind,
          finalizeOnly: !!nextUpdate.finalizeOnly,
          chars: nextUpdate.text.length,
          preview: nextUpdate.text.slice(0, 80),
          action: diag.action,
          reason: diag.reason,
          mergeIndex: diag.mergeIndex,
          existingPreview: diag.existingPreview,
          existingIsFinal: diag.existingIsFinal,
          existingStreamKind: diag.existingStreamKind,
          beforeCounts: diag.bubbleCounts,
          afterCounts,
          openedNewBubble: diag.action === 'append_new',
          duplicatedAiRisk:
            nextUpdate.type === 'ai' &&
            diag.action === 'append_new' &&
            diag.bubbleCounts.ai > 0,
        });
      }
      return next;
    });
  }, []);

  const handleMessage = useCallback((message: any) => {
    if (!isMountedRef.current) return;
    console.log('SDK Message metadata:', {
      type: message?.type,
      source: message?.source,
      role: message?.role,
      hasAudio: Boolean(message?.audio_event),
      hasTranscript: Boolean(
        message?.message ||
          message?.user_transcription_event ||
          message?.agent_response_event,
      ),
      hasClientToolCall: Boolean(message?.client_tool_call),
    });

    // Extract before state transitions so tentative user messages can stream
    // into the "You" bubble without being treated as speech-end finals.
    const transcriptUpdate = extractTranscriptUpdate(message);
    
    // --- Server-event-driven processing state ---
    // SDK sends NORMALIZED format to onMessage: { message, role, source } (not raw WebSocket types)
    // source: "user" can be tentative or final in current SDK docs.
    // Also support raw IncomingSocketEvent types (user_transcript, agent_response, etc.) when present

    // User speech finalized -> enter processing (waiting for agent)
    const isUserTranscript =
      message.source === 'user' ||
      message.type === 'user_transcript' ||
      message.user_transcription_event;
    if (isUserTranscript && (transcriptUpdate?.isFinal ?? true)) {
      const trigger = message.source === 'user' ? 'source:user' : message.type || 'user_transcription_event';
      console.log('[PROCESSING_STATE] ENTER processing (user spoke)', { trigger, source: message.source, type: message.type });
      setServerProcessing(true);
      if (serverProcessingTimeoutRef.current) clearTimeout(serverProcessingTimeoutRef.current);
      serverProcessingTimeoutRef.current = setTimeout(() => {
        console.log('[PROCESSING_STATE] EXIT processing (15s timeout - no agent response)');
        setServerProcessing(false);
        serverProcessingTimeoutRef.current = null;
      }, 15000);
    }

    // Agent response started -> exit processing
    const isAgentResponseOrRelated =
      message.source === 'ai' ||
      message.type === 'agent_response' ||
      message.type === 'agent_chat_response_part' ||
      message.type === 'agent_response_correction' ||
      message.type === 'interruption' ||
      message.type === 'internal_tentative_agent_response';
    if (isAgentResponseOrRelated) {
      const trigger = message.source === 'ai' ? 'source:ai' : message.type || 'unknown';
      console.log('[PROCESSING_STATE] EXIT processing (agent responded)', { trigger, source: message.source, type: message.type });
      if (serverProcessingTimeoutRef.current) {
        clearTimeout(serverProcessingTimeoutRef.current);
        serverProcessingTimeoutRef.current = null;
      }
      setServerProcessing(false);
    }

    // Audio: Agent started speaking (first chunk)
    // SDK: AudioClientEvent { type: "audio", audio_event: { audio_base_64, event_id } }
    const isAudioMessage =
      message.type === 'audio' ||
      message.audio_event;
    
    // Latency tracking: Record when first audio chunk arrives
    if (isAudioMessage && !firstAudioChunkTimeRef.current) {
      console.log('[PROCESSING_STATE] EXIT processing (first audio chunk)');
      const audioStartTime = Date.now();
      firstAudioChunkTimeRef.current = audioStartTime;
      if (serverProcessingTimeoutRef.current) {
        clearTimeout(serverProcessingTimeoutRef.current);
        serverProcessingTimeoutRef.current = null;
      }
      setServerProcessing(false); // Agent started responding - exit processing
      
      // Calculate round trip latency if we have user speech end time
      if (lastUserSpeechEndTimeRef.current) {
        const roundTripLatency = audioStartTime - lastUserSpeechEndTimeRef.current;
        console.log(`[Audio Latency] Round Trip: ${roundTripLatency} ms (User stopped speaking → AI audio started)`);
        
        // Reset for next measurement
        lastUserSpeechEndTimeRef.current = null;
      } else {
        console.log('[Audio Latency] AI audio started (no user speech end time available)');
      }
    }
    
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
    
    // SDK: ErrorClientEvent - reset latency refs on error (session may end)
    if (message.type === 'error') {
      firstAudioChunkTimeRef.current = null;
      lastUserSpeechEndTimeRef.current = null;
    }

    // SDK: ClientToolCallMessage { type: "client_tool_call", client_tool_call: { tool_name, tool_call_id, parameters, event_id } }
    if (message.type === 'client_tool_call' || message.client_tool_call) {
      const toolCall = message.client_tool_call || message;
      const toolName = toolCall.tool_name || message.tool_name;
      
      console.log('Tool call received:', {
        toolName,
        toolCallId: toolCall.tool_call_id || message.tool_call_id,
        hasParameters: Boolean(toolCall.parameters || message.parameters),
      });
      
      if (toolName === 'MarkInterviewComplete') {
        console.log('[FLIGHT_RECORDER] [INTERVIEW] MarkInterviewComplete tool call received');

        const handleInterviewComplete = async () => {
          // Mark complete immediately so disconnect races use agent ended_by, not disconnect
          isInterviewCompleteRef.current = true;
          interviewEndedByRef.current = 'agent';

          // End session first so the agent cannot prompt after goodbye while save runs
          if (conversationRef.current?.status === 'connected') {
            try {
              console.log('[FLIGHT_RECORDER] [INTERVIEW] MarkInterviewComplete — ending session');
              await conversationRef.current.endSession();
              console.log('[FLIGHT_RECORDER] [INTERVIEW] MarkInterviewComplete — session ended');
            } catch (endError) {
              console.warn('[FLIGHT_RECORDER] [INTERVIEW] MarkInterviewComplete — endSession failed (non-fatal):', endError);
            }
          }

          try {
            setStatusMessage("Saving interview...");
            console.log('[FLIGHT_RECORDER] [INTERVIEW] MarkInterviewComplete — saving with ended_by=agent', {
              sessionId,
              conversationId: conversationIdRef.current
            });

            const saveResponse = await saveInterview(conversationIdRef.current, 'agent');
            const interviewId = saveResponse?.interviewId || savedInterviewIdRef.current || null;

            console.log('[FLIGHT_RECORDER] [INTERVIEW] MarkInterviewComplete — save complete', {
              interviewId,
              sessionId,
              conversationId: conversationIdRef.current
            });

            if (onInterviewEnd) {
              onInterviewEnd({
                status: 'completed',
                timestamp: new Date().toISOString(),
                reason: 'tool_call',
                sessionId: sessionId,
                conversationId: conversationIdRef.current,
                interviewId: interviewId
              });
            }
          } catch (error: any) {
            console.error('[FLIGHT_RECORDER] [INTERVIEW] MarkInterviewComplete — save failed, still ending session:', error);
            isInterviewCompleteRef.current = true;
            interviewEndedByRef.current = 'agent';
            // Try to get interviewId from error response if available
            let errorInterviewId: string | null = savedInterviewIdRef.current;
            if (error && typeof error === 'object' && 'response' in error) {
              try {
                const errorResponse = await (error as any).response?.json?.();
                errorInterviewId = errorResponse?.interviewId || errorInterviewId;
              } catch {
                // Ignore JSON parse errors
              }
            }
            if (onInterviewEnd) {
              onInterviewEnd({
                status: 'completed',
                timestamp: new Date().toISOString(),
                reason: 'tool_call',
                sessionId: sessionId,
                conversationId: conversationIdRef.current,
                interviewId: errorInterviewId,
              });
            }

            if (conversationRef.current?.status === 'connected') {
              conversationRef.current.endSession().catch((endError: unknown) => {
                console.warn('[FLIGHT_RECORDER] [INTERVIEW] MarkInterviewComplete — endSession failed after save error:', endError);
              });
            }
          }
        };
        
        // Execute async handler
        handleInterviewComplete();
      }
      return; // Don't process tool calls as regular messages
    }
    
    const isAI = transcriptUpdate?.type === 'ai';
    if (import.meta.env.DEV && transcriptUpdate?.type === 'student') {
      console.log('[TRANSCRIPT:MESSAGE] extracted user update', {
        streamKind: transcriptUpdate.streamKind,
        isFinal: transcriptUpdate.isFinal,
        chars: transcriptUpdate.text.length,
        preview: transcriptUpdate.text.slice(0, 80),
      });
    }

    if (shouldDebugEleven() && isAI && transcriptUpdate?.text && !firstAiFinalizedRef.current) {
      firstAiMessageRef.current += transcriptUpdate.text;
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
        transcriptUpdate?.isFinal ||
        message?.type === 'agent_response' ||
        message?.type === 'agent_response_correction' ||
        (message?.text_response_part?.type === 'stop');

      if (explicitFinal) {
        finalize();
      } else {
        firstAiDebounceTimerRef.current = setTimeout(finalize, 600);
      }
    }
    
    if (transcriptUpdate) {
      applyTranscriptUpdate(transcriptUpdate);
    }
  }, [onInterviewEnd, saveInterview, sessionId, applyTranscriptUpdate]);

  const handleAgentChatResponsePart = useCallback((part: {
    text?: string;
    type: 'start' | 'delta' | 'stop';
  }) => {
    const update = extractAgentChatResponsePartUpdate(part);
    if (update) {
      applyTranscriptUpdate(update);
    }
  }, [applyTranscriptUpdate]);

  // Tentative AI arrives only via onDebug (SDK does not call onMessage for it).
  // User tentative_user_transcript can also land here, sometimes wrapped in a debug envelope.
  const handleDebug = useCallback((debug: any) => {
    if (import.meta.env.DEV) {
      const debugType =
        debug?.type ||
        debug?.event ||
        debug?.message?.type ||
        (typeof debug === 'string' ? debug.slice(0, 40) : undefined);
      console.log('[TRANSCRIPT:DEBUG]', {
        debugType,
        keys: debug && typeof debug === 'object' ? Object.keys(debug).slice(0, 12) : [],
        preview:
          typeof debug?.response === 'string'
            ? debug.response.slice(0, 80)
            : typeof debug?.message === 'string'
              ? debug.message.slice(0, 80)
              : typeof debug?.tentative_user_transcription_event?.user_transcript === 'string'
                ? debug.tentative_user_transcription_event.user_transcript.slice(0, 80)
                : undefined,
      });
    }

    const tentativeUpdate = extractTentativeAgentDebugUpdate(debug);
    if (tentativeUpdate) {
      if (import.meta.env.DEV) {
        console.log('[TRANSCRIPT:DEBUG] applied tentative AI', {
          chars: tentativeUpdate.text.length,
          preview: tentativeUpdate.text.slice(0, 80),
        });
      }
      applyTranscriptUpdate(tentativeUpdate);
      return;
    }

    const update = extractTranscriptUpdate(debug);
    if (update) {
      if (import.meta.env.DEV) {
        console.log('[TRANSCRIPT:DEBUG] applied extracted update', {
          speaker: update.type,
          streamKind: update.streamKind,
          isFinal: update.isFinal,
          chars: update.text.length,
          preview: update.text.slice(0, 80),
        });
      }
      applyTranscriptUpdate(update);
      return;
    }

    if (import.meta.env.DEV) {
      console.log('[TRANSCRIPT:DEBUG] no transcript update extracted (tentative user may be missing)');
    }
  }, [applyTranscriptUpdate]);

  // Prefer this path during AI speech: alignment fires per audio chunk when present.
  // If the agent/session omits audio_event.alignment, SDK never calls this — fall back to tentatives.
  const handleAudioAlignment = useCallback((alignment: { chars?: string[] }) => {
    const update = extractAudioAlignmentUpdate(alignment);
    if (update) {
      if (import.meta.env.DEV) {
        console.log('[TRANSCRIPT:ALIGNMENT]', {
          chars: update.text.length,
          preview: update.text.slice(0, 80),
        });
      }
      applyTranscriptUpdate(update);
    } else if (import.meta.env.DEV) {
      console.log('[TRANSCRIPT:ALIGNMENT] empty/ignored alignment payload', {
        charCount: Array.isArray(alignment?.chars) ? alignment.chars.length : 0,
      });
    }
  }, [applyTranscriptUpdate]);

  const handleInterruption = useCallback(() => {
    alignmentActiveThisTurnRef.current = false;
    chatPartActiveThisTurnRef.current = false;
    receivedLiveStreamRef.current = false;
  }, []);

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
    onAgentChatResponsePart: handleAgentChatResponsePart,
    onDebug: handleDebug,
    onAudioAlignment: handleAudioAlignment,
    onInterruption: handleInterruption,
    onError: handleError,
  } as Parameters<typeof useConversation>[0]);

  conversationRef.current = conversation;

  // Keep orb / ambient / status aligned with SDK + live input (mode also updated on 50ms volume tick)
  useEffect(() => {
    const mode = computeConversationMode({
      status: conversation.status,
      isSpeaking: conversation.isSpeaking,
      micSpeechLatched: micSpeechLatchedRef.current,
      serverProcessing: serverProcessingRef.current,
      wasUserSpeaking: wasUserSpeakingRef.current,
    });
    if (mode !== conversationModeRef.current) {
      conversationModeRef.current = mode;
      setConversationMode(mode);
    }
  }, [conversation.status, conversation.isSpeaking, serverProcessing, hasStarted]);

  // Determine if we should play ambient sound (only during actual processing, not during disconnection)
  const shouldPlayAmbientSound = conversationMode === 'processing' && conversation.status === 'connected';

  // Ambient sound hook - only plays during processing state when connected
  useAmbientSound(shouldPlayAmbientSound ? 'processing' : 'idle', {
    enabled: soundEnabled,
    volume: soundVolume
  });

  // Track state transitions and manage processing state timeout
  useEffect(() => {
    if (!hasStarted || conversation.status !== 'connected') return;
    
    // Detect when AI finishes speaking (transitions from speaking to not speaking)
    if (lastIsSpeakingRef.current && !conversation.isSpeaking) {
      // AI just finished speaking - reset processing flag
      wasUserSpeakingRef.current = false;
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    }
    lastIsSpeakingRef.current = conversation.isSpeaking;
    
    // When AI starts speaking, clear processing state (including server-driven)
    if (conversation.isSpeaking) {
      if (serverProcessingTimeoutRef.current) {
        clearTimeout(serverProcessingTimeoutRef.current);
        serverProcessingTimeoutRef.current = null;
      }
      setServerProcessing(false);
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      wasUserSpeakingRef.current = false;
    }
    
  }, [conversation.isSpeaking, conversation.status, hasStarted]);

  // Update status message based on mode
  const prevModeRef = useRef<ConversationMode | null>(null);
  useEffect(() => {
    if (!hasStarted) return;

    if (
      conversation.status === 'connected' &&
      prevModeRef.current !== conversationMode &&
      conversationMode === 'processing'
    ) {
      console.log('[PROCESSING_STATE] UI transitioned to PROCESSING mode', { serverProcessing, isSpeaking: conversation.isSpeaking });
    }
    prevModeRef.current = conversationMode;

    if (conversation.status !== 'connected') return;

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
        setStatusMessage("Processing your response...");
        break;
    }
  }, [conversationMode, hasStarted, conversation.status, serverProcessing, conversation.isSpeaking]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [liveTranscriptMessages]);

  // PERF: Volume state only updates when crossing threshold (0.1) to limit re-renders; refs always updated for AudioVisualizer.
  useEffect(() => {
    if (conversation.status === 'connected' && !volumeIntervalRef.current) {
      const VOLUME_UPDATE_THRESHOLD = 0.1; // Only update state when volume changes by 0.1
      let lastStateInputVolume = 0;
      let lastStateOutputVolume = 0;
      
      volumeIntervalRef.current = setInterval(() => {
        const input = conversation.getInputVolume();
        const output = conversation.getOutputVolume();
        
        // Always update refs (for AudioVisualizer which reads from refs)
        inputVolumeRef.current = input;
        outputVolumeRef.current = output;
        
        // Only update state when volume crosses significant threshold (reduces re-renders)
        if (Math.abs(input - lastStateInputVolume) >= VOLUME_UPDATE_THRESHOLD) {
          setInputVolume(input);
          lastStateInputVolume = input;
        }
        if (Math.abs(output - lastStateOutputVolume) >= VOLUME_UPDATE_THRESHOLD) {
          setOutputVolume(output);
          lastStateOutputVolume = output;
        }
        
        // Mic hysteresis + latency: user stopped speaking (falling edge after latched speech)
        const SPEECH_END_DELAY_MS = 300;
        const wasSpeakingLatched = micSpeechLatchedRef.current;
        if (input >= MIC_SPEECH_ENTER_LEVEL) {
          micSpeechLatchedRef.current = true;
        } else if (input <= MIC_SPEECH_EXIT_LEVEL) {
          micSpeechLatchedRef.current = false;
        }

        if (micSpeechLatchedRef.current) {
          wasUserSpeakingRef.current = true;
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
          }
          if (userSpeechEndTimeoutRef.current) {
            clearTimeout(userSpeechEndTimeoutRef.current);
            userSpeechEndTimeoutRef.current = null;
          }
          lastInputVolumeRef.current = input;
        } else if (wasSpeakingLatched) {
          if (!userSpeechEndTimeoutRef.current) {
            userSpeechEndTimeoutRef.current = setTimeout(() => {
              const speechEndTime = Date.now();
              lastUserSpeechEndTimeRef.current = speechEndTime;
              console.log('[Audio Latency] User stopped speaking at:', speechEndTime);
              userSpeechEndTimeoutRef.current = null;
            }, SPEECH_END_DELAY_MS);
          }
        }

        lastInputVolumeRef.current = input;

        if (wasUserSpeakingRef.current && !conversation.isSpeaking && !micSpeechLatchedRef.current) {
          if (!processingTimeoutRef.current) {
            processingTimeoutRef.current = setTimeout(() => {
              console.log('[State Transition] Processing timeout - resetting to listening');
              wasUserSpeakingRef.current = false;
              processingTimeoutRef.current = null;
            }, 10000);
          }
        } else if (!wasUserSpeakingRef.current && processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }

        const nextMode = computeConversationMode({
          status: conversation.status,
          isSpeaking: conversation.isSpeaking,
          micSpeechLatched: micSpeechLatchedRef.current,
          serverProcessing: serverProcessingRef.current,
          wasUserSpeaking: wasUserSpeakingRef.current,
        });
        if (nextMode !== conversationModeRef.current) {
          conversationModeRef.current = nextMode;
          setConversationMode(nextMode);
        }
      }, 50); // 20fps for smooth visualization
    }
    
    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
      if (userSpeechEndTimeoutRef.current) {
        clearTimeout(userSpeechEndTimeoutRef.current);
        userSpeechEndTimeoutRef.current = null;
      }
    };
  }, [conversation.status, conversation]);

  // AudioContext resume function - ensures browser audio pipeline is ready
  // CRITICAL: Prevents multiple AudioContext initializations which cause crackling/choppy audio
  const resumeAudioContext = useCallback(async (): Promise<void> => {
    // CRITICAL FIX: Close existing AudioContext before creating new one (prevents memory leaks)
    if (micAudioContextRef.current && micAudioContextRef.current.state !== 'closed') {
      console.log('[AUDIO] Closing existing AudioContext before creating new one');
      await cleanupAudioContext();
    }
    
    // Check if we already have an active AudioContext to prevent multiple initializations
    if (micAudioContextRef.current && micAudioContextRef.current.state !== 'closed') {
      console.log('[AUDIO] AudioContext already exists, resuming if suspended...');
      try {
        if (micAudioContextRef.current.state === 'suspended') {
          await micAudioContextRef.current.resume();
          console.log('[AUDIO] Existing AudioContext resumed');
        }
        return; // Reuse existing context to prevent multiple initializations
      } catch (error) {
        console.warn('[AUDIO] Error resuming existing AudioContext, creating new one:', error);
        // Continue to create new context if resume fails
      }
    }
    
    try {
      // Create a temporary AudioContext to resume the browser's audio system
      // Use 16kHz sample rate to match microphone constraints and prevent sample rate mismatch
      const tempContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000 // Match microphone sample rate to prevent crackling
      });
      
      // Store reference to prevent multiple initializations
      micAudioContextRef.current = tempContext;
      
      if (tempContext.state === 'suspended') {
        await tempContext.resume();
        console.log('[AUDIO] Temporary AudioContext resumed - browser audio pipeline ready');
      }
      
      // Play a silent sound to "wake up" the audio system
      // This ensures the browser's audio processing is fully initialized
      // Use 16kHz sample rate to match constraints
      const buffer = tempContext.createBuffer(1, 1, 16000);
      const source = tempContext.createBufferSource();
      source.buffer = buffer;
      source.connect(tempContext.destination);
      source.start(0);
      source.stop(0.001);
      
      // Small delay to ensure audio system is ready
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log('[AUDIO] AudioContext warmup complete (16kHz sample rate)');
      
      // NOTE: Don't close the context here - keep it alive for the session
      // Closing and reopening causes audio drift and crackling
    } catch (error) {
      console.warn('[AUDIO] AudioContext resume failed (non-critical):', error);
      // Don't fail - SDK may handle this internally
      // Clear ref if creation failed
      micAudioContextRef.current = null;
    }
  }, [cleanupAudioContext]);

  // Pre-warm microphone permission and connection (reduces initial latency)
  // NOTE: Using minimal constraints to avoid conflicts with later detailed constraints
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
    const resumeTextForSession =
      candidateContext?.resumeText ||
      candidateContext?.resume_summary ||
      candidateContext?.summary ||
      candidateContext?.resume_highlights ||
      '';
    const resumeSourceForSession = candidateContext?.resumeSource || 'not_provided';
    const resumeChars = resumeTextForSession?.length || 0;
    const candidateContextPresent = !!candidateContext;
    const resumeExpected =
      resumeSourceForSession === 'pdf_upload' || resumeSourceForSession === 'text_resume';

    if (!normalizedFirstName || !normalizedMajor) {
      console.warn('Missing first name or major; using safe defaults for ElevenLabs', { normalizedFirstName, normalizedMajor });
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
      // STEP 1: Request Microphone (with graceful fallback and mount check)
      // ============================================
      console.log('Step 1: Requesting microphone access with optimized constraints...');
      
      // Use module-level constants defined at top of file to prevent TDZ issues
      
      try {
        // Attempt with preferred constraints first
        let micPromise: Promise<MediaStream>;
        
        try {
          console.log('[AUDIO] Attempting microphone access with preferred constraints:', PREFERRED_AUDIO_CONSTRAINTS);
          micPromise = navigator.mediaDevices.getUserMedia({ audio: PREFERRED_AUDIO_CONSTRAINTS });
          
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('TIMEOUT')), MIC_TIMEOUT_MS);
          });
          
          micStream = await Promise.race([micPromise, timeoutPromise]);
          console.log('[AUDIO] Successfully obtained microphone with preferred constraints');
        } catch (preferredError: any) {
          // Check for timeout
          if (preferredError.message === 'TIMEOUT') {
            console.error('[AUDIO] Microphone request timeout');
            throw new Error('Microphone access timed out. Please check your browser settings and allow microphone access.');
          }
          
          // If constraint error, try fallback constraints
          if (preferredError.name === 'OverconstrainedError' || preferredError.name === 'ConstraintNotSatisfiedError') {
            console.warn('[AUDIO] Preferred constraints rejected, trying fallback constraints:', preferredError.message);
            
            try {
              micPromise = navigator.mediaDevices.getUserMedia({ audio: FALLBACK_AUDIO_CONSTRAINTS });
              const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('TIMEOUT')), MIC_TIMEOUT_MS);
              });
              
              micStream = await Promise.race([micPromise, timeoutPromise]);
              console.log('[AUDIO] Successfully obtained microphone with fallback constraints');
            } catch (fallbackError: any) {
              if (fallbackError.message === 'TIMEOUT') {
                throw new Error('Microphone access timed out. Please check your browser settings and allow microphone access.');
              }
              
              // Last resort: minimal constraints
              console.warn('[AUDIO] Fallback constraints rejected, trying minimal constraints:', fallbackError.message);
              micPromise = navigator.mediaDevices.getUserMedia(MINIMAL_AUDIO_CONSTRAINTS);
              const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('TIMEOUT')), MIC_TIMEOUT_MS);
              });
              
              micStream = await Promise.race([micPromise, timeoutPromise]);
              console.log('[AUDIO] Successfully obtained microphone with minimal constraints');
            }
          } else {
            // Non-constraint error (permission denied, no device, etc.) - rethrow
            throw preferredError;
          }
        }
      } catch (micError: any) {
        console.error('[AUDIO] Microphone access error:', micError);
        
        // Check for timeout
        if (micError.message === 'TIMEOUT') {
          console.error('[AUDIO] Microphone request timeout - browser may have blocked permission dialog');
          throw new Error('Microphone access timed out. Please check your browser settings and allow microphone access.');
        }
        
        // User-friendly error messages
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
        cleanupMediaStream(micStream); // Use centralized cleanup
        return; // Don't reset refs - finally block handles it
      }
      
      // Release the stream - we just needed permission
      console.log('Microphone access granted, releasing stream...');
      cleanupMediaStream(micStream);
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

      const tokenData = await tokenResponse.json();
      
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
          if (errorCode === 'RATE_LIMIT_EXCEEDED') {
            throw new Error(errorMessage);
          }
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
      
      const yearStr = (candidateContext?.year || '').trim() || 'Unknown';
      const { technicalDifficulty, technicalDepth, behavioralRatio } = getYearToDifficulty(yearStr === 'Unknown' ? '' : yearStr);

      // Derive first_name from full name or use default
      const derivedFirstName =
        normalizedFirstName ||
        (candidateContext?.name?.trim() && candidateContext.name.trim().split(/\s+/)[0]) ||
        'John Doe';
      const derivedMajor = normalizedMajor || 'Generic';

      // Safe defaults for year-based params when year is unknown
      const effectiveTechnicalDifficulty = yearStr === 'Unknown' ? 'intermediate' : technicalDifficulty;
      const effectiveTechnicalDepth = yearStr === 'Unknown' ? 'standard' : technicalDepth;
      const effectiveBehavioralRatio = yearStr === 'Unknown' ? 60 : behavioralRatio;

      // Use HF-enhanced summary/highlights when available (from PDF upload), else fall back to slice
      const resumeSummary =
        candidateContext?.resume_summary ||
        (resumeTextForSession ? resumeTextForSession.slice(0, 1500) : '');
      const resumeHighlights =
        candidateContext?.resume_highlights ||
        (resumeTextForSession ? resumeTextForSession.slice(0, 500) : '');

      // Question bank for agent (add {{question_bank}} to ElevenLabs agent system prompt)
      const { getQuestionBankForYear } = await import("@/lib/questionBank");
      const questionBank = getQuestionBankForYear(yearStr);

      // ElevenLabs session dynamic variables — exact keys required by dashboard; safe defaults ensure none are missing
      const dynamicVariables: Record<string, string | number> = {
        candidate_id: candidateId || sessionId,
        interview_id: sessionId,
        candidateid: candidateId || sessionId,
        interviewid: sessionId,
        first_name: derivedFirstName,
        major: derivedMajor,
        year: yearStr,
        resume_summary: resumeSummary,
        resume_highlights: resumeHighlights,
        technical_difficulty: effectiveTechnicalDifficulty,
        technical_depth: effectiveTechnicalDepth,
        behavioral_ratio: String(effectiveBehavioralRatio),
        question_bank: questionBank,
      };

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
        overrides: {
          conversation: {
            client_events: [
              'agent_response',
              'agent_response_correction',
              'agent_chat_response_part',
              'interruption',
              'user_transcript',
              'tentative_user_transcript',
              'conversation_initiation_metadata',
              'client_tool_call',
              'internal_tentative_agent_response',
            ],
          },
        },
        // Voice settings optimized for expressiveness and naturalness
        voiceSettings: {
          stability: 0.5,      // Lower for more expressiveness (prioritizes naturalness over consistency)
          similarityBoost: 0.75, // Balanced similarity (prevents high-similarity artifacts)
          style: 0.0,          // Neutral style for professional interviews
          useSpeakerBoost: true, // Enhance clarity
        },
      };

      lastStartDynamicVarsRef.current = startOptions.dynamicVariables;
      const dynamicKeys = Object.keys(dynamicVariables);
      const dynamicVarLengths = Object.fromEntries(
        dynamicKeys.map((k) => [
          k,
          typeof dynamicVariables[k] === 'string' ? (dynamicVariables[k] as string).length : 0,
        ])
      );

      // Log only keys and string lengths before session start (no resume content)
      console.log('[ELEVEN START] dynamicVariables keys and lengths:', dynamicVarLengths);
      if (resumeSummary.length > 0) {
        console.log(
          '[ELEVEN START] Resume context injected via dynamicVariables (server tool GetResumeProfile optional)',
          { interviewid: sessionId, resumeSummaryLen: resumeSummary.length, resumeHighlightsLen: resumeHighlights.length }
        );
      }
      console.log('[WebRTC] Step 3: Starting ElevenLabs session with option keys:', Object.keys(startOptions));
      
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
        cleanupMediaStream(micStream);
      }
      
      // Clean up AudioContext on error
      await cleanupAudioContext();
      
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
  }, [candidateContext, candidateId, conversation, firstName, hasStarted, isStarting, isTokenRequesting, major, resumeAudioContext, sessionId, toast, cleanupMediaStream, cleanupAudioContext]);

  // End interview
  const handleEndInterview = useCallback(async () => {
    if (confirm("Are you sure you want to end the interview?")) {
      const clientTranscript = buildTranscriptForSave(transcriptsRef.current);
      if (hasStartedRef.current && !conversationIdRef.current && !clientTranscript) {
        toast({
          title: "Very short session",
          description:
            "No conversation or transcript was captured yet. Feedback may be unavailable, but you can still view the results page.",
          variant: "destructive",
        });
      }

      setStatusMessage("Ending interview...");
      interviewEndedByRef.current = 'user';
      
      try {
        // CRITICAL: Clean up AudioContext before ending session
        await cleanupAudioContext();
        
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
            clientTranscriptChars: clientTranscript?.length ?? 0,
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
            interviewId: saveResponse?.interviewId || savedInterviewIdRef.current || null,
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
          // Still navigate even if save fails - backend should have created interview
          // The save-interview endpoint is idempotent and can be retried
          isInterviewCompleteRef.current = true;
          // Try to get interviewId from error response if available
          let errorInterviewId: string | null = savedInterviewIdRef.current;
          if (saveError && typeof saveError === 'object' && 'response' in saveError) {
            try {
              const errorResponse = await (saveError as any).response?.json?.();
              errorInterviewId = errorResponse?.interviewId || errorInterviewId;
            } catch {
              // Ignore JSON parse errors
            }
          }
          const completeData = { 
            sessionId, 
            conversationId,
            interviewId: errorInterviewId,
          };
          console.log('[FLIGHT_RECORDER] [TRANSITION] User click End - error path, calling onComplete with:', completeData);
          onComplete(completeData);
        }
      } catch (error) {
        console.error('Error ending session:', error);
        // Still try to save and complete even if endSession fails
        try {
          setStatusMessage("Saving interview...");
          const saveResponse = await saveInterview(conversationId, 'user');
          isInterviewCompleteRef.current = true;
          onComplete({ 
            sessionId, 
            conversationId,
            interviewId: saveResponse?.interviewId || savedInterviewIdRef.current || null,
          });
        } catch (saveError) {
          console.error('Error saving interview:', saveError);
          isInterviewCompleteRef.current = true;
          // Try to get interviewId from error response if available
          let errorInterviewId: string | null = savedInterviewIdRef.current;
          if (saveError && typeof saveError === 'object' && 'response' in saveError) {
            try {
              const errorResponse = await (saveError as any).response?.json?.();
              errorInterviewId = errorResponse?.interviewId || errorInterviewId;
            } catch {
              // Ignore JSON parse errors
            }
          }
          onComplete({ 
            sessionId, 
            conversationId,
            interviewId: errorInterviewId,
          });
        }
      }
    }
  }, [conversation, conversationId, sessionId, saveInterview, onComplete, cleanupAudioContext, toast]);

  // Handle user click to start interview (requires user gesture for mic access)
  const handleStartClick = useCallback(() => {
    console.log('User clicked Start Interview button');
    startInterview();
  }, [startInterview]);

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
      
      // Clean up audio context if it exists (only on unmount, not during session)
      // CRITICAL: Only close AudioContext on component unmount to prevent audio crackling
      if (micAudioContextRef.current && micAudioContextRef.current.state !== 'closed') {
        try {
          console.log('[CLEANUP] Closing AudioContext on component unmount');
          micAudioContextRef.current.close().catch((error: any) => {
            console.warn('[CLEANUP] Error closing AudioContext:', error);
          });
          micAudioContextRef.current = null;
        } catch (error) {
          console.warn('[CLEANUP] Error closing AudioContext:', error);
          micAudioContextRef.current = null; // Clear ref even if close fails
        }
      }
      
      // Reset audio buffer state
      audioChunkBufferRef.current = [];
      isAudioBufferingRef.current = true;
      audioBufferStartTimeRef.current = null;
      
      // Reset latency tracking state
      firstAudioChunkTimeRef.current = null;
      lastUserSpeechEndTimeRef.current = null;
      lastInputVolumeRef.current = 0;
      if (userSpeechEndTimeoutRef.current) {
        clearTimeout(userSpeechEndTimeoutRef.current);
        userSpeechEndTimeoutRef.current = null;
      }
      
      // Clean up processing state tracking
      wasUserSpeakingRef.current = false;
      lastIsSpeakingRef.current = false;
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      if (serverProcessingTimeoutRef.current) {
        clearTimeout(serverProcessingTimeoutRef.current);
        serverProcessingTimeoutRef.current = null;
      }
      
      // If interview completed successfully, skip any cleanup that might interfere with navigation
      // The navigation to /results should proceed without interference
      if (isComplete) {
        console.log("✅ Interview completed - skipping cleanup logic to allow navigation");
        return;
      }
      
      // CRITICAL FIX: End conversation session on unmount if still active
      // This prevents memory leaks when component unmounts during active interview
      // Note: Cleanup functions can't be async, so we fire-and-forget async operations
      if (conversationRef.current && conversationRef.current.status === 'connected') {
        console.log('[CLEANUP] Ending conversation session on unmount');
        conversationRef.current.endSession().catch((error: any) => {
          console.warn('[CLEANUP] Error ending conversation session:', error);
          // Don't block cleanup if endSession fails
        });
      }
      
      // CRITICAL FIX: Clean up AudioContext on unmount
      // Fire-and-forget since cleanup can't be async
      cleanupAudioContext().catch((error: any) => {
        console.warn('[CLEANUP] Error cleaning up AudioContext:', error);
      });
    };
  }, [cleanupAudioContext]);

  // Removed automatic cleanup on hidden state to prevent premature disconnection
  // The component stays mounted even when hidden (isActive=false) so audio can continue


  const isConnected = conversation.status === 'connected';
  const isAiSpeaking = conversation.isSpeaking;
  /** When disconnected/connecting, keep orb in a neutral listening palette (not "processing") */
  const orbVisualMode: ConversationMode = isConnected ? conversationMode : 'listening';

  // When not active, render nothing but stay mounted
  // This prevents unmounting during async operations like getUserMedia
  if (!isActive) {
    return null;
  }

  return (
    <InterviewRoomBackground className="flex min-h-screen flex-col items-center px-4 pb-10 pt-2 sm:px-6 sm:pt-4">
      <div className="w-full max-w-3xl space-y-6">
        <Card className={interviewRoomCardClassName}>
          <CardContent className="p-5 sm:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Live session
                </p>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Voice interview</h2>
                <p className="text-sm text-muted-foreground sm:text-base">
                  {candidateContext.major} <span className="text-border">·</span> {candidateContext.year}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 sm:max-w-[min(100%,20rem)]">
                <Badge
                  variant="outline"
                  className={
                    isConnected
                      ? "border-emerald-500/40 bg-emerald-50 text-emerald-800"
                      : conversation.status === "connecting"
                        ? "border-amber-500/40 bg-amber-50 text-amber-900"
                        : "border-border bg-muted/60 text-muted-foreground"
                  }
                >
                  <span
                    className={
                      "mr-1.5 inline-block h-2 w-2 rounded-full " +
                      (isConnected
                        ? "animate-pulse bg-emerald-500"
                        : conversation.status === "connecting"
                          ? "animate-pulse bg-amber-500"
                          : "bg-muted-foreground/50")
                    }
                    aria-hidden
                  />
                  {isConnected
                    ? "Connected"
                    : conversation.status === "connecting"
                      ? "Connecting"
                      : "Disconnected"}
                </Badge>
                <Button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  variant={soundEnabled ? "default" : "outline"}
                  size="sm"
                  className="shrink-0"
                  title={
                    soundEnabled
                      ? "Ambient sound enabled - click to disable"
                      : "Ambient sound disabled - click to enable"
                  }
                >
                  {soundEnabled ? <Volume1 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                <Button
                  onClick={handleEndInterview}
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={!isConnected && !isStarting}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  End
                </Button>
              </div>
            </div>

            {/* Idle State - Show Start Interview Button */}
            {isIdle && !isStarting && !isTokenRequesting ? (
              <motion.div 
                className="flex flex-col items-center justify-center py-12"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
              >
                <motion.div 
                  className="text-center mb-8"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.2, ease: [0.33, 1, 0.68, 1] }}
                >
                  <h3 className="text-xl font-semibold mb-2">Ready to Begin</h3>
                  <p className="text-muted-foreground max-w-md">
                    Click the button below to start your voice interview. 
                    You'll be asked to allow microphone access.
                  </p>
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.5, ease: [0.33, 1, 0.68, 1] }}
                  whileHover={{
                    scale: 1.05,
                    transition: { type: "tween", duration: 0.55, ease: [0.33, 1, 0.68, 1] },
                  }}
                  whileTap={{
                    scale: 0.95,
                    transition: { type: "tween", duration: 0.4, ease: [0.33, 1, 0.68, 1] },
                  }}
                >
                <Button
                  onClick={handleStartClick}
                  size="lg"
                  disabled={isTokenRequesting || isStarting}
                  className="w-48 h-48 rounded-full text-xl font-bold shadow-2xl bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Mic className="w-12 h-12" />
                    <span>Start Interview</span>
                  </div>
                </Button>
                </motion.div>
                
                <motion.p 
                  className="text-xs text-muted-foreground mt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.45, delay: 0.45, ease: [0.33, 1, 0.68, 1] }}
                >
                  Make sure you're in a quiet environment
                </motion.p>
              </motion.div>
            ) : (
              <>
            {/* Status Indicator - Clear visual feedback for each state */}
            <motion.div 
              className="text-center mb-6"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
            >
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
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 bg-blue-600 rounded-full animate-pulse" />
                  </div>
                      <span className="font-medium text-lg">AI is speaking...</span>
                </div>
                  ) : conversationMode === 'processing' ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-medium text-lg">Processing your response...</span>
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
            </motion.div>

            {/* Audio Visualizer - Enhanced for better visibility */}
            <motion.div 
              className="mb-6 flex flex-col items-center justify-center"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.33, 1, 0.68, 1] }}
            >
              <div className={`transition-all duration-500 w-full max-w-3xl mx-auto px-4 flex justify-center ${
                orbVisualMode === 'user_speaking' 
                  ? 'scale-105 drop-shadow-lg' 
                  : orbVisualMode === 'ai_speaking'
                  ? 'scale-105 drop-shadow-lg'
                  : ''
              }`}>
                <ChatGPTVoiceOrb
                  inputVolume={inputVolume}
                  outputVolume={outputVolume}
                  mode={orbVisualMode}
                  size={280}
                />
              </div>
            </motion.div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className={interviewRoomCardClassName}>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Live Transcript</h3>
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {liveTranscriptMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {isConnected && conversation.isSpeaking
                    ? 'Listening for live transcript events… If text never appears, enable client events on your ElevenLabs agent: internal_tentative_agent_response, tentative_user_transcript, user_transcript, and agent_response.'
                    : 'Transcript will appear here as the conversation progresses...'}
                </p>
              ) : (
                liveTranscriptMessages.map((transcript, index) => (
                  <TranscriptRow
                    key={`${transcript.type}-${transcript.timestamp}-${index}`}
                    transcript={transcript}
                  />
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </CardContent>
        </Card>
      </div>
    </InterviewRoomBackground>
  );
}
