import { clearAccessStatusCache } from "@/lib/accessStatusCache";
import { getApiUrl } from "@/lib/api";

export type RedirectToAccessGateOptions = {
  setLocation?: (path: string) => void;
  /** Full page load — clears React state, WebSockets, and cached queries. */
  hard?: boolean;
};

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

function clearQueryCache(): void {
  void import("@/lib/queryClient")
    .then(({ getQueryClient }) => getQueryClient().clear())
    .catch(() => {
      // QueryClient may not be initialized yet.
    });
}

function navigateToGate(setLocation?: (path: string) => void, hard = false): void {
  if (hard || !setLocation) {
    if (typeof window !== "undefined") {
      window.location.assign("/gate");
    }
    return;
  }
  setLocation("/gate");
}

/** Sign out and return user to the hourly access gate. */
export function redirectToAccessGate(
  setLocationOrOptions?: ((path: string) => void) | RedirectToAccessGateOptions,
): void {
  let setLocation: ((path: string) => void) | undefined;
  let hard = false;

  if (typeof setLocationOrOptions === "function") {
    setLocation = setLocationOrOptions;
  } else if (setLocationOrOptions) {
    setLocation = setLocationOrOptions.setLocation;
    hard = setLocationOrOptions.hard ?? false;
  }

  clearAuthSession();
  clearAccessStatusCache();
  revokeAccessCookie();
  clearQueryCache();
  navigateToGate(setLocation, hard);
}

/** Gate session ended — log out completely and hard-navigate to /gate. */
export function expireAccessSession(): void {
  redirectToAccessGate({ hard: true });
}
