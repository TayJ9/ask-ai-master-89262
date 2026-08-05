import { apiGet } from "@/lib/api";

const CACHE_KEY = "mockly_access_status";

export type AccessStatus = {
  required: boolean;
  granted: boolean;
  signupEnabled?: boolean;
};

type CachedAccessStatus = AccessStatus & {
  cachedAt: number;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
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

    return {
      required: parsed.required,
      granted: parsed.granted,
      signupEnabled: parsed.signupEnabled,
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
export function markAccessGranted(): void {
  const existing = readAccessStatusCache();
  writeAccessStatusCache({
    required: true,
    granted: true,
    signupEnabled: existing?.signupEnabled,
  });
}

export function clearAccessStatusCache(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(CACHE_KEY);
}

export async function fetchAndCacheAccessStatus(): Promise<AccessStatus> {
  const status = (await apiGet("/api/access/status")) as AccessStatus;
  writeAccessStatusCache(status);
  return status;
}
