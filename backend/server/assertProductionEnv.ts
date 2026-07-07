/**
 * Fail fast in production when required env vars are missing.
 * Keeps builds/Dockerfile checks from needing secrets; only applies when NODE_ENV=production at runtime.
 */
import { isJwtSecretConfigured, JWT_SECRET_ENV_KEYS } from "./jwtSecret";

export function assertRequiredProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!isJwtSecretConfigured()) {
    missing.push(`JWT signing secret (${JWT_SECRET_ENV_KEYS.join(" | ")})`);
  }
  if (!process.env.DATABASE_URL?.trim()) missing.push("DATABASE_URL");

  if (missing.length > 0) {
    const jwtRelatedKeys = Object.keys(process.env).filter((key) =>
      key.toUpperCase().includes("JWT")
    );

    console.error(
      `[FATAL] Missing required environment variables in production: ${missing.join(", ")}. Refusing to start.`
    );
    if (!isJwtSecretConfigured()) {
      console.error(
        `[FATAL] JWT diagnostics: relatedKeys=${jwtRelatedKeys.join(", ") || "(none)"}`
      );
      console.error(
        `[FATAL] On Railway, add AUTH_JWT_SECRET if JWT_SECRET will not save. Use a random 32+ character string, then click Deploy on staged variable changes.`
      );
    }
    process.exit(1);
  }
}
