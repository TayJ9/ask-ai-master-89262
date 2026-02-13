# ElevenLabs Tool Configuration Guide

## Summary of Backend Changes

✅ **Backend is now ready to accept tool calls!**

1. **`/webhooks/elevenlabs` endpoint** now accepts:
   - Automatic webhooks (with HMAC signature) - original behavior
   - Tool calls (with `x-api-secret` header) - NEW!

2. **`/api/save-interview` endpoint** now accepts:
   - `transcript` field in the request body - NEW!
   - If transcript is provided, it's saved immediately and evaluation is triggered

3. **Frontend polling** now handles:
   - Null evaluation state (starts polling immediately)
   - Better logging for debugging

---

## ElevenLabs Configuration Steps

### Option 1: Configure `SaveInterviewResults` Tool (Recommended)

The `SaveInterviewResults` tool should call **`/webhooks/elevenlabs`** with the transcript data.

#### Step 1: Update Tool URL

1. Go to ElevenLabs Dashboard → Your Agent → Tools tab
2. Find the `SaveInterviewResults` tool
3. Update the **URL** to:
   ```
   https://ask-ai-master-89262-production.up.railway.app/webhooks/elevenlabs
   ```
   (Replace with your actual Railway backend URL if different)

#### Step 2: Add Authentication Header

1. In the **Headers** section of the tool configuration
2. Add a new header:
   - **Type**: `Value`
   - **Name**: `x-api-secret`
   - **Value**: `[Your ELEVENLABS_API_KEY from Railway]`
     - This is the same value as your `ELEVENLABS_API_KEY` environment variable
     - Example: `sk_live_abc123def456...`

#### Step 3: Configure Body Parameters

The tool needs to send the following data in the request body. Add these as **Body Parameters**:

1. **`conversation_id`** (String, Required)
   - **Value Type**: `Dynamic Variable`
   - **Variable Name**: `conversation_id`
   - **Description**: "The ElevenLabs conversation ID"

2. **`transcript`** (String, Required)
   - **Value Type**: `Dynamic Variable` or `LLM Extracted`
   - **Variable Name**: `transcript`
   - **Description**: "The full interview transcript text. Extract this from the conversation history."

3. **`user_id`** (String, Required)
   - **Value Type**: `Dynamic Variable`
   - **Variable Name**: `candidate_id`
   - **Description**: "The candidate/user ID"

4. **`agent_id`** (String, Optional)
   - **Value Type**: `Constant Value`
   - **Constant Value**: `agent_8601kavsezrheczradx9qmz8qp3e`
   - **Description**: "The ElevenLabs agent ID"

5. **`status`** (String, Required)
   - **Value Type**: `Constant Value`
   - **Constant Value**: `completed`
   - **Description**: "Interview completion status"

6. **`year`** (String, Optional)
   - **Value Type**: `Dynamic Variable`
   - **Variable Name**: `year`
   - **Description**: "Academic level (Freshman, Sophomore, Junior, Senior, etc.) - used for question tailoring and evaluation context"

7. **`duration`** (Number, Optional)
   - **Value Type**: `LLM Extracted` or `Dynamic Variable`
   - **Description**: "Interview duration in seconds"

8. **`started_at`** (String, Optional)
   - **Value Type**: `LLM Extracted` or `Dynamic Variable`
   - **Description**: "ISO 8601 timestamp when interview started"

9. **`ended_at`** (String, Optional)
   - **Value Type**: `LLM Extracted` or `Dynamic Variable`
   - **Description**: "ISO 8601 timestamp when interview ended"

#### Step 4: Configure Tool Description

Update the tool description to instruct the LLM to extract the transcript:

```
Call this tool immediately after the interview concludes to save the transcript, analysis, and interview details to the database. 

IMPORTANT: Extract the full conversation transcript from the conversation history. The transcript should include all questions asked by the interviewer and all answers provided by the candidate, formatted clearly with speaker labels (e.g., "Interviewer: ..." and "Candidate: ...").

Required data:
- conversation_id: The current conversation ID
- transcript: The full interview transcript (extract from conversation history)
- user_id: The candidate ID (from dynamic variables)
- status: Always "completed"
```

---

### Option 2: Alternative - Use `/api/save-interview` Endpoint

If you prefer to use the `/api/save-interview` endpoint instead:

1. **URL**: `https://ask-ai-master-89262-production.up.railway.app/api/save-interview`
2. **Headers**:
   - `Content-Type`: `application/json`
   - `Authorization`: `Bearer [JWT_TOKEN]` (requires authentication)
3. **Body Parameters**:
   - `client_session_id` (String, Required)
   - `conversation_id` (String, Optional)
   - `transcript` (String, Optional) - NEW! Can be provided here
   - `ended_by` (String, Optional): `"user"` or `"disconnect"`
   - `agent_id` (String, Optional)

**Note**: This endpoint requires JWT authentication, which is more complex for tool calls. Option 1 (using `/webhooks/elevenlabs`) is recommended.

---

## Testing the Configuration

After configuring the tool:

1. **Start a test interview** in your application
2. **Complete the interview** (click "End Interview")
3. **Check Railway logs** for:
   - `[WEBHOOK] Tool call verified via x-api-secret`
   - `[WEBHOOK] Received ElevenLabs webhook`
   - `[SAVE-INTERVIEW] Successfully saved transcript from tool`
   - `[SAVE-INTERVIEW] Evaluation enqueued`

4. **Check the frontend** - Results page should:
   - Show "Processing Analysis" immediately
   - Automatically update when evaluation completes
   - Display full results without refresh

---

## Troubleshooting

### Tool call not working?

1. **Check Railway logs** for authentication errors:
   - `Invalid x-api-secret` → Verify the API key in the header matches `ELEVENLABS_API_KEY`
   - `Missing conversation_id` → Ensure the tool is sending this field

2. **Transcript not being saved?**
   - Check if `transcript` parameter is configured in the tool
   - Verify the LLM is extracting the transcript from conversation history
   - Check Railway logs for: `[SAVE-INTERVIEW] Successfully saved transcript from tool`

3. **Evaluation not starting?**
   - Check if transcript has Q&A pairs (logs will show: `Transcript has X Q&A pairs`)
   - Verify evaluation queue is running (check for: `Evaluation enqueued`)

### Still using automatic webhooks?

If ElevenLabs supports automatic webhooks (not just tools), you can configure:
- **Webhook URL**: `https://ask-ai-master-89262-production.up.railway.app/webhooks/elevenlabs`
- **Webhook Secret**: Set `ELEVENLABS_WEBHOOK_SECRET` in Railway to match

The backend supports both methods simultaneously!

---

## Next Steps

1. ✅ Configure the `SaveInterviewResults` tool as described above
2. ✅ Test with a real interview
3. ✅ Monitor Railway logs for successful transcript saving
4. ✅ Verify frontend shows results automatically

If you encounter any issues, check the Railway logs for detailed error messages.
