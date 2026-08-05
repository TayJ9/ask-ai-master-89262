/** Session flag set when navigating from the /demo portfolio hub. */
export const DEMO_FROM_HUB_KEY = "mockly_demo_from_hub";

export function markDemoFromHub(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(DEMO_FROM_HUB_KEY, "1");
  }
}

export function clearDemoFromHub(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(DEMO_FROM_HUB_KEY);
  }
}

/** True when ?public=true or user arrived from the /demo hub this session. */
export function isPublicDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("public") === "true") return true;
  return sessionStorage.getItem(DEMO_FROM_HUB_KEY) === "1";
}

/** Append public demo query params and mark session as portfolio demo. */
export function buildDemoHref(path: string): string {
  markDemoFromHub();
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("public", "true");
  const qs = params.toString();
  return qs ? `${base}?${qs}` : `${base}?public=true`;
}
