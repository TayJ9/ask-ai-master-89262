/**
 * Test runner for Dialogflow CX Webhook
 * 
 * Tests the webhook handler with various payloads and assertions
 */

const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8081; // Use different port from default to avoid conflicts
const TEST_TIMEOUT = 10000; // 10 seconds

// Load test payloads
const payloads = {
  intro: JSON.parse(fs.readFileSync(path.join(__dirname, 'payloads/intro-to-interview.json'), 'utf8')),
  withProgress: JSON.parse(fs.readFileSync(path.join(__dirname, 'payloads/with-progress.json'), 'utf8')),
  missingMajor: JSON.parse(fs.readFileSync(path.join(__dirname, 'payloads/missing-major.json'), 'utf8'))
};

let serverProcess = null;
let serverReady = false;

/**
 * Start the webhook server
 */
function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting webhook server...');
    
    // Use functions-framework to start the server
    serverProcess = spawn('npx', ['functions-framework', '--target=dialogflowWebhook', '--port', PORT.toString()], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      shell: true
    });
    
    let output = '';
    let errorOutput = '';
    
    serverProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text); // Show server output
    });
    
    serverProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      // functions-framework may output to stderr, that's ok
      if (!text.includes('Error')) {
        process.stderr.write(text);
      }
    });
    
    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });
    
    // Wait a bit, then try to connect to health endpoint to verify server is ready
    setTimeout(async () => {
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        try {
          const healthCheck = await new Promise((resolve, reject) => {
            const req = http.get(`http://localhost:${PORT}/health`, (res) => {
              resolve(res.statusCode);
            });
            req.on('error', () => resolve(null));
            req.setTimeout(1000, () => {
              req.destroy();
              resolve(null);
            });
          });
          
          if (healthCheck === 200) {
            serverReady = true;
            console.log('Server is ready');
            resolve();
            return;
          }
        } catch (e) {
          // Continue trying
        }
        
        attempts++;
        await new Promise(r => setTimeout(r, 500));
      }
      
      // If we get here, assume server started (might be a false positive, but tests will fail if not)
      console.log('Assuming server is ready (health check inconclusive)');
      serverReady = true;
      resolve();
    }, 2000);
  });
}

/**
 * Stop the webhook server
 */
function stopServer() {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill();
    serverProcess = null;
    serverReady = false;
  }
}

/**
 * Make HTTP request to webhook
 */
function makeRequest(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: TEST_TIMEOUT
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.write(data);
    req.end();
  });
}

/**
 * Test helper: Invoke handler directly (alternative approach)
 */
async function testDirect() {
  console.log('\n=== Testing with direct handler invocation ===\n');
  
  // Mock request/response objects
  function createMockReqRes(payload) {
    const req = {
      body: payload,
      query: {},
      headers: {},
      path: '/'
    };
    
    let resStatus = 200;
    let resBody = null;
    const res = {
      status: (code) => {
        resStatus = code;
        return res;
      },
      json: (body) => {
        resBody = body;
      }
    };
    
    return { req, res, getStatus: () => resStatus, getBody: () => resBody };
  }
  
  // Import the handler - we need to extract it
  // Since the handler is exported via functions.http, we'll test via HTTP instead
  // For now, let's use the HTTP approach which is more realistic
  return false; // Signal to use HTTP tests
}

/**
 * Run a test case
 */
