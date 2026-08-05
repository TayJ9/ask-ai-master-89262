import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  fetchAndCacheAccessStatus,
  readAccessStatusCache,
  type AccessStatus,
} from "@/lib/accessStatusCache";
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
    setLocation("/gate");
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
    return true;
  });

  useEffect(() => {
    if (isPublicPath(location, search)) {
      setAllowed(true);
      setChecking(false);
      return;
    }

    const sessionCached = readAccessStatusCache();
    if (sessionCached) {
      applyAccessStatus(sessionCached, location, setAllowed, setLocation);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    (async () => {
      try {
        const status = await fetchAndCacheAccessStatus();
        if (cancelled) return;
        applyAccessStatus(status, location, setAllowed, setLocation);
      } catch {
        if (cancelled) return;
        setAllowed(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location, search, setLocation]);

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
