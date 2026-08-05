/**
 * Integration tests for ElevenLabs server tools:
 *   POST /api/get-resume-profile
 *   POST /api/get-resume-fulltext
 *
 * Also verifies text resume persist via POST /api/resume/upload.
 *
 * Run (backend must be up; do not run while manually testing the resume UI):
 *   npm run test:resume-server-tools
 */

import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

if (process.env.SKIP_RESUME_API_TESTS === "1") {
  console.log("Skipping resume API tests (SKIP_RESUME_API_TESTS=1)");
  process.exit(0);
}

const API_BASE = (
  process.env.API_TEST_BASE ||
  `http://127.0.0.1:${process.env.PORT || "3001"}`
).replace(/\/$/, "");

const DEV_EMAIL = (process.env.DEV_TEST_EMAIL || "dev@localhost.test").trim().toLowerCase();
const DEV_PASSWORD = process.env.DEV_TEST_PASSWORD?.trim() || "Test1234";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY?.trim();

let passed = 0;
let failed = 0;

function ok(label: string) {
  passed++;
  console.log(`  ✅ ${label}`);
}

function fail(label: string, detail?: unknown): never {
  failed++;
  console.error(`  ❌ ${label}`);
  if (detail !== undefined) console.error("     ", detail);
  throw new Error(label);
}

async function signIn(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Signin failed (${res.status}): ${await res.text()}`);
  }
  const { token } = (await res.json()) as { token: string };
  return token;
}

async function persistTextResume(token: string, sessionId: string, text: string) {
  const res = await fetch(`${API_BASE}/api/resume/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text, sessionId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail("POST /api/resume/upload", { status: res.status, data });
  }
  return data as {
    sessionId: string;
    resumeText: string;
    resumeProfile?: { skills?: string[] };
  };
}

async function getResumeProfile(interviewId: string, secret: string) {
  return fetch(`${API_BASE}/api/get-resume-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": secret,
    },
    body: JSON.stringify({ interviewid: interviewId }),
  });
}

async function getResumeFulltext(interviewId: string, secret: string) {
  return fetch(`${API_BASE}/api/get-resume-fulltext`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": secret,
    },
    body: JSON.stringify({ interviewid: interviewId }),
  });
}

async function main() {
  console.log("=== Resume server tools integration test ===");
  console.log(`API: ${API_BASE}`);

  if (!ELEVENLABS_API_KEY) {
    fail("ELEVENLABS_API_KEY must be set in backend/.env");
  }

  const health = await fetch(`${API_BASE}/health`);
  if (!health.ok) {
    fail(`Backend not reachable at ${API_BASE}/health (${health.status})`);
  }
  ok("backend health");

  const token = await signIn();
  ok("authenticated");

  const sessionId = randomUUID();
  const resumeText = [
    "Jane Candidate",
    "Education: State University, Computer Science, GPA 3.7",
    "Experience: Software Engineering Intern at TechCorp — built React dashboards",
    "Skills: JavaScript, Python, React, SQL, teamwork, leadership",
  ].join("\n");

  const uploaded = await persistTextResume(token, sessionId, resumeText);
  if (uploaded.sessionId !== sessionId) {
    fail("resume/upload returns requested sessionId", uploaded);
  }
  ok("text resume persisted via /api/resume/upload");

  const badSecretRes = await getResumeProfile(sessionId, "wrong-secret");
  if (badSecretRes.status !== 401) {
    fail("get-resume-profile rejects bad secret", badSecretRes.status);
  }
  ok("get-resume-profile returns 401 for invalid x-api-secret");

  const profileRes = await getResumeProfile(sessionId, ELEVENLABS_API_KEY!);
  const profileBody = await profileRes.json().catch(() => ({}));
  if (profileRes.status !== 200) {
    fail("get-resume-profile returns 200", { status: profileRes.status, profileBody });
  }
  if (profileBody.interviewid !== sessionId || !profileBody.resumeprofile) {
    fail("get-resume-profile response shape", profileBody);
  }
  if (!profileBody.result?.resumeprofile) {
    fail("get-resume-profile includes ElevenLabs result wrapper", profileBody);
  }
  ok("get-resume-profile returns resumeprofile for sessionId");

  const profileEnvelopeRes = await fetch(`${API_BASE}/api/get-resume-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": ELEVENLABS_API_KEY!,
    },
    body: JSON.stringify({
      tool_call_id: "call_test",
      tool_name: "GetResumeProfile",
      parameters: { interview_id: sessionId },
      conversation_id: "conv_test",
    }),
  });
  const profileEnvelopeBody = await profileEnvelopeRes.json().catch(() => ({}));
  if (profileEnvelopeRes.status !== 200 || profileEnvelopeBody.result?.interviewid !== sessionId) {
    fail("get-resume-profile accepts ElevenLabs parameters envelope", {
      status: profileEnvelopeRes.status,
      profileEnvelopeBody,
    });
  }
  ok("get-resume-profile accepts ElevenLabs parameters envelope");

  const profileGetRes = await fetch(
    `${API_BASE}/api/get-resume-profile?interviewid=${encodeURIComponent(sessionId)}`,
    {
      method: "GET",
      headers: {
        "x-api-secret": ELEVENLABS_API_KEY!,
      },
    },
  );
  const profileGetBody = await profileGetRes.json().catch(() => ({}));
  if (profileGetRes.status !== 200 || profileGetBody.result?.interviewid !== sessionId) {
    fail("get-resume-profile accepts GET query interviewid", {
      status: profileGetRes.status,
      profileGetBody,
    });
  }
  ok("get-resume-profile accepts GET query interviewid");

  const profileSnakeRes = await fetch(`${API_BASE}/api/get-resume-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": ELEVENLABS_API_KEY!,
    },
    body: JSON.stringify({ interview_id: sessionId, candidate_id: "test-candidate" }),
  });
  const profileSnakeBody = await profileSnakeRes.json().catch(() => ({}));
  if (profileSnakeRes.status !== 200 || profileSnakeBody.interviewid !== sessionId) {
    fail("get-resume-profile accepts ElevenLabs interview_id alias", {
      status: profileSnakeRes.status,
      profileSnakeBody,
    });
  }
  ok("get-resume-profile accepts ElevenLabs interview_id body alias");

  const fullRes = await getResumeFulltext(sessionId, ELEVENLABS_API_KEY!);
  const fullBody = await fullRes.json().catch(() => ({}));
  if (fullRes.status !== 200) {
    fail("get-resume-fulltext returns 200", { status: fullRes.status, fullBody });
  }
  if (
    fullBody.interviewid !== sessionId ||
    typeof fullBody.resumefulltext !== "string" ||
    !fullBody.resumefulltext.includes("TechCorp")
  ) {
    fail("get-resume-fulltext response shape/content", fullBody);
  }
  ok("get-resume-fulltext returns resumefulltext for sessionId");

  const missingRes = await getResumeProfile(randomUUID(), ELEVENLABS_API_KEY!);
  if (missingRes.status !== 404) {
    fail("get-resume-profile returns 404 for unknown id", missingRes.status);
  }
  ok("get-resume-profile returns 404 for unknown interviewid");

  console.log("\n" + "=".repeat(48));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(48));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
