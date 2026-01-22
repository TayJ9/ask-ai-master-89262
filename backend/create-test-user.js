/**
 * Helper script to create a test user for testing the SaveInterviewResults tool
 * 
 * Usage:
 *   node create-test-user.js
 * 
 * Environment Variables:
 *   - API_BASE_URL: Your Railway backend URL (default: http://localhost:3000)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Try to load .env file if it exists
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

const API_BASE_URL = process.env.API_BASE_URL || envVars.API_BASE_URL || 'http://localhost:3000';

async function createTestUser() {
  console.log('🔧 Creating test user...\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // Generate unique email with timestamp
  const timestamp = Date.now();
  const testEmail = `test-user-${timestamp}@test.example.com`;
  const testPassword = 'TestPassword123!';
  const testFullName = 'Test User';

  const signupPayload = {
    email: testEmail,
    password: testPassword,
    fullName: testFullName,
  };

  console.log('📤 Creating user via POST /api/auth/signup...');
  console.log(`   Email: ${testEmail}`);
  console.log(`   Full Name: ${testFullName}\n`);

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(signupPayload),
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
      console.error('❌ Failed to create test user!');
      console.error(`   Status: ${response.status}`);
      console.error(`   Error: ${JSON.stringify(responseData, null, 2)}`);
      
      if (response.status === 409) {
        console.error('\n💡 User already exists. Try using an existing user ID or delete the user first.');
      }
      
      process.exit(1);
    }

    console.log('✅ Test user created successfully!');
    console.log(`   Email: ${testEmail}`);
    console.log('');
    
    // Sign in to get the user ID from the JWT token
    console.log('🔐 Signing in to get user ID...');
    const signinResponse = await fetch(`${API_BASE_URL}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    const signinData = await signinResponse.json();
    
    if (!signinResponse.ok) {
      console.error('❌ Failed to sign in:', signinData);
      console.error('   User was created but could not retrieve user ID');
      process.exit(1);
    }

    // Extract user ID from JWT token (decode the token)
    let userId = null;
    if (signinData.token) {
      try {
        // JWT tokens are base64 encoded: header.payload.signature
        // We need the payload which contains the user ID
        const tokenParts = signinData.token.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString('utf8'));
          userId = payload.userId || payload.id || payload.sub;
        }
      } catch (error) {
        console.error('⚠️  Could not decode JWT token:', error.message);
      }
    }

    if (userId) {
      console.log('✅ User ID retrieved successfully!');
      console.log(`   User ID: ${userId}`);
      console.log('');
      console.log('📋 Use this user ID for testing:');
      console.log(`   ${userId}`);
      console.log('');
      console.log('💡 To use it in the test script:');
      console.log(`   node test-save-interview-tool.js --api-key="your-key" --user-id="${userId}"`);
      console.log('');
      console.log('💡 Or set as environment variable:');
      console.log(`   $env:TEST_USER_ID="${userId}"; node test-save-interview-tool.js --api-key="your-key"`);
    } else {
      console.error('⚠️  Warning: Could not extract user ID from token');
      console.error('   Token received but could not decode');
      console.error('   You can still use the email to sign in and get your user ID');
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

// Run the script
createTestUser().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
