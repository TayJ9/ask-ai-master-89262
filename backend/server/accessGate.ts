import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const ACCESS_COOKIE_NAME = "mockly_access_granted";
/** IANA timezone used for hourly code rotation (US Eastern hour boundaries). */
export const ACCESS_GATE_TIMEZONE = "America/New_York";
export const ACCESS_GATE_TIMEZONE_LABEL = "US Eastern Time (ET)";

const HOUR_MS = 3600 * 1000;
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 3600;

/** Access granted after code entry lasts this long (rolling 1h from verify time). */
export const ACCESS_SESSION_DURATION_MS = HOUR_MS;

export function getAccessSessionExpiresMs(unixMs: number): number {
  return unixMs + ACCESS_SESSION_DURATION_MS;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

function getZonedParts(unixMs: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(unixMs));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  let hour = Number.parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;

  return {
    year: Number.parseInt(get("year"), 10),
    month: Number.parseInt(get("month"), 10),
    day: Number.parseInt(get("day"), 10),
    hour,
  };
}

function getAccessGateHourKey(unixMs: number): string {
  const p = getZonedParts(unixMs, ACCESS_GATE_TIMEZONE);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour).padStart(2, "0")}`;
}

/** Milliseconds since epoch when the current access-gate hour ends (next :00 in US Eastern). */
export function getAccessGateHourEndMs(unixMs: number): number {
  const hourKey = getAccessGateHourKey(unixMs);
  let hi = unixMs + HOUR_MS;
  while (getAccessGateHourKey(hi) === hourKey) {
    hi += HOUR_MS;
  }

  let lo = unixMs;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (getAccessGateHourKey(mid) === hourKey) lo = mid;
    else hi = mid;
  }
  return hi;
}

function getAccessGateHourEndIso(now: number): string {
  return new Date(getAccessGateHourEndMs(now)).toISOString();
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
  const hourKey = getAccessGateHourKey(unixMs);
  const hmac = createHmac("sha256", secret).update(hourKey).digest("base64url");
  return hmac.slice(0, 8).toUpperCase();
}

/** Strip display dashes and base64url `-`/`_` so comparison matches what users type. */
export function normalizeAccessCode(input: string): string {
  return input.replace(/[-_]/g, "").trim().toUpperCase();
}

export function formatAccessCode(code: string): string {
  const normalized = normalizeAccessCode(code);
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function verifyAccessCode(input: string, now = Date.now()): boolean {
  if (!isAccessGateEnabled()) return true;

  const secret = getSecret();
  const normalized = normalizeAccessCode(input);
  if (!normalized) return false;

  for (const offset of [0, -1]) {
    const t = now + offset * HOUR_MS;
    if (normalizeAccessCode(getHourlyCode(secret, t)) === normalized) return true;
  }
  return false;
}

export function getCurrentAccessCode(now = Date.now()): { code: string; validUntilIso: string } {
  const secret = getSecret();
  const raw = getHourlyCode(secret, now);
  return {
    code: formatAccessCode(raw),
    validUntilIso: getAccessGateHourEndIso(now),
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
  const expiresAt = getAccessSessionExpiresMs(now);
  const nonce = randomBytes(16).toString("hex");
  const payload = `${expiresAt}.${nonce}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function getAccessCookieExpiresAt(
  cookie: string | undefined,
): number | null {
  if (!cookie?.trim()) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const expiresAt = Number.parseInt(parts[0], 10);
  return Number.isFinite(expiresAt) ? expiresAt : null;
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
