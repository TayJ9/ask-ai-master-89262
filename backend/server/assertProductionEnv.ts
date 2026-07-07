/**
 * Fail fast in production when required env vars are missing.
 * Keeps builds/Dockerfile checks from needing secrets; only applies when NODE_ENV=production at runtime.
 */
export function assertRequiredProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env.JWT_SECRET?.trim()) missing.push("JWT_SECRET");
  if (!process.env.DATABASE_URL?.trim()) missing.push("DATABASE_URL");

  if (missing.length > 0) {
    const jwtDefined = process.env.JWT_SECRET !== undefined;
    const jwtLength = process.env.JWT_SECRET?.length ?? 0;
    const jwtRelatedKeys = Object.keys(process.env).filter((key) =>
      key.toUpperCase().includes("JWT")
    );

    console.error(
      `[FATAL] Missing required environment variables in production: ${missing.join(", ")}. Refusing to start.`
    );
    if (missing.includes("JWT_SECRET")) {
      console.error(
        `[FATAL] JWT_SECRET diagnostics: defined=${jwtDefined}, length=${jwtLength}, relatedKeys=${jwtRelatedKeys.join(", ") || "(none)"}`
      );
      console.error(
        "[FATAL] Set JWT_SECRET on the backend API service in Railway (Variables tab), not only on Postgres or the frontend. Use a random 32+ character string, then redeploy."
      );
    }
    process.exit(1);
  }
}
