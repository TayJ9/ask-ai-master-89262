# Interview Evaluation System

## Summary

Implemented an asynchronous evaluation system that automatically processes interview transcripts after the ElevenLabs webhook saves them. The system generates per-question scores and an overall evaluation score.

## Architecture

### Data Model

**New Table: `interview_evaluations`**
- `id` (UUID, primary key)
- `interview_id` (UUID, FK to interviews)
- `status` (text: pending/complete/failed)
- `overall_score` (integer, 0-100)
- `evaluation_json` (JSONB with full evaluation data)
- `error` (text, for failed evaluations)
- `created_at`, `updated_at` (timestamps)

**Indexes:**
- `interview_id` (for fast lookups)
- `status` (for filtering pending/failed jobs)

### Components

1. **Evaluation Queue** (`backend/server/evaluation.ts`)
   - In-process job queue with concurrency control (max 2 concurrent jobs)
   - Retry logic (3 retries with exponential backoff)
   - Idempotency (prevents duplicate evaluations)
   - Non-blocking (webhook returns immediately)

2. **Evaluation Logic** (`evaluateInterview()`)
   - Parses transcript into question-answer pairs
   - Handles multiple transcript formats (speaker labels, plain text)
   - Generates placeholder scores with deterministic logic
   - Saves evaluation JSON to database

3. **Webhook Integration** (`backend/server/routes.ts`)
   - Enqueues evaluation after saving interview
   - Handles duplicate webhook calls gracefully
   - Non-blocking (returns 200 immediately)

4. **Results API** (`GET /api/interviews/:id/results`)
   - Returns interview metadata + transcript
   - Returns evaluation status and payload (if ready)
   - Requires authentication (user can only see their own interviews)

## Evaluation Scoring Logic (Placeholder)

**Baseline Score:** 60 points

**Bonuses (+5 each, max +15):**
- Answer length > 100 chars: +5
- Contains numbers/metrics: +5
- Contains "I" + action verbs: +5

**Score Range:** 0-100 (capped)

**Strengths/Improvements:**
- Generated deterministically based on answer characteristics
- 1-2 strengths and 1-2 improvements per question

## Files Changed

### New Files
1. `backend/server/evaluation.ts` - Evaluation queue and logic
2. `backend/test-evaluation-flow.js` - Test script
3. `EVALUATION_SYSTEM.md` - This documentation

### Modified Files
1. `backend/shared/schema.ts` - Added `interview_evaluations` table
2. `backend/server/routes.ts` - Added evaluation enqueueing and results API
3. `backend/scripts/setup-db.ts` - Added table creation SQL

## Database Setup

Run the database setup script to create the new table:

```bash
cd backend
npm run setup-db
# or
tsx scripts/setup-db.ts
```

This creates:
- `interviews` table (if not exists)
- `interview_evaluations` table
- Indexes on `interview_id` and `status`

## API Endpoints

### GET /api/interviews/:id/results

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "interview": {
    "id": "uuid",
    "conversationId": "string",
    "agentId": "string",
    "transcript": "string",
    "durationSeconds": 180,
    "startedAt": "2024-01-01T00:00:00Z",
    "endedAt": "2024-01-01T00:03:00Z",
    "status": "completed",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "evaluation": {
    "status": "complete",
    "overallScore": 75,
    "evaluation": {
      "overall_score": 75,
      "questions": [
        {
          "question": "Tell me about yourself",
          "answer": "I'm a software engineer...",
          "score": 80,
          "strengths": ["Provided detailed response", "Used specific metrics"],
          "improvements": ["Consider providing more context"]
        }
      ]
    },
    "error": null,
    "createdAt": "2024-01-01T00:00:01Z",
    "updatedAt": "2024-01-01T00:00:05Z"
  },
  "metadata": {
    "userId": "uuid",
    "userEmail": "user@example.com"
  }
}
```

## Testing

### Test Script

Run the test script to simulate webhook -> evaluation flow:

```bash
cd backend
ELEVENLABS_WEBHOOK_SECRET=test-secret-key \
TEST_USER_ID=<your-user-uuid> \
API_BASE_URL=http://localhost:3000 \
node test-evaluation-flow.js
```

### Manual Testing

1. **Trigger Webhook:**
   ```bash
   curl -X POST http://localhost:3000/webhooks/elevenlabs \
     -H "Content-Type: application/json" \
     -H "elevenlabs-signature: t=1234567890,v0=abc123..." \
     -d '{"conversation_id":"test-123","user_id":"...","transcript":"..."}'
   ```

2. **Check Evaluation Status:**
   ```sql
   SELECT * FROM interview_evaluations 
   WHERE interview_id = '<interview-id>' 
   ORDER BY created_at DESC;
   ```

3. **Fetch Results:**
   ```bash
   curl http://localhost:3000/api/interviews/<interview-id>/results \
     -H "Authorization: Bearer <token>"
   ```

## Logging

The system logs:
- `[EVALUATION] Enqueued evaluation job for interview <id>`
- `[EVALUATION] Starting evaluation for interview <id>`
- `[EVALUATION] Completed evaluation for interview <id>`
- `[EVALUATION] Error evaluating interview <id>: <error>`
- `[WEBHOOK] Enqueued evaluation for interview <id>`

## Error Handling

- **Missing Transcript:** Evaluation fails with error message
- **Parse Errors:** Evaluation fails, can be retried
- **Database Errors:** Logged, evaluation marked as failed
- **Max Retries:** After 3 retries, evaluation marked as failed

## Future Enhancements

1. **Replace Placeholder Scoring:**
   - Integrate with LLM API for intelligent scoring
   - Use resume context for better evaluation
   - Add role-specific rubrics

2. **Queue Improvements:**
   - Use external queue system (Redis/BullMQ) for production
   - Add job priority
   - Add job cancellation

3. **Evaluation Features:**
   - Sentiment analysis
   - Keyword extraction
   - Comparison with resume
   - Time-based analysis (response speed)

## Security Considerations

- Results API requires authentication
- Users can only access their own interviews
- Evaluation runs server-side (no client exposure)
- No PII logged beyond what's in transcript

