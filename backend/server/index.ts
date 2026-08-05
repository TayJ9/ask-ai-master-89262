// Load environment variables FIRST before anything else
import dotenv from 'dotenv';
import { initArizeTracing } from "./instrumentation";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { randomUUID } from "crypto";
import { isJwtSecretConfigured } from "./jwtSecret";
import { assertRequiredProductionEnv } from "./assertProductionEnv";
import { installErrorHandlers } from "./errorHandler";
import { registerRoutes } from "./routes";
import { requireAccessGate } from "./requireAccessGate";
import { isAccessGateEnabled } from "./accessGate";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { repairSchema } from "./schema-repair";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Import CommonJS module for WebSocket server using createRequire
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const { createVoiceServer } = require("../voiceServer");

dotenv.config();
initArizeTracing();

process.on("unhandledRejection", (reason) => {
  console.error("[ProcessUnhandledRejection]", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[ProcessUncaughtException]", {
    message: error.message,
    stack: error.stack,
  });
  process.exitCode = 1;
  setImmediate(() => process.exit(1));
});

const app = express();

/** Railway / Vercel / other reverse proxies — required for accurate req.ip and rate limiting */
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));

assertRequiredProductionEnv();

// CORS configuration for Railway backend + Vercel frontend deployment
// Supports both production and preview deployments on Vercel
const getAllowedOrigins = (): string[] => {
  const origins: string[] = [
    // Explicitly configured frontend URL
    process.env.FRONTEND_URL,
    // Vercel production URL (if set)
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    // Development origins
    'http://localhost:3001',
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
  
  // Allow any Vercel deployment (*.vercel.app) when explicitly enabled
  if (process.env.ALLOW_VERCEL_ORIGINS === "true" && origin.includes(".vercel.app")) {
    return true;
  }
  
  // Allow localhost for development
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return true;
  }
  
  return false;
};

const isProduction = process.env.NODE_ENV === "production";

// CORS configuration using cors package for better reliability
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (origin) {
      log(`🌐 Request from origin: ${origin}`);
    }

    if (!origin) {
      callback(null, true);
      return;
    }

    if (isOriginAllowed(origin)) {
      log(`✅ CORS: Allowed origin: ${origin}`);
      callback(null, true);
      return;
    }

    if (isProduction) {
      log(`🚫 CORS: Blocked origin: ${origin}`);
      callback(null, false);
      return;
    }

    log(`⚠️  CORS: Unknown origin (dev allow): ${origin}`);
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-api-secret', 'X-Request-Id', 'x-request-id'],
  maxAge: 86400 // 24 hours
};

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header("X-Request-Id");
  const id = typeof incoming === "string" && incoming.trim() ? incoming.trim().slice(0, 128) : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
});

// Apply CORS middleware - must be before routes
app.use(cors(corsOptions));

// Explicit OPTIONS handler for all routes (ensures preflight works correctly)
app.options("*", cors(corsOptions));

// Log OPTIONS preflight requests for debugging
// This runs AFTER CORS middleware sets headers, so it only logs (doesn't interfere)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.header('Origin');
    const requestedHeaders = req.header('Access-Control-Request-Headers');
    const requestedMethod = req.header('Access-Control-Request-Method');
    const requestId = req.header('X-Request-Id') || 'none';
    
    // Enhanced logging for /api/conversation-token
    if (req.path === '/api/conversation-token') {
      log(`[CONVERSATION-TOKEN] OPTIONS preflight - origin=${origin || 'none'} method=${requestedMethod || 'none'} headers=${requestedHeaders || 'none'} requestId=${requestId}`);
    } else {
      log(`[CORS PREFLIGHT] OPTIONS ${req.path} - origin=${origin || 'none'} method=${requestedMethod || 'none'} headers=${requestedHeaders || 'none'}`);
    }
  }
  next();
});

