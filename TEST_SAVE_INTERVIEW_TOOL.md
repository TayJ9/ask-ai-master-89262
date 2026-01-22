# Testing SaveInterviewResults Tool

This guide explains how to test the `SaveInterviewResults` tool configuration using the test script.

## Quick Start

### 1. Set Environment Variables

Create a `.env` file in the `backend` directory or export these variables:

```bash
# Required
export API_BASE_URL="https://ask-ai-master-89262-production.up.railway.app"
export ELEVENLABS_API_KEY="sk_live_your_key_here"

# Optional
export TEST_USER_ID="your-user-uuid-here"  # Will generate a random UUID if not set
```

### 2. Run the Test Script

```bash
cd backend
node test-save-interview-tool.js
```

## What the Test Script Does

The test script simulates exactly what the ElevenLabs `SaveInterviewResults` tool should do:

1. **Sends a POST request** to `/webhooks/elevenlabs`
2. **Includes `x-api-secret` header** with your `ELEVENLABS_API_KEY`
3. **Sends a complete payload** with:
   - `conversation_id` (generated test ID)
   - `transcript` (sample Q&A pairs)
   - `user_id` (from env or generated)
   - `agent_id`, `status`, `duration`, timestamps

## Expected Output

### ✅ Success Output

```
🧪 Testing SaveInterviewResults Tool Call

API Base URL: https://ask-ai-master-89262-production.up.railway.app
Test User ID: abc123...
Using API Key: sk_live_...

📤 Sending tool call to /webhooks/elevenlabs...
   Conversation ID: test-conv-1234567890-abc12345
   Transcript length: 1234 chars
   User ID: abc123...
   Agent ID: agent_8601kavsezrheczradx9qmz8qp3e

📥 Response Status: 200 OK
📥 Response Body: {
  "success": true,
  "interviewId": "xyz-789-..."
}

✅ Tool call SUCCESSFUL!
   Interview ID: xyz-789-...

🔍 Next Steps:
   1. Check Railway logs for: [WEBHOOK] Tool call verified
   2. Check Railway logs for: [SAVE-INTERVIEW] Successfully saved transcript
   3. Check Railway logs for: [SAVE-INTERVIEW] Evaluation enqueued
   4. Wait 10-30 seconds for evaluation to complete
   5. Test results endpoint: GET .../api/interviews/xyz-789-.../results

⏳ Waiting 3 seconds, then checking evaluation status...

✅ Test completed successfully!
   Check Railway logs to verify:
   - Transcript was saved
   - Evaluation was enqueued
   - Evaluation completed (check logs after 10-30 seconds)
```

### ❌ Error Output Examples

#### Authentication Error (401)
```
❌ Tool call FAILED!
   Status: 401
   Error: { "error": "Unauthorized: Invalid API secret" }

💡 Troubleshooting:
   - Check that x-api-secret header matches ELEVENLABS_API_KEY
   - Verify ELEVENLABS_API_KEY is set correctly in Railway
```

#### Missing Field Error (400)
```
❌ Tool call FAILED!
   Status: 400
   Error: { "error": "Missing conversation_id" }

💡 Troubleshooting:
   - Check that all required fields are present in payload
   - Verify conversation_id and user_id are valid
```

## What to Check in Railway Logs

After running the test, check your Railway logs for these messages (in order):

### 1. Authentication ✅
```
[WEBHOOK] Detected tool call (x-api-secret header present, no HMAC signature)
[WEBHOOK] Verifying x-api-secret...
[WEBHOOK] ✅ Tool call verified via x-api-secret
```

### 2. Request Received ✅
```
[WEBHOOK] 📥 Received ElevenLabs webhook
[WEBHOOK] 📋 Request body fields: { hasConversationId: true, hasTranscript: true, ... }
[WEBHOOK] ✅ Required fields validated
```

### 3. Interview Saved ✅
```
[WEBHOOK] ✅ Interview saved successfully
[WEBHOOK] Interview ID: xyz-789-...
```

### 4. Transcript Saved ✅
```
[SAVE-INTERVIEW] Successfully saved transcript from tool (1234 chars) for interview xyz-789-...
```

### 5. Evaluation Enqueued ✅
```
[WEBHOOK] 🔄 Enqueuing evaluation for interview xyz-789-...
[WEBHOOK] ✅ Successfully enqueued evaluation
[EVALUATION] 🔄 Enqueue request received
[EVALUATION] ✅ Created pending evaluation record
[EVALUATION] 📥 Enqueued evaluation job
```

### 6. Evaluation Processing ✅
```
[EVALUATION] 🎯 Starting evaluation job
[EVALUATION] 📊 Starting evaluation process
[EVALUATION] ✅ Parsed transcript
[EVALUATION] 🤖 Generating evaluation using OpenAI...
[EVALUATION] ✅ Evaluation generated
[EVALUATION] ✅ Saved evaluation
```

## Troubleshooting

### Test Script Can't Connect

**Error**: `Network Error: fetch failed`

**Solutions**:
- Check `API_BASE_URL` is correct (should be your Railway backend URL)
- Verify backend is running and accessible
- Check network connectivity

### Authentication Fails

**Error**: `401 Unauthorized: Invalid API secret`

**Solutions**:
- Verify `ELEVENLABS_API_KEY` matches the value in Railway
- Check that the key starts with `sk_live_` or `sk_`
- Ensure no extra spaces or newlines in the key

### Missing Fields Error

**Error**: `400 Missing conversation_id` or `Missing user_id`

**Solutions**:
- The test script should include all fields - this shouldn't happen
- If it does, check the script is up to date

### Evaluation Not Starting

**Check Railway logs for**:
- `[EVALUATION] Enqueue request received` - Should appear
- `[EVALUATION] ✅ Created pending evaluation record` - Should appear
- `[EVALUATION] 🎯 Starting evaluation job` - Should appear within seconds

**If evaluation doesn't start**:
- Check for errors in logs
- Verify transcript has Q&A pairs (should see `qaPairsCount: X` in logs)
- Check database connection

## Testing with Real ElevenLabs Tool

After the test script works, test with the actual ElevenLabs tool:

1. **Start a real interview** in your application
2. **Complete the interview** (let it end naturally or click "End Interview")
3. **Watch Railway logs** in real-time
4. **Verify the same log messages appear** as in the test script

## Next Steps

Once the test script passes:

1. ✅ Verify tool configuration in ElevenLabs dashboard
2. ✅ Test with a real interview
3. ✅ Monitor Railway logs during real interview
4. ✅ Verify frontend shows results automatically

## Additional Debugging

### Check Database Directly

You can query the database to verify:

```sql
-- Check if interview was created
SELECT id, "conversationId", status, "transcript" IS NOT NULL as has_transcript
FROM interviews
WHERE "conversationId" = 'test-conv-...'
ORDER BY "createdAt" DESC
LIMIT 1;

-- Check if evaluation was created
SELECT id, status, "overallScore", "createdAt", "updatedAt"
FROM interview_evaluations
WHERE "interviewId" = 'xyz-789-...';
```

### Check Evaluation Status via API

After running the test, you can check evaluation status:

```bash
# Replace INTERVIEW_ID with the ID from test output
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://ask-ai-master-89262-production.up.railway.app/api/interviews/INTERVIEW_ID/results
```

---

**Note**: The test script uses a sample transcript with Q&A pairs. In production, the ElevenLabs agent should extract the actual conversation transcript.
