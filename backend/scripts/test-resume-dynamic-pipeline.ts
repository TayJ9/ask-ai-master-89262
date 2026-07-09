/**
 * End-to-end resume → dynamic-questions pipeline test.
 *
 * Verifies:
 *   1. Resume persist (NER/summarization + DB storage)
 *   2. Dynamic variables the ElevenLabs agent receives at session start
 *   3. Server tools the agent can call mid-conversation
 *
 * Run (SQLite DB initialized; backend optional for HTTP section; do not run while manually testing the resume UI):
 *   npm run test:resume-dynamic-pipeline
 *
 * For full HTTP coverage, start the backend first:
 *   npm run dev:no-setup
 *
 * Set SKIP_RESUME_API_TESTS=1 to skip when the backend is up for manual UI testing.
 */

import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { persistResumeForSession } from "../server/persistResume.js";
import { storage } from "../server/storage.js";
import { getYearToDifficulty } from "../../frontend/src/lib/yearToDifficulty.js";
import { getQuestionBankForYear } from "../../frontend/src/lib/questionBank.js";

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

/** Distinctive markers the agent should be able to reference in questions */
const COMPANY_MARKER = "QuantumLeap Robotics";
const PROJECT_MARKER = "sentiment-analysis chatbot in Rust";
const SKILL_MARKER = "Kubernetes";

const SAMPLE_RESUME = [
  "Alex Rivera",
  "Education: State University, Computer Science, GPA 3.8",
  `Experience: Software Engineering Intern at ${COMPANY_MARKER}`,
  `Projects: Built a ${PROJECT_MARKER} serving 10k daily users`,
  `Skills: JavaScript, Python, React, ${SKILL_MARKER}, teamwork`,
].join("\n");

const REQUIRED_DYNAMIC_KEYS = [
  "first_name",
  "major",
  "year",
  "resume_summary",
  "resume_highlights",
  "technical_difficulty",
  "technical_depth",
  "behavioral_ratio",
  "question_bank",
  "interview_id",
  "interviewid",
] as const;

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(label: string) {
  passed++;
  console.log(`  ✅ ${label}`);
}

function skip(label: string, reason: string) {
  skipped++;
  console.log(`  ⏭️  ${label} (skipped: ${reason})`);
}

function fail(label: string, detail?: unknown): never {
  failed++;
  console.error(`  ❌ ${label}`);
  if (detail !== undefined) console.error("     ", detail);
  throw new Error(label);
}

function assert(condition: boolean, label: string, detail?: unknown): asserts condition {
  if (!condition) fail(label, detail);
}

function containsMarker(text: string, marker: string): boolean {
  return text.toLowerCase().includes(marker.toLowerCase());
}

/** Mirrors VoiceInterviewWebSocket.tsx startInterview dynamic variable builder */
function buildInterviewDynamicVariables(input: {
  sessionId: string;
  firstName: string;
  major: string;
  year: string;
  resume_summary: string;
  resume_highlights: string;
  resumeText?: string;
}): Record<string, string | number> {
  const yearStr = input.year.trim() || "Unknown";
  const { technicalDifficulty, technicalDepth, behavioralRatio } = getYearToDifficulty(
    yearStr === "Unknown" ? "" : yearStr,
  );
  const effectiveTechnicalDifficulty =
    yearStr === "Unknown" ? "intermediate" : technicalDifficulty;
  const effectiveTechnicalDepth = yearStr === "Unknown" ? "standard" : technicalDepth;
  const effectiveBehavioralRatio = yearStr === "Unknown" ? 60 : behavioralRatio;

  const resumeSummary =
    input.resume_summary ||
    (input.resumeText ? input.resumeText.slice(0, 1500) : "");
  const resumeHighlights =
    input.resume_highlights ||
    (input.resumeText ? input.resumeText.slice(0, 500) : "");

  return {
    candidate_id: input.sessionId,
    interview_id: input.sessionId,
    candidateid: input.sessionId,
    interviewid: input.sessionId,
    first_name: input.firstName,
    major: input.major,
    year: yearStr,
    resume_summary: resumeSummary,
    resume_highlights: resumeHighlights,
    technical_difficulty: effectiveTechnicalDifficulty,
    technical_depth: effectiveTechnicalDepth,
    behavioral_ratio: String(effectiveBehavioralRatio),
    question_bank: getQuestionBankForYear(yearStr),
  };
}

