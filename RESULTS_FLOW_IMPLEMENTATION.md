# Interview Results Flow Implementation

## Summary

Implemented a robust end-of-interview flow that reliably navigates to a Results screen and loads results even when:
- The ElevenLabs webhook is delayed
- The frontend does NOT have `conversation_id` immediately (SDK limitation)

Also cleaned up the deprecated `POST /api/save-interview` endpoint to only record client-side end state (webhook is source of truth for transcripts).

## Architecture

### Design Decision: Option 2 - Client Session ID Mapping

**Chosen Approach:** Use `sessionId` (client-generated, always available) as the primary lookup key, with mapping to `conversationId` when webhook arrives.

**Rationale:**
- `sessionId` is always available from interview start
- `conversationId` may be missing or delayed (SDK limitation)
- Webhook provides `conversation_id` but may arrive late

### Identifier Flow

```
Frontend (start) → sessionId (always available)
Frontend (end) → sessionId + conversationId (if available)
Backend (save-interview) → Creates/updates interview_sessions record
Webhook (arrives) → Links conversation_id to session via:
  1. Direct match by conversation_id
  2. Time window matching (user_id + agent_id + last 10 min)
  3. Creates fallback session if no match
Frontend (results) → Polls by sessionId → Gets interviewId → Fetches results
```

## Files Changed

### Backend

1. **`backend/shared/schema.ts`**
   - Added `interview_sessions` table schema
   - Fields: `id`, `userId`, `agentId`, `clientSessionId` (unique), `conversationId` (unique, nullable), `interviewId` (FK), `status`, `endedBy`, timestamps

2. **`backend/server/routes.ts`**
   - **Repurposed `POST /api/save-interview`:**
     - Now uses Bearer token auth (not x-api-secret)
     - Accepts: `client_session_id`, `conversation_id` (optional), `ended_by`, `agent_id`
     - Creates/updates `interview_sessions` record
     - Updates `interviews` table if `conversation_id` provided and interview exists
     - Idempotent and safe to call before webhook arrives
     - Removed transcript fetching logic (webhook is source of truth)
   
   - **Added `GET /api/interviews/by-session/:sessionId`:**
     - Returns: `interviewId`, `conversationId`, `status`, `evaluationStatus`
     - Returns `interviewId: null` if webhook hasn't arrived yet
     - Auth protected (Bearer token)
   
   - **Updated `/webhooks/elevenlabs` handler:**
     - After saving interview, links to `interview_sessions` record
     - Tries direct match by `conversation_id` first
     - Falls back to time window matching (user_id + agent_id + last 10 min)
     - Creates fallback session if no match found

3. **`backend/scripts/setup-db.ts`**
   - Added `interview_sessions` table creation SQL
   - Added indexes: `user_id`, `client_session_id`, `conversation_id`, `status`

### Frontend

1. **`frontend/src/components/VoiceInterviewWebSocket.tsx`**
   - Updated `saveInterview()`:
     - Now accepts `endedBy` parameter ('user' | 'disconnect')
     - Sends `client_session_id` (always), `conversation_id` (optional)
     - Uses Bearer token auth
     - Always calls endpoint (even if conversationId is null)
   
   - Updated `handleDisconnect()`:
     - Calls `saveInterview()` with 'disconnect'
     - Passes `sessionId` and `conversationId` to `onComplete()`
   
   - Updated `handleEndInterview()`:
     - Calls `saveInterview()` with 'user'
     - Passes `sessionId` and `conversationId` to `onComplete()`

2. **`frontend/src/pages/Index.tsx`**
   - Updated `handleCompleteInterview()`:
     - Navigates to `/results?sessionId=...&conversationId=...` instead of going back to roles
     - Uses `voiceSessionId` or `results.sessionId`

3. **`frontend/src/pages/Results.tsx`** (NEW)
   - New Results page component
   - Three-phase polling:
     1. **Phase 1:** Poll `GET /api/interviews/by-session/:sessionId` for `interviewId` (1s intervals, 60s max)
     2. **Phase 2:** Fetch `GET /api/interviews/:id/results`
     3. **Phase 3:** If evaluation pending, poll results endpoint (2s intervals, 60s max)
   - UI states: "Saving your interview...", "Generating your feedback...", results display
   - Error handling with retry button
   - Displays transcript and evaluation results

4. **`frontend/src/App.tsx`**
   - Added `/results` route

## API Endpoints

### POST /api/save-interview

**Authentication:** Bearer token

**Request:**
```json
{
  "client_session_id": "uuid",
  "conversation_id": "string (optional)",
  "ended_by": "user" | "disconnect",
  "agent_id": "string (optional)"
}
```

**Response:**
```json
{
  "success": true
}
```

