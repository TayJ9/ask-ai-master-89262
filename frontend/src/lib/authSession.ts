import { clearAccessStatusCache } from "@/lib/accessStatusCache";

/** Clear signed-in user state (JWT + profile + interview draft). */
export function clearAuthSession(): void {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("user");
  localStorage.removeItem("candidate_context");
}

/** Sign out and return user to the hourly access gate. */
export function redirectToAccessGate(setLocation?: (path: string) => void): void {
  clearAuthSession();
  clearAccessStatusCache();
  if (setLocation) {
    setLocation("/gate");
    return;
  }
  if (typeof window !== "undefined") {
    window.location.assign("/gate");
  }
}
