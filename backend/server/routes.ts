import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { insertProfileSchema, insertInterviewSessionSchema, insertInterviewResponseSchema, insertInterviewSchema, interviews, elevenLabsInterviewSessions, insertElevenLabsInterviewSessionSchema } from "../shared/schema";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import multer from "multer";
import pdfParse from "pdf-parse";
import { Readable } from "stream";
import FormData from "form-data";
import { v4 as uuidv4 } from "uuid";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { randomUUID, createHmac } from "crypto";
import { db } from "./db";
import { sql, eq } from "drizzle-orm";
import { evaluationQueue, recordTerminalEvaluationFailure } from "./evaluation";
import { normalizeEvaluationJson, scoreInterview, EvaluationJsonSchema } from "./llm/openaiEvaluator";
import { buildResumeProfile } from "./resumeProfileHeuristic";
import { stripResumeContactInfo } from "./resumeSanitize";
import { persistResumeForSession } from "./persistResume";
import {
  mergeElevenLabsToolInput,
  normalizeElevenLabsToolBody,
  readElevenLabsApiSecret,
  readElevenLabsToolCandidateId,
  readElevenLabsToolConversationId,
  readElevenLabsToolInterviewId,
  summarizeElevenLabsToolBody,
  summarizeElevenLabsToolRequest,
} from "./elevenLabsToolRequest";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VOICE_FIXTURES_DIR = join(__dirname, "..", "..", "test-fixtures", "voice");

