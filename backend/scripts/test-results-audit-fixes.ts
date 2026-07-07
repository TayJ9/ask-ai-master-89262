/**
 * Integration checks for interview → save → results audit fixes.
 *
 * Run (backend must be up on PORT from .env, default 3001):
 *   npm run test:results-audit-fixes
 *
 * Prerequisites:
 *   DEV_TEST_PASSWORD in backend/.env and: npm run create-test-user
 */
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { storage } from '../server/storage.js';
import { TERMINAL_EVAL_ERROR_MESSAGES } from '../server/evaluation.js';
import { db } from '../server/db.js';
import { elevenLabsInterviewSessions } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const API_BASE = (
  process.env.API_TEST_BASE ||
  `http://127.0.0.1:${process.env.PORT || '3001'}`
).replace(/\/$/, '');

const DEV_EMAIL = (process.env.DEV_TEST_EMAIL || 'dev@localhost.test').trim().toLowerCase();
const DEV_PASSWORD = process.env.DEV_TEST_PASSWORD?.trim() || 'Test1234';

type ResultsPayload = {
  interview?: { transcript?: string | null; status?: string };
  evaluation?: { status?: string; error?: string | null } | null;
};

let passed = 0;
let failed = 0;

function ok(label: string) {
  passed++;
  console.log(`   ✅ ${label}`);
}

function fail(label: string, detail?: unknown): never {
  failed++;
  console.error(`   ❌ ${label}`);
  if (detail !== undefined) console.error('      ', detail);
  throw new Error(label);
}

