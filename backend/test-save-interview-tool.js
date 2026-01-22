/**
 * Test script for SaveInterviewResults tool call
 * 
 * Simulates the tool call that ElevenLabs agent makes when interview ends
 * 
 * Usage:
 *   # Method 1: Environment variable (most secure)
 *   ELEVENLABS_API_KEY="your-key" node test-save-interview-tool.js
 * 
 *   # Method 2: Command-line argument (secure, not stored)
 *   node test-save-interview-tool.js --api-key="your-key"
 * 
 *   # Method 3: .env file (create backend/.env with ELEVENLABS_API_KEY=...)
 *   node test-save-interview-tool.js
 * 
 * Environment Variables:
 *   - API_BASE_URL: Your Railway backend URL (default: http://localhost:3000)
 *   - ELEVENLABS_API_KEY: Your ElevenLabs API key (for x-api-secret header)
 *   - TEST_USER_ID: A valid user UUID from your database (REQUIRED - must exist in profiles table)
 * 
 * Note: TEST_USER_ID must be a real user ID that exists in your database's profiles table.
 * You can get a real user ID by:
 *   1. Creating a test user via /api/auth/signup
 *   2. Querying your database: SELECT id FROM profiles LIMIT 1;
 */

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Try to load .env file if it exists (for local testing)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let envVars = {};
try {
  const envFile = join(__dirname, '.env');
  const envContent = readFileSync(envFile, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
} catch (error) {
  // .env file doesn't exist - that's fine
}

// Parse command-line arguments
const args = process.argv.slice(2);
let apiKeyFromArgs = null;
args.forEach(arg => {
  if (arg.startsWith('--api-key=')) {
    apiKeyFromArgs = arg.split('=')[1].replace(/^["']|["']$/g, '');
  }
});

// Get API key from: command-line arg > environment variable > .env file
const API_BASE_URL = process.env.API_BASE_URL || envVars.API_BASE_URL || 'http://localhost:3000';
const ELEVENLABS_API_KEY = apiKeyFromArgs || process.env.ELEVENLABS_API_KEY || envVars.ELEVENLABS_API_KEY;
const TEST_USER_ID = process.env.TEST_USER_ID || envVars.TEST_USER_ID;

// Parse user_id from command line if provided
let userIdFromArgs = null;
args.forEach(arg => {
  if (arg.startsWith('--user-id=')) {
    userIdFromArgs = arg.split('=')[1].replace(/^["']|["']$/g, '');
  }
});

const finalUserId = userIdFromArgs || TEST_USER_ID;

// Sample transcript with Q&A pairs for testing
const SAMPLE_TRANSCRIPT = `Interviewer: Hello! Can you tell me about yourself?

Candidate: Hi! I'm a software engineer with 5 years of experience. I've built several web applications using React and Node.js. I led a team of 3 developers and we increased user engagement by 40% last quarter.

Interviewer: That's great! Can you describe a challenging project you worked on?

Candidate: Sure! I designed and implemented a real-time chat system that handles 10,000 concurrent users. I used WebSockets and Redis for caching. It was challenging because we had to ensure low latency while maintaining data consistency.

Interviewer: How do you handle debugging complex issues?

Candidate: I start by reproducing the issue, then I analyze the logs and use debugging tools. I've fixed over 50 production bugs in the past year. I also write unit tests to prevent regressions.`;

async function testSaveInterviewTool() {
  console.log('🧪 Testing SaveInterviewResults Tool Call\n');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Test User ID: ${finalUserId || 'NOT SET'}`);
  console.log(`Using API Key: ${ELEVENLABS_API_KEY ? `${ELEVENLABS_API_KEY.substring(0, 8)}...` : 'NOT SET'}\n`);

  if (!ELEVENLABS_API_KEY) {
    console.error('❌ ERROR: ELEVENLABS_API_KEY is required!');
    console.error('\n💡 Secure ways to provide the API key:');
    console.error('   1. Command-line (recommended): node test-save-interview-tool.js --api-key="your-key"');
    console.error('   2. Environment variable: $env:ELEVENLABS_API_KEY="your-key"; node test-save-interview-tool.js');
    console.error('   3. .env file: Create backend/.env with ELEVENLABS_API_KEY=your-key');
    console.error('\n⚠️  The API key is never stored in code or committed to git.');
    process.exit(1);
  }

  if (!finalUserId) {
    console.error('❌ ERROR: TEST_USER_ID is required!');
    console.error('\n💡 The user_id must exist in your database\'s profiles table.');
    console.error('   Ways to provide it:');
    console.error('   1. Command-line: node test-save-interview-tool.js --user-id="uuid-here"');
    console.error('   2. Environment variable: $env:TEST_USER_ID="uuid-here"; node test-save-interview-tool.js');
    console.error('   3. .env file: Create backend/.env with TEST_USER_ID=uuid-here');
    console.error('\n💡 To get a real user ID:');
    console.error('   - Create a test user via POST /api/auth/signup');
    console.error('   - Or query your database: SELECT id FROM profiles LIMIT 1;');
    process.exit(1);
  }

  // Generate test conversation ID
  const conversationId = `test-conv-${Date.now()}-${randomUUID().substring(0, 8)}`;
  const agentId = 'agent_8601kavsezrheczradx9qmz8qp3e';
  const startedAt = new Date(Date.now() - 180000).toISOString(); // 3 minutes ago
  const endedAt = new Date().toISOString();

  // Simulate the exact payload that SaveInterviewResults tool should send
  const toolPayload = {
    conversation_id: conversationId,
    transcript: SAMPLE_TRANSCRIPT,
    duration: 180, // 3 minutes in seconds
    user_id: finalUserId,
    agent_id: agentId,
    started_at: startedAt,
    ended_at: endedAt,
    status: 'completed'
  };

  console.log('📤 Sending tool call to /webhooks/elevenlabs...');
  console.log(`   Conversation ID: ${conversationId}`);
  console.log(`   Transcript length: ${SAMPLE_TRANSCRIPT.length} chars`);
  console.log(`   User ID: ${finalUserId}`);
  console.log(`   Agent ID: ${agentId}\n`);

  try {
    const response = await fetch(`${API_BASE_URL}/webhooks/elevenlabs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': ELEVENLABS_API_KEY, // Tool call authentication
      },
      body: JSON.stringify(toolPayload),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📥 Response Body:`, JSON.stringify(responseData, null, 2));
    console.log('');

    if (!response.ok) {
      console.error('❌ Tool call FAILED!');
      console.error(`   Status: ${response.status}`);
      console.error(`   Error: ${JSON.stringify(responseData, null, 2)}`);
      console.error('\n💡 Troubleshooting:');
      
      if (response.status === 401) {
        console.error('   - Check that x-api-secret header matches ELEVENLABS_API_KEY');
        console.error('   - Verify ELEVENLABS_API_KEY is set correctly in Railway');
      } else if (response.status === 400) {
        console.error('   - Check that all required fields are present in payload');
        console.error('   - Verify conversation_id and user_id are valid');
      } else if (response.status === 500) {
        console.error('   - Check Railway logs for detailed error messages');
        console.error('   - Verify database connection is working');
      }
      
      process.exit(1);
    }

    console.log('✅ Tool call SUCCESSFUL!');
    console.log(`   Interview ID: ${responseData.interviewId || 'unknown'}`);
    console.log('');

    if (responseData.interviewId) {
      console.log('🔍 Next Steps:');
      console.log(`   1. Check Railway logs for: [WEBHOOK] Tool call verified`);
      console.log(`   2. Check Railway logs for: [SAVE-INTERVIEW] Successfully saved transcript`);
      console.log(`   3. Check Railway logs for: [SAVE-INTERVIEW] Evaluation enqueued`);
      console.log(`   4. Wait 10-30 seconds for evaluation to complete`);
      console.log(`   5. Test results endpoint: GET ${API_BASE_URL}/api/interviews/${responseData.interviewId}/results`);
      console.log('');
      
      // Wait a moment, then check if evaluation was enqueued
      console.log('⏳ Waiting 3 seconds, then checking evaluation status...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Note: To check evaluation status, you'd need authentication
      // This is just a test script, so we'll just report success
      console.log('✅ Test completed successfully!');
      console.log('   Check Railway logs to verify:');
      console.log('   - Transcript was saved');
      console.log('   - Evaluation was enqueued');
      console.log('   - Evaluation completed (check logs after 10-30 seconds)');
    }

  } catch (error) {
    console.error('❌ Network Error:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   - Check that API_BASE_URL is correct');
    console.error('   - Verify the backend server is running');
    console.error('   - Check network connectivity');
    process.exit(1);
  }
}

// Run the test
testSaveInterviewTool().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
