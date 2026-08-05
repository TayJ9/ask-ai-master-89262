/**
 * Login page at /login-preview — renders the same Auth UI as production (/).
 * After sign-in, redirects to / so the main app picks up the stored session.
 */

import { useCallback } from "react";
import { useLocation } from "wouter";
import Auth from "@/components/Auth";

export default function LoginPreview() {
  const [, setLocation] = useLocation();

  const handleAuthSuccess = useCallback((_user: unknown, _token: string) => {
    setLocation("/");
  }, [setLocation]);

  return <Auth onAuthSuccess={handleAuthSuccess} />;
}
