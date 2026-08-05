import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  fetchAndCacheAccessStatus,
  getAccessExpiryDelayMs,
  readAccessStatusCache,
  type AccessStatus,
} from "@/lib/accessStatusCache";
import { redirectToAccessGate } from "@/lib/authSession";
import { preloadIndexRoute } from "@/lib/routePreload";

function isMockResultsPath(pathname: string, search: string): boolean {
  if (pathname !== "/results") return false;
  const params = new URLSearchParams(search);
  return params.get("mock") === "true";
}

function isPublicPath(pathname: string, search: string): boolean {
  if (pathname === "/gate" || pathname === "/terms") return true;
  return isMockResultsPath(pathname, search);
}

function canProceedWithStatus(status: AccessStatus): boolean {
  return !status.required || status.granted;
}

function applyAccessStatus(
  status: AccessStatus,
  pathname: string,
  setAllowed: (value: boolean) => void,
  setLocation: (path: string) => void,
): void {
  const allowed = canProceedWithStatus(status);
  setAllowed(allowed);
  if (!allowed && pathname !== "/gate") {
    redirectToAccessGate(setLocation);
  } else if (allowed) {
    preloadIndexRoute();
  }
}

export default function AccessGateGuard({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const search = window.location.search;
  const isPublic = isPublicPath(location, search);
  const cached = isPublic ? null : readAccessStatusCache();

  const [checking, setChecking] = useState(() => !isPublic && !cached);
  const [allowed, setAllowed] = useState(() => {
    if (isPublic) return true;
    if (cached) return canProceedWithStatus(cached);
    return false;
  });
  const [accessValidUntil, setAccessValidUntil] = useState<string | undefined>(
    () => cached?.validUntil,
  );

  const revalidateAccess = useCallback(async () => {
    if (isPublicPath(location, search)) {
      setAllowed(true);
      setChecking(false);
      return;
    }

    const sessionCached = readAccessStatusCache();
    if (sessionCached) {
      setAccessValidUntil(sessionCached.validUntil);
      applyAccessStatus(sessionCached, location, setAllowed, setLocation);
    }

    try {
      const status = await fetchAndCacheAccessStatus();
      setAccessValidUntil(status.validUntil);
      applyAccessStatus(status, location, setAllowed, setLocation);
    } catch {
      setAllowed(false);
      redirectToAccessGate(setLocation);
    } finally {
      setChecking(false);
    }
  }, [location, search, setLocation]);

  useEffect(() => {
    if (isPublicPath(location, search)) {
      setAllowed(true);
      setChecking(false);
      return;
    }

    if (!readAccessStatusCache()) {
      setChecking(true);
    }

    let cancelled = false;

    (async () => {
      if (cancelled) return;
      await revalidateAccess();
    })();

    const onWake = () => {
      if (document.visibilityState === "visible" && !cancelled) {
        void revalidateAccess();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && !cancelled) {
        void revalidateAccess();
      }
    };

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [location, search, revalidateAccess]);

  useEffect(() => {
    if (!allowed || isPublicPath(location, search)) return;

    const delayMs = getAccessExpiryDelayMs(accessValidUntil);
    if (delayMs == null) {
      void revalidateAccess();
      return;
    }

    if (delayMs <= 0) {
      redirectToAccessGate(setLocation);
      return;
    }

    const timer = window.setTimeout(() => {
      redirectToAccessGate(setLocation);
    }, delayMs + 250);

    return () => window.clearTimeout(timer);
  }, [allowed, accessValidUntil, location, search, setLocation, revalidateAccess]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!allowed && window.location.pathname !== "/gate") {
    return null;
  }

  return <>{children}</>;
}
