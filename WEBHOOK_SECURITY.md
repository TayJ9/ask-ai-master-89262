# ElevenLabs Webhook HMAC Security Implementation

## Summary

Secured the `/webhooks/elevenlabs` endpoint with HMAC signature verification per ElevenLabs webhook security requirements.

## Changes Made

### 1. `backend/server/index.ts`
- Added `express.raw()` middleware for `/webhooks/elevenlabs` route to capture raw body before JSON parsing
- This ensures we have access to the exact raw body bytes for HMAC verification

**Key Code:**
```typescript
// Apply raw body parser for webhook route (for HMAC verification)
// Must be before JSON parser so webhook route gets raw body
app.use('/webhooks/elevenlabs', express.raw({ type: 'application/json', limit: '50mb' }));
```

### 2. `backend/server/routes.ts`
- Added `createHmac` import from `crypto`
- Implemented `verifyElevenLabsSignature()` function with:
  - Signature header parsing (`t=timestamp,v0=hash`)
  - Timestamp tolerance check (5 minutes)
  - HMAC-SHA256 verification using raw body
  - Constant-time comparison to prevent timing attacks
- Updated webhook handler to:
  - Verify signature before processing
  - Parse JSON manually after verification
  - Log verification results (without secrets)

**Key Code:**
```typescript
function verifyElevenLabsSignature(
  signatureHeader: string | undefined,
  rawBody: string | Buffer,
  secret: string
): { valid: boolean; reason?: string; timestamp?: number }
```

### 3. `backend/test-webhook-signature.js`
- Created test script to validate signature verification
- Tests valid signatures, invalid hashes, missing signatures, malformed headers, and timestamp validation

## Environment Variable Required

Add to Railway environment variables:
```
ELEVENLABS_WEBHOOK_SECRET=<your-webhook-secret-from-elevenlabs>
```

## Security Features

1. **HMAC-SHA256 Verification**: Validates webhook authenticity
2. **Timestamp Tolerance**: Prevents replay attacks (5-minute window)
3. **Constant-Time Comparison**: Prevents timing attacks
4. **Raw Body Verification**: Uses exact bytes received (before JSON parsing)
5. **Error Logging**: Logs verification failures without exposing secrets

## Signature Format

ElevenLabs sends signature header as:
```
elevenlabs-signature: t=1234567890,v0=abc123...
```

Where:
- `t` = Unix timestamp (seconds)
- `v0` = HMAC-SHA256 hex digest of `${timestamp}.${rawBody}`

## Verification Flow

```
1. Receive webhook request
2. Extract `elevenlabs-signature` header
3. Parse timestamp and hash from header
4. Check timestamp is within 5 minutes
5. Compute HMAC-SHA256(`${timestamp}.${rawBody}`)
6. Compare computed hash with received hash (constant-time)
7. If valid → Process webhook
8. If invalid → Return 401 Unauthorized
```

## Testing

Run the test script:
```bash
cd backend
ELEVENLABS_WEBHOOK_SECRET=test-secret-key node test-webhook-signature.js
```

## Expected Logs

**Valid Signature:**
```
[WEBHOOK] Signature verified successfully { conversation_id: '...', timestamp: 1234567890 }
[WEBHOOK] Received ElevenLabs webhook
```

**Invalid Signature:**
```
[WEBHOOK] Invalid signature: Hash mismatch { hasSignature: true, timestamp: 1234567890 }
```

## Deployment Checklist

- [ ] Add `ELEVENLABS_WEBHOOK_SECRET` to Railway environment variables
- [ ] Configure webhook secret in ElevenLabs dashboard
- [ ] Deploy backend changes
- [ ] Test webhook with valid signature
- [ ] Verify 401 response for invalid signatures
- [ ] Check logs for verification messages

