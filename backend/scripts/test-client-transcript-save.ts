/**
 * Verifies POST /api/save-interview persists body.transcript (client fallback)
 * and GET /api/interviews/:id/results returns transcript + completed status.
 */
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const SAMPLE_TRANSCRIPT = `AI: Tell me about yourself.

User: I am a computer science student.

AI: What is your strongest technical skill?

User: I enjoy building full-stack web applications.`;

function apiBase(): string {
  if (process.env.API_TEST_BASE) return process.env.API_TEST_BASE.replace(/\/$/, '');
  const port = process.env.PORT || '5000';
  return `http://127.0.0.1:${port}`;
}

async function main() {
  const base = apiBase();
  console.log(`Using API base: ${base}\n`);

  console.log('1. Signing in...');
  const signinRes = await fetch(`${base}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test123@gmail.com', password: 'Test123' }),
  });
  if (!signinRes.ok) {
    const t = await signinRes.text();
    throw new Error(`Signin failed (${signinRes.status}): ${t}\nRun: npm run create-test-user (with DEV_TEST_PASSWORD in .env)`);
  }
  const { token } = (await signinRes.json()) as { token: string };
  console.log('   OK\n');

  // --- Case A: new interview + client transcript + fake conversation id ---
  const sessionA = crypto.randomUUID();
  const convA = `conv_client_tx_test_${Date.now()}`;
  console.log('2. save-interview with client transcript (with conversation_id)...');
  const saveA = await fetch(`${base}/api/save-interview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      client_session_id: sessionA,
      conversation_id: convA,
      ended_by: 'disconnect',
      transcript: SAMPLE_TRANSCRIPT,
    }),
  });
  const saveAData = (await saveA.json()) as { success?: boolean; interviewId?: string };
  if (!saveA.ok || !saveAData.interviewId) {
    console.error('   FAIL', saveA.status, saveAData);
    process.exit(1);
  }
  console.log('   interviewId:', saveAData.interviewId);

  const resA = await fetch(`${base}/api/interviews/${saveAData.interviewId}/results`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataA = (await resA.json()) as {
    interview?: { transcript: string | null; status: string };
  };
  if (!resA.ok) {
    console.error('   results FAIL', resA.status, dataA);
    process.exit(1);
  }
  if (!dataA.interview?.transcript || !dataA.interview.transcript.includes('computer science')) {
    console.error('   FAIL: transcript missing or wrong', dataA.interview);
    process.exit(1);
  }
  if (dataA.interview.status !== 'completed') {
    console.error('   FAIL: expected status completed, got', dataA.interview.status);
    process.exit(1);
  }
  console.log('   OK: transcript saved, status completed\n');

  // --- Case B: no conversation_id, client transcript only (local-dev style) ---
  const sessionB = crypto.randomUUID();
  console.log('3. save-interview with client transcript (no conversation_id)...');
  const saveB = await fetch(`${base}/api/save-interview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      client_session_id: sessionB,
      ended_by: 'disconnect',
      transcript: SAMPLE_TRANSCRIPT,
    }),
  });
  const saveBData = (await saveB.json()) as { interviewId?: string };
  if (!saveB.ok || !saveBData.interviewId) {
    console.error('   FAIL', saveB.status, saveBData);
    process.exit(1);
  }
  const resB = await fetch(`${base}/api/interviews/${saveBData.interviewId}/results`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataB = (await resB.json()) as {
    interview?: { transcript: string | null; status: string; conversationId: string | null };
  };
  if (!resB.ok || !dataB.interview?.transcript) {
    console.error('   FAIL', resB.status, dataB);
    process.exit(1);
  }
  if (dataB.interview.status !== 'completed') {
    console.error('   FAIL: expected completed, got', dataB.interview.status);
    process.exit(1);
  }
  console.log('   OK: transcript without conversation_id\n');

  console.log('All client-transcript save checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
