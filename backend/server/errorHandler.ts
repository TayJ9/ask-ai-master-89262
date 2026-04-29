import type { Express, NextFunction, Request, Response } from "express";

function getRequestId(req: Request, res: Response): string {
  const existing = res.getHeader("X-Request-Id");
  if (typeof existing === "string" && existing) return existing;
  return (req as Request & { requestId?: string }).requestId || "unknown";
}

/** Express error-handling middleware (place after all routes). */
export function installErrorHandlers(app: Express): void {
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = getRequestId(req, res);
    const isDev = process.env.NODE_ENV !== "production";

    const message = err instanceof Error ? err.message : String(err);
    const status =
      err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
        ? (err as { status: number }).status
        : 500;

    console.error("[UnhandledError]", { requestId, path: req.path, status, message, stack: err instanceof Error ? err.stack : undefined });

    if (res.headersSent) return;

    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: isDev ? message : "An unexpected error occurred. Please try again.",
      requestId,
    });
  });
}
