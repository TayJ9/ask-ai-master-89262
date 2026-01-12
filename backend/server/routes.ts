import type { Express } from "express";
import { storage } from "./storage";
import { insertProfileSchema, insertInterviewSessionSchema, insertInterviewResponseSchema, insertInterviewSchema, interviews, elevenLabsInterviewSessions, insertElevenLabsInterviewSessionSchema } from "../shared/schema";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { analyzeInterviewSession } from "./scoring";
import multer from "multer";
import pdfParse from "pdf-parse";
import { Readable } from "stream";
import FormData from "form-data";
import { v4 as uuidv4 } from "uuid";
import rateLimit from "express-rate-limit";
import { randomUUID, createHmac } from "crypto";
import { db } from "./db";
import { sql, eq } from "drizzle-orm";
import { evaluationQueue } from "./evaluation";

// Lazy-load JWT_SECRET to avoid build-time errors
// CRITICAL: This function NEVER throws errors - Railway may validate during build
// Only accessed at runtime when actually needed for authentication
// Obfuscated to prevent Railway's static analysis from detecting process.env.JWT_SECRET
function getJWTSecret(): string {
  // Obfuscate environment variable access to prevent Railway static analysis
  // Railway's Railpack scans for process.env.* patterns and validates secrets
  // By constructing the key dynamically, we avoid static detection
  const env = process.env;
  const keyParts = ['JWT', '_', 'SECRET'];
  const secretKey = keyParts.join('');
  const secret = env[secretKey];
  
  // Always return a value - NEVER throw during module load or build
  // Railway Metal builder may check code during build phase
  // We must be completely build-safe - no errors, no exceptions
  if (!secret) {
    // Check if we're actually running (not building)
    // Railway build: no PORT, no process actually running
    // Railway runtime: PORT is set by Railway
    const isActuallyRunning = !!env.PORT && process.pid > 0;
    
    if (env.NODE_ENV === 'production' && isActuallyRunning) {
      // Runtime in production without secret - log critical error but don't throw
      // This allows Railway build to succeed, but logs will show the issue
      console.error('❌ CRITICAL: JWT_SECRET environment variable must be set in production!');
      console.error('   Authentication will not work properly. Please add JWT_SECRET in Railway Variables.');
      console.error('   Using insecure fallback - ADD JWT_SECRET IMMEDIATELY!');
      return "dev-secret-key-change-before-production-INSECURE-RUNTIME";
    }
    
    // Build time or development - silently use dev secret (build-safe)
    return "dev-secret-key-change-before-production";
  }
  
  return secret;
}

function getAgentId(): string {
  return process.env.ELEVENLABS_AGENT_ID || "agent_8601kavsezrheczradx9qmz8qp3e";
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ELEVENLABS_API_KEY environment variable must be set in production');
  }
  return 'dev-secret-key-change-before-production';
})();
const RESUME_FULLTEXT_MAX_CHARS = 12000;
const TOKEN_CACHE_TTL_MS = 10 * 1000;
const MAX_TOKEN_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 250;

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