async function testDirectPersist(): Promise<{
  sessionId: string;
  resume_summary: string;
  resume_highlights: string;
  resumeText: string;
}> {
  console.log("\n--- Phase 1: Direct resume persist ---");
  const sessionId = randomUUID();

  const persisted = await persistResumeForSession(sessionId, SAMPLE_RESUME, "[TEST-RESUME-PIPELINE]");
  assert(persisted.sessionId === sessionId, "persist returns same sessionId", persisted);
  ok("persistResumeForSession stores resume");

  assert(persisted.resume_summary.length > 50, "resume_summary is non-trivial", {
    length: persisted.resume_summary.length,
  });
  ok("resume_summary generated");

  assert(persisted.resume_highlights.length > 20, "resume_highlights is non-trivial", {
    length: persisted.resume_highlights.length,
  });
  ok("resume_highlights generated");

  assert(
    persisted.briefSource === "structured",
    "interview brief should be structured for labeled resumes",
    { briefSource: persisted.briefSource, preview: persisted.resume_summary.slice(0, 300) },
  );
  ok(`briefSource=${persisted.briefSource}`);

  // Markers must appear in the dynamic-var brief itself (not only fulltext),
  // so the interviewer can ask about them without calling server tools.
  const briefText = `${persisted.resume_summary} ${persisted.resume_highlights}`;
  const briefMarkerHits = [COMPANY_MARKER, PROJECT_MARKER, SKILL_MARKER].filter((m) =>
    containsMarker(briefText, m),
  );
  assert(
    briefMarkerHits.length >= 2,
    "structured brief retains distinctive markers for tailored questions",
    { briefMarkerHits, briefPreview: briefText.slice(0, 400) },
  );
  ok(`structured brief retains markers: ${briefMarkerHits.join(", ")}`);

  const combined = `${briefText} ${persisted.resumeText}`;
  const markerHits = [COMPANY_MARKER, PROJECT_MARKER, SKILL_MARKER].filter((m) =>
    containsMarker(combined, m),
  );
  assert(
    markerHits.length >= 1,
    "persisted resume retains at least one distinctive marker for dynamic questions",
    { markerHits, combinedPreview: combined.slice(0, 300) },
  );
  ok(`resume content retains markers: ${markerHits.join(", ")}`);

  const fromDb = await storage.getResume(sessionId);
  assert(!!fromDb?.resumeFulltext, "storage.getResume returns fulltext");
  assert(!!fromDb?.resumeProfile, "storage.getResume returns profile");
  ok("resume retrievable from DB");

  return {
    sessionId,
    resume_summary: persisted.resume_summary,
    resume_highlights: persisted.resume_highlights,
    resumeText: persisted.resumeText,
  };
}

