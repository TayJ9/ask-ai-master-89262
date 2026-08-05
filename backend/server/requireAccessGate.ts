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
  "/api/access/revoke",
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

/** SPA routes that may load without an access cookie (gate page itself, terms, public demo). */
const PUBLIC_APP_SHELL_PATHS = new Set(["/gate", "/terms"]);

function isMockResultsRequest(req: Request): boolean {
  return req.path === "/results" && req.query.mock === "true";
}

/** Built assets and media — required so /gate can load JS/CSS after redirect. */
function isStaticAssetPath(path: string): boolean {
  if (path.startsWith("/assets/") || path.startsWith("/demo/")) return true;
  const base = path.split("/").pop() ?? "";
  return base.includes(".") && !base.endsWith(".html");
}

function isPublicAppShellRequest(req: Request): boolean {
  if (PUBLIC_APP_SHELL_PATHS.has(req.path)) return true;
  return isMockResultsRequest(req);
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

  const staleCookie = getAccessCookieFromRequest(req);
  if (staleCookie) {
    clearAccessCookie(res);
  }

  if (req.path.startsWith("/api/")) {
    res.status(401).json({ error: "ACCESS_GATE_REQUIRED" });
    return;
  }

  if (req.method === "GET" && isStaticAssetPath(req.path)) {
    next();
    return;
  }

  if (req.method === "GET" && isPublicAppShellRequest(req)) {
    next();
    return;
  }

  if (req.method === "GET") {
    res.redirect(302, "/gate");
    return;
  }

  res.status(401).json({ error: "ACCESS_GATE_REQUIRED" });
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
    process.env.ACCESS_GATE_COOKIE_MAX_AGE_SECONDS ?? "3600",
    10,
  );
  return Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 ? maxAgeSeconds : 3600;
}

export function clearAccessCookie(res: Response): void {
  const isProduction = process.env.NODE_ENV === "production";
  const parts = [
    `${ACCESS_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProduction) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function setAccessCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  const expiresAt = Number.parseInt(token.split(".")[0] ?? "", 10);
  const maxAge = Number.isFinite(expiresAt)
    ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
    : getAccessCookieMaxAgeSeconds();
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
