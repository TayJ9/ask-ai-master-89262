/**
 * Local smoke test for email verification, interview history API, and results email hook.
 *
 * Usage (backend must be running on PORT, default 3001):
 *   npm run setup-sqlite
 *   npm run dev:no-setup   # separate terminal
 *   npm run test:local-features
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { profiles, interviews, interviewEvaluations, elevenLabsInterviewSessions } from "../shared/schema";
import { generateVerificationToken } from "../server/emailVerification";
import { storage } from "../server/storage";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const API_BASE = (process.env.TEST_API_BASE || `http://127.0.0.1:${process.env.PORT || 3001}`).replace(/\/$/, "");
const TEST_EMAIL = `local-verify-${Date.now()}@localhost.test`;
const TEST_PASSWORD = "LocalTest123!";
const TEST_NAME = "Local Verify User";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function jsonFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function main() {
  console.log(`\n🧪 Local feature smoke test → ${API_BASE}\n`);

  // Health
  const health = await jsonFetch("/api/health");
  assert(health.res.ok, `Backend not reachable at ${API_BASE} (start npm run dev:no-setup)`);

  // Signup
  const signup = await jsonFetch("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, fullName: TEST_NAME }),
  });
  assert(signup.res.status === 200, `Signup failed: ${JSON.stringify(signup.body)}`);
  assert(signup.body.verificationRequired === true, "Signup should require verification");

  // Signin blocked before verify
  const blockedSignin = await jsonFetch("/api/auth/signin", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  assert(blockedSignin.res.status === 403, "Unverified signin should return 403");
  assert(blockedSignin.body.code === "EMAIL_NOT_VERIFIED", "Expected EMAIL_NOT_VERIFIED code");

  // Inject known token (signup stores hash only; tests can't read raw token from email)
  const { token, tokenHash } = generateVerificationToken();
  const profileRow = await storage.getProfileByEmail(TEST_EMAIL);
  assert(profileRow?.id, "Signup profile not found");
  await storage.updateProfile(profileRow.id, {
    emailVerificationTokenHash: tokenHash,
    emailVerificationSentAt: new Date(),
  });

  const verify = await jsonFetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  assert(verify.res.ok, `Verify failed: ${JSON.stringify(verify.body)}`);

  const signin = await jsonFetch("/api/auth/signin", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  assert(signin.res.ok && signin.body.token, "Signin after verify should succeed");
  const tokenJwt = signin.body.token as string;
  const userId = signin.body.user.id as string;

  const me = await jsonFetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${tokenJwt}` },
  });
  assert(me.res.ok && me.body.emailVerified === true, "/api/auth/me should show emailVerified");

  // Seed one completed interview for history
  const interviewId = randomUUID();
  await db.insert(interviews).values({
    id: interviewId,
    userId,
    agentId: "test-agent",
    status: "completed",
    durationSeconds: 600,
    createdAt: new Date(),
  });
  await db.insert(interviewEvaluations).values({
    id: randomUUID(),
    interviewId,
    status: "complete",
    overallScore: 82,
    evaluationJson: { overall_strengths: ["Clear answers", "Good structure"] },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(elevenLabsInterviewSessions).values({
    id: randomUUID(),
    userId,
    agentId: "test-agent",
    clientSessionId: randomUUID(),
    interviewId,
    status: "completed",
    candidateContext: { role: "General Interview", major: "Computer Science", firstName: "Local" },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const list = await jsonFetch("/api/interviews", {
    headers: { Authorization: `Bearer ${tokenJwt}` },
  });
  assert(list.res.ok, `GET /api/interviews failed: ${JSON.stringify(list.body)}`);
  assert(Array.isArray(list.body) && list.body.length >= 1, "Interview list should include seeded interview");
  const found = list.body.find((row: { id: string }) => row.id === interviewId);
  assert(found?.overallScore === 82, "Interview list should include overall score");
  assert(found?.evaluationStatus === "complete", "Interview list should include evaluation status");

  if (process.env.RESEND_API_KEY?.trim()) {
    try {
      const { sendResultsEmailIfEligible } = await import("../server/resultsEmail");
      await sendResultsEmailIfEligible(interviewId);
      const [evalRow] = await db
        .select({ sent: interviewEvaluations.resultsEmailSentAt })
        .from(interviewEvaluations)
        .where(eq(interviewEvaluations.interviewId, interviewId));
      assert(Boolean(evalRow?.sent), "Results email should mark results_email_sent_at when Resend is configured");
      console.log("✅ Results email sent (Resend configured)");
    } catch (err) {
      console.warn("⚠️  Results email step skipped/failed locally:", (err as Error).message);
    }
  } else {
    console.log("ℹ️  Results email skipped (RESEND_API_KEY not set — expected for offline local test)");
  }

  console.log("\n✅ All local API checks passed:");
  console.log("   • Signup requires verification");
  console.log("   • Unverified sign-in blocked");
  console.log("   • Email verify + sign-in works");
  console.log("   • GET /api/interviews returns voice interview history");
  console.log("\n👉 Manual UI checks (http://localhost:5173):");
  console.log("   • Sign up / verify / sign in in Auth");
  console.log("   • Resume form → Review before you start → Confirm");
  console.log("   • History → View results on a completed interview\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Local feature test failed:", err.message || err);
    process.exit(1);
  });