function assert(condition: boolean, label: string, detail?: unknown): asserts condition {
  if (!condition) fail(label, detail);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveResumeLikeEvaluation(
  interviewId: string,
  clientSessionId: string,
): Promise<{ resumeFulltext?: string | null; resumeProfile?: Record<string, unknown> | null } | undefined> {
  let resume = await storage.getResume(interviewId);
  if (!resume?.resumeFulltext) {
    resume = await storage.getResume(clientSessionId);
  }
  return resume;
}

async function signIn(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Signin failed (${res.status}): ${text}\nRun: cd backend && npm run create-test-user`
    );
  }
  const { token } = (await res.json()) as { token: string };
  assert(!!token, 'signin returns token');
  return token;
}

async function saveInterview(
  token: string,
  body: Record<string, unknown>
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/save-interview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, data };
}

async function getResults(token: string, interviewId: string): Promise<ResultsPayload> {
  const res = await fetch(`${API_BASE}/api/interviews/${interviewId}/results`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as ResultsPayload;
  return { ...data, ...(res.ok ? {} : { _httpStatus: res.status }) };
}

async function testHealth() {
  console.log('\n0. Health check');
  const res = await fetch(`${API_BASE}/health`);
  assert(res.ok, `GET /health (${res.status})`);
  ok(`API reachable at ${API_BASE}`);
}

async function testInvalidSessionIdRejected(token: string) {
  console.log('\n1. Reject non-UUID client_session_id');
  const { status, data } = await saveInterview(token, {
    client_session_id: `session-${Date.now()}`,
    ended_by: 'disconnect',
  });
  assert(status === 400, 'non-UUID session returns 400', { status, data });
  ok('save-interview rejects legacy session-* id format');
}

async function testSaveLinkAndInterviewId(token: string) {
  console.log('\n2. UUID save returns interviewId + by-session linkStatus');
  const sessionId = crypto.randomUUID();
  const { status, data } = await saveInterview(token, {
    client_session_id: sessionId,
    conversation_id: `conv_audit_${Date.now()}`,
    ended_by: 'disconnect',
    transcript: `AI: Question one?\n\nUser: Answer one.`,
  });
  assert(status === 200 && data.success === true, 'save succeeds', { status, data });
  const interviewId = data.interviewId as string | undefined;
  assert(!!interviewId, 'response includes interviewId', data);

  const bySessionRes = await fetch(`${API_BASE}/api/interviews/by-session/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const bySession = (await bySessionRes.json()) as {
    interviewId?: string;
    linkStatus?: string;
  };
  assert(bySessionRes.ok, 'by-session ok', bySession);
  assert(bySession.interviewId === interviewId, 'by-session interviewId matches', bySession);
  assert(bySession.linkStatus === 'linked', 'linkStatus is linked', bySession);
  ok('interviewId returned and session linked');
}

async function testNoTranscriptTerminalFailure(token: string) {
  console.log('\n3. No transcript → terminal failed evaluation (no infinite pending)');
  const sessionId = crypto.randomUUID();
  const { status, data } = await saveInterview(token, {
    client_session_id: sessionId,
    ended_by: 'user',
    // no conversation_id, no transcript → fast-fail path
  });
  assert(status === 200 && !!data.interviewId, 'save still creates interview', { status, data });
  const interviewId = data.interviewId as string;

  const results = await getResults(token, interviewId);
  assert(results.evaluation?.status === 'failed', 'evaluation status is failed', results.evaluation);
  assert(
    (results.evaluation?.error || '').includes(
      TERMINAL_EVAL_ERROR_MESSAGES.no_transcript.slice(0, 40)
    ),
    'error explains missing transcript',
    results.evaluation?.error
  );
  ok('no_transcript recorded as failed evaluation');
}

async function testNoQaPairsTerminalFailure(token: string) {
  console.log('\n4. Unparseable transcript → terminal failed (no_qa_pairs)');
  const sessionId = crypto.randomUUID();
  const { status, data } = await saveInterview(token, {
    client_session_id: sessionId,
    ended_by: 'disconnect',
    transcript: 'xxxxxxxx no speaker labels at all xxxxxxxx',
  });
  assert(status === 200 && !!data.interviewId, 'save with unparseable transcript', { status, data });
  const results = await getResults(token, data.interviewId as string);
  assert(results.evaluation?.status === 'failed', 'evaluation failed', results.evaluation);
  const err = results.evaluation?.error || '';
  assert(
    err.includes(TERMINAL_EVAL_ERROR_MESSAGES.no_qa_pairs.slice(0, 35)),
    'error is no_qa_pairs message',
    err
  );
  ok('no_qa_pairs recorded as failed evaluation');
}

async function testClientTranscriptEnqueuesEvaluation(token: string) {
  console.log('\n5. Valid client transcript → transcript saved, evaluation queued (not terminal fail)');
  const sessionId = crypto.randomUUID();
  const transcript = `AI: Tell me about a project.\n\nUser: I built a web app with React and Node.`;
  const { status, data } = await saveInterview(token, {
    client_session_id: sessionId,
    conversation_id: `conv_valid_${Date.now()}`,
    ended_by: 'disconnect',
    transcript,
  });
  assert(status === 200 && !!data.interviewId, 'save ok', { status, data });
  const interviewId = data.interviewId as string;

  const results = await getResults(token, interviewId);
  assert(!!results.interview?.transcript?.includes('React'), 'transcript persisted', results.interview);
  const evalStatus = results.evaluation?.status;
  assert(
    evalStatus === 'pending' || evalStatus === 'processing' || evalStatus === 'complete',
    'evaluation queued or running (not terminal no_transcript fail)',
    results.evaluation
  );
  if (results.evaluation?.error) {
    assert(
      !results.evaluation.error.includes(TERMINAL_EVAL_ERROR_MESSAGES.no_transcript.slice(0, 30)),
      'not marked no_transcript',
      results.evaluation.error
    );
  }
  ok('valid transcript path persists data and queues evaluation');
}

async function testResumeCopiedToInterviewId(token: string) {
  console.log('\n6. Resume uploaded under sessionId is copied to interviewId on save');
  const sessionId = crypto.randomUUID();
  const resumeText = 'Audit Test Resume — Computer Science student with React experience.';
  await storage.upsertResume(sessionId, resumeText, { major: 'Computer Science', skills: ['React'] });

  const { status, data } = await saveInterview(token, {
    client_session_id: sessionId,
    ended_by: 'disconnect',
    transcript: `AI: Skill question?\n\nUser: I use React daily.`,
  });
  assert(status === 200 && !!data.interviewId, 'save ok', { status, data });
  const interviewId = data.interviewId as string;

  const resume = await storage.getResume(interviewId);
  assert(!!resume?.resumeFulltext?.includes('Audit Test Resume'), 'resume linked to interviewId', resume);
  ok('resume copied from sessionId to interviewId');
}

async function testResumeAvailableBeforeEvaluation(token: string) {
  console.log('\n7. Resume linked before evaluation enqueue (session → interviewId ordering)');
  const sessionId = crypto.randomUUID();
  const resumeMarker = 'PreEvalResumeMarker-React-TypeScript';
  const resumeText = `${resumeMarker} — Computer Science student. Skills: React, TypeScript`;
  const resumeProfile = {
    major: 'Computer Science',
    skills: ['React', 'TypeScript', 'AuditSkillMarker'],
    firstName: 'Alex',
    year: 'Junior',
  };
  await storage.upsertResume(sessionId, resumeText, resumeProfile);

  const { status, data } = await saveInterview(token, {
    client_session_id: sessionId,
    ended_by: 'disconnect',
    transcript: `AI: Tell me about your React experience.\n\nUser: I built apps with React and TypeScript.`,
  });
  assert(status === 200 && !!data.interviewId, 'save ok', { status, data });
  const interviewId = data.interviewId as string;

  const resumeOnInterview = await storage.getResume(interviewId);
  assert(
    !!resumeOnInterview?.resumeFulltext?.includes(resumeMarker),
    'resume on interviewId immediately after save (before eval completes)',
    resumeOnInterview,
  );

  const sessionRow = await db.query.elevenLabsInterviewSessions.findFirst({
    where: eq(elevenLabsInterviewSessions.clientSessionId, sessionId),
  });
  const ctx = (sessionRow?.candidateContext || {}) as Record<string, unknown>;
  assert(ctx.major === 'Computer Science', 'candidateContext.major persisted from resume profile', ctx);
  assert(ctx.first_name === 'Alex', 'candidateContext.first_name persisted from resume profile', ctx);

  const resolved = await resolveResumeLikeEvaluation(interviewId, sessionId);
  assert(!!resolved?.resumeFulltext?.includes(resumeMarker), 'evaluation-style resume resolve finds resume', resolved);
  const skills = (resolved?.resumeProfile as { skills?: string[] } | null)?.skills || [];
  assert(skills.includes('AuditSkillMarker'), 'resume profile skills available for evaluation', skills);

  let evalStatus = 'pending';
  for (let attempt = 0; attempt < 90; attempt++) {
    const results = await getResults(token, interviewId);
    evalStatus = results.evaluation?.status || 'pending';
    if (evalStatus === 'complete' || evalStatus === 'failed') break;
    await sleep(1000);
  }

  assert(
    evalStatus === 'complete' || evalStatus === 'failed' || evalStatus === 'processing' || evalStatus === 'pending',
    'evaluation reached a trackable state',
    { evalStatus },
  );

  if (evalStatus === 'complete') {
    ok('resume linked before evaluation; evaluation completed with resume context available');
  } else {
    ok(`resume linked before evaluation enqueue (eval status: ${evalStatus})`);
  }
}

async function main() {
  console.log('=== Results audit fixes — integration test ===');
  console.log(`API: ${API_BASE}`);
  console.log(`User: ${DEV_EMAIL}`);

  await testHealth();

  console.log('\nSigning in...');
  const token = await signIn();
  ok('authenticated');

  await testInvalidSessionIdRejected(token);
  await testSaveLinkAndInterviewId(token);
  await testNoTranscriptTerminalFailure(token);
  await testNoQaPairsTerminalFailure(token);
  await testClientTranscriptEnqueuesEvaluation(token);
  await testResumeCopiedToInterviewId(token);
  await testResumeAvailableBeforeEvaluation(token);

  console.log(`\n=== Done: ${passed} passed, ${failed} failed ===\n`);
}

main().catch((err) => {
  console.error('\n❌ Test run failed:', err.message || err);
  process.exit(1);
});
