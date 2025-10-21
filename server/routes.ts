import type { Express } from "express";
import { storage } from "./storage";
import { insertProfileSchema, insertInterviewSessionSchema, insertInterviewResponseSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

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
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, profile.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
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
      const questions = await storage.getQuestionsByRole(role);
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

      await storage.updateSession(id, req.body);
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

  // AI endpoints (proxying to Lovable AI)
  app.post("/api/ai/text-to-speech", authenticateToken, async (req: any, res) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }

      const lovableApiKey = process.env.LOVABLE_API_KEY;
      if (!lovableApiKey) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      const response = await fetch('https://api.lovable.app/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: 'alloy',
        }),
      });

      if (!response.ok) {
        throw new Error(`Text-to-speech failed: ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const base64Audio = Buffer.from(audioBuffer).toString('base64');

      res.json({ audioContent: base64Audio });
    } catch (error) {
      console.error("Text-to-speech error:", error);
      res.status(500).json({ error: 'Text-to-speech failed' });
    }
  });

  app.post("/api/ai/speech-to-text", authenticateToken, async (req: any, res) => {
    try {
      const { audio } = req.body;

      if (!audio) {
        return res.status(400).json({ error: 'No audio provided' });
      }

      const lovableApiKey = process.env.LOVABLE_API_KEY;
      if (!lovableApiKey) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      const audioData = Buffer.from(audio, 'base64');
      const FormData = (await import('formdata-node')).FormData;
      const { Blob } = await import('buffer');

      const formData = new FormData();
      const audioBlob = new Blob([audioData], { type: 'audio/webm' });
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');

      const response = await fetch('https://api.lovable.app/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
        },
        body: formData as any,
      });

      if (!response.ok) {
        throw new Error(`Speech-to-text failed: ${response.statusText}`);
      }

      const result = await response.json();
      res.json({ text: result.text });
    } catch (error) {
      console.error("Speech-to-text error:", error);
      res.status(500).json({ error: 'Speech-to-text failed' });
    }
  });

  app.post("/api/ai/analyze-response", authenticateToken, async (req: any, res) => {
    try {
      const { question, answer, role } = req.body;

      if (!question || !answer || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const lovableApiKey = process.env.LOVABLE_API_KEY;
      if (!lovableApiKey) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      const prompt = `You are an expert interview coach. Analyze this ${role} interview response.

Question: ${question}

Candidate's Answer: ${answer}

Provide a detailed analysis in JSON format with:
1. score (0-100): Overall quality of the response
2. strengths (array of strings): 2-3 specific positive aspects
3. improvements (array of strings): 2-3 concrete suggestions for improvement

Focus on: clarity, technical accuracy (if applicable), structure, communication skills, and role-specific competencies.

Return only valid JSON with this exact structure:
{
  "score": number,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}`;

      const response = await fetch('https://api.lovable.app/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-5-mini',
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI analysis failed: ${response.statusText}`);
      }

      const result = await response.json();
      const content = result.choices[0].message.content;
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }

      const feedback = JSON.parse(jsonMatch[0]);
      res.json(feedback);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: 'Analysis failed' });
    }
  });
}