// Apply raw body parser for webhook route (for HMAC verification)
// Must be before JSON parser so webhook route gets raw body
app.use('/webhooks/elevenlabs', express.raw({ type: 'application/json', limit: '50mb' }));

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
    // Run schema repair on startup to ensure all tables exist
    log('[SERVER STARTUP] Running database schema repair...');
    await repairSchema();
    log('[SERVER STARTUP] Schema repair completed');
    
    log('[SERVER STARTUP] Registering API routes...');
    app.use(requireAccessGate);
    registerRoutes(app);
    log('[SERVER STARTUP] API routes registered successfully');
    
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

    installErrorHandlers(app);

    const PORT = Number.parseInt(String(process.env.PORT || 5000), 10) || 5000;
    const server = app.listen(PORT, "0.0.0.0", async () => {
      log(`Server running on port ${PORT}`);
      log(`Environment: ${process.env.NODE_ENV || "development"}`);
      log(`Health check: http://localhost:${PORT}/health`);
      
      // Log CORS configuration
      const allowedOrigins = getAllowedOrigins();
      if (allowedOrigins.length > 0) {
        log(`CORS: Allowing origins: ${allowedOrigins.join(', ')}`);
      }
      if (process.env.ALLOW_VERCEL_ORIGINS === "true") {
        log(`CORS: Also allowing all *.vercel.app domains`);
      }
      
      // Log environment variable status
      log(`Environment Variables Status:`);
      log(`  ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? '✅ Set' : '❌ Missing (CRITICAL for voice interviews)'}`);
      log(`  ELEVENLABS_AGENT_ID: ${process.env.ELEVENLABS_AGENT_ID ? '✅ Set' : '⚠️  Missing (will use default)'}`);
      log(`  JWT_SECRET: ${isJwtSecretConfigured() ? '✅ Set' : '❌ Missing (required in production)'}`);
      log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Missing (CRITICAL)'}`);
      log(`  FRONTEND_URL: ${process.env.FRONTEND_URL ? '✅ Set' : 'ℹ️  Not set (required for production CORS on Coolify)'}`);
      log(`  ACCESS_GATE: ${isAccessGateEnabled() ? '✅ Enabled (hourly codes, US Eastern)' : 'ℹ️  Disabled (ACCESS_GATE_SECRET unset)'}`);
      log(`  ARIZE_TRACING: ${process.env.ARIZE_SPACE_ID && process.env.ARIZE_API_KEY ? '✅ Enabled (scoring traces → Arize)' : 'ℹ️  Disabled (set ARIZE_SPACE_ID + ARIZE_API_KEY to enable)'}`);
      
      // Validate ElevenLabs configuration FIRST (before other initialization)
      // This ensures all validation checks are visible in Railway logs
      try {
        // Use dynamic import for ES module
        const { validateElevenLabsConfig, testElevenLabsAgentConnection } = await import("../scripts/validateElevenLabs.js");
        const elevenLabsValidation = validateElevenLabsConfig();
        
        // Force a small delay to ensure all validation logs are flushed
        await new Promise(resolve => setImmediate(resolve));
        
        if (!elevenLabsValidation.valid) {
          log(`⚠️  ElevenLabs validation failed - voice interviews may not work`);
          log(`   Fix the issues above and redeploy`);
        } else {
          // Test actual agent connection if basic validation passed
          log(`🔌 Testing ElevenLabs agent connection...`);
          try {
            const connectionTest = await testElevenLabsAgentConnection();
            if (connectionTest.success) {
              log(`✅ ElevenLabs agent connection test passed - backend can interact with agent`);
            } else if (!connectionTest.skipped) {
              log(`⚠️  ElevenLabs agent connection test failed: ${connectionTest.reason}`);
              log(`   Check agent permissions and API key access`);
            }
          } catch (connectionError: any) {
            log(`⚠️  ElevenLabs agent connection test error: ${connectionError.message || connectionError}`);
          }
        }
      } catch (validationError: any) {
        log(`⚠️  ElevenLabs validation script error: ${validationError.message || validationError}`);
        log(`   Continuing startup, but ElevenLabs may not be properly configured`);
      }
      
      // Initialize WebSocket server for voice interviews AFTER validation
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