import { getJwtSecretForSigning, isJwtSecretConfigured } from "./jwtSecret";
import {
  ACCESS_GATE_TIMEZONE,
  ACCESS_GATE_TIMEZONE_LABEL,
  getAccessCookieExpiresAt,
  getAccessCookieFromRequest,
  getCurrentAccessCode,
  getAccessSessionExpiresMs,
  hasValidAccessCookie,
  isAccessGateEnabled,
  signAccessCookie,
  verifyAccessCode,
} from "./accessGate";
import { requireAccessCookieForAuth, setAccessCookie, clearAccessCookie } from "./requireAccessGate";
import {
  generateVerificationToken,
  hashVerificationToken,
  isVerificationTokenExpired,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from "./emailVerification";
import { sendVerificationEmail } from "./email";

const isProd = process.env.NODE_ENV === "production";

/** Stable rate-limit key per client IP (IPv6-aware via express-rate-limit helper). */
function rateLimitIpKey(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  return ipKeyGenerator(ip);
}

function getJWTSecret(): string {
  return getJwtSecretForSigning();
}

function getAgentId(): string {
  return process.env.ELEVENLABS_AGENT_ID || "agent_8601kavsezrheczradx9qmz8qp3e";
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const RESUME_FULLTEXT_MAX_CHARS = 12000;
const TOKEN_CACHE_TTL_MS = 10 * 1000;
const MAX_TOKEN_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 250;
const TOKEN_FETCH_TIMEOUT_MS = Number(process.env.CONVERSATION_TOKEN_FETCH_TIMEOUT_MS ?? 10_000);
const MAX_TOKEN_RETRY_DELAY_MS = Number(process.env.CONVERSATION_TOKEN_MAX_RETRY_DELAY_MS ?? 2_000);

const tokenResponseCache = new Map<string, { timestamp: number; status: number; body: any }>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Format transcript array into readable string format
 * Handles various message formats from ElevenLabs API
 */
function formatTranscriptArray(messages: any[]): string {
  const formattedLines: string[] = [];
  
  for (const msg of messages) {
    // Handle different message formats
    const role = msg.role || msg.source || msg.speaker || 'unknown';
    const text = msg.text || msg.message || msg.content || '';
    
    if (text && text.trim()) {
      // Format as "Role: text"
      const roleLabel = role === 'assistant' || role === 'ai' || role === 'agent' 
        ? 'AI' 
        : role === 'user' || role === 'candidate' 
        ? 'User' 
        : role.charAt(0).toUpperCase() + role.slice(1);
      
      formattedLines.push(`${roleLabel}: ${text.trim()}`);
    }
  }
  
  return formattedLines.join('\n\n');
}

type NormalizedElevenLabsWebhook = {
  eventType: string | null;
  conversation_id: string | null;
  user_id: string | null;
  agent_id: string | null;
  transcript: string | null;
  duration: number | null;
  status: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  year: string | null;
  skipProcessing: boolean;
  skipReason?: string;
};

/** Map ElevenLabs post-call webhook payloads (nested under `data`) to our internal shape. */
function normalizeElevenLabsWebhookBody(body: any): NormalizedElevenLabsWebhook {
  const eventType = typeof body?.type === "string" ? body.type : null;
  const payload = body?.data && typeof body.data === "object" ? body.data : body;

  if (eventType === "post_call_audio" || eventType === "call_initiation_failure") {
    return {
      eventType,
      conversation_id: payload.conversation_id ?? null,
      user_id: null,
      agent_id: payload.agent_id ?? null,
      transcript: null,
      duration: null,
      status: null,
      started_at: null,
      ended_at: null,
      year: null,
      skipProcessing: true,
      skipReason: eventType,
    };
  }

  let transcript: string | null = null;
  if (typeof payload.transcript === "string") {
    transcript = payload.transcript;
  } else if (Array.isArray(payload.transcript)) {
    transcript = formatTranscriptArray(payload.transcript);
  }

  const metadata =
    payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  const duration =
    typeof payload.duration === "number"
      ? payload.duration
      : typeof metadata.call_duration_secs === "number"
        ? metadata.call_duration_secs
        : null;

  let started_at: Date | null = null;
  let ended_at: Date | null = null;
  if (typeof payload.started_at === "string") {
    started_at = new Date(payload.started_at);
  } else if (typeof metadata.start_time_unix_secs === "number") {
    started_at = new Date(metadata.start_time_unix_secs * 1000);
  }
  if (typeof payload.ended_at === "string") {
    ended_at = new Date(payload.ended_at);
  } else if (started_at && duration != null) {
    ended_at = new Date(started_at.getTime() + duration * 1000);
  }

  let year: string | null = null;
  const clientData = payload.conversation_initiation_client_data;
  const dynVars = clientData?.dynamic_variables;
  if (dynVars && typeof dynVars.year === "string" && dynVars.year.trim()) {
    year = dynVars.year.trim();
  } else if (typeof payload.year === "string" && payload.year.trim()) {
    year = payload.year.trim();
  }

  return {
    eventType,
    conversation_id: payload.conversation_id ?? body.conversation_id ?? null,
    user_id: payload.user_id ?? body.user_id ?? null,
    agent_id: payload.agent_id ?? body.agent_id ?? null,
    transcript,
    duration,
    status: payload.status ?? body.status ?? null,
    started_at,
    ended_at,
    year,
    skipProcessing: false,
  };
}

/** Max polls when ConvAI returns 404 or transcript not ready yet (conversation still finalizing). */
const FETCH_TRANSCRIPT_MAX_ATTEMPTS = 6;
const FETCH_TRANSCRIPT_BACKOFF_MS = 2000;

/**
 * Fetch transcript from ElevenLabs API for a given conversation_id
 * Retries on 404 and when JSON has status "processing" or empty transcript (common right after disconnect).
 */
async function fetchTranscriptFromElevenLabs(conversationId: string): Promise<string | null> {
  const apiKey = ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn('[FETCH-TRANSCRIPT] ELEVENLABS_API_KEY not configured, skipping transcript fetch');
    return null;
  }

  const url = `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`;
  const fetchOptions = {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
    },
  };

  const extractTranscriptText = (data: any): string | null => {
    let transcriptText: string | null = null;
    if (data.transcript && typeof data.transcript === 'string') {
      transcriptText = data.transcript;
    } else if (data.transcript && Array.isArray(data.transcript)) {
      transcriptText = formatTranscriptArray(data.transcript);
    } else if (data.messages && Array.isArray(data.messages)) {
      transcriptText = formatTranscriptArray(data.messages);
    } else if (data.conversation) {
      if (typeof data.conversation.transcript === 'string') {
        transcriptText = data.conversation.transcript;
      } else if (Array.isArray(data.conversation.transcript)) {
        transcriptText = formatTranscriptArray(data.conversation.transcript);
      } else if (data.conversation.messages && Array.isArray(data.conversation.messages)) {
        transcriptText = formatTranscriptArray(data.conversation.messages);
      }
    }
    if (!transcriptText || transcriptText.trim().length === 0) return null;
    return transcriptText;
  };

  for (let attempt = 1; attempt <= FETCH_TRANSCRIPT_MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[FETCH-TRANSCRIPT] Fetching transcript for conversation_id: ${conversationId} (attempt ${attempt}/${FETCH_TRANSCRIPT_MAX_ATTEMPTS})`);
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[FETCH-TRANSCRIPT] 404 for conversation_id: ${conversationId} (attempt ${attempt})`);
          if (attempt < FETCH_TRANSCRIPT_MAX_ATTEMPTS) {
            await sleep(FETCH_TRANSCRIPT_BACKOFF_MS);
            continue;
          }
          return null;
        }
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[FETCH-TRANSCRIPT] ElevenLabs API error (${response.status}) for conversation_id ${conversationId}:`, errorText);
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const convStatus =
        typeof data.status === "string" ? data.status.toLowerCase() : "";
      const transcriptText = extractTranscriptText(data);

      if (transcriptText) {
        console.log(`[FETCH-TRANSCRIPT] Successfully fetched transcript (${transcriptText.length} chars) for conversation_id: ${conversationId}`);
        return transcriptText;
      }

      // Conversation exists but transcript not populated yet
      if (convStatus === "processing" || convStatus === "in_progress" || attempt < FETCH_TRANSCRIPT_MAX_ATTEMPTS) {
        console.warn(`[FETCH-TRANSCRIPT] Empty transcript (status=${String(data.status ?? "unknown")}) for ${conversationId} — retrying in ${FETCH_TRANSCRIPT_BACKOFF_MS}ms`);
        if (attempt < FETCH_TRANSCRIPT_MAX_ATTEMPTS) {
          await sleep(FETCH_TRANSCRIPT_BACKOFF_MS);
          continue;
        }
      }

      console.warn(`[FETCH-TRANSCRIPT] Transcript still empty for conversation_id: ${conversationId} after ${attempt} attempt(s)`);
      return null;
    } catch (error: any) {
      console.error(`[FETCH-TRANSCRIPT] Error fetching transcript for conversation_id ${conversationId} (attempt ${attempt}):`, error.message || error);
      if (attempt < FETCH_TRANSCRIPT_MAX_ATTEMPTS && (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message?.includes('fetch'))) {
        await sleep(FETCH_TRANSCRIPT_BACKOFF_MS);
        continue;
      }
      return null;
    }
  }

  return null;
}

/**
 * Persist a transcript when needed, parse it for Q&A pairs, and enqueue evaluation.
 * Centralizes the repeated "write transcript → parse → gate on Q&A pairs → enqueue"
 * pattern used by the webhook and /api/save-interview.
 */
type TranscriptFinalizeJob = {
  interviewId: string;
  conversationId: string | undefined;
  transcript: string | undefined | null;
  source: string;
};

type CandidateContextInput = {
  firstName?: unknown;
  first_name?: unknown;
  name?: unknown;
  major?: unknown;
  year?: unknown;
  role?: unknown;
  target_role?: unknown;
};

function buildCandidateContext(
  input: CandidateContextInput | null | undefined,
): Record<string, string> | null {
  if (!input || typeof input !== "object") return null;
  const ctx: Record<string, string> = {};
  const nameRaw = input.firstName ?? input.first_name ?? input.name;
  if (typeof nameRaw === "string" && nameRaw.trim()) {
    ctx.first_name = nameRaw.trim();
  }
  const majorRaw = input.major;
  if (typeof majorRaw === "string" && majorRaw.trim()) {
    ctx.major = majorRaw.trim();
  }
  const roleRaw = input.role ?? input.target_role;
  if (typeof roleRaw === "string" && roleRaw.trim()) {
    ctx.role = roleRaw.trim();
  } else if (ctx.major) {
    // Upload form "major" is the interview focus; evaluation reads `role`.
    ctx.role = ctx.major;
  }
  const yearRaw = input.year;
  if (typeof yearRaw === "string" && yearRaw.trim()) {
    ctx.year = yearRaw.trim();
  }
  return Object.keys(ctx).length > 0 ? ctx : null;
}

function candidateContextFromResumeProfile(
  profile: Record<string, unknown> | null | undefined,
): Record<string, string> | null {
  if (!profile || typeof profile !== "object") return null;
  return buildCandidateContext({
    firstName: profile.firstName,
    first_name: profile.first_name,
    name: profile.name,
    major: profile.major,
    year: profile.year,
    role: profile.role,
    target_role: profile.target_role,
  });
}

function mergeCandidateContextRecords(
  ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === "string" && value.trim()) {
        merged[key] = value.trim();
      }
    }
  }
  if (merged.major && !merged.role) {
    merged.role = merged.major;
  }
  return merged;
}

/**
 * Merge candidate context onto elevenlabs_interview_sessions (create session if missing).
 * Form fields from resume upload / save-interview must land here for evaluation scoring.
 */
async function mergeCandidateContextOnSession(
  clientSessionId: string,
  userId: string,
  context: Record<string, unknown> | null | undefined,
): Promise<void> {
  const incoming = buildCandidateContext(context as CandidateContextInput);
  if (!incoming) return;

  try {
    const existingSession = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
      where: (sessions: any, { eq }: any) => eq(sessions.clientSessionId, clientSessionId),
    });

    if (existingSession) {
      if (existingSession.userId !== userId) {
        console.warn("[CANDIDATE-CONTEXT] Session ownership mismatch; skipping context merge", {
          clientSessionId,
          hasUserId: !!userId,
        });
        return;
      }
      const existingContext = (existingSession.candidateContext as Record<string, unknown>) || {};
      const merged = mergeCandidateContextRecords(existingContext, incoming);
      await db
        .update(elevenLabsInterviewSessions)
        .set({
          candidateContext: merged,
          updatedAt: new Date(),
        })
        .where(eq(elevenLabsInterviewSessions.clientSessionId, clientSessionId));
      console.log("[CANDIDATE-CONTEXT] Merged onto existing session", {
        clientSessionId,
        keys: Object.keys(merged),
      });
      return;
    }

    const agentId = getAgentId();
    const sessionData = insertElevenLabsInterviewSessionSchema.parse({
      userId,
      agentId,
      clientSessionId,
      candidateContext: incoming,
      status: "started",
    });
    const now = new Date();
    const sessionValues = process.env.DATABASE_URL?.startsWith("file:")
      ? { ...sessionData, id: randomUUID(), startedAt: now, createdAt: now, updatedAt: now }
      : sessionData;
    await db.insert(elevenLabsInterviewSessions).values(sessionValues as any);
    console.log("[CANDIDATE-CONTEXT] Created session with candidate context", {
      clientSessionId,
      keys: Object.keys(incoming),
    });
  } catch (ctxError: unknown) {
    const msg = ctxError instanceof Error ? ctxError.message : String(ctxError);
    console.warn("[CANDIDATE-CONTEXT] Persist skipped:", msg);
  }
}

/**
 * Copy resume uploaded under client_session_id → interviewId before evaluation runs.
 * Request-body resume_text takes precedence when provided.
 */
async function linkResumeFromSessionToInterview(
  clientSessionId: string,
  interviewId: string,
  options?: { resumeTextFromBody?: string; userId?: string | null; source?: string },
): Promise<{ linked: boolean; profile?: Record<string, unknown> }> {
  const logPrefix = options?.source || "[RESUME-LINK]";
  if (options?.resumeTextFromBody?.trim()) {
    const persisted = await persistResumeForSession(
      interviewId,
      options.resumeTextFromBody,
      logPrefix,
      options.userId,
    );
    console.log(`${logPrefix} Stored request resume text for interview`, {
      interviewId,
      hasUserId: !!options.userId,
      resumeTextLength: persisted.resumeText.length,
      hasProfile: !!persisted.resumeProfile,
    });
    return { linked: true, profile: persisted.resumeProfile };
  }

  try {
    const resumeForSession = await storage.getResume(clientSessionId, options?.userId);
    if (resumeForSession?.resumeFulltext) {
      const profile =
        (resumeForSession.resumeProfile as Record<string, unknown> | null) ??
        buildResumeProfile(resumeForSession.resumeFulltext);
      await storage.upsertResume(interviewId, resumeForSession.resumeFulltext, profile, options?.userId);
      console.log(`${logPrefix} Linked resume from session to interview`, {
        clientSessionId,
        interviewId,
        hasUserId: !!options?.userId,
        resumeTextLength: resumeForSession.resumeFulltext.length,
      });
      return { linked: true, profile };
    }
  } catch (resumeLinkError: unknown) {
    const msg = resumeLinkError instanceof Error ? resumeLinkError.message : String(resumeLinkError);
    console.warn(`${logPrefix} Resume session-to-interview link skipped:`, msg);
  }
  return { linked: false };
}

function readResumeUploadCandidateFields(req: any): Record<string, string> | null {
  return buildCandidateContext({
    firstName: req.body?.firstName ?? req.body?.first_name,
    major: req.body?.major,
    year: req.body?.year,
  });
}

async function finalizeInterviewTranscript({
  interviewId,
  conversationId,
  transcript,
  source,
}: TranscriptFinalizeJob): Promise<void> {
  if (!transcript?.trim()) {
    console.log(`[FINALIZE-TRANSCRIPT] ${source}: no transcript available for interview ${interviewId}`);
    await recordTerminalEvaluationFailure(interviewId, 'no_transcript');
    return;
  }

  try {
    const existingInterview = await (db.query as any).interviews?.findFirst({
      where: (interviews: any, { eq }: any) => eq(interviews.id, interviewId),
    });

    if (!existingInterview) {
      console.warn(`[FINALIZE-TRANSCRIPT] ${source}: interview ${interviewId} not found`);
      return;
    }

    if (!existingInterview.transcript) {
      await db.update(interviews)
        .set({ transcript, status: 'completed' })
        .where(eq(interviews.id, interviewId));
      console.log(`[FINALIZE-TRANSCRIPT] ${source}: saved transcript (${transcript.length} chars) for interview ${interviewId}`);
    } else {
      console.log(`[FINALIZE-TRANSCRIPT] ${source}: interview ${interviewId} already has transcript, preserving existing transcript`);
    }

    const transcriptForEvaluation = existingInterview.transcript || transcript;
    const { parseTranscriptWithFallback } = await import('./evaluation');
    const qaPairs = await parseTranscriptWithFallback(transcriptForEvaluation);
    if (qaPairs.length === 0) {
      console.log(`[FINALIZE-TRANSCRIPT] ${source}: transcript has no Q&A pairs - skipping evaluation for interview ${interviewId}`);
      await recordTerminalEvaluationFailure(interviewId, 'no_qa_pairs');
      return;
    }
    console.log(`[FINALIZE-TRANSCRIPT] ${source}: transcript has ${qaPairs.length} Q&A pairs - enqueuing evaluation for interview ${interviewId}`);
    await evaluationQueue.enqueue(interviewId, conversationId || '');
    console.log(`[FINALIZE-TRANSCRIPT] ${source}: evaluation enqueued for interview ${interviewId}`);
  } catch (evalError: any) {
    console.error(`[FINALIZE-TRANSCRIPT] ${source}: error finalizing transcript for interview ${interviewId}:`, evalError?.message || evalError);
    // Don't re-throw - evaluation can be retried later via webhook or stalled-evaluation health check
  }
}

const parseRetryAfter = (value: string | null): number | null => {
  if (!value) return null;
  const seconds = parseInt(value, 10);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    const delay = date - Date.now();
    return delay > 0 ? delay : 0;
  }
  return null;
};

const clampTokenRetryDelay = (delayMs: number): number =>
  Math.max(0, Math.min(delayMs, MAX_TOKEN_RETRY_DELAY_MS));

const describeTokenFetchError = (error: any) => {
  const cause = error?.cause as { code?: string } | undefined;
  return {
    name: error?.name || 'Unknown',
    message: error?.message || String(error),
    code: error?.code || cause?.code,
  };
};

const isRetryableTokenFetchError = (error: any): boolean => {
  const details = describeTokenFetchError(error);
  const message = details.message.toLowerCase();
  return (
    details.name === 'AbortError' ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(details.code || '')
  );
};

const sanitizeLogPayload = (payload: unknown) => {
  if (typeof payload === 'string') {
    return payload.length > 1000 ? payload.slice(0, 1000) + '…' : payload;
  }
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return '<unserializable>';
  }
};

const getCachedTokenResponse = (requestId: string) => {
  const entry = tokenResponseCache.get(requestId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TOKEN_CACHE_TTL_MS) {
    tokenResponseCache.delete(requestId);
    return null;
  }
  return entry;
};

const cacheTokenResponse = (requestId: string, status: number, body: any) => {
  tokenResponseCache.set(requestId, { timestamp: Date.now(), status, body });
  setTimeout(() => {
    tokenResponseCache.delete(requestId);
  }, TOKEN_CACHE_TTL_MS);
};

function authenticateToken(req: any, res: any, next: any) {
  const requestId = req.requestId as string | undefined;
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader) {
      console.error("[Auth] No Authorization header for path:", req.path, { requestId });
      return res.status(401).json({ error: "No authorization header provided", requestId });
    }

    if (!isProd) {
      console.log("[Auth] Header present:", !!authHeader, "path:", req.path);
      const headerPreview = authHeader.length > 30 ? `${authHeader.substring(0, 30)}...` : authHeader;
      console.log("[Auth] Authorization header received:", {
        length: authHeader.length,
        preview: headerPreview,
        startsWithBearer: authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer "),
      });
    }
    
    // Robust token extraction - handle various formats
    let token: string | null = null;
    
    if (typeof authHeader === 'string') {
      // Trim the header first
      const trimmedHeader = authHeader.trim();
      
      // Check for "Bearer " prefix (case-insensitive)
      const bearerPrefix = /^bearer\s+/i;
      if (bearerPrefix.test(trimmedHeader)) {
        // Extract token after "Bearer " prefix
        token = trimmedHeader.replace(bearerPrefix, '').trim();
      } else {
        // If no Bearer prefix, try splitting by space (fallback)
        const parts = trimmedHeader.split(/\s+/);
        if (parts.length >= 2 && parts[0].toLowerCase() === 'bearer') {
          token = parts.slice(1).join(' ').trim();
        } else if (parts.length === 1) {
          // No Bearer prefix, assume entire string is token (for compatibility)
          console.warn('[Auth] No Bearer prefix found, treating entire header as token');
          token = trimmedHeader;
        }
      }
    }

    if (!token) {
      console.error("[Auth] No token extracted from header for path:", req.path, { requestId });
      return res.status(401).json({ error: "Invalid authorization header format. Expected: Bearer <token>", requestId });
    }

    // Trim token to handle any remaining whitespace issues
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      console.error("[Auth] Token empty after trim for path:", req.path, { requestId });
      return res.status(401).json({ error: "Invalid token format", requestId });
    }

    if (!isProd) {
      const tokenPreview = trimmedToken.length > 20 ? `${trimmedToken.substring(0, 20)}...` : trimmedToken;
      console.log("[Auth] Verifying token:", { length: trimmedToken.length, preview: tokenPreview, path: req.path });
    }

    let jwtSecret: string;
    try {
      jwtSecret = getJWTSecret();
    } catch (e) {
      console.error("[Auth] JWT configuration error", { requestId });
      return res.status(500).json({ error: "Server authentication misconfiguration", requestId });
    }

    jwt.verify(trimmedToken, jwtSecret, (err: any, decoded: any) => {
      if (err) {
        console.error("[Auth] Token verify failed:", {
          name: err.name,
          path: req.path,
          requestId,
          ...(isProd ? {} : { message: err.message, tokenLength: trimmedToken.length }),
        });

        let errorMessage = "Invalid token";
        if (err.name === "JsonWebTokenError") {
          errorMessage = "Invalid token format. Please sign in again.";
        } else if (err.name === "TokenExpiredError") {
          errorMessage = "Token expired. Please sign in again.";
        } else if (err.message?.includes("secret")) {
          errorMessage = "Token signature mismatch. Please sign in again to get a new token.";
        }

        return res.status(401).json({ error: errorMessage, requestId });
      }

      if (!isProd) {
        console.log("[Auth] Token ok:", { userId: decoded.userId, path: req.path });
      }

      req.userId = decoded.userId;
      next();
    });
  } catch (error: any) {
    console.error("[Auth] authenticateToken exception:", {
      message: error?.message,
      stack: error?.stack,
      path: req.path,
      requestId,
    });
    return res.status(500).json({
      error: isProd ? "Authentication failed" : `Authentication error: ${error.message}`,
      requestId,
    });
  }
}

/**
 * Register all API routes
 * 
 * This application uses ElevenLabs ConvAI API for voice interview functionality.
 * All OpenAI endpoints have been removed as part of the migration to ElevenLabs.
 * 
 * Active ElevenLabs endpoints:
 * - GET /api/conversation-token - Get conversation token for voice interviews
 * - POST /webhooks/elevenlabs - Receive conversation completion webhooks
 */
export function registerRoutes(app: Express) {
  console.log('[ROUTE REGISTRATION] Starting route registration...');

  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProd ? 30 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => rateLimitIpKey(req),
    handler: (req, res) => {
      const requestId = (req as { requestId?: string }).requestId || randomUUID();
      res.status(429).json({
        error: {
          code: "AUTH_RATE_LIMIT",
          message: "Too many sign-in or sign-up attempts. Please try again later.",
          requestId,
        },
      });
    },
  });
  
  // Favicon handler - prevent 404 errors
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });
  
  // Health check — also at /api/health so Vite's /api proxy resolves a real route
  // (otherwise the request hits embedded Vite middleware and can recurse via proxy).
  const healthCheck = async (_req: Request, res: Response) => {
    try {
      const dbConnected = await storage.checkDbConnection();
      const environment = process.env.NODE_ENV || 'development';
      const port = process.env.PORT || '5000';
      const jwtReady = isJwtSecretConfigured();

      if (dbConnected) {
        res.json({
          status: 'healthy',
          database: 'connected',
          environment,
          port,
          timestamp: new Date().toISOString(),
          services: {
            api: 'operational',
            websocket: 'operational',
            database: 'connected',
          },
          ...(environment === 'development' ? { checks: { jwtConfigured: jwtReady } } : {}),
        });
      } else {
        res.status(500).json({
          status: 'unhealthy',
          database: 'disconnected',
          environment,
          port,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error('Health check error:', error);
      res.status(500).json({
        status: 'unhealthy',
        database: 'error',
        error: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      });
    }
  };
  app.get('/health', healthCheck);
  app.get('/api/health', healthCheck);

  const accessVerifyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProd ? 20 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => rateLimitIpKey(req),
    handler: (req, res) => {
      const requestId = (req as { requestId?: string }).requestId || randomUUID();
      res.status(429).json({
        error: {
          code: "ACCESS_VERIFY_RATE_LIMIT",
          message: "Too many access code attempts. Please try again later.",
          requestId,
        },
      });
    },
  });

  const accessAdminRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isProd ? 60 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => rateLimitIpKey(req),
    handler: (req, res) => {
      const requestId = (req as { requestId?: string }).requestId || randomUUID();
      res.status(429).json({
        error: {
          code: "ACCESS_ADMIN_RATE_LIMIT",
          message: "Too many requests. Please try again later.",
          requestId,
        },
      });
    },
  });

  app.get("/api/access/status", (req, res) => {
    const required = isAccessGateEnabled();
    const cookie = getAccessCookieFromRequest(req);
    const granted = required ? hasValidAccessCookie(req) : true;
    let validUntil: string | undefined;

    if (required && cookie && !granted) {
      clearAccessCookie(res);
    }

    if (required && granted) {
      const expiresAt = getAccessCookieExpiresAt(cookie);
      if (expiresAt != null) {
        validUntil = new Date(expiresAt).toISOString();
      }
    }

    res.json({
      required,
      granted,
      signupEnabled: process.env.ALLOW_SIGNUP !== "false",
      timezone: ACCESS_GATE_TIMEZONE,
      timezoneLabel: ACCESS_GATE_TIMEZONE_LABEL,
      ...(validUntil ? { validUntil } : {}),
    });
  });

  app.get("/api/auth/config", (_req, res) => {
    res.json({
      signupEnabled: process.env.ALLOW_SIGNUP !== "false",
    });
  });

  app.post("/api/access/verify", accessVerifyRateLimiter, (req, res) => {
    if (!isAccessGateEnabled()) {
      return res.json({ ok: true, granted: true });
    }

    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code.trim()) {
      return res.status(400).json({ error: "Access code is required" });
    }

    if (!verifyAccessCode(code)) {
      return res.status(401).json({ error: "Invalid access code" });
    }

    const now = Date.now();
    const token = signAccessCookie(now);
    setAccessCookie(res, token);
    return res.json({
      ok: true,
      validUntil: new Date(getAccessSessionExpiresMs(now)).toISOString(),
    });
  });

  app.post("/api/access/revoke", (_req, res) => {
    clearAccessCookie(res);
    return res.json({ ok: true });
  });

  app.get("/api/access/current", accessAdminRateLimiter, (req, res) => {
    if (!isAccessGateEnabled()) {
      return res.status(404).json({ error: "Access gate is disabled" });
    }

    const adminKey = process.env.ACCESS_GATE_ADMIN_KEY?.trim();
    if (!adminKey) {
      return res.status(503).json({ error: "Admin endpoint is not configured" });
    }

    const provided = req.header("X-Admin-Key");
    if (!provided || provided !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { code, validUntilIso } = getCurrentAccessCode();
    return res.json({
      code,
      validUntil: validUntilIso,
      timezone: ACCESS_GATE_TIMEZONE,
      timezoneLabel: ACCESS_GATE_TIMEZONE_LABEL,
    });
  });

  // Dev-only: Expected dynamicVariables shape for a given year (for test assertions)
  app.get("/api/dev/dynamic-variables-schema", (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Dev endpoint disabled in production" });
    }
    const yearStr = (req.query.year as string) || "";
    const yearLower = yearStr.toLowerCase();
    let technicalDifficulty = "moderate";
    let technicalDepth = "intermediate";
    let behavioralRatio = 50;
    if (yearLower.includes("high school")) {
      technicalDifficulty = "foundational";
      technicalDepth = "basic";
      behavioralRatio = 70;
    } else if (yearLower.includes("freshman")) {
      technicalDifficulty = "basic";
      technicalDepth = "introductory";
      behavioralRatio = 65;
    } else if (yearLower.includes("sophomore")) {
      technicalDifficulty = "basic-intermediate";
      technicalDepth = "foundational";
      behavioralRatio = 60;
    } else if (yearLower.includes("junior")) {
      technicalDifficulty = "intermediate";
      technicalDepth = "moderate";
      behavioralRatio = 50;
    } else if (yearLower.includes("senior")) {
      technicalDifficulty = "intermediate-advanced";
      technicalDepth = "advanced";
      behavioralRatio = 45;
    } else if (yearLower.includes("post grad") || yearLower.includes("postgrad") || yearLower.includes("graduate")) {
      technicalDifficulty = "advanced";
      technicalDepth = "expert";
      behavioralRatio = 40;
    }
    const requiredKeys = ["year", "technical_difficulty", "technical_depth", "behavioral_ratio"];
    return res.json({
      year: yearStr,
      technical_difficulty: technicalDifficulty,
      technical_depth: technicalDepth,
      behavioral_ratio: String(behavioralRatio),
      required_keys: requiredKeys,
    });
  });

  // Dev-only: Fixture replay — runs evaluation pipeline with voice fixtures (no live voice)
  app.post("/api/dev/eval-fixture", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Dev endpoint disabled in production" });
    }

    const body = req.body || {};
    const { fixtureId, studentyear, technicaldifficulty, technicaldepth, behavioralratio } = body;
    if (!fixtureId || typeof fixtureId !== "string") {
      return res.status(400).json({ error: "Missing or invalid fixtureId in body" });
    }

    const safeId = fixtureId.replace(/[^a-z0-9_]/gi, "");
    if (!safeId) {
      return res.status(400).json({ error: "Invalid fixtureId" });
    }

    const { readFileSync, existsSync } = await import("fs");
    const txtPath = join(VOICE_FIXTURES_DIR, `${safeId}.txt`);
    const metaPath = join(VOICE_FIXTURES_DIR, `${safeId}.meta.json`);

    if (!existsSync(txtPath) || !existsSync(metaPath)) {
      return res.status(404).json({ error: `Fixture not found: ${safeId}` });
    }

    try {
      const transcript = readFileSync(txtPath, "utf-8").trim();
      const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
      const question = (meta.prompt_question as string) || "Fixture question";

      const evalParams: Parameters<typeof scoreInterview>[0] = {
        role: "Software Engineer Intern",
        major: "Computer Science",
        resumeText: "CS student. Python, JavaScript. GPA 3.5.",
        questions: [{ question, answer: transcript }],
      };
      if (studentyear != null && typeof studentyear === "string") evalParams.studentYear = studentyear;
      if (technicaldifficulty != null && typeof technicaldifficulty === "string") evalParams.technicalDifficulty = technicaldifficulty;
      if (technicaldepth != null && typeof technicaldepth === "string") evalParams.technicalDepth = technicaldepth;
      if (behavioralratio != null) evalParams.behavioralRatio = typeof behavioralratio === "number" ? behavioralratio : String(behavioralratio);

      const evaluation = await scoreInterview(evalParams);

      const validated = EvaluationJsonSchema.parse(evaluation);
      return res.json(validated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        error: "Evaluation failed",
        ...(isProd ? {} : { details: msg }),
      });
    }
  });

  // Auth endpoints
  app.post("/api/auth/signup", authRateLimiter, requireAccessCookieForAuth, async (req, res) => {
    try {
      const allowSignup = process.env.ALLOW_SIGNUP !== "false";
      if (!allowSignup) {
        return res.status(403).json({ error: "Sign up is disabled. Contact the administrator." });
      }

      const { email, password, fullName } = req.body;
      
      if (!email || !password || !fullName) {
        return res.status(400).json({ error: "Email, password, and full name are required" });
      }
      
      console.log(`[SIGNUP] Attempting to create account for: ${email}`);
      
      const existingUser = await storage.getProfileByEmail(email.toLowerCase().trim());
      if (existingUser) {
        return res.status(400).json({ error: "Email already exists" });
      }

      console.log(`[SIGNUP] Hashing password...`);
      const passwordHash = await bcrypt.hash(password, 10);
      
      console.log(`[SIGNUP] Creating profile in database...`);
      const profile = await storage.createProfile({
        email: email.toLowerCase().trim(),
        fullName: fullName.trim(),
        passwordHash,
      });

      const { token, tokenHash } = generateVerificationToken();
      const sentAt = new Date();
      await storage.updateProfile(profile.id, {
        emailVerificationTokenHash: tokenHash,
        emailVerificationSentAt: sentAt,
      });

      const emailSent = await sendVerificationEmail(profile.email!, token);
      if (!emailSent && !isProd) {
        console.warn(`[SIGNUP] Verification email not sent (RESEND_API_KEY missing?) — dev token logged below`);
        console.warn(`[SIGNUP] Dev verify URL: ${(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "")}/verify-email?token=${token}`);
      }

      console.log(`[SIGNUP] Success! Profile created with ID: ${profile.id}`);
      res.json({
        message: emailSent
          ? "Account created. Check your email to verify your address before signing in."
          : "Account created. Email verification could not be sent — use resend verification or contact support.",
        verificationRequired: true,
      });
    } catch (error: any) {
      console.error("❌ [SIGNUP] Error:", error?.message || error, { code: error?.code, stack: error?.stack });

      let errorMessage = "Signup failed";
      if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) {
        errorMessage = "Database tables not created. Please run database setup script.";
      } else if (error?.message?.includes('connection') || error?.code === 'ECONNREFUSED') {
        errorMessage = "Database connection failed. Please check DATABASE_URL.";
      } else if (!isProd && error?.message) {
        errorMessage = `Signup failed: ${error.message}`;
      }

      const requestId = (req as { requestId?: string }).requestId;
      res.status(500).json({ 
        error: errorMessage,
        requestId,
        details: !isProd ? error?.message : undefined,
      });
    }
  });

  app.post("/api/auth/signin", authRateLimiter, requireAccessCookieForAuth, async (req, res) => {
    try {
      console.log(`[SIGNIN] Request received:`, {
        method: req.method,
        path: req.path,
        body: req.body ? { email: req.body.email, hasPassword: !!req.body.password } : 'no body',
        contentType: req.headers['content-type'],
        origin: req.headers.origin
      });
      
      const { email, password } = req.body;
      
      if (!email || !password) {
        console.log(`[SIGNIN] Missing email or password:`, { hasEmail: !!email, hasPassword: !!password });
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      console.log(`[SIGNIN] Attempting signin for: ${email}`);
      
      const profile = await storage.getProfileByEmail(email.toLowerCase().trim());
      if (!profile || !profile.passwordHash) {
        return res.status(401).json({ error: "No account found with this email address. Please sign up first." });
      }

      console.log(`[SIGNIN] Profile found, verifying password...`);
      const validPassword = await bcrypt.compare(password, profile.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: "Incorrect password. Please try again." });
      }

      console.log(`[SIGNIN] Password valid, generating token...`);

      if (!profile.emailVerifiedAt) {
        return res.status(403).json({
          error: "Please verify your email before signing in. Check your inbox for the verification link.",
          code: "EMAIL_NOT_VERIFIED",
        });
      }

      let token: string;
      try {
        token = jwt.sign({ userId: profile.id }, getJWTSecret(), { expiresIn: '7d' });
      } catch (jwtErr) {
        console.error("[SIGNIN] JWT signing failed:", jwtErr);
        return res.status(500).json({
          error: isProd ? "Signin failed" : "JWT configuration error",
          requestId: (req as { requestId?: string }).requestId,
        });
      }
      
      console.log(`[SIGNIN] Success! Token generated for user: ${profile.id}`);
      res.json({ 
        token,
        user: {
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
          emailVerified: Boolean(profile.emailVerifiedAt),
        }
      });
    } catch (error: any) {
      console.error("❌ [SIGNIN] Error:", error?.message || error, { code: error?.code, stack: error?.stack });

      let errorMessage = "Signin failed";
      if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) {
        errorMessage = "Database tables not created. Please run database setup script.";
      } else if (error?.message?.includes('connection') || error?.code === 'ECONNREFUSED') {
        errorMessage = "Database connection failed. Please check DATABASE_URL.";
      } else if (!isProd && error?.message) {
        errorMessage = `Signin failed: ${error.message}`;
      }

      const requestId = (req as { requestId?: string }).requestId;
      res.status(500).json({ 
        error: errorMessage,
        requestId,
        details: !isProd ? error?.message : undefined,
      });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    try {
      const profile = await storage.getProfileById(req.userId);
      if (!profile) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        emailVerified: Boolean(profile.emailVerifiedAt),
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
      if (!token) {
        return res.status(400).json({ error: "Verification token is required" });
      }

      const tokenHash = hashVerificationToken(token);
      const profile = await storage.getProfileByVerificationTokenHash(tokenHash);
      if (!profile) {
        return res.status(400).json({ error: "Invalid or expired verification link" });
      }

      if (profile.emailVerifiedAt) {
        return res.json({ message: "Email already verified", alreadyVerified: true });
      }

      if (isVerificationTokenExpired(profile.emailVerificationSentAt)) {
        return res.status(400).json({ error: "Verification link has expired. Request a new one." });
      }

      await storage.updateProfile(profile.id, {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationSentAt: null,
      });

      res.json({ message: "Email verified successfully. You can now sign in." });
    } catch (error) {
      console.error("Verify email error:", error);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  app.post("/api/auth/resend-verification", authRateLimiter, async (req, res) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const profile = await storage.getProfileByEmail(email);
      if (!profile || !profile.passwordHash) {
        // Avoid revealing whether account exists
        return res.json({ message: "If an unverified account exists for this email, a verification link was sent." });
      }

      if (profile.emailVerifiedAt) {
        return res.json({ message: "This email is already verified. You can sign in." });
      }

      const sentAt = profile.emailVerificationSentAt;
      if (sentAt) {
        const sentMs = sentAt instanceof Date ? sentAt.getTime() : new Date(sentAt).getTime();
        if (!Number.isNaN(sentMs) && Date.now() - sentMs < VERIFICATION_RESEND_COOLDOWN_MS) {
          return res.status(429).json({ error: "Please wait a minute before requesting another verification email." });
        }
      }

      const { token, tokenHash } = generateVerificationToken();
      const now = new Date();
      await storage.updateProfile(profile.id, {
        emailVerificationTokenHash: tokenHash,
        emailVerificationSentAt: now,
      });

      await sendVerificationEmail(email, token);

      res.json({ message: "Verification email sent. Check your inbox." });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  app.get("/api/interviews", authenticateToken, async (req: any, res) => {
    try {
      const items = await storage.getInterviewsByUserId(req.userId);
      res.json(items);
    } catch (error) {
      console.error("List interviews error:", error);
      res.status(500).json({ error: "Failed to list interviews" });
    }
  });

  // Interview questions
  app.get("/api/questions/:role", authenticateToken, async (req: any, res) => {
    try {
      const { role } = req.params;
      const difficulty = req.query.difficulty || 'medium';
      const questions = await storage.getQuestionsByRole(role, difficulty);
      res.json(questions);
    } catch (error) {
      console.error("Get questions error:", error);
      res.status(500).json({ error: "Failed to get questions" });
    }
  });

  // Interview sessions
  app.post("/api/sessions", authenticateToken, async (req: any, res) => {
    try {
      const data = insertInterviewSessionSchema.parse({
        ...req.body,
        userId: req.userId,
      });
      const session = await storage.createSession(data);
      res.json(session);
    } catch (error) {
      console.error("Create session error:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.get("/api/sessions", authenticateToken, async (req: any, res) => {
    try {
      const sessions = await storage.getSessionsByUserId(req.userId);
      res.json(sessions);
    } catch (error) {
      console.error("Get sessions error:", error);
      res.status(500).json({ error: "Failed to get sessions" });
    }
  });

  app.patch("/api/sessions/:id", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const session = await storage.getSessionById(id);
      
      if (!session || session.userId !== req.userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Only allow updating specific fields
      const allowedFields = z.object({
        status: z.string().optional(),
        overallScore: z.number().optional(),
        feedbackSummary: z.string().optional(),
        completedAt: z.coerce.date().optional(),
      });

      const validatedData = allowedFields.parse(req.body);
      await storage.updateSession(id, validatedData);
      res.json({ success: true });
    } catch (error) {
      console.error("Update session error:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.get("/api/sessions/:id/responses", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const session = await storage.getSessionById(id);
      
      if (!session || session.userId !== req.userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      const responses = await storage.getResponsesBySessionId(id);
      res.json(responses);
    } catch (error) {
      console.error("Get responses error:", error);
      res.status(500).json({ error: "Failed to get responses" });
    }
  });

  // Interview responses
  app.post("/api/responses", authenticateToken, async (req: any, res) => {
    try {
      const session = await storage.getSessionById(req.body.sessionId);
      if (!session || session.userId !== req.userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const data = insertInterviewResponseSchema.parse(req.body);
      const response = await storage.createResponse(data);
      res.json(response);
    } catch (error) {
      console.error("Create response error:", error);
      res.status(500).json({ error: "Failed to create response" });
    }
  });

  // Resume upload endpoint with security measures
  // Configure multer with file size limits and validation
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
    fileFilter: (req, file, cb) => {
      // Only allow PDF files
      if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'));
      }
    }
  });

  const RESUME_SESSION_ID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** Multer wrapper with consistent PDF upload error responses. */
  const resumeMulterSingle = (fieldName: string) => (req: any, res: any, next: any) => {
    upload.single(fieldName)(req, res, (err: any) => {
      if (!err) {
        next();
        return;
      }
      console.error(`[RESUME-UPLOAD] Multer error (${fieldName}):`, {
        error: err.message,
        code: err.code,
        field: err.field,
        name: err.name,
      });
      if (err.code === "LIMIT_FILE_SIZE") {
        const fileSizeMB = err.limit ? (err.limit / (1024 * 1024)).toFixed(2) : "10";
        return res.status(413).json({
          error: "File too large",
          message: `File size exceeds ${fileSizeMB}MB limit. Please compress your PDF or use a smaller file.`,
        });
      }
      if (err.message?.includes("Only PDF")) {
        return res.status(400).json({
          error: "Invalid file type",
          message: "Only PDF files are allowed",
        });
      }
      return res.status(400).json({
        error: "File upload error",
        message: err.message || "Failed to process file upload",
      });
    });
  };

  /** Canonical resume persist handler — PDF (multipart) or pasted text (JSON). */
  const handleResumeUpload = async (req: any, res: Response) => {
    try {
      let resumeText = "";

      if (req.file) {
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        if (req.file.size > MAX_FILE_SIZE) {
          const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
          return res.status(400).json({
            error: "File size exceeds 10MB limit",
            message: `File size (${fileSizeMB}MB) exceeds the 10MB limit. Please compress your PDF or use a smaller file.`,
          });
        }

        try {
          const pdfBuffer = req.file.buffer;
          const pdfMagicBytes = pdfBuffer.slice(0, 4).toString();
          if (pdfMagicBytes !== "%PDF") {
            return res.status(400).json({
              error: "Invalid PDF file",
              message: "File does not appear to be a valid PDF",
            });
          }
          const pdfData = await pdfParse(pdfBuffer);
          resumeText = pdfData.text;
        } catch (error: any) {
          console.error("[RESUME-UPLOAD] PDF parsing error:", error);
          return res.status(400).json({
            error: "Failed to parse PDF file",
            message: "The PDF file could not be processed. Please ensure it is a valid PDF file.",
          });
        }
        req.file.buffer = null as any;
      } else if (req.body?.text) {
        resumeText = String(req.body.text);
      } else {
        return res.status(400).json({ error: "No file or text provided" });
      }

      if (!resumeText || resumeText.trim().length === 0) {
        return res.status(400).json({ error: "Resume text is empty" });
      }

      const requestedSessionId = req.body?.sessionId as string | undefined;
      const sessionId =
        requestedSessionId && RESUME_SESSION_ID_RE.test(requestedSessionId)
          ? requestedSessionId
          : uuidv4();

      const formCandidateContext = readResumeUploadCandidateFields(req);

      let persisted;
      try {
        persisted = await persistResumeForSession(sessionId, resumeText, "[RESUME-UPLOAD]", req.userId);
      } catch (persistError) {
        console.error("[RESUME-UPLOAD] Failed to persist resume text/profile:", {
          error: persistError instanceof Error ? persistError.message : String(persistError),
          sessionId,
          hasUserId: !!req.userId,
          resumeTextLength: resumeText.length,
        });
        return res.status(500).json({
          error: "Failed to persist resume",
          message: "Your resume could not be saved. Please try again.",
        });
      }

      if (formCandidateContext) {
        const mergedProfile = mergeCandidateContextRecords(
          persisted.resumeProfile as Record<string, unknown>,
          formCandidateContext,
        );
        try {
          await storage.upsertResume(sessionId, persisted.resumeText, mergedProfile, req.userId);
          persisted = { ...persisted, resumeProfile: mergedProfile };
        } catch (profileMergeError: unknown) {
          const msg =
            profileMergeError instanceof Error ? profileMergeError.message : String(profileMergeError);
          console.warn("[RESUME-UPLOAD] Could not merge form fields into resume profile:", msg);
        }
        await mergeCandidateContextOnSession(sessionId, req.userId, formCandidateContext);
      }

      res.json({
        sessionId: persisted.sessionId,
        resumeText: persisted.resumeText,
        resume_summary: persisted.resume_summary,
        resume_highlights: persisted.resume_highlights,
        resumeProfile: persisted.resumeProfile,
      });
    } catch (error: any) {
      console.error("[RESUME-UPLOAD] Error processing resume upload:", error);
      res.status(500).json({
        error: "Failed to process resume",
        message: "An error occurred while processing your resume. Please try again.",
      });
    }
  };

  // Canonical resume upload — PDF (field: file) or pasted text (JSON body.text).
  app.post(
    "/api/resume/upload",
    authenticateToken,
    resumeMulterSingle("file"),
    handleResumeUpload,
  );

  // Deprecated alias for older clients/tests that POST multipart field "resume".
  app.post(
    "/api/upload-resume",
    authenticateToken,
    resumeMulterSingle("resume"),
    handleResumeUpload,
  );

  // Voice interview endpoints (proxy to Python Flask server)
  // IMPORTANT: Python backend must run on a DIFFERENT port than Node.js server (5000)
  // Default to 5001 to avoid conflict with Node.js server on port 5000
  // Use 127.0.0.1 instead of localhost for better compatibility in Replit
  const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:5001";
  
  app.post("/api/voice-interview/start", authenticateToken, async (req: any, res) => {
    try {
      // Check if Python backend is configured
      if (!PYTHON_BACKEND_URL) {
        console.error("PYTHON_BACKEND_URL not configured");
        return res.status(500).json({ error: "Python backend URL not configured. Please set PYTHON_BACKEND_URL environment variable." });
      }

      // Proxying voice interview start request to Python backend

      let response;
      try {
        const fetchUrl = `${PYTHON_BACKEND_URL}/api/voice-interview/start`;
        response = await fetch(fetchUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(req.body),
        });
      } catch (fetchError: any) {
        console.error("[VOICE-INTERVIEW-START] Fetch error connecting to Python backend:", fetchError);
        console.error("[VOICE-INTERVIEW-START] Error name:", fetchError.name);
        console.error("[VOICE-INTERVIEW-START] Error code:", fetchError.code);
        console.error("[VOICE-INTERVIEW-START] Error message:", fetchError.message);
        console.error("[VOICE-INTERVIEW-START] Full error:", fetchError);
        
        // Check if it's a connection error
        if (fetchError.code === 'ECONNREFUSED' || 
            fetchError.message?.includes('fetch failed') || 
            fetchError.message?.includes('ECONNREFUSED') ||
            fetchError.name === 'TypeError' && fetchError.message?.includes('fetch')) {
          return res.status(500).json({ 
            error: `Cannot connect to Python backend at ${PYTHON_BACKEND_URL}. Please ensure the Python backend is running and accessible.` 
          });
        }
        
        // For any other fetch error
        return res.status(500).json({ 
          error: `Failed to connect to Python backend: ${fetchError.message || 'Unknown error'}` 
        });
      }

      if (!response.ok) {
        // Try to parse error, but don't fail if it's not JSON
        let errorData;
        let errorText = '';
        try {
          errorText = await response.text();
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `Python backend returned status ${response.status}: ${errorText || 'Unknown error'}` };
        }
        
        console.error("Python backend error response:", errorData);
        console.error("Python backend error text:", errorText);
        
        // Don't pass through auth errors from Python backend - they're not auth errors for our API
        // Python backend doesn't do auth, so any error is a backend issue
        return res.status(500).json({ 
          error: errorData.error || "Failed to start voice interview. Please check if the Python backend is running." 
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Error proxying voice interview start:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      
      // Check if it's a connection error
      if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        return res.status(500).json({ 
          error: `Cannot connect to Python backend at ${PYTHON_BACKEND_URL}. Please ensure the Python backend is running.` 
        });
      }
      
      // If error message contains "No token provided", it might be from Python backend
      // but that shouldn't happen since Python backend doesn't do auth
      if (error.message && error.message.includes('No token provided')) {
        console.error("ERROR: Got 'No token provided' error - this suggests auth middleware issue");
        console.error("This should not happen if authenticateToken middleware ran successfully");
        return res.status(500).json({ 
          error: "Internal server error. Please check if the Python backend is running and accessible." 
        });
      }
      
      res.status(500).json({ error: error.message || "Failed to start voice interview" });
    }
  });

  // Multer for parsing multipart/form-data (audio files)
  // Note: multer parses form fields to req.body, but only when content-type is multipart/form-data
  const audioUpload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });
  
  app.post("/api/voice-interview/send-audio", authenticateToken, audioUpload.single('audio'), async (req: any, res) => {
    try {
      // Check if Python backend is configured
      if (!PYTHON_BACKEND_URL) {
        return res.status(500).json({ error: "Python backend URL not configured." });
      }

      // Processing audio request

      // Handle multipart/form-data (audio file) or JSON
      let pythonResponse;
      
      if (req.file) {
        // Multipart/form-data: audio file was uploaded
        // Use form-data package for Node.js
        const formData = new FormData();
        
        // Add audio file
        formData.append('audio', req.file.buffer, {
          filename: req.file.originalname || 'recording.webm',
          contentType: req.file.mimetype || 'audio/webm',
        });
        
        // Get session_id from req.body (multer puts form fields there)
        const sessionId = req.body?.session_id;
        if (!sessionId) {
          return res.status(400).json({ error: "session_id is required" });
        }
        
        formData.append('session_id', sessionId);
        if (req.body?.audioEncoding) formData.append('audioEncoding', req.body.audioEncoding);
        if (req.body?.sampleRate) formData.append('sampleRate', req.body.sampleRate);
        
        // Forward to Python backend
        pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/api/voice-interview/send-audio`, {
          method: "POST",
          headers: formData.getHeaders(),
          body: formData,
        });
      } else {
        // JSON request (base64 audio) - not typically used but handle it
        if (!req.body || !req.body.session_id) {
          return res.status(400).json({ error: "session_id is required" });
        }
        
        pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/api/voice-interview/send-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(req.body),
        });
      }

      if (!pythonResponse.ok) {
        // Try to parse error
        let errorData;
        let errorText = '';
        try {
          errorText = await pythonResponse.text();
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `Python backend returned status ${pythonResponse.status}: ${errorText || 'Unknown error'}` };
        }
        
        console.error("[AUDIO-PROXY] Python backend error:", errorData);
        return res.status(500).json({ 
          error: errorData.error || "Failed to send audio. Please check if the Python backend is running." 
        });
      }

      // Python backend returns JSON (not raw audio)
      // Check content type to be safe
      const responseContentType = pythonResponse.headers.get('content-type') || '';
      
      if (responseContentType.includes('audio/')) {
        // Forward audio response directly (unlikely but handle it)
        const audioBuffer = await pythonResponse.arrayBuffer();
        res.setHeader('Content-Type', responseContentType);
        res.setHeader('X-Response-Text', pythonResponse.headers.get('X-Response-Text') || '');
        res.setHeader('X-Response-Transcript', pythonResponse.headers.get('X-Response-Transcript') || '');
        res.setHeader('X-Response-IsEnd', pythonResponse.headers.get('X-Response-IsEnd') || 'false');
        res.setHeader('X-Response-Intent', pythonResponse.headers.get('X-Response-Intent') || '');
        res.send(Buffer.from(audioBuffer));
      } else {
        // Forward JSON response (Python returns JSON with base64 audio)
        const data = await pythonResponse.json();
        res.json(data);
      }
    } catch (error: any) {
      console.error("[AUDIO-PROXY] Error proxying audio:", error);
      console.error("[AUDIO-PROXY] Error stack:", error.stack);
      
      // Check if it's a connection error
      if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        return res.status(500).json({ 
          error: `Cannot connect to Python backend at ${PYTHON_BACKEND_URL}. Please ensure the Python backend is running.` 
        });
      }
      
      res.status(500).json({ 
        error: error.message || "Failed to send audio",
        details: error.stack 
      });
    }
  });

  app.post("/api/voice-interview/score", authenticateToken, async (req: any, res) => {
    try {
      // Check if Python backend is configured
      if (!PYTHON_BACKEND_URL) {
        return res.status(500).json({ error: "Python backend URL not configured." });
      }

      const response = await fetch(`${PYTHON_BACKEND_URL}/api/voice-interview/score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `Python backend returned status ${response.status}` };
        }
        
        return res.status(500).json({ 
          error: errorData.error || "Failed to score interview. Please check if the Python backend is running." 
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Error proxying voice interview score:", error);
      
      // Check if it's a connection error
      if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
        return res.status(500).json({ 
          error: "Cannot connect to Python backend. Please ensure the Python backend is running." 
        });
      }
      
      res.status(500).json({ error: error.message || "Failed to score interview" });
    }
  });

  // ============================================================================
  // ElevenLabs Voice Interview Endpoints
  // ============================================================================
  // These endpoints use ElevenLabs ConvAI API for voice interview functionality.
  // All OpenAI endpoints have been removed as part of the migration.
  // ============================================================================

  // Rate limiter for ElevenLabs token endpoint (per user; higher default in development)
  const conversationTokenRateLimitMax = Number(
    process.env.CONVERSATION_TOKEN_RATE_LIMIT_MAX ??
      (process.env.NODE_ENV === "production" ? "5" : "100"),
  );
  const tokenRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: conversationTokenRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  // Use userId from request if available (after auth middleware)
  // For IP fallback, use ipKeyGenerator helper to properly handle IPv6 addresses
  keyGenerator: (req: any) => {
    if (req.userId) {
      return req.userId;
    }
    return rateLimitIpKey(req);
  },
  handler: (req, res) => {
    const requestId = req.header('X-Request-Id') || randomUUID();
    console.warn(`[CONVERSATION-TOKEN] Rate limit exceeded for requestId=${requestId}`);
    const errorBody = {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Maximum ${conversationTokenRateLimitMax} interview starts per hour.`,
      requestId,
    };
    return res.status(429).json({ error: errorBody });
  },
});

  // Get ElevenLabs conversation token for voice interview sessions
  // Note: OPTIONS preflight is handled globally by CORS middleware (see server/index.ts)
  // The logging middleware logs all OPTIONS requests including this route
  // Requires authentication and is rate-limited to 5 requests per hour per user
  console.log('[ROUTE REGISTRATION] Registering route: GET /api/conversation-token');
  app.get("/api/conversation-token", authenticateToken, tokenRateLimiter, async (req: any, res) => {
    const requestId = req.header('X-Request-Id') || randomUUID();
    const timestamp = new Date().toISOString();
    const origin = req.header('Origin');
    const hasRequestIdHeader = !!req.header('X-Request-Id');
    
    console.log(`[CONVERSATION-TOKEN] GET request received`, {
      requestId,
      timestamp,
      origin: origin || 'none',
      hasRequestIdHeader,
      userId: req.userId || 'unknown',
    });
    
    try {
      const cached = getCachedTokenResponse(requestId);
      if (cached) {
        console.log(`[CONVERSATION-TOKEN] Cache HIT - Returning cached result (requestId=${requestId}, timestamp=${timestamp})`);
        return res.status(cached.status).json(cached.body);
      }
      console.log(`[CONVERSATION-TOKEN] Cache MISS - Processing new request (requestId=${requestId}, timestamp=${timestamp})`);

      const userId = req.userId;
      const agentId = getAgentId();
      const apiKey = process.env.ELEVENLABS_API_KEY;

      console.log(`[CONVERSATION-TOKEN] Request from user: ${userId} (requestId=${requestId}, timestamp=${timestamp})`);

      if (!apiKey) {
        console.error('[CONVERSATION-TOKEN] ELEVENLABS_API_KEY not configured');
        const errorBody = {
          code: 'ELEVEN_API_KEY_MISSING',
          message: 'ElevenLabs API key not configured',
          requestId,
        };
        cacheTokenResponse(requestId, 500, { error: errorBody });
        return res.status(500).json({ error: errorBody });
      }

      // Log exact parameters being sent to ElevenLabs (masking API key)
      const maskedApiKey = apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'MISSING';
      console.log(`[CONVERSATION-TOKEN] ElevenLabs API Parameters:`, {
        requestId,
        agentId,
        apiKeyMasked: maskedApiKey,
        apiKeyLength: apiKey?.length || 0,
        timestamp: new Date().toISOString(),
        audioQuality: {
          expectedSampleRate: '16000 Hz',
          expectedCodec: 'Opus (WebRTC)',
          note: 'Frontend requests 16kHz sample rate with 16-bit depth for optimal compatibility and reduced crackling. Agent dashboard should be configured for Opus codec and 16kHz sample rate. Frontend uses graceful fallback if browser rejects constraints.'
        }
      });

      // Use GET /v1/convai/conversation/get_signed_url - this is the standard entry point
      // The SDK will automatically upgrade to WebRTC if available/supported
      const elevenLabsUrl = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`;
      const fetchOptions = {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      };

      console.log(`[CONVERSATION-TOKEN] Fetching signed URL for WebRTC... (requestId=${requestId}, agentId=${agentId})`);
      console.log(`[CONVERSATION-TOKEN] Calling ElevenLabs API: ${elevenLabsUrl}`);

      const fetchResult = await (async function fetchSignedUrl(attempt = 0): Promise<{ success: boolean; signedUrl?: string; status?: number; body?: any; special?: 'concurrent' | 'system_busy' | 'timeout' | 'network'; retryAfterSeconds?: number }> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS);

        let response: globalThis.Response;
        let responseText = '';
        let parsedBody: any = null;

        try {
          response = await fetch(elevenLabsUrl, { ...fetchOptions, signal: controller.signal });
          responseText = await response.text();
          try {
            parsedBody = JSON.parse(responseText);
          } catch {
            parsedBody = null;
          }
        } catch (error: any) {
          const details = describeTokenFetchError(error);
          const timedOut = details.name === 'AbortError';
          console.warn(`[CONVERSATION-TOKEN] ElevenLabs fetch failed (attempt ${attempt + 1})`, {
            requestId,
            timestamp: new Date().toISOString(),
            timeoutMs: TOKEN_FETCH_TIMEOUT_MS,
            ...details,
          });

          if (attempt < MAX_TOKEN_RETRIES && isRetryableTokenFetchError(error)) {
            const delay = clampTokenRetryDelay(
              Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5)),
            );
            console.log(`[CONVERSATION-TOKEN] Retrying fetch failure after ${delay}ms for requestId=${requestId} (attempt ${attempt + 1})`);
            await sleep(delay);
            return fetchSignedUrl(attempt + 1);
          }

          return {
            success: false,
            status: 504,
            special: timedOut ? 'timeout' : 'network',
            body: {
              error: {
                code: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR',
                message: timedOut
                  ? `ElevenLabs token request timed out after ${TOKEN_FETCH_TIMEOUT_MS}ms`
                  : `ElevenLabs token request failed: ${details.message}`,
              },
            },
          };
        } finally {
          clearTimeout(timeout);
        }

        if (response.ok) {
          // ElevenLabs returns: { signed_url: "..." } (snake_case)
          const signedUrl = parsedBody?.signed_url;
          
          if (!signedUrl) {
            console.error('[CONVERSATION-TOKEN] API response missing signed_url:', parsedBody);
            return { 
              success: false, 
              status: 500, 
              body: { error: 'signed_url not found in response', response: parsedBody }
            };
          }
          
          console.log(`[CONVERSATION-TOKEN] Successfully received signed_url (length: ${signedUrl.length})`);
          return { 
            success: true, 
            signedUrl: signedUrl
          };
        }

        const headersObj: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headersObj[key] = value;
        });

        // Extract error message/code from response (sanitized, no sensitive data)
        const errorMessage = parsedBody?.error?.message || parsedBody?.message || parsedBody?.error || '';
        const errorCode = parsedBody?.error?.code || parsedBody?.code || '';
        const sanitizedError = {
          message: typeof errorMessage === 'string' ? errorMessage : String(errorMessage),
          code: typeof errorCode === 'string' ? errorCode : String(errorCode),
        };
        
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSeconds = retryAfterHeader ? parseRetryAfter(retryAfterHeader) : null;
        
        const rawErrorText = (errorMessage || responseText || '').toString().toLowerCase();
        const isConcurrent = rawErrorText.includes('too_many_concurrent_requests');
        const isBusy = rawErrorText.includes('system_busy');
        
        // Explicit detection and logging
        if (isConcurrent) {
          console.warn(`[CONVERSATION-TOKEN] Upstream 429 detected: TOO_MANY_CONCURRENT_REQUESTS`, {
            requestId,
            timestamp: new Date().toISOString(),
            upstreamStatus: response.status,
            retryAfterHeader: retryAfterHeader || null,
            retryAfterSeconds: retryAfterSeconds ? Math.round(retryAfterSeconds / 1000) : null,
            sanitizedError,
          });
          return { 
            success: false, 
            status: response.status, 
            body: parsedBody ?? responseText, 
            special: 'concurrent',
            retryAfterSeconds: retryAfterSeconds ? Math.round(retryAfterSeconds / 1000) : undefined,
          };
        }
        if (isBusy) {
          console.warn(`[CONVERSATION-TOKEN] Upstream 429 detected: SYSTEM_BUSY`, {
            requestId,
            timestamp: new Date().toISOString(),
            upstreamStatus: response.status,
            retryAfterHeader: retryAfterHeader || null,
            retryAfterSeconds: retryAfterSeconds ? Math.round(retryAfterSeconds / 1000) : null,
            sanitizedError,
          });
          return { 
            success: false, 
            status: response.status, 
            body: parsedBody ?? responseText, 
            special: 'system_busy',
            retryAfterSeconds: retryAfterSeconds ? Math.round(retryAfterSeconds / 1000) : undefined,
          };
        }
        
        // Generic upstream error logging
        console.warn(`[CONVERSATION-TOKEN] ElevenLabs API error (attempt ${attempt + 1})`, {
          requestId,
          timestamp: new Date().toISOString(),
          upstreamStatus: response.status,
          retryAfterHeader: retryAfterHeader || null,
          retryAfterSeconds: retryAfterSeconds ? Math.round(retryAfterSeconds / 1000) : null,
          sanitizedError,
        });

        if (response.status === 429 && attempt < MAX_TOKEN_RETRIES) {
          const retryAfterValue = response.headers.get('retry-after');
          const delay = clampTokenRetryDelay(
            parseRetryAfter(retryAfterValue) ??
              Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5)),
          );
          console.log(`[CONVERSATION-TOKEN] Retrying after ${delay}ms for requestId=${requestId} (attempt ${attempt + 1})`);
          await sleep(delay);
          return fetchSignedUrl(attempt + 1);
        }

        return { 
          success: false, 
          status: response.status, 
          body: parsedBody ?? responseText,
          retryAfterSeconds: retryAfterSeconds ? Math.round(retryAfterSeconds / 1000) : undefined,
        };
      })();

      if (fetchResult.success && fetchResult.signedUrl) {
        console.log(`[CONVERSATION-TOKEN] Signed URL obtained successfully for user: ${userId} (requestId=${requestId})`);
        // Return the signed_url exactly as received from ElevenLabs
        // The SDK will automatically upgrade to WebRTC if available/supported
        const successBody = {
          success: {
            signed_url: fetchResult.signedUrl, // snake_case from ElevenLabs API
            signedUrl: fetchResult.signedUrl,   // camelCase alias for frontend convenience
            clientId: userId,
            agentId,
            requestId,
          },
          signed_url: fetchResult.signedUrl, // snake_case from ElevenLabs API
          signedUrl: fetchResult.signedUrl,   // camelCase alias for frontend convenience
          clientId: userId,
          agentId,
        };
        cacheTokenResponse(requestId, 200, successBody);
        return res.status(200).json(successBody);
      }

      const upstreamStatus = fetchResult.status || 500;
      const isConcurrent = fetchResult.special === 'concurrent';
      const isBusy = fetchResult.special === 'system_busy';
      const isTimeout = fetchResult.special === 'timeout';
      const isNetwork = fetchResult.special === 'network';
      const retryAfterSeconds = fetchResult.retryAfterSeconds;
      
      // Log full error details from ElevenLabs response
      console.error(`[CONVERSATION-TOKEN] ElevenLabs API returned error:`, {
        requestId,
        upstreamStatus,
        upstreamBody: fetchResult.body,
        isConcurrent,
        isBusy,
        isTimeout,
        isNetwork,
        retryAfterSeconds: retryAfterSeconds || null,
        timestamp: new Date().toISOString(),
      });
      
      // Determine error code based on error type
      let errorCode: 'SYSTEM_BUSY' | 'TOO_MANY_CONCURRENT' | 'RATE_LIMIT' | 'UPSTREAM_TIMEOUT' | 'UPSTREAM_NETWORK_ERROR' | 'UPSTREAM_ERROR';
      if (isConcurrent) {
        errorCode = 'TOO_MANY_CONCURRENT';
      } else if (isBusy) {
        errorCode = 'SYSTEM_BUSY';
      } else if (isTimeout) {
        errorCode = 'UPSTREAM_TIMEOUT';
      } else if (isNetwork) {
        errorCode = 'UPSTREAM_NETWORK_ERROR';
      } else if (upstreamStatus === 429) {
        errorCode = 'RATE_LIMIT';
      } else {
        errorCode = 'UPSTREAM_ERROR';
      }
      
      // Extract detailed error message from ElevenLabs response body
      let errorMessage = 'Failed to get signed URL from ElevenLabs.';
      if (fetchResult.body) {
        if (typeof fetchResult.body === 'string') {
          errorMessage = `Upstream Error: ${fetchResult.body}`;
        } else if (fetchResult.body?.error?.message) {
          errorMessage = `Upstream Error: ${fetchResult.body.error.message}`;
        } else if (fetchResult.body?.message) {
          errorMessage = `Upstream Error: ${fetchResult.body.message}`;
        } else if (fetchResult.body?.error) {
          errorMessage = `Upstream Error: ${String(fetchResult.body.error)}`;
        }
      }
      
      // Override with user-friendly messages for specific error types
      if (isConcurrent) {
        errorMessage = 'Too many concurrent sessions. Close other sessions and wait 10–30s.';
      } else if (isBusy) {
        errorMessage = 'Service busy. Try again in a few seconds.';
      } else if (isTimeout) {
        errorMessage = 'Timed out contacting ElevenLabs. Please try again.';
      } else if (isNetwork) {
        errorMessage = 'Could not reach ElevenLabs. Please try again.';
      } else if (upstreamStatus === 429) {
        errorMessage = 'Rate limit exceeded. Please wait and try again.';
      }
      
      const errorBody: {
        code: string;
        message: string;
        requestId: string;
        retryAfterSeconds?: number;
      } = {
        code: errorCode,
        message: errorMessage,
        requestId,
      };
      
      if (retryAfterSeconds !== undefined) {
        errorBody.retryAfterSeconds = retryAfterSeconds;
      }
      
      console.error(`[CONVERSATION-TOKEN] Returning error response to frontend:`, {
        requestId,
        timestamp: new Date().toISOString(),
        errorCode,
        errorMessage,
        upstreamStatus,
        retryAfterSeconds: retryAfterSeconds || null,
      });
      
      cacheTokenResponse(requestId, upstreamStatus, { error: errorBody });
      
      // Return specific error message to frontend (include upstream error details)
      return res.status(upstreamStatus).json({ 
        error: errorBody,
        details: upstreamStatus >= 500 ? errorMessage : undefined, // Include details for 5xx errors
      });
    } catch (error: any) {
      // CRITICAL: Log full error details including stack trace
      console.error('[CONVERSATION-TOKEN] CRITICAL ERROR - Exception caught:', {
        requestId,
        errorName: error?.name || 'Unknown',
        errorMessage: error?.message || String(error),
        errorStack: error?.stack || 'No stack trace available',
        errorType: typeof error,
        timestamp: new Date().toISOString(),
      });
      
      // Log the full error object for debugging
      if (error instanceof Error) {
        console.error('[CONVERSATION-TOKEN] Error stack trace:', error.stack);
      } else {
        console.error('[CONVERSATION-TOKEN] Error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      }
      
      // Determine error message for frontend
      let errorMessage = 'Failed to get conversation token';
      if (error?.message) {
        errorMessage = `Upstream Error: ${error.message}`;
      } else if (typeof error === 'string') {
        errorMessage = `Upstream Error: ${error}`;
      }
      
      const errorBody = {
        code: 'INTERNAL_ERROR',
        message: errorMessage,
        requestId,
        upstreamStatus: undefined,
      };
      
      cacheTokenResponse(requestId, 500, { error: errorBody });
      
      // Return specific error message to frontend (always include in 500 responses)
      return res.status(500).json({
        error: errorBody,
        details: errorMessage, // Always include error details, not just in development
      });
    }
  });

  // HMAC verification for ElevenLabs webhooks
  // ElevenLabs signature format: t=timestamp,v0=hash
  // Expected hash = hex(hmac_sha256(secret, `${timestamp}.${rawBody}`))
  function verifyElevenLabsSignature(
    signatureHeader: string | undefined,
    rawBody: string | Buffer,
    secret: string
  ): { valid: boolean; reason?: string; timestamp?: number } {
    if (!signatureHeader) {
      return { valid: false, reason: 'Missing elevenlabs-signature header' };
    }

    // Parse signature header: t=timestamp,v0=hash
    const parts = signatureHeader.split(',');
    let timestamp: number | null = null;
    let hash: string | null = null;

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 't') {
        timestamp = parseInt(value, 10);
      } else if (key === 'v0') {
        hash = value;
      }
    }

    if (!timestamp || !hash) {
      return { valid: false, reason: 'Malformed signature header (missing t or v0)' };
    }

    // Check timestamp tolerance (5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const age = now - timestamp;
    const MAX_AGE_SECONDS = 5 * 60; // 5 minutes

    if (age > MAX_AGE_SECONDS) {
      return { valid: false, reason: `Timestamp too old (${age}s ago, max ${MAX_AGE_SECONDS}s)`, timestamp };
    }

    if (age < -MAX_AGE_SECONDS) {
      return { valid: false, reason: `Timestamp too far in future (${-age}s ahead)`, timestamp };
    }

    // Compute expected hash
    const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const payload = `${timestamp}.${bodyString}`;
    const expectedHash = createHmac('sha256', secret).update(payload).digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (hash.length !== expectedHash.length) {
      return { valid: false, reason: 'Hash length mismatch', timestamp };
    }

    let match = 0;
    for (let i = 0; i < hash.length; i++) {
      match |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }

    if (match !== 0) {
      return { valid: false, reason: 'Hash mismatch', timestamp };
    }

    return { valid: true, timestamp };
  }

  // ElevenLabs webhook endpoint - receives conversation completion events
  // Secured with HMAC signature verification
  // Note: Raw body middleware is applied globally in server/index.ts before express.json()
  app.post("/webhooks/elevenlabs", async (req: any, res) => {
    try {
      // Check if this is a tool call (x-api-secret) vs automatic webhook (HMAC signature)
      // Express normalizes headers to lowercase, so check lowercase first
      const signatureHeader = req.headers['elevenlabs-signature'] || req.headers['xi-elevenlabs-signature'];
      // Express normalizes headers to lowercase - check all possible variations
      const apiSecretHeader = req.headers['x-api-secret'] || req.headers['x-apisecret'] || req.headers['xapisecret'] || '';
      const apiSecretHeaderStr = apiSecretHeader ? String(apiSecretHeader) : '';
      const isToolCall = !signatureHeader && apiSecretHeaderStr.length > 0;
      
      // Debug: Log all headers to see what we're receiving
      const relevantHeaders = Object.keys(req.headers)
        .filter(h => h.toLowerCase().includes('api') || h.toLowerCase().includes('secret') || h.toLowerCase().includes('signature') || h.toLowerCase().includes('x-'))
        .reduce((acc, key) => {
          acc[key] = req.headers[key] ? `${String(req.headers[key]).substring(0, 10)}...` : 'missing';
          return acc;
        }, {} as Record<string, string>);
      
      console.log('[WEBHOOK] Request received', {
        hasSignatureHeader: !!signatureHeader,
        hasApiSecretHeader: !!apiSecretHeader,
        apiSecretHeaderValue: apiSecretHeaderStr ? `${apiSecretHeaderStr.substring(0, 8)}...` : 'missing',
        apiSecretHeaderLength: apiSecretHeaderStr.length,
        isToolCall,
        method: req.method,
        path: req.path,
        relevantHeaders,
        allHeaderKeys: Object.keys(req.headers),
      });
      
      // req.body is Buffer when using express.raw()
      const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body || {}), 'utf8');
      
      // Verify authentication: either HMAC signature (automatic webhook) or x-api-secret (tool call)
      if (isToolCall) {
        // Tool call authentication via x-api-secret
        console.log('[WEBHOOK] Detected tool call (x-api-secret header present, no HMAC signature)');
        const expectedApiKey = ELEVENLABS_API_KEY;
        if (!expectedApiKey) {
          console.error('[WEBHOOK] ❌ ELEVENLABS_API_KEY not configured for tool call verification');
          return res.status(500).json({ error: 'API key not configured' });
        }
        
        console.log('[WEBHOOK] Verifying x-api-secret...', {
          providedLength: apiSecretHeader?.length || 0,
          expectedLength: expectedApiKey.length,
          providedPrefix: apiSecretHeader ? `${apiSecretHeader.substring(0, 8)}...` : 'missing',
          expectedPrefix: `${expectedApiKey.substring(0, 8)}...`,
        });
        
        if (apiSecretHeader !== expectedApiKey) {
          console.error('[WEBHOOK] ❌ Invalid x-api-secret for tool call', {
            provided: apiSecretHeader ? `${apiSecretHeader.substring(0, 8)}...${apiSecretHeader.substring(apiSecretHeader.length - 4)}` : 'missing',
            providedLength: apiSecretHeader?.length || 0,
            expectedLength: expectedApiKey.length,
            expectedPrefix: `${expectedApiKey.substring(0, 8)}...`,
            mismatch: true,
          });
          return res.status(401).json({ error: 'Unauthorized: Invalid API secret' });
        }
        
        console.log('[WEBHOOK] ✅ Tool call verified via x-api-secret');
      } else {
        // Automatic webhook authentication via HMAC signature
        const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
        if (!webhookSecret) {
          console.error('[WEBHOOK] ELEVENLABS_WEBHOOK_SECRET not configured');
          return res.status(500).json({ error: 'Webhook secret not configured' });
        }
        
        const verification = verifyElevenLabsSignature(signatureHeader, rawBody, webhookSecret);
        
        if (!verification.valid) {
          console.error(`[WEBHOOK] Invalid signature: ${verification.reason}`, {
            hasSignature: !!signatureHeader,
            timestamp: verification.timestamp,
          });
          return res.status(401).json({ error: 'Invalid signature' });
        }
        
        console.log(`[WEBHOOK] Signature verified successfully`, {
          conversation_id: 'parsing...',
          timestamp: verification.timestamp,
        });
      }

      // Parse JSON body after authentication
      let body: any;
      try {
        body = JSON.parse(rawBody.toString('utf8'));
        console.log('[WEBHOOK] ✅ Successfully parsed JSON body');
      } catch (parseError: any) {
        console.error('[WEBHOOK] ❌ Failed to parse JSON body:', {
          error: parseError.message,
          bodyLength: rawBody.length,
        });
        return res.status(400).json({ error: 'Invalid JSON body' });
      }

      console.log('[WEBHOOK] 📥 Received ElevenLabs webhook', {
        source: isToolCall ? 'tool-call' : 'automatic-webhook',
        timestamp: new Date().toISOString(),
      });
      console.log('[WEBHOOK] 📋 Request body fields:', {
        topLevelType: body.type,
        hasDataObject: !!body.data,
        topLevelKeys: Object.keys(body),
      });

      const normalized = normalizeElevenLabsWebhookBody(body);

      if (normalized.skipProcessing) {
        console.log('[WEBHOOK] Acknowledged event without processing', {
          eventType: normalized.eventType,
          reason: normalized.skipReason,
          conversation_id: normalized.conversation_id,
        });
        return res.json({
          success: true,
          acknowledged: true,
          eventType: normalized.eventType,
        });
      }

      let {
        conversation_id,
        user_id,
        transcript,
        duration,
        agent_id,
        started_at,
        ended_at,
        status,
        year,
      } = normalized;

      console.log('[WEBHOOK] Normalized payload', {
        eventType: normalized.eventType,
        conversation_id,
        hasUserId: !!user_id,
        hasTranscript: !!transcript,
        transcriptLength: transcript?.length || 0,
        duration,
        status,
      });

      // Validate required fields
      if (!conversation_id) {
        console.error('[WEBHOOK] ❌ Missing conversation_id in webhook payload');
        console.error('[WEBHOOK] Available fields:', Object.keys(body));
        return res.status(400).json({ error: 'Missing conversation_id' });
      }

      if (!user_id) {
        try {
          const sessionByConversationId = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
            where: (sessions: any, { eq }: any) => eq(sessions.conversationId, conversation_id),
          });
          if (sessionByConversationId?.userId) {
            user_id = sessionByConversationId.userId;
            console.log('[WEBHOOK] Resolved user_id from interview session', {
              conversation_id,
              user_id,
            });
          }
        } catch (lookupError: any) {
          console.error('[WEBHOOK] Failed to resolve user_id from session (non-critical):', lookupError);
        }
      }

      if (!user_id) {
        const existingInterview = await (db.query as any).interviews?.findFirst({
          where: (interviews: any, { eq }: any) => eq(interviews.conversationId, conversation_id),
        });
        if (existingInterview) {
          user_id = existingInterview.userId;
          console.log('[WEBHOOK] Resolved user_id from existing interview', {
            conversation_id,
            user_id,
            interviewId: existingInterview.id,
          });
        }
      }

      if (!user_id) {
        console.warn('[WEBHOOK] Missing user_id — acknowledging webhook without creating interview', {
          conversation_id,
          eventType: normalized.eventType,
        });
        return res.json({
          success: true,
          acknowledged: true,
          message: 'Missing user_id; interview may already be saved via client',
        });
      }

      console.log('[WEBHOOK] ✅ Required fields validated', {
        conversation_id,
        user_id,
        hasTranscript: !!transcript,
        transcriptLength: transcript?.length || 0,
      });

      // Check if interview already exists (prevent duplicates)
      const existingInterview = await (db.query as any).interviews?.findFirst({
        where: (interviews: any, { eq }: any) => eq(interviews.conversationId, conversation_id),
      });

      if (existingInterview) {
        if (existingInterview.userId !== user_id) {
          console.warn("[WEBHOOK] Existing interview ownership mismatch", {
            conversationId: conversation_id,
            interviewId: existingInterview.id,
            webhookUserId: user_id,
          });
          return res.status(403).json({ error: "Unauthorized interview" });
        }
        console.log(`[WEBHOOK] Interview with conversation_id ${conversation_id} already exists (id: ${existingInterview.id})`);
        
        if (transcript && existingInterview.transcript && existingInterview.transcript !== transcript) {
          console.warn(`[WEBHOOK] Transcript mismatch for existing interview - preserving existing transcript`, {
            interviewId: existingInterview.id,
            existingLength: existingInterview.transcript.length,
            incomingLength: transcript.length,
          });
        }
        
        // Link to session if not already linked (idempotent)
        let matchedSessionForResume: any = null;
        try {
          const sessionByConversationId = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
            where: (sessions: any, { eq }: any) => eq(sessions.conversationId, conversation_id),
          });
          matchedSessionForResume = sessionByConversationId || null;
          
          if (sessionByConversationId && !sessionByConversationId.interviewId) {
            const updatePayload: Record<string, unknown> = {
              interviewId: existingInterview.id,
              status: 'completed',
              updatedAt: new Date(),
            };
            if (year && typeof year === 'string') {
              const existingContext = (sessionByConversationId.candidateContext as Record<string, unknown>) || {};
              updatePayload.candidateContext = { ...existingContext, year };
            }
            await db.update(elevenLabsInterviewSessions)
              .set(updatePayload as any)
              .where(eq(elevenLabsInterviewSessions.id, sessionByConversationId.id));
            console.log(`[WEBHOOK] Linked existing interview ${existingInterview.id} to session ${sessionByConversationId.id}`);
          } else if (sessionByConversationId && sessionByConversationId.status !== 'completed') {
            const updatePayload: Record<string, unknown> = { status: 'completed', updatedAt: new Date() };
            if (year && typeof year === 'string') {
              const existingContext = (sessionByConversationId.candidateContext as Record<string, unknown>) || {};
              updatePayload.candidateContext = { ...existingContext, year };
            }
            await db.update(elevenLabsInterviewSessions)
              .set(updatePayload as any)
              .where(eq(elevenLabsInterviewSessions.id, sessionByConversationId.id));
            console.log(`[WEBHOOK] Updated session ${sessionByConversationId.id} status to completed`);
          }
        } catch (linkError: any) {
          // Don't fail if link already exists or other non-critical error
          if (!linkError.message?.includes('duplicate')) {
            console.error(`[WEBHOOK] Error linking existing interview (non-critical):`, linkError);
          }
        }

        if (matchedSessionForResume?.clientSessionId) {
          await linkResumeFromSessionToInterview(
            matchedSessionForResume.clientSessionId,
            existingInterview.id,
            {
              userId: existingInterview.userId || user_id,
              source: "[WEBHOOK]",
            },
          );
        }
        
        await finalizeInterviewTranscript({
          interviewId: existingInterview.id,
          conversationId: conversation_id,
          transcript: existingInterview.transcript || transcript,
          source: 'webhook / existing interview',
        });
        
        // Always return success for idempotent operations
        return res.json({ 
          success: true, 
          message: 'Interview already exists',
          interviewId: existingInterview.id 
        });
      }

      const startedAt = started_at;
      const endedAt = ended_at;

      // Insert interview record (with error handling for duplicates)
      let interview;
      try {
        const interviewData = insertInterviewSchema.parse({
          userId: user_id,
          conversationId: conversation_id,
          agentId: agent_id || getAgentId(),
          transcript: transcript || null,
          durationSeconds: duration ? Math.round(duration) : null,
          startedAt: startedAt,
          endedAt: endedAt,
          status: status || "completed",
        });
        const isSqliteWebhook = process.env.DATABASE_URL?.startsWith('file:');
        const interviewValues = isSqliteWebhook
          ? { ...interviewData, id: randomUUID(), createdAt: new Date() }
          : interviewData;
        const [insertedInterview] = await db.insert(interviews).values(interviewValues as any).returning();
        interview = insertedInterview;
        console.log(`[WEBHOOK] Interview saved successfully: ${interview.id}`);
      } catch (dbError: any) {
        // Check for duplicate (idempotency - webhook may fire twice)
        if (dbError.message?.includes('duplicate') || dbError.code === '23505') {
          const existingInterview = await (db.query as any).interviews?.findFirst({
            where: (interviews: any, { eq }: any) => eq(interviews.conversationId, conversation_id),
          });
          if (existingInterview) {
            interview = existingInterview;
            console.log(`[WEBHOOK] Interview already exists (duplicate insert prevented): ${interview.id}`);
          } else {
            throw dbError; // Re-throw if not a duplicate
          }
        } else {
          throw dbError; // Re-throw other errors
        }
      }

      // Link this interview to any existing elevenlabs_interview_sessions record (non-critical)
      // Try by conversation_id first (most reliable)
      let matchedSessionForResume: any = null;
      try {
        const sessionByConversationId = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
          where: (sessions: any, { eq }: any) => eq(sessions.conversationId, conversation_id),
        });

        if (sessionByConversationId) {
          matchedSessionForResume = sessionByConversationId;
          // Only update if status is not already completed (idempotency)
          if (sessionByConversationId.status !== 'completed' || !sessionByConversationId.interviewId) {
            const updatePayload: Record<string, unknown> = {
              interviewId: interview.id,
              status: 'completed',
              updatedAt: new Date(),
            };
            if (year && typeof year === 'string') {
              const existingContext = (sessionByConversationId.candidateContext as Record<string, unknown>) || {};
              updatePayload.candidateContext = { ...existingContext, year };
            }
            await db.update(elevenLabsInterviewSessions)
              .set(updatePayload as any)
              .where(eq(elevenLabsInterviewSessions.id, sessionByConversationId.id));
            console.log(`[WEBHOOK] Linked interview ${interview.id} to session ${sessionByConversationId.id} (by conversation_id)`);
          }
        } else {
          // Try to find by user_id + agent_id + time window (last 10 minutes)
          // This handles cases where conversation_id wasn't set in session yet
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          const recentSessions = await (db.query as any).elevenLabsInterviewSessions?.findMany({
            where: (sessions: any, { eq, and, gte }: any) => and(
              eq(sessions.userId, user_id),
              eq(sessions.agentId, agent_id || getAgentId()),
              eq(sessions.interviewId, null), // Not already linked
              gte(sessions.startedAt, tenMinutesAgo) // Started within last 10 minutes
            ),
          });

          // Link to the most recent unlinked session
          if (recentSessions && recentSessions.length > 0) {
            const mostRecentSession = recentSessions.sort((a: any, b: any) => 
              new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
            )[0];
            matchedSessionForResume = mostRecentSession;
            
            const updatePayload: Record<string, unknown> = {
              conversationId: conversation_id,
              interviewId: interview.id,
              status: 'completed',
              updatedAt: new Date(),
            };
            if (year && typeof year === 'string') {
              const existingContext = (mostRecentSession.candidateContext as Record<string, unknown>) || {};
              updatePayload.candidateContext = { ...existingContext, year };
            }
            await db.update(elevenLabsInterviewSessions)
              .set(updatePayload as any)
              .where(eq(elevenLabsInterviewSessions.id, mostRecentSession.id));
            console.log(`[WEBHOOK] Linked interview ${interview.id} to session ${mostRecentSession.id} (by time window)`);
          } else {
            // Create a new session record for this webhook (fallback)
            const agentId = agent_id || getAgentId();
            const fallbackClientSessionId = `webhook-${conversation_id}`;
            const sessionData = insertElevenLabsInterviewSessionSchema.parse({
              userId: user_id,
              agentId,
              clientSessionId: fallbackClientSessionId, // Fallback ID
              conversationId: conversation_id,
              interviewId: interview.id,
              status: 'completed',
              startedAt: startedAt || new Date(),
              endedAt: endedAt || new Date(),
              ...(year && typeof year === 'string' ? { candidateContext: { year } } : {}),
            });
            const webhookSessionValues = process.env.DATABASE_URL?.startsWith('file:')
              ? { ...sessionData, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() }
              : sessionData;
            await db.insert(elevenLabsInterviewSessions).values(webhookSessionValues as any).catch((err: any) => {
              // Ignore duplicate errors (conversation_id unique constraint)
              if (!err.message?.includes('duplicate') && !err.message?.includes('unique')) {
                console.error('[WEBHOOK] Error creating session record:', err);
              }
            });
            console.log(`[WEBHOOK] Created session record for interview ${interview.id}`);
            matchedSessionForResume = { clientSessionId: fallbackClientSessionId, userId: user_id };
          }
        }
      } catch (linkError: any) {
        // Log but don't fail - interview is saved, linking can be retried
        console.error(`[WEBHOOK] Failed to link interview to session (non-critical):`, linkError);
      }

      if (matchedSessionForResume?.clientSessionId) {
        await linkResumeFromSessionToInterview(
          matchedSessionForResume.clientSessionId,
          interview.id,
          {
            userId: matchedSessionForResume.userId || user_id,
            source: "[WEBHOOK]",
          },
        );
      }

      await finalizeInterviewTranscript({
        interviewId: interview.id,
        conversationId: conversation_id,
        transcript: interview.transcript || transcript,
        source: 'webhook / new interview',
      });

      res.json({ success: true, interviewId: interview.id });
    } catch (error: any) {
      console.error('[WEBHOOK] Error processing webhook:', error);
      
      // Handle validation errors
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid webhook data', 
          details: error.errors 
        });
      }

      // Handle duplicate key errors (if database enforces uniqueness)
      if (error.message && error.message.includes('duplicate')) {
        console.log('[WEBHOOK] Duplicate conversation_id detected');
        return res.json({ success: true, message: 'Interview already exists' });
      }

      res.status(500).json({ 
        error: 'Failed to process webhook',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Get interview by client session ID
  // Used by frontend to look up interviewId when webhook may be delayed
  app.get("/api/interviews/by-session/:sessionId", authenticateToken, async (req: any, res) => {
    console.log('[FLIGHT_RECORDER] [BACKEND] GET /api/interviews/by-session/:sessionId - request:', {
      sessionId: req.params.sessionId,
      userId: req.userId,
      timestamp: new Date().toISOString()
    });
    try {
      const clientSessionId = req.params.sessionId;
      const userId = req.userId;

      if (!clientSessionId) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      // Find session record
      const session = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
        where: (sessions: any, { eq, and }: any) => and(
          eq(sessions.clientSessionId, clientSessionId),
          eq(sessions.userId, userId)
        ),
      });

      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          message: 'Interview save was not found for this session. The interview may still be saving — try again shortly.',
        });
      }

      const linkStatus = session.interviewId ? 'linked' : 'pending';

      // If interviewId is linked, return it
      if (session.interviewId) {
        // Also check evaluation status
        const evaluation = await (db.query as any).interviewEvaluations?.findFirst({
          where: (evaluations: any, { eq }: any) => eq(evaluations.interviewId, session.interviewId),
        });

        return res.json({
          interviewId: session.interviewId,
          conversationId: session.conversationId,
          status: session.status,
          linkStatus,
          evaluationStatus: evaluation?.status || null,
        });
      }

      // Interview not linked yet (save in flight or webhook delayed)
      return res.json({
        interviewId: null,
        conversationId: session.conversationId,
        status: session.status,
        linkStatus,
        evaluationStatus: null,
      });
    } catch (error: any) {
      console.error('[BY-SESSION] Error fetching interview by session:', error);
      res.status(500).json({ 
        error: 'Failed to fetch interview by session',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Get interview results with evaluation
  app.get("/api/interviews/:id/results", authenticateToken, async (req: any, res) => {
    const interviewId = req.params.id;
    console.log('[FLIGHT_RECORDER] [BACKEND] GET /api/interviews/:id/results - request:', {
      interviewId,
      userId: req.userId,
      timestamp: new Date().toISOString()
    });
    try {
      const userId = req.userId;

      if (!interviewId) {
        console.log('[FLIGHT_RECORDER] [BACKEND] GET /api/interviews/:id/results - Missing interviewId (400)');
        return res.status(400).json({ error: 'Interview ID required' });
      }

      // PERFORMANCE FIX: Parallelize database queries to reduce latency from ~150-300ms to ~50-100ms
      // All three queries can run simultaneously since they don't depend on each other
      const [interview, evaluation, profile] = await Promise.all([
        (db.query as any).interviews?.findFirst({
          where: (interviews: any, { eq, and }: any) => and(
            eq(interviews.id, interviewId),
            eq(interviews.userId, userId)
          ),
        }),
        (db.query as any).interviewEvaluations?.findFirst({
          where: (evaluations: any, { eq }: any) => eq(evaluations.interviewId, interviewId),
        }),
        (db.query as any).profiles?.findFirst({
          where: (profiles: any, { eq }: any) => eq(profiles.id, userId),
        }),
      ]);

      if (!interview) {
        console.log('[FLIGHT_RECORDER] [BACKEND] GET /api/interviews/:id/results - Interview NOT FOUND (404):', {
          interviewId,
          userId,
          timestamp: new Date().toISOString()
        });
        return res.status(404).json({
          error: 'Interview not found',
          message: 'Interview not found or not accessible with this account.',
        });
      }
      
      console.log('[FLIGHT_RECORDER] [BACKEND] GET /api/interviews/:id/results - Interview found:', {
        interviewId,
        interviewStatus: interview.status,
        hasTranscript: !!interview.transcript,
        transcriptLength: interview.transcript?.length || 0,
        timestamp: new Date().toISOString()
      });

      const responseData = {
        interview: {
          id: interview.id,
          conversationId: interview.conversationId,
          agentId: interview.agentId,
          transcript: interview.transcript,
          durationSeconds: interview.durationSeconds,
          startedAt: interview.startedAt,
          endedAt: interview.endedAt,
          status: interview.status,
          createdAt: interview.createdAt,
        },
        evaluation: evaluation ? {
          status: evaluation.status,
          overallScore: evaluation.overallScore,
          // Explicitly check for null/undefined - empty objects should also be treated as null
          evaluation: (() => {
            const raw = evaluation.evaluationJson;
            if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) return null;
            try {
              return normalizeEvaluationJson(raw, []);
            } catch (normalizationError: any) {
              console.error('[RESULTS] Failed to normalize stored evaluation JSON:', {
                interviewId,
                evaluationId: evaluation.id,
                error: normalizationError?.message || normalizationError,
              });
              return null;
            }
          })(),
          error: evaluation.error,
          createdAt: evaluation.createdAt,
          updatedAt: evaluation.updatedAt,
        } : null,
        metadata: {
          userId: interview.userId,
          userEmail: profile?.email || null,
        },
      };
      
      console.log('[FLIGHT_RECORDER] [BACKEND] GET /api/interviews/:id/results - Returning response:', {
        interviewId,
        interviewStatus: interview.status,
        hasEvaluation: !!evaluation,
        evaluationStatus: evaluation?.status || 'null',
        hasFeedback: !!evaluation?.evaluationJson,
        timestamp: new Date().toISOString()
      });
      
      res.json(responseData);
    } catch (error: any) {
      console.error('[RESULTS] Error fetching interview results:', error);
      res.status(500).json({ 
        error: 'Failed to fetch interview results',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Client-side interview end notification endpoint
  // Records that the frontend has ended the interview (user click or disconnect)
  // Transcript: webhook + server fetch are preferred; body.transcript is a fallback (e.g. localhost without webhook).
  // Idempotent and safe to call before webhook arrives
  app.post("/api/save-interview", authenticateToken, async (req: any, res) => {
    let interviewId: string | null = null;
    let client_session_id: string | undefined;
    try {
      console.log('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - incoming request metadata:', {
        bodyKeys: Object.keys(req.body || {}),
        hasClientSessionId: !!req.body?.client_session_id,
        hasConversationId: !!req.body?.conversation_id,
        hasResumeText: typeof req.body?.resume_text === "string" && req.body.resume_text.length > 0,
        resumeTextLength: typeof req.body?.resume_text === "string" ? req.body.resume_text.length : 0,
        hasTranscript: typeof req.body?.transcript === "string" && req.body.transcript.length > 0,
        transcriptLength: typeof req.body?.transcript === "string" ? req.body.transcript.length : 0,
        hasCandidateContext: !!req.body?.candidate_context,
        userId: req.userId,
        timestamp: new Date().toISOString()
      });
      
      const userId = req.userId; // candidate_id is userId from JWT
      client_session_id = req.body?.client_session_id as string;
      const conversation_id = req.body?.conversation_id as string | undefined;
      const ended_by = req.body?.ended_by as string | undefined; // 'user' | 'agent' | 'disconnect'
      const agent_id = req.body?.agent_id as string | undefined;
      const resume_text = req.body?.resume_text as string | undefined; // Optional resume text from request
      const transcript_from_tool = req.body?.transcript as string | undefined; // Transcript from SaveInterviewResults tool
      const candidate_context_from_body = req.body?.candidate_context as Record<string, unknown> | undefined;
      
      console.log('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - parsed fields:', { 
        userId, 
        client_session_id, 
        conversation_id: conversation_id || 'not provided',
        ended_by,
        agent_id: agent_id || 'not provided',
        hasTranscript: !!transcript_from_tool,
        transcriptLength: transcript_from_tool?.length || 0,
        timestamp: new Date().toISOString()
      });
      
      console.log('[SAVE-INTERVIEW] Client end notification', { 
        userId, 
        client_session_id, 
        conversation_id: conversation_id || 'not provided',
        ended_by,
        agent_id: agent_id || 'not provided',
      });

      // Validate required fields
      if (!client_session_id) {
        return res.status(400).json({ error: 'Missing client_session_id in body' });
      }

      // UUID validation regex
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // Validate client_session_id format
      if (!uuidRegex.test(client_session_id)) {
        console.error('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - VALIDATION FAILED: Invalid client_session_id format:', client_session_id);
        return res.status(400).json({ error: 'Invalid client_session_id format. Must be a valid UUID.' });
      }

      // Validate userId format (from JWT middleware)
      if (!userId || !uuidRegex.test(userId)) {
        console.error('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - VALIDATION FAILED: Invalid userId format:', userId);
        return res.status(401).json({ error: 'Invalid user token. User ID must be a valid UUID.' });
      }

      // Validate ended_by enum
      const validEndedBy = ['user', 'agent', 'disconnect'];
      if (ended_by && !validEndedBy.includes(ended_by)) {
        console.error('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - VALIDATION FAILED: Invalid ended_by value:', ended_by);
        return res.status(400).json({ 
          error: `Invalid ended_by value. Must be one of: ${validEndedBy.join(', ')}` 
        });
      }
      
      console.log('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - All validations passed');

      const clientEndedAt = new Date();
      const agentId = agent_id || getAgentId();
      let pendingFinalize: TranscriptFinalizeJob | null = null;
      let pendingAsyncFetch: { interviewId: string; conversationId: string; source: string } | null = null;
      
      // CRITICAL FIX: Always create interview record synchronously if it doesn't exist
      // This ensures interviewId is always returned, preventing frontend hang
      interviewId = null; // Reset for this request
      
      // Step 1: Check if interview already exists by conversation_id (if provided)
      if (conversation_id) {
        try {
          const existingInterview = await (db.query as any).interviews?.findFirst({
            where: (interviews: any, { eq }: any) => eq(interviews.conversationId, conversation_id),
          });
          if (existingInterview) {
            if (existingInterview.userId !== userId) {
              console.warn("[SAVE-INTERVIEW] Interview ownership mismatch", {
                conversationId: conversation_id,
                interviewId: existingInterview.id,
                requestUserId: userId,
              });
              return res.status(403).json({ error: "Unauthorized interview" });
            }
            interviewId = existingInterview.id;
            console.log(`[SAVE-INTERVIEW] Found existing interview ${interviewId} by conversation_id: ${conversation_id}`);
            
            // Update interview status if not already completed
            const isAlreadyCompleted = existingInterview.status === 'completed' && existingInterview.endedAt;
            if (!isAlreadyCompleted) {
              await db.update(interviews)
                .set({
                  status: 'completed',
                  endedAt: clientEndedAt,
                })
                .where(eq(interviews.id, interviewId));
              console.log(`[SAVE-INTERVIEW] Updated existing interview ${interviewId} with end time`);
            }
            
            // Defer transcript finalization until resume is linked to interviewId
            if (!existingInterview.transcript) {
              if (transcript_from_tool) {
                pendingFinalize = {
                  interviewId,
                  conversationId: conversation_id,
                  transcript: transcript_from_tool,
                  source: 'existing interview / tool transcript',
                };
              } else if (conversation_id) {
                pendingAsyncFetch = {
                  interviewId,
                  conversationId: conversation_id,
                  source: 'existing interview / fetched transcript',
                };
              }
            } else if (existingInterview.transcript) {
              console.log(`[SAVE-INTERVIEW] Interview ${interviewId} already has transcript, ensuring evaluation is enqueued`);
              pendingFinalize = {
                interviewId,
                conversationId: conversation_id,
                transcript: existingInterview.transcript,
                source: 'existing interview / existing transcript',
              };
            }
          }
        } catch (dbError: any) {
          console.error('[SAVE-INTERVIEW] Error finding interview by conversation_id:', dbError);
          // Continue to create new interview
        }
      }
      
      // Step 2: If no interview found, CREATE ONE SYNCHRONOUSLY
      if (!interviewId) {
        try {
          console.log('[SAVE-INTERVIEW] No existing interview found - creating new interview record synchronously');
          
          // Create interview record with status 'pending'
          const interviewData = insertInterviewSchema.parse({
            userId: userId, // candidate_id is userId in schema
            conversationId: conversation_id || null,
            agentId: agentId,
            transcript: null, // Will be populated by webhook or async fetch
            durationSeconds: null,
            startedAt: null, // Will be populated by webhook if available
            endedAt: clientEndedAt,
            status: 'pending', // Set to 'pending' initially as requested
          });
          // SQLite doesn't have gen_random_uuid() or now() - provide id and createdAt explicitly
          const isSqlite = process.env.DATABASE_URL?.startsWith('file:');
          const interviewValues = isSqlite
            ? { ...interviewData, id: randomUUID(), createdAt: new Date() }
            : interviewData;
          const [newInterview] = await db.insert(interviews).values(interviewValues as any).returning();
          interviewId = newInterview.id;
          
          console.log('[SAVE-INTERVIEW] Created new interview record synchronously:', {
            interviewId,
            userId,
            conversationId: conversation_id || 'null',
            agentId,
            status: 'pending',
            hasResumeText: !!resume_text,
            resumeTextLength: resume_text?.length || 0,
            timestamp: new Date().toISOString()
          });
          
          // Defer transcript finalization until resume is linked to interviewId
          if (transcript_from_tool) {
            pendingFinalize = {
              interviewId,
              conversationId: conversation_id,
              transcript: transcript_from_tool,
              source: 'new interview / tool transcript',
            };
          } else if (conversation_id) {
            pendingAsyncFetch = {
              interviewId,
              conversationId: conversation_id,
              source: 'new interview / fetched transcript',
            };
          }
        } catch (createError: any) {
          // Handle conflict: if conversation_id already exists (race condition)
          if (createError.code === '23505' || createError.message?.includes('duplicate') || createError.message?.includes('unique')) {
            console.log('[SAVE-INTERVIEW] Conflict detected - interview may have been created concurrently, attempting to find it');
            if (conversation_id) {
              try {
                const conflictInterview = await (db.query as any).interviews?.findFirst({
                  where: (interviews: any, { eq }: any) => eq(interviews.conversationId, conversation_id),
                });
                if (conflictInterview) {
                  if (conflictInterview.userId !== userId) {
                    console.warn("[SAVE-INTERVIEW] Conflict interview ownership mismatch", {
                      conversationId: conversation_id,
                      interviewId: conflictInterview.id,
                      requestUserId: userId,
                    });
                    return res.status(403).json({ error: "Unauthorized interview" });
                  }
                  interviewId = conflictInterview.id;
                  console.log(`[SAVE-INTERVIEW] Found interview ${interviewId} after conflict - returning existing ID`);
                }
              } catch (findError) {
                console.error('[SAVE-INTERVIEW] Error finding interview after conflict:', findError);
              }
            }
          } else {
            console.error('[SAVE-INTERVIEW] Error creating interview:', createError);
            throw createError; // Re-throw if it's not a conflict error
          }
        }
      }
      
      // Ensure we have an interviewId at this point
      if (!interviewId) {
        console.error('[SAVE-INTERVIEW] CRITICAL: Failed to create or find interview - interviewId is still null');
        throw new Error('Failed to create interview record');
      }

      // Link resume BEFORE finalizeInterviewTranscript enqueues evaluation
      let linkResult: { linked: boolean; profile?: Record<string, unknown> };
      try {
        linkResult = await linkResumeFromSessionToInterview(client_session_id, interviewId, {
          resumeTextFromBody: resume_text,
          userId,
          source: "[SAVE-INTERVIEW]",
        });
      } catch (resumePersistError: unknown) {
        console.error("[SAVE-INTERVIEW] Failed to persist request resume text:", {
          error: resumePersistError instanceof Error ? resumePersistError.message : String(resumePersistError),
          interviewId,
          clientSessionId: client_session_id,
          hasUserId: !!userId,
          resumeTextLength: resume_text?.length || 0,
        });
        return res.status(500).json({
          success: false,
          error: "Failed to persist resume",
          interviewId,
          sessionId: client_session_id,
        });
      }

      // Find or create elevenlabs_interview_sessions record
      // Wrap in try/catch to handle database errors gracefully
      try {
        const existingSession = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
          where: (sessions: any, { eq }: any) => eq(sessions.clientSessionId, client_session_id),
        });

        if (existingSession) {
          if (existingSession.userId !== userId) {
            console.warn("[SAVE-INTERVIEW] Session ownership mismatch", {
              clientSessionId: client_session_id,
              sessionId: existingSession.id,
              requestUserId: userId,
            });
            return res.status(403).json({ error: "Unauthorized session" });
          }
          // Update existing session
          try {
            const existingContext = (existingSession.candidateContext as Record<string, unknown>) || {};
            const mergedContext = mergeCandidateContextRecords(
              existingContext,
              buildCandidateContext(candidate_context_from_body as CandidateContextInput),
              linkResult.profile ? candidateContextFromResumeProfile(linkResult.profile) : null,
            );
            const updateData: Record<string, unknown> = {
              conversationId: conversation_id || existingSession.conversationId,
              interviewId: interviewId, // Always set since we guarantee interviewId exists
              status: 'completed', // Interview exists, so status is completed
              endedBy: ended_by || existingSession.endedBy,
              endedAt: clientEndedAt,
              clientEndedAt: clientEndedAt,
              updatedAt: new Date(),
            };
            if (Object.keys(mergedContext).length > 0) {
              updateData.candidateContext = mergedContext;
            }
            await db.update(elevenLabsInterviewSessions)
              .set(updateData as any)
              .where(eq(elevenLabsInterviewSessions.clientSessionId, client_session_id));
            console.log('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - Database UPDATE session:', {
              sessionId: existingSession.id,
              clientSessionId: client_session_id,
              updateData,
              timestamp: new Date().toISOString()
            });
            console.log(`[SAVE-INTERVIEW] Updated session ${existingSession.id} for client_session_id ${client_session_id}`);
          } catch (updateError: any) {
            console.error('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - Database UPDATE session FAILED:', {
              error: updateError.message || updateError,
              clientSessionId: client_session_id,
              timestamp: new Date().toISOString()
            });
            console.error('[SAVE-INTERVIEW] Error updating session:', updateError);
            // Continue - don't fail the request
          }
        } else {
          // Create new session record
          try {
            const agentId = agent_id || getAgentId();
            const mergedContext = mergeCandidateContextRecords(
              buildCandidateContext(candidate_context_from_body as CandidateContextInput),
              linkResult.profile ? candidateContextFromResumeProfile(linkResult.profile) : null,
            );
            const sessionData = insertElevenLabsInterviewSessionSchema.parse({
              userId,
              agentId,
              clientSessionId: client_session_id,
              conversationId: conversation_id || null, // conversation_id is optional
              interviewId: interviewId, // Always set since we guarantee interviewId exists
              status: 'completed', // Interview exists, so status is completed
              endedBy: ended_by || null,
              endedAt: clientEndedAt,
              clientEndedAt: clientEndedAt,
              ...(Object.keys(mergedContext).length > 0 ? { candidateContext: mergedContext } : {}),
            });
            // SQLite doesn't have gen_random_uuid() or now() - provide id and all timestamps explicitly
            const now = new Date();
            const sessionValues = process.env.DATABASE_URL?.startsWith('file:')
              ? { ...sessionData, id: randomUUID(), startedAt: now, createdAt: now, updatedAt: now }
              : sessionData;
            const [session] = await db.insert(elevenLabsInterviewSessions).values(sessionValues as any).returning();
            console.log('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - Database INSERT session:', {
              sessionId: session.id,
              clientSessionId: client_session_id,
              conversationId: conversation_id || null,
              interviewId: interviewId || null,
              status: sessionData.status,
              timestamp: new Date().toISOString()
            });
            console.log(`[SAVE-INTERVIEW] Created session ${session.id} for client_session_id ${client_session_id}`);
          } catch (insertError: any) {
            console.error('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - Database INSERT session FAILED:', {
              error: insertError.message || insertError,
              clientSessionId: client_session_id,
              timestamp: new Date().toISOString()
            });
            console.error('[SAVE-INTERVIEW] Error creating session:', insertError);
            // Continue - don't fail the request
          }
        }
      } catch (sessionError: any) {
        console.error('[SAVE-INTERVIEW] Error querying/updating session:', sessionError);
        // Continue - don't fail the request
      }

      if (candidate_context_from_body) {
        await mergeCandidateContextOnSession(client_session_id, userId, candidate_context_from_body);
      } else if (linkResult.linked && linkResult.profile) {
        await mergeCandidateContextOnSession(client_session_id, userId, linkResult.profile);
      }

      if (pendingFinalize) {
        await finalizeInterviewTranscript(pendingFinalize);
      }

      if (pendingAsyncFetch) {
        const { interviewId: asyncInterviewId, conversationId: asyncConversationId, source: asyncSource } =
          pendingAsyncFetch;
        fetchTranscriptFromElevenLabs(asyncConversationId)
          .then(async (transcript) => {
            if (transcript) {
              await linkResumeFromSessionToInterview(client_session_id, asyncInterviewId, {
                resumeTextFromBody: resume_text,
                userId,
                source: "[SAVE-INTERVIEW]",
              });
              await finalizeInterviewTranscript({
                interviewId: asyncInterviewId,
                conversationId: asyncConversationId,
                transcript,
                source: asyncSource,
              });
            } else {
              console.log(
                `[SAVE-INTERVIEW] Transcript not available yet for interview ${asyncInterviewId} - will be available via webhook`,
              );
            }
          })
          .catch((transcriptError: any) => {
            console.error(
              `[SAVE-INTERVIEW] Error fetching transcript for interview ${asyncInterviewId}:`,
              transcriptError.message || transcriptError,
            );
          });
      }

      // No transcript source: fail fast so Results does not poll for minutes
      const hasToolTranscript = !!transcript_from_tool?.trim();
      const willFetchTranscriptAsync = !!conversation_id && !hasToolTranscript;
      if (!hasToolTranscript && !willFetchTranscriptAsync) {
        try {
          const savedInterview = await (db.query as any).interviews?.findFirst({
            where: (interviews: any, { eq }: any) => eq(interviews.id, interviewId),
          });
          if (!savedInterview?.transcript?.trim()) {
            await recordTerminalEvaluationFailure(interviewId, 'no_transcript');
          }
        } catch (terminalEvalError: any) {
          console.warn('[SAVE-INTERVIEW] Could not record no_transcript failure:', terminalEvalError?.message || terminalEvalError);
        }
      }

      // CRITICAL: Always return interviewId - we guarantee it exists at this point
      // This prevents frontend from hanging due to null interviewId
      console.log('[SAVE-INTERVIEW] Returning response with interviewId:', {
        interviewId,
        sessionId: client_session_id,
        timestamp: new Date().toISOString()
      });
      
      res.json({ 
        success: true,
        interviewId: interviewId, // Always present - guaranteed by synchronous creation
        sessionId: client_session_id, // Also return sessionId for reference
      });
    } catch (error: any) {
      console.error('[SAVE-INTERVIEW] Unexpected error processing client end notification:', error);
      
      // CRITICAL: Even if there's an error, try to return interviewId if we have it
      // This ensures frontend can still navigate even if some operations failed
      if (interviewId) {
        console.log('[SAVE-INTERVIEW] Error occurred but interviewId exists - returning it for navigation:', {
          interviewId,
          error: error.message || error,
          timestamp: new Date().toISOString()
        });
        return res.status(200).json({ 
          success: true, // Still return success since interview was created
          interviewId: interviewId, // Return interviewId so frontend can navigate
          sessionId: client_session_id,
          warning: 'Some operations may have failed, but interview was created successfully'
        });
      }
      
      // If interviewId is null, return error (this should be rare since we throw if creation fails)
      console.error('[SAVE-INTERVIEW] CRITICAL: Error occurred and interviewId is null');
      res.status(500).json({ 
        success: false,
        error: 'Failed to create interview record',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // ========================================================================
  // ElevenLabs Server Tools: Fetch resume profile/fulltext by interviewid
  // Called from ElevenLabs cloud — requires a public backend URL (not localhost).
  // Resume context is also injected at session start via dynamicVariables in the frontend.
  // ========================================================================
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      '[RESUME-PROFILE] Dev note: ElevenLabs server tools call this backend from the cloud. ' +
      'Use ngrok or a deployed URL for live tool calls; missing [RESUME-PROFILE] logs during ' +
      'interviews is normal when structured resume_summary/resume_highlights dynamic vars are set.'
    );
  }

  async function resolveResumeLookupIds(requestedId: string): Promise<{
    lookupIds: string[];
    verified: boolean;
    kind: "interview" | "session" | "legacy-direct";
  }> {
    try {
      const interview = await (db.query as any).interviews?.findFirst({
        where: (interviews: any, { eq }: any) => eq(interviews.id, requestedId),
      });
      if (interview) {
        return { lookupIds: [requestedId], verified: true, kind: "interview" };
      }

      const sessionByClientId = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
        where: (sessions: any, { eq }: any) => eq(sessions.clientSessionId, requestedId),
      });
      const session =
        sessionByClientId ||
        (await (db.query as any).elevenLabsInterviewSessions?.findFirst({
          where: (sessions: any, { eq }: any) => eq(sessions.id, requestedId),
        }));

      if (session) {
        const lookupIds = session.interviewId
          ? [session.interviewId, session.clientSessionId].filter(Boolean)
          : [session.clientSessionId];
        return { lookupIds, verified: true, kind: "session" };
      }
    } catch (lookupError: unknown) {
      const msg = lookupError instanceof Error ? lookupError.message : String(lookupError);
      console.warn('[RESUME-LOOKUP] Session/interview lookup failed; falling back to direct id', {
        requestedId,
        error: msg,
      });
    }

    // Backward compatible for resume uploads that predate session creation.
    return { lookupIds: [requestedId], verified: false, kind: "legacy-direct" };
  }

  async function getVerifiedResumeForServerTool(requestedId: string) {
    const context = await resolveResumeLookupIds(requestedId);
    for (const lookupId of context.lookupIds) {
      const resume = await storage.getResume(lookupId);
      if (resume) {
        return { resume, lookupId, context };
      }
    }
    return { resume: undefined, lookupId: context.lookupIds[0] || requestedId, context };
  }

  async function resolveInterviewIdForServerTool(input: unknown): Promise<string | undefined> {
    const normalized = normalizeElevenLabsToolBody(input);
    const directId = readElevenLabsToolInterviewId(normalized);
    if (directId) return directId;

    const conversationId = readElevenLabsToolConversationId(normalized);
    if (!conversationId) return undefined;

    try {
      const session = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
        where: (sessions: any, { eq }: any) => eq(sessions.conversationId, conversationId),
      });
      return session?.clientSessionId || undefined;
    } catch (lookupError: unknown) {
      const msg = lookupError instanceof Error ? lookupError.message : String(lookupError);
      console.warn('[RESUME-LOOKUP] conversation_id session lookup failed', {
        conversationId,
        error: msg,
      });
      return undefined;
    }
  }

  function verifyElevenLabsToolAuth(
    req: Request,
    logPrefix: string,
  ): boolean {
    const apiSecret = readElevenLabsApiSecret(req.headers);
    if (apiSecret && apiSecret === ELEVENLABS_API_KEY) {
      return true;
    }
    console.warn(`[${logPrefix}] unauthorized tool request`, {
      method: req.method,
      hasSecret: Boolean(apiSecret),
      authHeader: typeof req.headers.authorization === "string" ? "present" : "missing",
    });
    return false;
  }

  app.all("/api/get-resume-profile", async (req, res) => {
    const logPrefix = "RESUME-PROFILE";
    console.log(`[${logPrefix}] incoming`, summarizeElevenLabsToolRequest(req));

    try {
      if (!verifyElevenLabsToolAuth(req, logPrefix)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API secret' });
      }

      const toolInput = mergeElevenLabsToolInput(req.body, req.query as Record<string, unknown>);
      const interviewId = await resolveInterviewIdForServerTool(toolInput);
      if (!interviewId) {
        return res.status(400).json({
          error: 'Missing interviewid (or interview_id) in body/parameters/query, and no session matched conversation_id',
          result: {
            error: true,
            message: 'Missing interview id for resume lookup',
          },
        });
      }

      const { resume, lookupId, context } = await getVerifiedResumeForServerTool(interviewId);
      console.log(`[${logPrefix}] lookup result`, {
        interviewId,
        lookupId,
        verified: context.verified,
        kind: context.kind,
        found: !!resume?.resumeProfile,
      });

      if (!resume || !resume.resumeProfile) {
        return res.status(404).json({
          error: 'Resume profile not found',
          result: {
            error: true,
            message: 'Resume profile not found for this interview',
            interviewid: interviewId,
          },
        });
      }

      const payload = {
        interviewid: interviewId,
        resumeprofile: resume.resumeProfile,
      };

      return res.json({ result: payload, ...payload });
    } catch (error: any) {
      console.error(`[${logPrefix}] Error:`, error);
      return res.status(500).json({ error: 'Failed to fetch resume profile' });
    }
  });

  app.all("/api/get-resume-fulltext", async (req, res) => {
    const logPrefix = "RESUME-FULLTEXT";
    console.log(`[${logPrefix}] incoming`, summarizeElevenLabsToolRequest(req));

    try {
      if (!verifyElevenLabsToolAuth(req, logPrefix)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API secret' });
      }

      const toolInput = mergeElevenLabsToolInput(req.body, req.query as Record<string, unknown>);
      const interviewId = await resolveInterviewIdForServerTool(toolInput);
      if (!interviewId) {
        return res.status(400).json({
          error: 'Missing interviewid (or interview_id) in body/parameters/query, and no session matched conversation_id',
          result: {
            error: true,
            message: 'Missing interview id for resume lookup',
          },
        });
      }

      const { resume, lookupId, context } = await getVerifiedResumeForServerTool(interviewId);
      console.log(`[${logPrefix}] lookup result`, {
        interviewId,
        lookupId,
        verified: context.verified,
        kind: context.kind,
        found: !!resume?.resumeFulltext,
        resumeTextLength: resume?.resumeFulltext?.length || 0,
      });

      if (!resume || !resume.resumeFulltext) {
        return res.status(404).json({
          error: 'Resume full text not found',
          result: {
            error: true,
            message: 'Resume full text not found for this interview',
            interviewid: interviewId,
          },
        });
      }

      const truncated = resume.resumeFulltext.length > RESUME_FULLTEXT_MAX_CHARS;
      const rawTruncated = truncated
        ? resume.resumeFulltext.substring(0, RESUME_FULLTEXT_MAX_CHARS)
        : resume.resumeFulltext;
      const safeText = stripResumeContactInfo(rawTruncated);

      const payload = {
        interviewid: interviewId,
        resumefulltext: safeText,
        truncated,
        maxChars: RESUME_FULLTEXT_MAX_CHARS,
      };

      return res.json({ result: payload, ...payload });
    } catch (error: any) {
      console.error(`[${logPrefix}] Error:`, error);
      return res.status(500).json({ error: 'Failed to fetch resume full text' });
    }
  });

  // ========================================================================
  // ElevenLabs Server Tool: Mark interview as complete
  // ========================================================================
  app.all("/api/mark-interview-complete", async (req, res) => {
    const logPrefix = "MARK-INTERVIEW-COMPLETE";
    console.log(`[${logPrefix}] incoming`, summarizeElevenLabsToolRequest(req));

    try {
      if (!verifyElevenLabsToolAuth(req, logPrefix)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API secret' });
      }

      const toolInput = mergeElevenLabsToolInput(req.body, req.query as Record<string, unknown>);
      const normalizedBody = normalizeElevenLabsToolBody(toolInput);

      const interviewId =
        readElevenLabsToolInterviewId(normalizedBody) ||
        (await resolveInterviewIdForServerTool(toolInput));
      const conversationId = readElevenLabsToolConversationId(normalizedBody);
      const candidateId = readElevenLabsToolCandidateId(normalizedBody);

      if (!interviewId || !candidateId) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          required: ['interviewid (or interview_id)', 'candidateid (or candidate_id)'],
        });
      }

      console.log(`MARK_INTERVIEW_COMPLETE interviewid=${interviewId}, conversationid=${conversationId}`);

      // interviewid is the frontend client_session_id (see dynamicVariables.interviewid)
      try {
        const existingSession = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
          where: (sessions: any, { eq }: any) => eq(sessions.clientSessionId, interviewId),
        });

        if (existingSession) {
          await db.update(elevenLabsInterviewSessions)
            .set({
              status: 'completed',
              endedBy: 'agent',
              endedAt: new Date(),
              conversationId: conversationId || existingSession.conversationId,
              updatedAt: new Date(),
            })
            .where(eq(elevenLabsInterviewSessions.clientSessionId, interviewId));
          console.log(`[MARK-INTERVIEW-COMPLETE] Updated session for client_session_id ${interviewId}`);
        }
      } catch (dbError: any) {
        console.warn('[MARK-INTERVIEW-COMPLETE] Session update failed (non-fatal):', dbError?.message || dbError);
      }

      const payload = {
        status: "completed",
        interviewid: interviewId,
        timestamp: new Date().toISOString(),
      };

      return res.json({ result: payload, ...payload });
    } catch (error: any) {
      console.error('[MARK-INTERVIEW-COMPLETE] Error:', error);
      return res.status(500).json({ error: 'Failed to mark interview as complete' });
    }
  });

  // Log completion of route registration
  console.log('[ROUTE REGISTRATION] All routes registered successfully');
  console.log('[ROUTE REGISTRATION] Available routes include:');
  console.log('[ROUTE REGISTRATION]   - GET /api/conversation-token (authenticated, rate-limited)');
  console.log('[ROUTE REGISTRATION]   - GET /health');
  console.log('[ROUTE REGISTRATION]   - POST /api/auth/signin');
  console.log('[ROUTE REGISTRATION]   - POST /api/auth/signup');
  console.log('[ROUTE REGISTRATION]   - POST /webhooks/elevenlabs');
  console.log('[ROUTE REGISTRATION]   - And other /api/* endpoints');
}