function testDynamicVariables(persisted: {
  sessionId: string;
  resume_summary: string;
  resume_highlights: string;
  resumeText: string;
}) {
  console.log("\n--- Phase 2: Dynamic variables (agent session start) ---");

  const dynamicVars = buildInterviewDynamicVariables({
    sessionId: persisted.sessionId,
    firstName: "Alex",
    major: "Computer Science",
    year: "Junior",
    resume_summary: persisted.resume_summary,
    resume_highlights: persisted.resume_highlights,
    resumeText: persisted.resumeText,
  });

  const keys = Object.keys(dynamicVars);
  const missing = REQUIRED_DYNAMIC_KEYS.filter((k) => !keys.includes(k));
  assert(missing.length === 0, "dynamic variables include all required keys", { missing });
  ok("all required dynamic variable keys present");

  const summary = String(dynamicVars.resume_summary);
  const highlights = String(dynamicVars.resume_highlights);
  const questionBank = String(dynamicVars.question_bank);

  assert(summary.length > 50, "resume_summary injected into dynamic vars", { length: summary.length });
  ok(`resume_summary length=${summary.length}`);

  assert(highlights.length > 20, "resume_highlights injected into dynamic vars", {
    length: highlights.length,
  });
  ok(`resume_highlights length=${highlights.length}`);

  assert(questionBank.length > 100, "question_bank is populated for year", {
    length: questionBank.length,
  });
  ok(`question_bank length=${questionBank.length}`);

  const injected = `${summary} ${highlights}`;
  const markerInVars = [COMPANY_MARKER, PROJECT_MARKER, SKILL_MARKER].some((m) =>
    containsMarker(injected, m),
  );
  assert(
    markerInVars,
    "dynamic variables contain resume-specific content for tailored questions",
    { summaryPreview: summary.slice(0, 200) },
  );
  ok("dynamic variables carry resume-specific content");

  assert(
    dynamicVars.interview_id === persisted.sessionId &&
      dynamicVars.interviewid === persisted.sessionId,
    "interview_id/interviewid match sessionId for server tools",
  );
  ok("interview_id aligned with sessionId for server tools");

  console.log("\n  Dynamic variable preview (redacted lengths):");
  for (const k of REQUIRED_DYNAMIC_KEYS) {
    const v = dynamicVars[k];
    const len = typeof v === "string" ? v.length : String(v).length;
    console.log(`    ${k}: ${len} chars`);
  }
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

async function testHttpIntegration(sessionId: string): Promise<void> {
  console.log("\n--- Phase 3: HTTP integration (server tools) ---");

  if (!ELEVENLABS_API_KEY) {
    skip("HTTP server-tool tests", "ELEVENLABS_API_KEY not set");
    return;
  }

  let healthOk = false;
  try {
    const health = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    healthOk = health.ok;
  } catch {
    healthOk = false;
  }

  if (!healthOk) {
    skip("HTTP server-tool tests", `backend not reachable at ${API_BASE}`);
    return;
  }
  ok("backend reachable");

  const token = await signIn();
  ok("authenticated");

  const uploadRes = await fetch(`${API_BASE}/api/resume/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text: SAMPLE_RESUME, sessionId }),
  });
  const uploadBody = await uploadRes.json().catch(() => ({}));
  assert(uploadRes.ok, "POST /api/resume/upload succeeds", { status: uploadRes.status, uploadBody });
  ok("resume uploaded via HTTP");

  const profileRes = await fetch(`${API_BASE}/api/get-resume-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({ interviewid: sessionId }),
  });
  const profileBody = await profileRes.json().catch(() => ({}));
  assert(profileRes.status === 200, "get-resume-profile returns 200", profileBody);
  assert(!!profileBody.resumeprofile, "get-resume-profile returns resumeprofile");
  ok("agent server tool get-resume-profile works");

  const fullRes = await fetch(`${API_BASE}/api/get-resume-fulltext`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({ interviewid: sessionId }),
  });
  const fullBody = await fullRes.json().catch(() => ({}));
  assert(fullRes.status === 200, "get-resume-fulltext returns 200", fullBody);
  assert(
    typeof fullBody.resumefulltext === "string" &&
      containsMarker(fullBody.resumefulltext, COMPANY_MARKER),
    "get-resume-fulltext returns resume with company marker",
    { preview: String(fullBody.resumefulltext).slice(0, 200) },
  );
  ok("agent server tool get-resume-fulltext returns resume content");
}

async function main() {
  console.log("=== Resume → Dynamic Questions Pipeline Test ===");
  console.log(`API (optional): ${API_BASE}`);

  const persisted = await testDirectPersist();
  testDynamicVariables(persisted);
  await testHttpIntegration(persisted.sessionId);

  console.log("\n" + "=".repeat(52));
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("=".repeat(52));

  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
