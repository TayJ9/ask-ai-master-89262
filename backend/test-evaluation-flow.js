/**
 * Test script for interview evaluation flow
 * 
 * Simulates: Webhook -> Evaluation -> Results API
 * 
 * Usage:
 *   node test-evaluation-flow.js
 * 
 * Requires:
 *   - DATABASE_URL environment variable
 *   - ELEVENLABS_WEBHOOK_SECRET environment variable
 *   - A valid user_id UUID from your database
 */

import { createHmac } from 'crypto';
import { randomUUID } from 'crypto';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET || 'test-secret-key';
const TEST_USER_ID = process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000000';

function generateSignature(rawBody, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${timestamp}.${rawBody}`;
  const hash = createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v0=${hash}`;
}

async function testEvaluationFlow() {
  console.log('🧪 Testing Interview Evaluation Flow\n');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Test User ID: ${TEST_USER_ID}\n`);

  // Step 1: Simulate webhook payload
  const conversationId = `test-conv-${Date.now()}`;
  const agentId = 'agent_8601kavsezrheczradx9qmz8qp3e';
  
  const webhookPayload = {
    conversation_id: conversationId,
    user_id: TEST_USER_ID,
    agent_id: agentId,
    transcript: `AI: Hello! Can you tell me about yourself?
User: Hi! I'm a software engineer with 5 years of experience. I've built several web applications using React and Node.js. I led a team of 3 developers and we increased user engagement by 40% last quarter.

AI: That's great! Can you describe a challenging project you worked on?
User: Sure! I designed and implemented a real-time chat system that handles 10,000 concurrent users. I used WebSockets and Redis for caching. It was challenging because we had to ensure low latency while maintaining data consistency.

AI: How do you handle debugging complex issues?
User: I start by reproducing the issue, then I analyze the logs and use debugging tools. I've fixed over 50 production bugs in the past year. I also write unit tests to prevent regressions.`,
    duration: 180,
    started_at: new Date(Date.now() - 180000).toISOString(),
    ended_at: new Date().toISOString(),
    status: 'completed',
  };

  const rawBody = JSON.stringify(webhookPayload);
  const signature = generateSignature(rawBody, WEBHOOK_SECRET);

  console.log('Step 1: Sending webhook payload...');
  console.log(`  Conversation ID: ${conversationId}`);
  console.log(`  Transcript length: ${webhookPayload.transcript.length} chars\n`);

  try {
    const webhookResponse = await fetch(`${API_BASE_URL}/webhooks/elevenlabs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'elevenlabs-signature': signature,
      },
      body: rawBody,
    });

    const webhookResult = await webhookResponse.json();
    
    if (!webhookResponse.ok) {
      console.error('❌ Webhook failed:', webhookResult);
      process.exit(1);
    }

    console.log('✅ Webhook accepted');
    console.log(`  Interview ID: ${webhookResult.interviewId || 'unknown'}\n`);

    const interviewId = webhookResult.interviewId;

    if (!interviewId) {
      console.error('❌ No interview ID returned from webhook');
      process.exit(1);
    }

    // Step 2: Wait for evaluation to complete (polling)
    console.log('Step 2: Waiting for evaluation to complete...');
    
    let evaluationComplete = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait

    while (!evaluationComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      // Note: In a real scenario, you'd need to authenticate to call the results API
      // For testing, you might need to add a test endpoint or use a test token
      console.log(`  Attempt ${attempts}/${maxAttempts}...`);
    }

    console.log('\n✅ Evaluation should be processing (check logs for completion)\n');

    // Step 3: Fetch results (requires authentication - this is a template)
    console.log('Step 3: Fetching results...');
    console.log('  Note: This requires authentication. Use a valid auth token.');
    console.log(`  GET ${API_BASE_URL}/api/interviews/${interviewId}/results\n`);

    console.log('✅ Test flow initiated successfully!');
    console.log('\nNext steps:');
    console.log(`1. Check server logs for evaluation processing`);
    console.log(`2. Query database: SELECT * FROM interview_evaluations WHERE interview_id = '${interviewId}'`);
    console.log(`3. Call results API with valid auth token: GET /api/interviews/${interviewId}/results`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testEvaluationFlow();

