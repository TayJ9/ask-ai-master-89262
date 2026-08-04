import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const ACCESS_COOKIE_NAME = "mockly_access_granted";
/** IANA timezone used for hourly code rotation (US Eastern, handles EST/EDT). */
export const ACCESS_GATE_TIMEZONE = "America/New_York";

const HOUR_MS = 3600 * 1000;
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 604800;

type EasternParts = { year: number; month: number; day: number; hour: number };

function getEasternParts(unixMs: number): EasternParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ACCESS_GATE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(unixMs));

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  let hour = Number.parseInt(map.hour, 10);
  if (hour === 24) hour = 0;

  return {
    year: Number.parseInt(map.year, 10),
    month: Number.parseInt(map.month, 10),
    day: Number.parseInt(map.day, 10),
    hour,
  };
}

function getEasternHourKey(unixMs: number): string {
  const { year, month, day, hour } = getEasternParts(unixMs);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}`;
}

function getEasternHourEndIso(now: number): string {
  const currentKey = getEasternHourKey(now);
  let t = now + 1000;
  const limit = now + 4 * HOUR_MS;
  while (t <= limit && getEasternHourKey(t) === currentKey) {
    t += 1000;
  }
  return new Date(t).toISOString();
}

export function isAccessGateEnabled(): boolean {
  return Boolean(process.env.ACCESS_GATE_SECRET?.trim());
}

function getSecret(): string {
  const secret = process.env.ACCESS_GATE_SECRET?.trim();
  if (!secret) {
    throw new Error("ACCESS_GATE_SECRET not configured");
  }
  return secret;
}

export function getHourlyCode(secret: string, unixMs: number): string {
  const hourKey = getEasternHourKey(unixMs);
  const hmac = createHmac("sha256", secret).update(hourKey).digest("base64url");
  return hmac.slice(0, 8).toUpperCase();
}

export function formatAccessCode(code: string): string {
  const normalized = code.replace(/-/g, "").trim().toUpperCase();
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function verifyAccessCode(input: string, now = Date.now()): boolean {
  if (!isAccessGateEnabled()) return true;

  const secret = getSecret();
  const normalized = input.replace(/-/g, "").trim().toUpperCase();
  if (!normalized) return false;

  for (const offset of [0, -1]) {
    const t = now + offset * HOUR_MS;
    if (getHourlyCode(secret, t) === normalized) return true;
  }
  return false;
}

export function getCurrentAccessCode(now = Date.now()): { code: string; validUntilIso: string } {
  const secret = getSecret();
  const raw = getHourlyCode(secret, now);
  return {
    code: formatAccessCode(raw),
    validUntilIso: getEasternHourEndIso(now),
  };
}

export function getCookieMaxAgeSeconds(): number {
  const parsed = Number.parseInt(
    process.env.ACCESS_GATE_COOKIE_MAX_AGE_SECONDS ?? String(DEFAULT_COOKIE_MAX_AGE_SECONDS),
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_COOKIE_MAX_AGE_SECONDS;
}

export function signAccessCookie(now = Date.now()): string {
  const secret = getSecret();
  const maxAge = getCookieMaxAgeSeconds();
  const expiresAt = now + maxAge * 1000;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${expiresAt}.${nonce}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyAccessCookie(cookie: string | undefined, now = Date.now()): boolean {
  if (!isAccessGateEnabled()) return true;
  if (!cookie?.trim()) return false;

  try {
    const secret = getSecret();
    const parts = cookie.split(".");
    if (parts.length !== 3) return false;

    const [expiresStr, nonce, sig] = parts;
    const expiresAt = Number.parseInt(expiresStr, 10);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

    const payload = `${expiresStr}.${nonce}`;
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return false;
    return true;
  } catch {
    return false;
  }
}

export function parseCookieHeader(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (key === name) return trimmed.slice(eq + 1);
  }
  return undefined;
}

export function getAccessCookieFromRequest(req: { headers: { cookie?: string } }): string | undefined {
  return parseCookieHeader(req.headers.cookie, ACCESS_COOKIE_NAME);
}

export function hasValidAccessCookie(req: { headers: { cookie?: string } }, now = Date.now()): boolean {
  return verifyAccessCookie(getAccessCookieFromRequest(req), now);
}
