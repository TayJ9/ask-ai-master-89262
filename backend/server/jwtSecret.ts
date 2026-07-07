/** Env keys accepted for JWT signing (Railway may block the literal name JWT_SECRET). */
export const JWT_SECRET_ENV_KEYS = [
  "JWT_SECRET",
  "AUTH_JWT_SECRET",
  "MOCKLY_JWT_SECRET",
] as const;

export function resolveJwtSecret(): string | undefined {
  for (const key of JWT_SECRET_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function isJwtSecretConfigured(): boolean {
  return resolveJwtSecret() !== undefined;
}

export function getJwtSecretForSigning(): string {
  const secret = resolveJwtSecret();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `JWT signing secret is required in production (set one of: ${JWT_SECRET_ENV_KEYS.join(", ")})`
    );
  }
  return "dev-secret-key-change-before-production";
}
