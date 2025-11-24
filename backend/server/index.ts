import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Import CommonJS module for WebSocket server using createRequire
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const { createVoiceServer } = require("../voiceServer");

const app = express();

// CORS configuration for Railway backend + Vercel frontend deployment
// Supports both production and preview deployments on Vercel
const getAllowedOrigins = (): string[] => {
  const origins: string[] = [
    // Explicitly configured frontend URL
    process.env.FRONTEND_URL,
    // Vercel production URL (if set)
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    // Development origins
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000',
  ].filter(Boolean) as string[];
  
  return origins;
};

// Check if origin is allowed (Vercel domains, localhost, or explicitly allowed)
const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return false;
  
  const allowedOrigins = getAllowedOrigins();
  
  // Check explicit allowlist
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  
  // Allow any Vercel deployment (*.vercel.app)
  if (origin.includes('.vercel.app')) {
    return true;
  }
  
  // Allow localhost for development
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return true;
  }
  
  return false;
};

// CORS configuration using cors package for better reliability
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Log all requests for debugging
    if (origin) {
      log(`🌐 Request from origin: ${origin}`);
    }
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // Check if origin is allowed
    if (isOriginAllowed(origin)) {
      log(`✅ CORS: Allowed origin: ${origin}`);
      callback(null, true);
    } else {
      log(`⚠️  CORS: Unknown origin: ${origin} - allowing for now`);
      // Allow for now but log for monitoring
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware - must be before routes
app.use(cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    registerRoutes(app);
    
    // Root route - provide API information (frontend is deployed separately on Vercel)
    app.get('/', (_req, res) => {
      res.json({
        message: "AI Interview Coach API",
        version: "1.0.0",
        status: "operational",
        environment: process.env.NODE_ENV || "development",
        endpoints: {
          health: "GET /health",
          api: "All /api/* endpoints available",
          websocket: "WS /voice - Voice interview WebSocket endpoint"
        },
        frontend: "Deployed separately on Vercel",
        documentation: "API endpoints are available at /api/*"
      });
    });
    
    // Use static file serving in production, Vite dev server in development
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      try {
        await setupVite(app);
      } catch (viteError: any) {
        console.warn("⚠️  Vite setup failed (frontend may not be available):", viteError.message);
        console.warn("   Backend API will still work");
        // Add a basic root route if Vite fails
        app.get("/", (_req, res) => {
          res.json({
            message: "AI Interview Coach API",
            version: "1.0.0",
            status: "operational",
            note: "Vite dev server unavailable. API endpoints are available."
          });
        });
      }
    }

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, "0.0.0.0", async () => {
      log(`Server running on port ${PORT}`);
      log(`Environment: ${process.env.NODE_ENV || "development"}`);
      log(`Health check: http://localhost:${PORT}/health`);
      
      // Log CORS configuration
      const allowedOrigins = getAllowedOrigins();
      if (allowedOrigins.length > 0) {
        log(`CORS: Allowing origins: ${allowedOrigins.join(', ')}`);
      }
      log(`CORS: Also allowing all *.vercel.app domains`);
      
      // Log environment variable status
      log(`Environment Variables Status:`);
      log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing (CRITICAL)'}`);
      log(`  JWT_SECRET: ${process.env.JWT_SECRET ? '✅ Set' : '⚠️  Missing (recommended for auth)'}`);
      log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Missing (CRITICAL)'}`);
      log(`  FRONTEND_URL: ${process.env.FRONTEND_URL ? '✅ Set' : 'ℹ️  Not set (optional - using *.vercel.app fallback)'}`);
      
      // Validate ElevenLabs configuration
      try {
        // Use dynamic import for ES module
        const { validateElevenLabsConfig } = await import("../scripts/validateElevenLabs.js");
        const elevenLabsValidation = validateElevenLabsConfig();
        if (!elevenLabsValidation.valid) {
          log(`⚠️  ElevenLabs validation failed - voice interviews may not work`);
          log(`   Fix the issues above and redeploy`);
        }
      } catch (validationError: any) {
        log(`⚠️  ElevenLabs validation script error: ${validationError.message || validationError}`);
        log(`   Continuing startup, but ElevenLabs may not be properly configured`);
      }
      
      // Initialize WebSocket server for voice interviews
      try {
        createVoiceServer(server);
        log(`✅ WebSocket server initialized on path /voice`);
      } catch (wsError: any) {
        log(`⚠️  WebSocket server initialization failed: ${wsError.message || wsError}`);
        log(`   Voice interviews may not work. Check voiceServer.js configuration.`);
      }
      
      // Check database connection on startup (non-blocking)
      // Don't crash if database check fails - let the app start and handle errors at request time
      storage.checkDbConnection().then(connected => {
        if (connected) {
          log(`✅ Database connection: OK`);
        } else {
          log(`⚠️  Database connection: FAILED - Check DATABASE_URL and ensure tables exist`);
        }
      }).catch(err => {
        // Log error but don't crash - database might be temporarily unavailable
        log(`⚠️  Database connection check error: ${err.message || err}`);
        log(`   The server will continue, but database operations may fail.`);
        log(`   Check DATABASE_URL environment variable in Railway Variables.`);
      });
    });
  } catch (error: any) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
})();
