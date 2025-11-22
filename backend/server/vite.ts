import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, type ViteDevServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [express] ${message}`);
}

export async function setupVite(app: Express) {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
    configFile: path.resolve(__dirname, "../../frontend/vite.config.ts"),
  });

  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    const url = req.originalUrl;

    if (url.startsWith('/api')) {
      return next();
    }

    try {
      const template = fs.readFileSync(
        path.resolve(__dirname, "../../frontend/index.html"),
        "utf-8"
      );
      const transformed = await vite.transformIndexHtml(url, template);

      res.status(200).set({ "Content-Type": "text/html" }).end(transformed);
    } catch (e: any) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "../../frontend/dist/public");

  // Gracefully handle missing frontend build in production
  // This allows the backend API to work even if frontend isn't deployed
  if (!fs.existsSync(distPath)) {
    console.warn(`⚠️  Frontend build directory not found: ${distPath}`);
    console.warn("   Backend API will work, but frontend routes will return 404");
    console.warn("   To serve frontend: build it and ensure dist/public exists");
    
    // Return API info for root route instead of failing
    app.get("/", (_req, res) => {
      res.json({
        message: "AI Interview Coach API",
        version: "1.0.0",
        status: "operational",
        endpoints: {
          health: "GET /health",
          api: "All /api/* endpoints available"
        },
        note: "Frontend not deployed. API endpoints are available."
      });
    });
    
    return;
  }

  app.use(express.static(distPath));

  app.use((_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
