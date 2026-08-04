import type { Request, Response, NextFunction } from "express";
import {
  ACCESS_COOKIE_NAME,
  getAccessCookieFromRequest,
  hasValidAccessCookie,
  isAccessGateEnabled,
  verifyAccessCookie,
} from "./accessGate";

const EXEMPT_API_PATHS = new Set([
  "/api/access/verify",
  "/api/access/status",
  "/api/access/current",
  "/api/health",
  "/api/get-resume-profile",
  "/api/get-resume-fulltext",
  "/api/mark-interview-complete",
]);

function isExemptPath(req: Request): boolean {
  const path = req.path;

  if (path === "/health" || path === "/favicon.ico") return true;
  if (EXEMPT_API_PATHS.has(path)) return true;
  if (path.startsWith("/webhooks/")) return true;

  return false;
}

export function requireAccessGate(req: Request, res: Response, next: NextFunction): void {
  if (!isAccessGateEnabled()) {
    next();
    return;
  }

  if (isExemptPath(req)) {
    next();
    return;
  }

  if (hasValidAccessCookie(req)) {
    next();
    return;
  }

  if (req.path.startsWith("/api/")) {
    res.status(401).json({ error: "ACCESS_GATE_REQUIRED" });
    return;
  }

  next();
}

export function requireAccessCookieForAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAccessGateEnabled()) {
    next();
    return;
  }

  if (hasValidAccessCookie(req)) {
    next();
    return;
  }

  res.status(401).json({ error: "ACCESS_GATE_REQUIRED" });
}

export function getAccessCookieMaxAgeSeconds(): number {
  const maxAgeSeconds = Number.parseInt(
    process.env.ACCESS_GATE_COOKIE_MAX_AGE_SECONDS ?? "604800",
    10,
  );
  return Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 ? maxAgeSeconds : 604800;
}

export function setAccessCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = getAccessCookieMaxAgeSeconds();
  const parts = [
    `${ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isProduction) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

export { getAccessCookieFromRequest, verifyAccessCookie };
