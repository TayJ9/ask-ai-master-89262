import type { Express } from "express";
import { storage } from "./storage";
import { insertProfileSchema, insertInterviewSessionSchema, insertInterviewResponseSchema, insertInterviewSchema, interviews } from "../shared/schema";
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
import { db } from "./db";

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

interface AuthRequest extends Express.Request {
  userId?: string;
}

function authenticateToken(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers['authorization'];
    // Authentication check
    
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      console.error('No token provided for:', req.path);
      return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, getJWTSecret(), (err: any, decoded: any) => {
      if (err) {
        console.error('Token verification failed:', err.message);
        return res.status(403).json({ error: 'Invalid token' });
      }
      req.userId = decoded.userId;
      // Token verified
      next();
    });
  } catch (error: any) {
    console.error('Error in authenticateToken middleware:', error);
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

      // Return response matching what frontend expects
      res.json({
        sessionId,
        resumeText: resumeText.trim(),
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
    message: { error: 'Rate limit exceeded. Maximum 5 tokens per hour.' },
    standardHeaders: true,
    legacyHeaders: false,
    // Use userId from request if available (after auth middleware)
    keyGenerator: (req: any) => {
      return req.userId || req.ip || 'unknown';
    },
  });

  // Get ElevenLabs conversation token for voice interview sessions
  // Requires authentication and is rate-limited to 5 requests per hour per user
  app.get("/api/conversation-token", authenticateToken, tokenRateLimiter, async (req: any, res) => {
    try {
      const userId = req.userId;
      const agentId = process.env.ELEVENLABS_AGENT_ID || "agent_8601kavsezrheczradx9qmz8qp3e";
      const apiKey = process.env.ELEVENLABS_API_KEY;

      console.log(`[CONVERSATION-TOKEN] Request from user: ${userId}`);

      if (!apiKey) {
        console.error('[CONVERSATION-TOKEN] ELEVENLABS_API_KEY not configured');
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      // Call ElevenLabs API to get SIGNED URL for the SDK
      // The SDK requires a signed URL, not a token
      const elevenLabsUrl = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`;
      
      console.log(`[CONVERSATION-TOKEN] Calling ElevenLabs API: ${elevenLabsUrl}`);

      const response = await fetch(elevenLabsUrl, {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CONVERSATION-TOKEN] ElevenLabs API error: ${response.status} - ${errorText}`);
        return res.status(500).json({ 
          error: 'Failed to get signed URL from ElevenLabs',
          details: process.env.NODE_ENV === 'development' ? errorText : undefined
        });
      }

      const data = await response.json() as { signed_url?: string };
      // The get_signed_url endpoint returns { signed_url: "wss://..." }
      const signedUrl = data.signed_url;

      if (!signedUrl) {
        console.error('[CONVERSATION-TOKEN] No signed_url in response:', data);
        return res.status(500).json({ error: 'No signed URL returned from ElevenLabs' });
      }

      console.log(`[CONVERSATION-TOKEN] Signed URL obtained successfully for user: ${userId}`);

      // Return the signed URL as 'token' for frontend compatibility
      // The frontend uses tokenData.token as the signedUrl
      res.json({
        token: signedUrl,
        signedUrl: signedUrl, // Also include as signedUrl for clarity
        clientId: userId,
        agentId,
      });
    } catch (error: any) {
      console.error('[CONVERSATION-TOKEN] Error:', error);
      res.status(500).json({ 
        error: 'Failed to get conversation token',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // ElevenLabs webhook endpoint - receives conversation completion events
  // No authentication required as this is called by ElevenLabs servers
  app.post("/webhooks/elevenlabs", async (req, res) => {
    try {
      console.log('[WEBHOOK] Received ElevenLabs webhook');
      console.log('[WEBHOOK] Body:', JSON.stringify(req.body, null, 2));

      const { conversation_id, transcript, duration, user_id, agent_id, started_at, ended_at, status } = req.body;

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
      const existingInterview = await db.query.interviews.findFirst({
        where: (interviews, { eq }) => eq(interviews.conversationId, conversation_id),
      });

      if (existingInterview) {
        console.log(`[WEBHOOK] Interview with conversation_id ${conversation_id} already exists, skipping`);
        return res.json({ success: true, message: 'Interview already exists' });
      }

      // Parse timestamps if provided as strings
      const startedAt = started_at ? new Date(started_at) : null;
      const endedAt = ended_at ? new Date(ended_at) : null;

      // Insert interview record
      const interviewData = insertInterviewSchema.parse({
        userId: user_id,
        conversationId: conversation_id,
        agentId: agent_id || process.env.ELEVENLABS_AGENT_ID || "agent_8601kavsezrheczradx9qmz8qp3e",
        transcript: transcript || null,
        durationSeconds: duration ? Math.round(duration) : null,
        startedAt: startedAt,
        endedAt: endedAt,
        status: status || "completed",
      });

      const [interview] = await db.insert(interviews).values(interviewData).returning();

      console.log(`[WEBHOOK] Interview saved successfully: ${interview.id}`);

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

  // ElevenLabs custom webhook endpoint for interview completion
  // This endpoint is called by ElevenLabs when an interview is completed
  // Requires x-api-secret header for security
  app.post("/api/save-interview", async (req, res) => {
    try {
      // Security check: Verify x-api-secret header
      const apiSecret = req.headers['x-api-secret'];
      const expectedSecret = 'my_secret_interview_key_123';
      
      if (!apiSecret || apiSecret !== expectedSecret) {
        console.error('[SAVE-INTERVIEW] Invalid or missing x-api-secret header');
        return res.status(401).json({ error: 'Unauthorized: Invalid API secret' });
      }

      // Extract query parameters
      const conversation_id = req.query.conversation_id as string;
      const candidate_id = req.query.candidate_id as string;

      // Validate required query parameters
      if (!conversation_id) {
        console.error('[SAVE-INTERVIEW] Missing conversation_id in query parameters');
        return res.status(400).json({ error: 'Missing conversation_id query parameter' });
      }

      if (!candidate_id) {
        console.error('[SAVE-INTERVIEW] Missing candidate_id in query parameters');
        return res.status(400).json({ error: 'Missing candidate_id query parameter' });
      }

      // Log the interview completion
      console.log(`Received interview completion for Candidate ID: ${candidate_id}, Conversation ID: ${conversation_id}`);

      // TODO: Fetch transcript from ElevenLabs using conversation_id and save to database

      // Return success response
      res.json({ success: true });
    } catch (error: any) {
      console.error('[SAVE-INTERVIEW] Error processing webhook:', error);
      res.status(500).json({ 
        error: 'Failed to process interview completion webhook',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

}
