import { clearAccessStatusCache } from "@/lib/accessStatusCache";
import { getApiUrl } from "@/lib/api";

/** Clear signed-in user state (JWT + profile + interview draft). */
export function clearAuthSession(): void {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("user");
  localStorage.removeItem("candidate_context");
}

function revokeAccessCookie(): void {
  if (typeof window === "undefined") return;
  void fetch(getApiUrl("/api/access/revoke"), {
    method: "POST",
    credentials: "include",
  }).catch(() => {
    // Best-effort: HttpOnly cookie is also rejected server-side once expired.
  });
}

/** Sign out and return user to the hourly access gate. */
export function redirectToAccessGate(setLocation?: (path: string) => void): void {
  clearAuthSession();
  clearAccessStatusCache();
  revokeAccessCookie();
  if (setLocation) {
    setLocation("/gate");
    return;
  }
  if (typeof window !== "undefined") {
    window.location.assign("/gate");
  }
}
