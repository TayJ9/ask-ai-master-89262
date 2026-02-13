/**
 * Test that save-interview and by-session/results flow works (SQLite)
 */
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = 'http://localhost:3001';

async function main() {
  console.log('1. Signing in...');
  const signinRes = await fetch(`${API_BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test123@gmail.com', password: 'Test123' }),
  });
  if (!signinRes.ok) {
    throw new Error(`Signin failed: ${signinRes.status} ${await signinRes.text()}`);
  }
  const { token } = await signinRes.json();
  console.log('   ✅ Signed in');

  const sessionId = crypto.randomUUID();
  const conversationId = `conv_test_${Date.now()}`;

  console.log('2. Calling save-interview...');
  const saveRes = await fetch(`${API_BASE}/api/save-interview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      client_session_id: sessionId,
      conversation_id: conversationId,
      ended_by: 'disconnect',
    }),
  });

  const saveData = await saveRes.json().catch(() => ({}));
  if (!saveRes.ok) {
    console.error('   ❌ save-interview failed:', saveRes.status, saveData);
    process.exit(1);
  }
  console.log('   ✅ save-interview success:', saveData);

  const interviewId = saveData.interviewId;
  if (!interviewId) {
    console.error('   ❌ No interviewId in response');
    process.exit(1);
  }
  console.log('   interviewId:', interviewId);

  console.log('3. Calling by-session...');
  const bySessionRes = await fetch(
    `${API_BASE}/api/interviews/by-session/${sessionId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const bySessionData = await bySessionRes.json().catch(() => ({}));
  if (!bySessionRes.ok) {
    console.error('   ❌ by-session failed:', bySessionRes.status, bySessionData);
    process.exit(1);
  }
  console.log('   ✅ by-session success:', bySessionData);
  if (bySessionData.interviewId !== interviewId) {
    console.error('   ❌ interviewId mismatch');
    process.exit(1);
  }

  console.log('4. Calling results...');
  const resultsRes = await fetch(
    `${API_BASE}/api/interviews/${interviewId}/results`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const resultsData = await resultsRes.json().catch(() => ({}));
  if (!resultsRes.ok) {
    console.error('   ❌ results failed:', resultsRes.status, resultsData);
    process.exit(1);
  }
  console.log('   ✅ results success (interview found, may be pending evaluation)');

  console.log('\n✅ All flows passed - results will save correctly');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
