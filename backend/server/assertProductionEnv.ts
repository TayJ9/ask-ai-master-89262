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
    console.error(
      `[FATAL] Missing required environment variables in production: ${missing.join(", ")}. Refusing to start.`
    );
    process.exit(1);
  }
}
