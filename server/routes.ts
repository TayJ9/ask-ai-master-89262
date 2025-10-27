import type { Express } from "express";
import { storage } from "./storage";
import { insertProfileSchema, insertInterviewSessionSchema, insertInterviewResponseSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { textToSpeech, speechToText, analyzeInterviewResponse, chatWithCoach } from "./openai";

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  return "dev-secret-key-change-before-production";
})();

interface AuthRequest extends Express.Request {
  userId?: string;
}

function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.userId = decoded.userId;
    next();
  });
}

export function registerRoutes(app: Express) {
  // Auth endpoints
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password, fullName } = req.body;
      
      const existingUser = await storage.getProfileByEmail(email.toLowerCase().trim());
      if (existingUser) {
        return res.status(400).json({ error: "Email already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const profile = await storage.createProfile({
        email: email.toLowerCase().trim(),
        fullName: fullName.trim(),
        passwordHash,
      });

      res.json({ message: "Account created successfully" });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Signup failed" });
    }
  });

  app.post("/api/auth/signin", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const profile = await storage.getProfileByEmail(email.toLowerCase().trim());
      if (!profile || !profile.passwordHash) {
        return res.status(401).json({ error: "No account found with this email address. Please sign up first." });
      }

      const validPassword = await bcrypt.compare(password, profile.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: "Incorrect password. Please try again." });
      }

      const token = jwt.sign({ userId: profile.id }, JWT_SECRET, { expiresIn: '7d' });
      
      res.json({ 
        token,
        user: {
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
        }
      });
    } catch (error) {
      console.error("Signin error:", error);
      res.status(500).json({ error: "Signin failed" });
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

  // AI endpoints (using OpenAI)
  app.post("/api/ai/text-to-speech", authenticateToken, async (req: any, res) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }

      if (!process.env.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY is missing in environment');
        return res.status(500).json({ 
          error: 'Text-to-speech failed', 
          details: 'OPENAI_API_KEY not configured in production'
        });
      }

      const audioBuffer = await textToSpeech(text);
      const base64Audio = audioBuffer.toString('base64');

      res.json({ audioContent: base64Audio });
    } catch (error: any) {
      console.error("Text-to-speech error:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({ 
        error: 'Text-to-speech failed', 
        details: error.message || String(error)
      });
    }
  });

  app.post("/api/ai/speech-to-text", authenticateToken, async (req: any, res) => {
    try {
      const { audio } = req.body;

      if (!audio) {
        return res.status(400).json({ error: 'No audio provided' });
      }

      const audioBuffer = Buffer.from(audio, 'base64');
      const text = await speechToText(audioBuffer);

      res.json({ text });
    } catch (error: any) {
      console.error("Speech-to-text error:", error);
      res.status(500).json({ 
        error: 'Speech-to-text failed',
        details: error.message || String(error)
      });
    }
  });

  app.post("/api/ai/analyze-response", authenticateToken, async (req: any, res) => {
    try {
      const { question, answer, role } = req.body;

      if (!question || !answer || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const feedback = await analyzeInterviewResponse(question, answer, role);
      res.json(feedback);
    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({ 
        error: 'Analysis failed',
        details: error.message || String(error)
      });
    }
  });

  // AI Coach endpoint
  app.post("/api/ai/coach", authenticateToken, async (req: any, res) => {
    try {
      const { message, role } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      if (message.length > 500) {
        return res.status(400).json({ error: 'Message is too long (max 500 characters)' });
      }

      const coachResponse = await chatWithCoach(message, { role: role || 'general' });
      
      res.json({ response: coachResponse });
    } catch (error: any) {
      console.error("Coach error:", error);
      res.status(500).json({ 
        error: 'Failed to get coach response',
        details: error.message || String(error)
      });
    }
  });
}
