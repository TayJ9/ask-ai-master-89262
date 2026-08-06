import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  canProceedWithAccessStatus,
  fetchAndCacheAccessStatus,
  getAccessExpiryDelayMs,
  readAccessStatusCache,
  type AccessStatus,
} from "@/lib/accessStatusCache";
import { expireAccessSession, redirectToAccessGate } from "@/lib/authSession";
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

function applyAccessStatus(
  status: AccessStatus,
  pathname: string,
  setAllowed: (value: boolean) => void,
  hadGrantedSession: boolean,
): void {
  const allowed = canProceedWithAccessStatus(status);
  setAllowed(allowed);
  if (!allowed && pathname !== "/gate") {
    if (status.required && hadGrantedSession) {
      expireAccessSession();
      return;
    }
    redirectToAccessGate({ hard: true });
  } else if (allowed) {
    preloadIndexRoute();
  }
}

export default function AccessGateGuard({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const search = window.location.search;
  const isPublic = isPublicPath(location, search);

  const [checking, setChecking] = useState(() => !isPublic);
  const [allowed, setAllowed] = useState(() => isPublic);
  const [accessValidUntil, setAccessValidUntil] = useState<string | undefined>(
    () => (isPublic ? undefined : readAccessStatusCache()?.validUntil),
  );

  const revalidateAccess = useCallback(async () => {
    if (isPublicPath(location, search)) {
      setAllowed(true);
      setChecking(false);
      return;
    }

    const sessionCached = readAccessStatusCache();
    const hadGrantedSession = Boolean(sessionCached?.validUntil);
    if (sessionCached) {
      setAccessValidUntil(sessionCached.validUntil);
      applyAccessStatus(sessionCached, location, setAllowed, hadGrantedSession);
    }

    try {
      const status = await fetchAndCacheAccessStatus();
      setAccessValidUntil(status.validUntil);
      applyAccessStatus(
        status,
        location,
        setAllowed,
        hadGrantedSession || Boolean(status.validUntil),
      );
    } catch {
      setAllowed(false);
      expireAccessSession();
    } finally {
      setChecking(false);
    }
  }, [location, search]);

  useEffect(() => {
    if (isPublicPath(location, search)) {
      setAllowed(true);
      setChecking(false);
      return;
    }

    setChecking(true);

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
      expireAccessSession();
      return;
    }

    const timer = window.setTimeout(() => {
      expireAccessSession();
    }, delayMs + 250);

    return () => window.clearTimeout(timer);
  }, [allowed, accessValidUntil, location, search, revalidateAccess]);

  useEffect(() => {
    if (!allowed || isPublicPath(location, search)) return;

    const interval = window.setInterval(() => {
      void revalidateAccess();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [allowed, location, search, revalidateAccess]);

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