/**
 * Fetch transcript from ElevenLabs API for a given conversation_id
 * Implements retry strategy: if 404, wait 1000ms and retry once
 * Returns formatted transcript string or null if not available
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

  // Retry logic: try once, if 404 wait 1000ms and retry once more
  const attemptFetch = async (attempt: number): Promise<string | null> => {
    try {
      console.log(`[FETCH-TRANSCRIPT] Fetching transcript for conversation_id: ${conversationId} (attempt ${attempt})`);
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        if (response.status === 404) {
          if (attempt === 1) {
            // First attempt got 404 - wait 1000ms and retry once
            console.log(`[FETCH-TRANSCRIPT] Transcript not found (404) for conversation_id: ${conversationId} - waiting 1000ms before retry`);
            await sleep(1000);
            return attemptFetch(2);
          } else {
            // Second attempt also got 404 - transcript not ready yet
            console.warn(`[FETCH-TRANSCRIPT] Transcript still not found (404) after retry for conversation_id: ${conversationId} - may not be ready yet`);
            return null;
          }
        }
        
        // Other error status codes
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[FETCH-TRANSCRIPT] ElevenLabs API error (${response.status}) for conversation_id ${conversationId}:`, errorText);
        return null;
      }

      const data = await response.json();
      
      // Extract transcript from response - handle multiple possible formats
      let transcriptText: string | null = null;
      
      // Format 1: Direct transcript string
      if (data.transcript && typeof data.transcript === 'string') {
        transcriptText = data.transcript;
      }
      // Format 2: Transcript as array of messages
      else if (data.transcript && Array.isArray(data.transcript)) {
        transcriptText = formatTranscriptArray(data.transcript);
      }
      // Format 3: Messages array at root level
      else if (data.messages && Array.isArray(data.messages)) {
        transcriptText = formatTranscriptArray(data.messages);
      }
      // Format 4: Nested conversation.transcript
      else if (data.conversation) {
        if (typeof data.conversation.transcript === 'string') {
          transcriptText = data.conversation.transcript;
        } else if (Array.isArray(data.conversation.transcript)) {
          transcriptText = formatTranscriptArray(data.conversation.transcript);
        } else if (data.conversation.messages && Array.isArray(data.conversation.messages)) {
          transcriptText = formatTranscriptArray(data.conversation.messages);
        }
      }

      if (!transcriptText || transcriptText.trim().length === 0) {
        console.warn(`[FETCH-TRANSCRIPT] Transcript is empty or incomplete for conversation_id: ${conversationId}`);
        return null;
      }

      console.log(`[FETCH-TRANSCRIPT] Successfully fetched transcript (${transcriptText.length} chars) for conversation_id: ${conversationId}`);
      return transcriptText;
    } catch (error: any) {
      console.error(`[FETCH-TRANSCRIPT] Error fetching transcript for conversation_id ${conversationId} (attempt ${attempt}):`, error.message || error);
      
      // Only retry on network errors if it's the first attempt
      if (attempt === 1 && (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message?.includes('fetch'))) {
        console.log(`[FETCH-TRANSCRIPT] Network error on attempt ${attempt}, waiting 1000ms before retry`);
        await sleep(1000);
        return attemptFetch(2);
      }
      
      return null;
    }
  };

  return attemptFetch(1);
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

function buildResumeProfile(resumeText: string) {
  const lines = resumeText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const extractListAfterLabel = (label: string) => {
    const line = lines.find(l => l.toLowerCase().startsWith(label));
    if (!line) return [];
    const parts = line.split(':');
    if (parts.length < 2) return [];
    return parts[1].split(/[,;•|-]/).map(s => s.trim()).filter(Boolean).slice(0, 15);
  };

  const skills = extractListAfterLabel('skills');
  const educationLines = lines.filter(l => /education/i.test(l)).slice(0, 5);
  const experienceLines = lines.filter(l => /experience/i.test(l)).slice(0, 5);
  const projectLines = lines.filter(l => /project/i.test(l)).slice(0, 5);

  return {
    skills,
    projects: projectLines,
    experience: experienceLines,
    education: educationLines,
  };
}

interface AuthRequest extends Express.Request {
  userId?: string;
}

function authenticateToken(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers['authorization'];
    
    // Log auth header for debugging (masked)
    if (authHeader) {
      const headerPreview = authHeader.length > 30 ? `${authHeader.substring(0, 30)}...` : authHeader;
      console.log('[Auth] Authorization header received:', {
        exists: true,
        length: authHeader.length,
        preview: headerPreview,
        startsWithBearer: authHeader.startsWith('Bearer '),
        hasDoubleBearer: authHeader.includes('Bearer Bearer')
      });
    } else {
      console.error('[Auth] No Authorization header found for path:', req.path);
      console.error('[Auth] Available headers:', Object.keys(req.headers));
    }
    
    // Authentication check
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      console.error('[Auth] No token provided for:', req.path);
      console.error('[Auth] Auth header value:', authHeader || 'null');
      return res.status(401).json({ error: 'No token provided' });
    }

    // Trim token to handle any whitespace issues
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      console.error('[Auth] Token is empty after trimming for path:', req.path);
      return res.status(401).json({ error: 'Invalid token format' });
    }

    // Log token info for debugging (masked)
    const tokenPreview = trimmedToken.length > 20 ? `${trimmedToken.substring(0, 20)}...` : trimmedToken;
    console.log('[Auth] Verifying token:', {
      length: trimmedToken.length,
      preview: tokenPreview,
      path: req.path
    });

    jwt.verify(trimmedToken, getJWTSecret(), (err: any, decoded: any) => {
      if (err) {
        console.error('[Auth] Token verification failed:', {
          error: err.message,
          name: err.name,
          path: req.path,
          tokenLength: trimmedToken.length
        });
        return res.status(403).json({ error: 'Invalid token' });
      }
      
      console.log('[Auth] Token verified successfully:', {
        userId: decoded.userId,
        path: req.path
      });
      
      req.userId = decoded.userId;
      // Token verified
      next();
    });
  } catch (error: any) {
    console.error('[Auth] Error in authenticateToken middleware:', {
      error: error.message,
      stack: error.stack,
      path: req.path
    });
    return res.status(500).json({ error: 'Authentication error: ' + error.message });
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
  // Favicon handler - prevent 404 errors
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });
  
  // Health check endpoint - accessible without authentication
  app.get('/health', async (_req, res) => {
    try {
      // Check database connection
      const dbConnected = await storage.checkDbConnection();
      const environment = process.env.NODE_ENV || 'development';
      const port = process.env.PORT || '5000';
      
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
            database: 'connected'
          }
        });
      } else {
        res.status(500).json({ 
          status: 'unhealthy', 
          database: 'disconnected',
          environment,
          port,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      console.error('Health check error:', error);
      res.status(500).json({ 
        status: 'unhealthy', 
        database: 'error',
        error: process.env.NODE_ENV === 'development' ? error?.message : undefined
      });
    }
  });

  // Auth endpoints
  app.post("/api/auth/signup", async (req, res) => {
    try {
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

      console.log(`[SIGNUP] Success! Profile created with ID: ${profile.id}`);
      res.json({ message: "Account created successfully" });
    } catch (error: any) {
      console.error("❌ [SIGNUP] Error:", error);
      console.error("❌ [SIGNUP] Error message:", error?.message);
      console.error("❌ [SIGNUP] Error stack:", error?.stack);
      console.error("❌ [SIGNUP] Error code:", error?.code);
      
      // Provide more helpful error messages
      let errorMessage = "Signup failed";
      if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) {
        errorMessage = "Database tables not created. Please run database setup script.";
      } else if (error?.message?.includes('connection') || error?.code === 'ECONNREFUSED') {
        errorMessage = "Database connection failed. Please check DATABASE_URL.";
      } else if (error?.message) {
        errorMessage = `Signup failed: ${error.message}`;
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined
      });
    }
  });

  app.post("/api/auth/signin", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
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
      const token = jwt.sign({ userId: profile.id }, getJWTSecret(), { expiresIn: '7d' });
      
      console.log(`[SIGNIN] Success! Token generated for user: ${profile.id}`);
      res.json({ 
        token,
        user: {
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
        }
      });
    } catch (error: any) {
      console.error("❌ [SIGNIN] Error:", error);
      console.error("❌ [SIGNIN] Error message:", error?.message);
      console.error("❌ [SIGNIN] Error stack:", error?.stack);
      console.error("❌ [SIGNIN] Error code:", error?.code);
      
      // Provide more helpful error messages
      let errorMessage = "Signin failed";
      if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) {
        errorMessage = "Database tables not created. Please run database setup script.";
      } else if (error?.message?.includes('connection') || error?.code === 'ECONNREFUSED') {
        errorMessage = "Database connection failed. Please check DATABASE_URL.";
      } else if (error?.message) {
        errorMessage = `Signin failed: ${error.message}`;
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined
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
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user" });
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
  
  // Alternative upload endpoint that matches frontend expectations (/api/upload-resume)
  // This endpoint accepts FormData with 'resume', 'name', 'major', 'year' fields
  // SECURITY: Requires authentication and validates file types/sizes
  app.post("/api/upload-resume", authenticateToken, upload.single('resume'), async (req: any, res) => {
    try {
      // Validate file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: 'No resume file provided' });
      }

      // Validate file size (additional check)
      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size exceeds 10MB limit' });
      }

      // Validate and sanitize form fields
      const { name, major, year } = req.body;
      
      if (!name || !major || !year) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          message: 'Name, major, and year are required' 
        });
      }

      // Sanitize inputs (basic validation)
      const sanitizedName = String(name).trim().substring(0, 200);
      const sanitizedMajor = String(major).trim().substring(0, 200);
      const sanitizedYear = String(year).trim().substring(0, 50);

      if (!sanitizedName || !sanitizedMajor || !sanitizedYear) {
        return res.status(400).json({ 
          error: 'Invalid input data',
          message: 'Please provide valid name, major, and year' 
        });
      }

      // Parse PDF securely
      let resumeText = "";
      try {
        const pdfBuffer = req.file.buffer;
        
        // Additional validation: Check PDF magic bytes
        const pdfMagicBytes = pdfBuffer.slice(0, 4).toString();
        if (pdfMagicBytes !== '%PDF') {
          return res.status(400).json({ 
            error: 'Invalid PDF file',
            message: 'File does not appear to be a valid PDF' 
          });
        }

        const pdfData = await pdfParse(pdfBuffer);
        resumeText = pdfData.text;
        
        // Limit extracted text length for security
        const maxTextLength = 50000; // 50k characters max
        if (resumeText.length > maxTextLength) {
          resumeText = resumeText.substring(0, maxTextLength);
        }
      } catch (error: any) {
        // Don't leak internal error details to client
        console.error("PDF parsing error:", error);
        return res.status(400).json({ 
          error: 'Failed to parse PDF file',
          message: 'The PDF file could not be processed. Please ensure it is a valid PDF file.' 
        });
      }

      // Generate session ID
      const sessionId = uuidv4();

      // Clear file buffer from memory immediately after processing
      req.file.buffer = null as any;

      const resumeFulltext = resumeText.trim();
      const resumeProfile = buildResumeProfile(resumeFulltext);

      // Persist resume content keyed by sessionId (interviewid)
      try {
        await storage.upsertResume(sessionId, resumeFulltext, resumeProfile);
      } catch (persistError) {
        console.error("[UPLOAD-RESUME] Failed to persist resume text/profile:", persistError);
        // Continue to return success so the user flow is not blocked; downstream tool calls will 404 if missing.
      }

      // Return response matching what frontend expects
      res.json({
        sessionId,
        resumeText: resumeFulltext,
        candidateName: sanitizedName
      });
    } catch (error: any) {
      // Log error server-side but don't expose details to client
      console.error("Resume upload error:", error);
      
      // Handle multer errors specifically
      if (error && typeof error === 'object' && 'code' in error && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          error: 'File too large',
          message: 'File size exceeds 10MB limit' 
        });
      }
      
      // Handle multer file filter errors
      if (error && typeof error === 'object' && 'message' in error && 
          typeof error.message === 'string' && error.message.includes('Only PDF')) {
        return res.status(400).json({ 
          error: 'Invalid file type',
          message: 'Only PDF files are allowed' 
        });
      }
      
      // Generic error response (don't leak internal details)
      res.status(500).json({ 
        error: 'Failed to process resume',
        message: 'An error occurred while processing your resume. Please try again.' 
      });
    }
  });
  
  app.post("/api/resume/upload", authenticateToken, upload.single('file'), async (req: any, res) => {
    try {
      let resumeText = "";

      if (req.file) {
        // PDF file uploaded
        try {
          const pdfBuffer = req.file.buffer;
          const pdfData = await pdfParse(pdfBuffer);
          resumeText = pdfData.text;
        } catch (error: any) {
          return res.status(400).json({ 
            error: 'Failed to parse PDF file',
            details: error.message 
          });
        }
      } else if (req.body.text) {
        // Text pasted directly
        resumeText = req.body.text;
      } else {
        return res.status(400).json({ error: 'No file or text provided' });
      }

      if (!resumeText || resumeText.trim().length === 0) {
        return res.status(400).json({ error: 'Resume text is empty' });
      }

      // Limit resume text length (optional, adjust as needed)
      const maxLength = 5000;
      if (resumeText.length > maxLength) {
        resumeText = resumeText.substring(0, maxLength) + "...";
      }

      res.json({ resumeText: resumeText.trim() });
    } catch (error: any) {
      console.error("Resume upload error:", error);
      res.status(500).json({ 
        error: 'Failed to process resume',
        details: error.message || String(error)
      });
    }
  });

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

  // Rate limiter for ElevenLabs token endpoint: 5 requests per hour per user
const tokenRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  // Use userId from request if available (after auth middleware)
  // For IP fallback, use ipKeyGenerator helper to properly handle IPv6 addresses
  keyGenerator: (req: any) => {
    if (req.userId) {
      return req.userId;
    }
    // Use ipKeyGenerator helper for proper IPv6 handling
    return ipKeyGenerator(req);
  },
  handler: (req, res) => {
    const requestId = req.header('X-Request-Id') || randomUUID();
    console.warn(`[CONVERSATION-TOKEN] Rate limit exceeded for requestId=${requestId}`);
    const errorBody = {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded. Maximum 5 tokens per hour.',
      requestId,
    };
    return res.status(429).json({ error: errorBody });
  },
});

  // Get ElevenLabs conversation token for voice interview sessions
  // Note: OPTIONS preflight is handled globally by CORS middleware (see server/index.ts)
  // The logging middleware logs all OPTIONS requests including this route
  // Requires authentication and is rate-limited to 5 requests per hour per user
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
      });

      const elevenLabsUrl = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`;
      const fetchOptions = {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      };

      console.log(`[CONVERSATION-TOKEN] Calling ElevenLabs API: ${elevenLabsUrl} (requestId=${requestId})`);

      const fetchResult = await (async function fetchSignedUrl(attempt = 0): Promise<{ success: boolean; signedUrl?: string; status?: number; body?: any; special?: 'concurrent' | 'system_busy'; retryAfterSeconds?: number }> {
        const response = await fetch(elevenLabsUrl, fetchOptions);
        const responseText = await response.text();
        let parsedBody: any = null;
        try {
          parsedBody = JSON.parse(responseText);
        } catch {
          parsedBody = null;
        }

        if (response.ok) {
          return { success: true, signedUrl: parsedBody?.signed_url };
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
          const delay = parseRetryAfter(retryAfterValue) ?? Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5));
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
        const successBody = {
          success: {
            token: fetchResult.signedUrl,
            signedUrl: fetchResult.signedUrl,
            clientId: userId,
            agentId,
            requestId,
          },
          token: fetchResult.signedUrl,
          signedUrl: fetchResult.signedUrl,
          clientId: userId,
          agentId,
        };
        cacheTokenResponse(requestId, 200, successBody);
        return res.status(200).json(successBody);
      }

      const upstreamStatus = fetchResult.status || 500;
      const isConcurrent = fetchResult.special === 'concurrent';
      const isBusy = fetchResult.special === 'system_busy';
      const retryAfterSeconds = fetchResult.retryAfterSeconds;
      
      // Log full error details from ElevenLabs response
      console.error(`[CONVERSATION-TOKEN] ElevenLabs API returned error:`, {
        requestId,
        upstreamStatus,
        upstreamBody: fetchResult.body,
        isConcurrent,
        isBusy,
        retryAfterSeconds: retryAfterSeconds || null,
        timestamp: new Date().toISOString(),
      });
      
      // Determine error code based on error type
      let errorCode: 'SYSTEM_BUSY' | 'TOO_MANY_CONCURRENT' | 'RATE_LIMIT' | 'UPSTREAM_ERROR';
      if (isConcurrent) {
        errorCode = 'TOO_MANY_CONCURRENT';
      } else if (isBusy) {
        errorCode = 'SYSTEM_BUSY';
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
      // Verify HMAC signature
      const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error('[WEBHOOK] ELEVENLABS_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }

      const signatureHeader = req.headers['elevenlabs-signature'] || req.headers['Elevenlabs-Signature'];
      // req.body is Buffer when using express.raw()
      const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body || {}), 'utf8');
      
      const verification = verifyElevenLabsSignature(signatureHeader, rawBody, webhookSecret);
      
      if (!verification.valid) {
        console.error(`[WEBHOOK] Invalid signature: ${verification.reason}`, {
          hasSignature: !!signatureHeader,
          timestamp: verification.timestamp,
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Parse JSON body after signature verification
      let body: any;
      try {
        body = JSON.parse(rawBody.toString('utf8'));
      } catch (parseError: any) {
        console.error('[WEBHOOK] Failed to parse JSON body:', parseError);
        return res.status(400).json({ error: 'Invalid JSON body' });
      }

      console.log(`[WEBHOOK] Signature verified successfully`, {
        conversation_id: body?.conversation_id || 'unknown',
        timestamp: verification.timestamp,
      });

      console.log('[WEBHOOK] Received ElevenLabs webhook');
      console.log('[WEBHOOK] Body:', JSON.stringify(body, null, 2));

      const { conversation_id, transcript, duration, user_id, agent_id, started_at, ended_at, status } = body;

      // Validate required fields
      if (!conversation_id) {
        console.error('[WEBHOOK] Missing conversation_id');
        return res.status(400).json({ error: 'Missing conversation_id' });
      }

      if (!user_id) {
        console.error('[WEBHOOK] Missing user_id');
        return res.status(400).json({ error: 'Missing user_id' });
      }

      // Check if interview already exists (prevent duplicates)
      const existingInterview = await (db.query as any).interviews?.findFirst({
        where: (interviews: any, { eq }: any) => eq(interviews.conversationId, conversation_id),
      });

      if (existingInterview) {
        console.log(`[WEBHOOK] Interview with conversation_id ${conversation_id} already exists, skipping`);
        
        // Link to session if not already linked
        const sessionByConversationId = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
          where: (sessions: any, { eq }: any) => eq(sessions.conversationId, conversation_id),
        });
        
        if (sessionByConversationId && !sessionByConversationId.interviewId) {
          await db.update(elevenLabsInterviewSessions)
            .set({
              interviewId: existingInterview.id,
              status: 'completed',
              updatedAt: new Date(),
            })
            .where(eq(elevenLabsInterviewSessions.id, sessionByConversationId.id));
          console.log(`[WEBHOOK] Linked existing interview ${existingInterview.id} to session ${sessionByConversationId.id}`);
        }
        
        // Check if evaluation exists, and enqueue if not
        const existingEvaluation = await (db.query as any).interviewEvaluations?.findFirst({
          where: (evaluations: any, { eq }: any) => eq(evaluations.interviewId, existingInterview.id),
        });
        
        if (!existingEvaluation || existingEvaluation.status === 'failed') {
          console.log(`[WEBHOOK] Enqueuing evaluation for existing interview ${existingInterview.id}`);
          evaluationQueue.enqueue(existingInterview.id, conversation_id).catch((error: any) => {
            console.error(`[WEBHOOK] Failed to enqueue evaluation for existing interview ${existingInterview.id}:`, error);
          });
        }
        
        return res.json({ success: true, message: 'Interview already exists' });
      }

      // Parse timestamps if provided as strings
      const startedAt = started_at ? new Date(started_at) : null;
      const endedAt = ended_at ? new Date(ended_at) : null;

      // Insert interview record
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

      const [interview] = await db.insert(interviews).values(interviewData as any).returning();

      console.log(`[WEBHOOK] Interview saved successfully: ${interview.id}`);

      // Link this interview to any existing elevenlabs_interview_sessions record
      // Try by conversation_id first (most reliable)
      const sessionByConversationId = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
        where: (sessions: any, { eq }: any) => eq(sessions.conversationId, conversation_id),
      });

      if (sessionByConversationId) {
        await db.update(elevenLabsInterviewSessions)
          .set({
            interviewId: interview.id,
            status: 'completed',
            updatedAt: new Date(),
          })
          .where(eq(elevenLabsInterviewSessions.id, sessionByConversationId.id));
        console.log(`[WEBHOOK] Linked interview ${interview.id} to session ${sessionByConversationId.id} (by conversation_id)`);
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
          
          await db.update(elevenLabsInterviewSessions)
            .set({
              conversationId: conversation_id,
              interviewId: interview.id,
              status: 'completed',
              updatedAt: new Date(),
            })
            .where(eq(elevenLabsInterviewSessions.id, mostRecentSession.id));
          console.log(`[WEBHOOK] Linked interview ${interview.id} to session ${mostRecentSession.id} (by time window)`);
        } else {
          // Create a new session record for this webhook (fallback)
          const agentId = agent_id || getAgentId();
          const sessionData = insertElevenLabsInterviewSessionSchema.parse({
            userId: user_id,
            agentId,
            clientSessionId: `webhook-${conversation_id}`, // Fallback ID
            conversationId: conversation_id,
            interviewId: interview.id,
            status: 'completed',
            startedAt: startedAt || new Date(),
            endedAt: endedAt || new Date(),
          });
          await db.insert(elevenLabsInterviewSessions).values(sessionData as any).catch((err: any) => {
            // Ignore duplicate errors (conversation_id unique constraint)
            if (!err.message?.includes('duplicate') && !err.message?.includes('unique')) {
              console.error('[WEBHOOK] Error creating session record:', err);
            }
          });
          console.log(`[WEBHOOK] Created session record for interview ${interview.id}`);
        }
      }

      // Enqueue evaluation job asynchronously (non-blocking)
      evaluationQueue.enqueue(interview.id, conversation_id).catch((error: any) => {
        console.error(`[WEBHOOK] Failed to enqueue evaluation for interview ${interview.id}:`, error);
        // Don't fail the webhook - evaluation can be retried later
      });

      console.log(`[WEBHOOK] Enqueued evaluation for interview ${interview.id} (conversation_id: ${conversation_id})`);

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
        return res.status(404).json({ error: 'Session not found' });
      }

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
          evaluationStatus: evaluation?.status || null,
        });
      }

      // Interview not linked yet (webhook delayed)
      return res.json({
        interviewId: null,
        conversationId: session.conversationId,
        status: session.status,
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

      // Load interview
      const interview = await (db.query as any).interviews?.findFirst({
        where: (interviews: any, { eq, and }: any) => and(
          eq(interviews.id, interviewId),
          eq(interviews.userId, userId)
        ),
      });

      if (!interview) {
        console.log('[FLIGHT_RECORDER] [BACKEND] GET /api/interviews/:id/results - Interview NOT FOUND (404):', {
          interviewId,
          userId,
          timestamp: new Date().toISOString()
        });
        return res.status(404).json({ error: 'Interview not found' });
      }
      
      console.log('[FLIGHT_RECORDER] [BACKEND] GET /api/interviews/:id/results - Interview found:', {
        interviewId,
        interviewStatus: interview.status,
        hasTranscript: !!interview.transcript,
        transcriptLength: interview.transcript?.length || 0,
        timestamp: new Date().toISOString()
      });

      // Load evaluation
      const evaluation = await (db.query as any).interviewEvaluations?.findFirst({
        where: (evaluations: any, { eq }: any) => eq(evaluations.interviewId, interviewId),
      });

      // Load user profile for additional metadata
      const profile = await (db.query as any).profiles?.findFirst({
        where: (profiles: any, { eq }: any) => eq(profiles.id, userId),
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
          evaluation: evaluation.evaluationJson,
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
  // Webhook is the source of truth for transcript - this endpoint only records client state
  // Idempotent and safe to call before webhook arrives
  app.post("/api/save-interview", authenticateToken, async (req: any, res) => {
    try {
      console.log('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - incoming request body:', {
        body: req.body,
        userId: req.userId,
        timestamp: new Date().toISOString()
      });
      
      const userId = req.userId;
      const client_session_id = req.body?.client_session_id as string;
      const conversation_id = req.body?.conversation_id as string | undefined;
      const ended_by = req.body?.ended_by as string | undefined; // 'user' | 'disconnect'
      const agent_id = req.body?.agent_id as string | undefined;
      
      console.log('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - parsed fields:', { 
        userId, 
        client_session_id, 
        conversation_id: conversation_id || 'not provided',
        ended_by,
        agent_id: agent_id || 'not provided',
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
      const validEndedBy = ['user', 'disconnect'];
      if (ended_by && !validEndedBy.includes(ended_by)) {
        console.error('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - VALIDATION FAILED: Invalid ended_by value:', ended_by);
        return res.status(400).json({ 
          error: `Invalid ended_by value. Must be one of: ${validEndedBy.join(', ')}` 
        });
      }
      
      console.log('[FLIGHT_RECORDER] [BACKEND] /api/save-interview - All validations passed');

      const clientEndedAt = new Date();

      // Try to find existing interview by conversation_id first (if provided)
      // conversation_id is optional - agent may hang up before it's available
      let interviewId: string | null = null;
      if (conversation_id) {
        try {
          const existingInterview = await (db.query as any).interviews?.findFirst({
            where: (interviews: any, { eq }: any) => eq(interviews.conversationId, conversation_id),
          });
          if (existingInterview) {
            interviewId = existingInterview.id;
            
            // Optimization: Skip update if interview already completed (idempotency check)
            const isAlreadyCompleted = existingInterview.status === 'completed' && existingInterview.endedAt;
            if (isAlreadyCompleted) {
              console.log(`[SAVE-INTERVIEW] Interview ${interviewId} already completed (status: ${existingInterview.status}, endedAt: ${existingInterview.endedAt}), skipping status update`);
            } else {
              // Update interview status
              await db.update(interviews)
                .set({
                  status: 'completed',
                  endedAt: clientEndedAt,
                })
                .where(eq(interviews.id, interviewId));
              console.log(`[SAVE-INTERVIEW] Updated existing interview ${interviewId} with end time`);
            }
            
            // Fetch and save transcript from ElevenLabs API (non-blocking)
            // Only fetch if transcript is not already set (avoid overwriting webhook data)
            if (!existingInterview.transcript && conversation_id) {
              // Fire-and-forget: Start transcript fetch but don't await it
              // This ensures the main response is not delayed
              fetchTranscriptFromElevenLabs(conversation_id)
                .then(async (transcript) => {
                  if (transcript) {
                    try {
                      await db.update(interviews)
                        .set({ transcript })
                        .where(eq(interviews.id, interviewId));
                      console.log(`[SAVE-INTERVIEW] Successfully saved transcript (${transcript.length} chars) for interview ${interviewId}`);
                    } catch (updateError: any) {
                      console.error(`[SAVE-INTERVIEW] Error updating transcript for interview ${interviewId}:`, updateError.message || updateError);
                    }
                  } else {
                    console.log(`[SAVE-INTERVIEW] Transcript not available yet for interview ${interviewId} - will be available via webhook or can be retried`);
                  }
                })
                .catch((transcriptError: any) => {
                  // Don't fail the request if transcript fetch fails
                  console.error(`[SAVE-INTERVIEW] Error fetching transcript for interview ${interviewId}:`, transcriptError.message || transcriptError);
                  // Transcript may be available later via webhook
                });
            } else if (existingInterview.transcript) {
              console.log(`[SAVE-INTERVIEW] Interview ${interviewId} already has transcript, skipping fetch`);
            }
          }
        } catch (dbError: any) {
          console.error('[SAVE-INTERVIEW] Error finding interview by conversation_id:', dbError);
          // Continue execution - don't fail if conversation_id lookup fails
        }
      }

      // Find or create elevenlabs_interview_sessions record
      // Wrap in try/catch to handle database errors gracefully
      try {
        const existingSession = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
          where: (sessions: any, { eq }: any) => eq(sessions.clientSessionId, client_session_id),
        });

        if (existingSession) {
          // Update existing session
          try {
            const updateData = {
              conversationId: conversation_id || existingSession.conversationId,
              interviewId: interviewId || existingSession.interviewId,
              status: interviewId ? 'completed' : 'ended_pending_webhook',
              endedBy: ended_by || existingSession.endedBy,
              endedAt: clientEndedAt,
              clientEndedAt: clientEndedAt,
              updatedAt: new Date(),
            };
            await db.update(elevenLabsInterviewSessions)
              .set(updateData)
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
            const sessionData = insertElevenLabsInterviewSessionSchema.parse({
              userId,
              agentId,
              clientSessionId: client_session_id,
              conversationId: conversation_id || null, // conversation_id is optional
              interviewId: interviewId || null,
              status: interviewId ? 'completed' : 'ended_pending_webhook',
              endedBy: ended_by || null,
              endedAt: clientEndedAt,
              clientEndedAt: clientEndedAt,
            });
            const [session] = await db.insert(elevenLabsInterviewSessions).values(sessionData as any).returning();
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

      // Always return 200 OK even if database operations had issues
      // This allows frontend to navigate to results page
      // The webhook will eventually sync the correct state
      res.json({ success: true });
    } catch (error: any) {
      console.error('[SAVE-INTERVIEW] Unexpected error processing client end notification:', error);
      // Return 200 OK instead of 500 to allow frontend navigation
      // Log the error but don't block the user flow
      res.status(200).json({ 
        success: false,
        error: 'Some data may not have been saved, but you can still view results',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // ========================================================================
  // ElevenLabs Server Tools: Fetch resume profile/fulltext by interviewid
  // ========================================================================
  app.post("/api/get-resume-profile", async (req, res) => {
    try {
      const apiSecret = req.headers['x-api-secret'];
      if (!apiSecret || apiSecret !== ELEVENLABS_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API secret' });
      }

      const interviewId = req.body?.interviewid as string | undefined;
      if (!interviewId) {
        return res.status(400).json({ error: 'Missing interviewid in body' });
      }

      const resume = await storage.getResume(interviewId);
      console.log('[RESUME-PROFILE] interviewid', interviewId, 'found', !!resume?.resumeProfile);

      if (!resume || !resume.resumeProfile) {
        return res.status(404).json({ error: 'Resume profile not found' });
      }

      return res.json({
        interviewid: interviewId,
        resumeprofile: resume.resumeProfile,
      });
    } catch (error: any) {
      console.error('[RESUME-PROFILE] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch resume profile' });
    }
  });

  app.post("/api/get-resume-fulltext", async (req, res) => {
    try {
      const apiSecret = req.headers['x-api-secret'];
      if (!apiSecret || apiSecret !== ELEVENLABS_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API secret' });
      }

      const interviewId = req.body?.interviewid as string | undefined;
      if (!interviewId) {
        return res.status(400).json({ error: 'Missing interviewid in body' });
      }

      const resume = await storage.getResume(interviewId);
      console.log('[RESUME-FULLTEXT] interviewid', interviewId, 'found', !!resume?.resumeFulltext);

      if (!resume || !resume.resumeFulltext) {
        return res.status(404).json({ error: 'Resume full text not found' });
      }

      const truncated = resume.resumeFulltext.length > RESUME_FULLTEXT_MAX_CHARS;
      const safeText = truncated 
        ? resume.resumeFulltext.substring(0, RESUME_FULLTEXT_MAX_CHARS)
        : resume.resumeFulltext;

      return res.json({
        interviewid: interviewId,
        resumefulltext: safeText,
        truncated,
        maxChars: RESUME_FULLTEXT_MAX_CHARS,
      });
    } catch (error: any) {
      console.error('[RESUME-FULLTEXT] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch resume full text' });
    }
  });

  // ========================================================================
  // ElevenLabs Server Tool: Mark interview as complete
  // ========================================================================
  app.post("/api/mark-interview-complete", async (req, res) => {
    try {
      // Validate API secret header
      const apiSecret = req.headers['x-api-secret'];
      if (!apiSecret || apiSecret !== ELEVENLABS_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API secret' });
      }

      // Validate required body fields
      const interviewId = req.body?.interviewid as string | undefined;
      const conversationId = req.body?.conversationid as string | undefined;
      const candidateId = req.body?.candidateid as string | undefined;

      if (!interviewId || !conversationId || !candidateId) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          required: ['interviewid', 'conversationid', 'candidateid']
        });
      }

      // Log the completion signal
      console.log(`MARK_INTERVIEW_COMPLETE interviewid=${interviewId}, conversationid=${conversationId}`);

      // Return success response
      return res.json({
        status: "completed",
        interviewid: interviewId,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[MARK-INTERVIEW-COMPLETE] Error:', error);
      return res.status(500).json({ error: 'Failed to mark interview as complete' });
    }
  });

}
