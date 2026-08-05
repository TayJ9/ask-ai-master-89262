import { createHash, randomBytes } from "crypto";

export const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateVerificationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashVerificationToken(token) };
}

export function isVerificationTokenExpired(sentAt: Date | string | number | null | undefined): boolean {
  if (!sentAt) return false;
  const sentMs =
    sentAt instanceof Date
      ? sentAt.getTime()
      : typeof sentAt === "number"
        ? sentAt
        : new Date(sentAt).getTime();
  if (Number.isNaN(sentMs)) return false;
  return Date.now() - sentMs > VERIFICATION_TOKEN_EXPIRY_MS;
}