**Behavior:**
- Creates/updates `interview_sessions` record
- Updates `interviews` table if `conversation_id` provided and interview exists
- Idempotent (safe to call multiple times)

### GET /api/interviews/by-session/:sessionId

**Authentication:** Bearer token

**Response:**
```json
{
  "interviewId": "uuid" | null,
  "conversationId": "string" | null,
  "status": "completed" | "ended_pending_webhook",
  "evaluationStatus": "pending" | "complete" | "failed" | null
}
```

**Behavior:**
- Returns `interviewId: null` if webhook hasn't arrived yet
- Frontend polls this endpoint until `interviewId` is available

### GET /api/interviews/:id/results

**Authentication:** Bearer token

**Response:** (unchanged)
```json
{
  "interview": { ... },
  "evaluation": { ... },
  "metadata": { ... }
}
```

## Database Schema

### interview_sessions Table

```sql
CREATE TABLE interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  client_session_id TEXT NOT NULL UNIQUE,
  conversation_id TEXT UNIQUE,
  interview_id UUID REFERENCES interviews(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'started',
  ended_by TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  client_ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON interview_sessions(user_id);
CREATE INDEX idx_sessions_client_session_id ON interview_sessions(client_session_id);
CREATE INDEX idx_sessions_conversation_id ON interview_sessions(conversation_id);
CREATE INDEX idx_sessions_status ON interview_sessions(status);
```

## Testing

### Manual Test Steps

1. **Start Interview:**
   - Upload resume, select role, start interview
   - Verify `sessionId` is generated and stored

2. **End Interview (User Click):**
   - Click "End Interview" button
   - Verify frontend calls `POST /api/save-interview` with `ended_by: 'user'`
   - Verify navigation to `/results?sessionId=...`

3. **End Interview (Disconnect):**
   - Close browser tab or disconnect network
   - Verify `handleDisconnect` calls `POST /api/save-interview` with `ended_by: 'disconnect'`

4. **Results Page:**
   - Verify "Saving your interview..." message appears
   - Wait for webhook (or simulate delay)
   - Verify "Generating your feedback..." appears when interviewId found
   - Verify results display when evaluation completes

5. **Webhook Delay Scenario:**
   - End interview before webhook arrives
   - Verify Results page polls for `interviewId`
   - Verify results appear when webhook arrives

6. **Missing conversationId Scenario:**
   - Force `conversationId` to be null in frontend
   - Verify `save-interview` still succeeds
   - Verify webhook links session via time window matching

### Simulate Webhook Delay (Dev Only)

Add to `.env`:
```
SIMULATE_WEBHOOK_DELAY_MS=5000
```

Then add delay in webhook handler (for testing only):
```typescript
if (process.env.SIMULATE_WEBHOOK_DELAY_MS) {
  await new Promise(resolve => setTimeout(resolve, parseInt(process.env.SIMULATE_WEBHOOK_DELAY_MS)));
}
```

## Identifier Flow End-to-End

```
1. Frontend: User starts interview
   → sessionId generated (always available)
   → Stored in state + localStorage

2. Frontend: SDK starts session
   → conversationId returned (may be null)
   → Stored in state

3. Frontend: User ends interview
   → Calls POST /api/save-interview
   → Payload: { client_session_id: sessionId, conversation_id: conversationId (optional), ended_by: 'user'|'disconnect' }
   → Backend creates/updates interview_sessions record

4. Backend: Webhook arrives (may be delayed)
   → Saves transcript to interviews table
   → Links conversation_id to interview_sessions:
     a) Direct match by conversation_id
     b) Time window match (user_id + agent_id + last 10 min)
     c) Creates fallback session if no match
   → Sets interviewId in interview_sessions

5. Frontend: Results page loads
   → Polls GET /api/interviews/by-session/:sessionId
   → Gets interviewId when webhook arrives
   → Fetches GET /api/interviews/:id/results
   → Polls for evaluation completion
   → Displays results
```

## Key Features

✅ **Reliable Navigation:** Always navigates to Results page, even if webhook delayed  
✅ **Works Without conversationId:** Uses sessionId as primary key  
✅ **Idempotent:** Safe to call save-interview multiple times  
✅ **Webhook is Source of Truth:** No transcript fetching in save-interview  
✅ **Time Window Matching:** Handles cases where conversation_id not set in session  
✅ **Polling with Timeouts:** Prevents infinite polling  
✅ **Error Handling:** Retry button on timeout  
✅ **UI States:** Clear feedback during saving/evaluating  

## Migration Notes

1. **Run database setup:**
   ```bash
   cd backend
   tsx scripts/setup-db.ts
   ```

2. **No breaking changes:** Existing webhook flow continues to work

3. **Frontend routing:** New `/results` route added

4. **Backward compatibility:** Old `POST /api/save-interview` calls will fail (now requires Bearer token instead of x-api-secret)