async function runTest(name, payload, assertions) {
  console.log(`\n--- Test: ${name} ---`);
  
  try {
    // Wait a bit for server to be ready
    let attempts = 0;
    while (!serverReady && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    const response = await makeRequest(payload);
    
    console.log(`Status: ${response.status}`);
    console.log(`Response keys: ${Object.keys(response.body || {}).join(', ')}`);
    
    // Run assertions
    if (assertions.status !== undefined) {
      assert.strictEqual(response.status, assertions.status, `Expected status ${assertions.status}, got ${response.status}`);
    }
    
    if (assertions.hasFulfillmentResponse) {
      assert(response.body.fulfillment_response, 'Response should have fulfillment_response');
      assert(response.body.fulfillment_response.messages, 'Response should have messages');
      assert(response.body.fulfillment_response.messages.length > 0, 'Should have at least one message');
      assert(response.body.fulfillment_response.messages[0].text, 'Message should have text');
      assert(response.body.fulfillment_response.messages[0].text.text, 'Message should have text.text array');
      assert(response.body.fulfillment_response.messages[0].text.text.length > 0, 'Should have at least one text message');
      const question = response.body.fulfillment_response.messages[0].text.text[0];
      assert(question.length > 0, 'Question should not be empty');
      console.log(`Question: ${question.substring(0, 60)}...`);
    }
    
    if (assertions.hasSessionInfo) {
      assert(response.body.session_info, 'Response should have session_info');
      assert(response.body.session_info.parameters, 'Response should have parameters');
    }
    
    if (assertions.checkParameters) {
      assertions.checkParameters(response.body.session_info?.parameters || {});
    }
    
    if (assertions.checkQuestion) {
      const question = response.body.fulfillment_response?.messages?.[0]?.text?.text?.[0];
      assertions.checkQuestion(question);
    }
    
    console.log(`✓ ${name} passed`);
    return true;
  } catch (error) {
    console.error(`✗ ${name} failed:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

/**
 * Main test suite
 */
async function runTests() {
  console.log('Dialogflow CX Webhook Test Suite');
  console.log('================================');
  
  const results = {
    passed: 0,
    failed: 0
  };
  
  try {
    // Start server
    await startServer();
    
    // Wait a bit more for server to be fully ready
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 1: Intro to Interview - should resolve tag and return question
    const test1Passed = await runTest(
      'Intro to Interview - resolves tag and returns question',
      payloads.intro,
      {
        status: 200,
        hasFulfillmentResponse: true,
        hasSessionInfo: true,
        checkParameters: (params) => {
          assert(params.major === 'Computer Science', 'Major should be preserved');
          assert(params.asked_questions, 'Should track asked_questions');
          assert(Array.isArray(params.asked_questions), 'asked_questions should be array');
          assert(params.asked_questions.length > 0, 'Should have at least one asked question');
          assert(params.next_page, 'Should have next_page');
          assert(params.section_question_count, 'Should have section_question_count');
          // Should not have "Unknown tag" - resolver should work
          console.log('  ✓ Parameters validated');
        },
        checkQuestion: (question) => {
          assert(question && question.length > 0, 'Question should exist and not be empty');
          assert(!question.includes('error'), 'Question should not contain error message');
        }
      }
    );
    if (test1Passed) results.passed++; else results.failed++;
    
    // Test 2: With progress - should use next_page and update counts
    const test2Passed = await runTest(
      'With progress - uses next_page and updates counts',
      payloads.withProgress,
      {
        status: 200,
        hasFulfillmentResponse: true,
        hasSessionInfo: true,
        checkParameters: (params) => {
          assert(params.major === 'Cybersecurity', 'Major should be preserved');
          assert(Array.isArray(params.completed_sections), 'completed_sections should be array');
          assert(params.section_question_count, 'Should have section_question_count');
          assert(params.asked_questions.length >= 2, 'Should have previous questions');
          console.log('  ✓ Progress tracking validated');
        }
      }
    );
    if (test2Passed) results.passed++; else results.failed++;
    
    // Test 3: Missing major - should prompt for major and not advance state
    const test3Passed = await runTest(
      'Missing major - prompts for major and does not advance state',
      payloads.missingMajor,
      {
        status: 200,
        hasFulfillmentResponse: true,
        hasSessionInfo: true,
        checkQuestion: (question) => {
          assert(question && question.toLowerCase().includes('major'), 'Should ask about major');
        },
        checkParameters: (params) => {
          // State should not advance - no new asked_questions
          const askedCount = (params.asked_questions || []).length;
          assert(askedCount === 0, 'Should not add questions when major is missing');
          console.log('  ✓ State preservation validated');
        }
      }
    );
    if (test3Passed) results.passed++; else results.failed++;
    
    // Test 4: Health endpoint
    try {
      const healthResponse = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${PORT}/health`, (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(body) });
            } catch (e) {
              resolve({ status: res.statusCode, body: body });
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(TEST_TIMEOUT, () => {
          req.destroy();
          reject(new Error('Health check timeout'));
        });
      });
      
      assert.strictEqual(healthResponse.status, 200, 'Health endpoint should return 200');
      assert(healthResponse.body.status === 'ok', 'Health endpoint should return {status:"ok"}');
      console.log('\n--- Test: Health endpoint ---');
      console.log('✓ Health endpoint passed');
      results.passed++;
    } catch (error) {
      console.log('\n--- Test: Health endpoint ---');
      console.error('✗ Health endpoint failed:', error.message);
      results.failed++;
    }
    
  } catch (error) {
    console.error('Test suite error:', error);
    results.failed++;
  } finally {
    // Stop server
    stopServer();
  }
  
  // Print summary
  console.log('\n================================');
  console.log('Test Summary:');
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Total:  ${results.passed + results.failed}`);
  console.log('================================\n');
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  runTests().catch((error) => {
    console.error('Fatal error:', error);
    stopServer();
    process.exit(1);
  });
}

module.exports = { runTests, makeRequest, startServer, stopServer };

