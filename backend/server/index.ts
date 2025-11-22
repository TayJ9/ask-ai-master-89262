import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";

const app = express();

// CORS configuration for production
// Allow all Vercel preview and production deployments
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5000',
].filter(Boolean) as string[];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Allow requests from:
  // 1. Explicitly allowed origins
  // 2. Any Vercel deployment (*.vercel.app) - includes preview and production
  // 3. Localhost for development
  // 4. Same origin requests
  if (origin) {
    const isAllowed = 
      allowedOrigins.includes(origin) || 
      origin.includes('localhost') ||
      origin.includes('.vercel.app') ||
      origin === req.headers.host;
    
    // Always set the origin header if it's allowed
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      // For unknown origins, still allow but log for debugging
      console.log(`CORS: Blocked origin: ${origin}`);
    }
  } else {
    // No origin header (e.g., same-origin request or direct API call)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

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
    app.listen(PORT, "0.0.0.0", () => {
      log(`Server running on port ${PORT}`);
      log(`Environment: ${process.env.NODE_ENV || "development"}`);
      log(`Health check: http://localhost:${PORT}/health`);
      
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
