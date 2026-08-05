import { apiGet } from "@/lib/api";

const CACHE_KEY = "mockly_access_status";

export type AccessStatus = {
  required: boolean;
  granted: boolean;
  signupEnabled?: boolean;
  validUntil?: string;
  timezone?: string;
  timezoneLabel?: string;
};

type CachedAccessStatus = AccessStatus & {
  cachedAt: number;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

function isAccessExpired(validUntil?: string): boolean {
  if (!validUntil) return true;
  const expiresAt = Date.parse(validUntil);
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

export function readAccessStatusCache(): AccessStatus | null {
  if (!isBrowser()) return null;

  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedAccessStatus;
    if (
      typeof parsed.required !== "boolean" ||
      typeof parsed.granted !== "boolean"
    ) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }

    if (parsed.granted && isAccessExpired(parsed.validUntil ?? undefined)) {
      sessionStorage.removeItem(CACHE_KEY);
      return {
        required: parsed.required,
        granted: false,
        signupEnabled: parsed.signupEnabled,
        validUntil: parsed.validUntil,
      };
    }

    return {
      required: parsed.required,
      granted: parsed.granted,
      signupEnabled: parsed.signupEnabled,
      validUntil: parsed.validUntil,
      timezone: parsed.timezone,
      timezoneLabel: parsed.timezoneLabel,
    };
  } catch {
    sessionStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export function writeAccessStatusCache(status: AccessStatus): void {
  if (!isBrowser()) return;

  const payload: CachedAccessStatus = {
    ...status,
    cachedAt: Date.now(),
  };
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

/** Call after a successful POST /api/access/verify */
export function markAccessGranted(validUntil?: string): void {
  const existing = readAccessStatusCache();
  writeAccessStatusCache({
    required: true,
    granted: true,
    signupEnabled: existing?.signupEnabled,
    validUntil,
  });
}

export function clearAccessStatusCache(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(CACHE_KEY);
}

export async function fetchAndCacheAccessStatus(): Promise<AccessStatus> {
  const status = (await apiGet("/api/access/status")) as AccessStatus;
  if (status.granted && isAccessExpired(status.validUntil ?? undefined)) {
    const expired: AccessStatus = { ...status, granted: false };
    writeAccessStatusCache(expired);
    return expired;
  }
  writeAccessStatusCache(status);
  return status;
}

/** Milliseconds until access expires, or null if unknown / already expired. */
export function getAccessExpiryDelayMs(validUntil?: string): number | null {
  if (!validUntil) return null;
  const expiresAt = Date.parse(validUntil);
  if (!Number.isFinite(expiresAt)) return null;
  const delay = expiresAt - Date.now();
  return delay > 0 ? delay : 0;
}
