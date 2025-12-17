/**
 * Test script for ElevenLabs webhook HMAC signature verification
 * 
 * Usage:
 *   node test-webhook-signature.js
 * 
 * Set ELEVENLABS_WEBHOOK_SECRET environment variable before running
 */

import { createHmac } from 'crypto';

const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET || 'test-secret-key';

function verifyElevenLabsSignature(signatureHeader, rawBody, secret) {
  if (!signatureHeader) {
    return { valid: false, reason: 'Missing elevenlabs-signature header' };
  }

  // Parse signature header: t=timestamp,v0=hash
  const parts = signatureHeader.split(',');
  let timestamp = null;
  let hash = null;

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') {
      timestamp = parseInt(value, 10);
    } else if (key === 'v0') {
      hash = value;
    }
  }

  if (!timestamp || !hash) {
    return { valid: false, reason: 'Malformed signature header (missing t or v0)' };
  }

  // Check timestamp tolerance (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;
  const MAX_AGE_SECONDS = 5 * 60; // 5 minutes

  if (age > MAX_AGE_SECONDS) {
    return { valid: false, reason: `Timestamp too old (${age}s ago, max ${MAX_AGE_SECONDS}s)`, timestamp };
  }

  if (age < -MAX_AGE_SECONDS) {
    return { valid: false, reason: `Timestamp too far in future (${-age}s ahead)`, timestamp };
  }

  // Compute expected hash
  const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const payload = `${timestamp}.${bodyString}`;
  const expectedHash = createHmac('sha256', secret).update(payload).digest('hex');

  // Constant-time comparison
  if (hash.length !== expectedHash.length) {
    return { valid: false, reason: 'Hash length mismatch', timestamp };
  }

  let match = 0;
  for (let i = 0; i < hash.length; i++) {
    match |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }

  if (match !== 0) {
    return { valid: false, reason: 'Hash mismatch', timestamp };
  }

  return { valid: true, timestamp };
}

function generateSignature(rawBody, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${timestamp}.${rawBody}`;
  const hash = createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v0=${hash}`;
}

// Test cases
console.log('🧪 Testing ElevenLabs Webhook Signature Verification\n');
console.log(`Using secret: ${WEBHOOK_SECRET.substring(0, 8)}...\n`);

// Test 1: Valid signature
console.log('Test 1: Valid signature');
const testBody = JSON.stringify({
  conversation_id: 'test-conv-123',
  transcript: 'Test transcript',
  user_id: 'user-123',
});
const validSignature = generateSignature(testBody, WEBHOOK_SECRET);
const result1 = verifyElevenLabsSignature(validSignature, testBody, WEBHOOK_SECRET);
console.log(`  Signature: ${validSignature}`);
console.log(`  Result: ${result1.valid ? '✅ PASS' : '❌ FAIL'} - ${result1.reason || 'Valid'}\n`);

// Test 2: Invalid hash
console.log('Test 2: Invalid hash');
const invalidSignature = validSignature.replace('v0=', 'v0=invalidhash');
const result2 = verifyElevenLabsSignature(invalidSignature, testBody, WEBHOOK_SECRET);
console.log(`  Signature: ${invalidSignature}`);
console.log(`  Result: ${result2.valid ? '❌ FAIL' : '✅ PASS'} - ${result2.reason}\n`);

// Test 3: Missing signature
console.log('Test 3: Missing signature');
const result3 = verifyElevenLabsSignature(undefined, testBody, WEBHOOK_SECRET);
console.log(`  Result: ${result3.valid ? '❌ FAIL' : '✅ PASS'} - ${result3.reason}\n`);

// Test 4: Malformed signature
console.log('Test 4: Malformed signature');
const result4 = verifyElevenLabsSignature('invalid-format', testBody, WEBHOOK_SECRET);
console.log(`  Result: ${result4.valid ? '❌ FAIL' : '✅ PASS'} - ${result4.reason}\n`);

// Test 5: Old timestamp
console.log('Test 5: Old timestamp (6 minutes ago)');
const oldTimestamp = Math.floor(Date.now() / 1000) - (6 * 60);
const oldPayload = `${oldTimestamp}.${testBody}`;
const oldHash = createHmac('sha256', WEBHOOK_SECRET).update(oldPayload).digest('hex');
const oldSignature = `t=${oldTimestamp},v0=${oldHash}`;
const result5 = verifyElevenLabsSignature(oldSignature, testBody, WEBHOOK_SECRET);
console.log(`  Signature: ${oldSignature}`);
console.log(`  Result: ${result5.valid ? '❌ FAIL' : '✅ PASS'} - ${result5.reason}\n`);

// Test 6: Future timestamp
console.log('Test 6: Future timestamp (6 minutes ahead)');
const futureTimestamp = Math.floor(Date.now() / 1000) + (6 * 60);
const futurePayload = `${futureTimestamp}.${testBody}`;
const futureHash = createHmac('sha256', WEBHOOK_SECRET).update(futurePayload).digest('hex');
const futureSignature = `t=${futureTimestamp},v0=${futureHash}`;
const result6 = verifyElevenLabsSignature(futureSignature, testBody, WEBHOOK_SECRET);
console.log(`  Signature: ${futureSignature}`);
console.log(`  Result: ${result6.valid ? '❌ FAIL' : '✅ PASS'} - ${result6.reason}\n`);

console.log('✅ All tests completed!');

