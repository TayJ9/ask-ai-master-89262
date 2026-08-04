import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { apiGet } from "@/lib/api";

type AccessStatus = {
  required: boolean;
  granted: boolean;
};

function isMockResultsPath(pathname: string, search: string): boolean {
  if (pathname !== "/results") return false;
  const params = new URLSearchParams(search);
  return params.get("mock") === "true";
}

function isPublicPath(pathname: string, search: string): boolean {
  if (pathname === "/gate" || pathname === "/terms") return true;
  return isMockResultsPath(pathname, search);
}

export default function AccessGateGuard({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const pathname = window.location.pathname;
    const search = window.location.search;

    if (isPublicPath(pathname, search)) {
      setAllowed(true);
      setChecking(false);
      return;
    }

    (async () => {
      try {
        const status = (await apiGet("/api/access/status")) as AccessStatus;
        if (cancelled) return;

        const canProceed = !status.required || status.granted;
        setAllowed(canProceed);
        if (!canProceed && pathname !== "/gate") {
          setLocation("/gate");
        }
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
  }, [location, setLocation]);

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
