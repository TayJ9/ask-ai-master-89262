# Fix Results Page Polling for Pending Feedback

## Current State Analysis

### Backend Endpoint (`/api/interviews/:id/results`)
- Returns interview record even if evaluation is null (line 1526-1533 in routes.ts)
- Returns `evaluation: null` if no evaluation record exists yet
- Returns 200 OK with null evaluation (does NOT return 404)
- Backend is correct - no changes needed

### Frontend Issues
1. **Polling interval**: Currently polls every 2s for 60 polls (120 seconds total) - should be 3s for 10 polls (30 seconds)
2. **Missing feedback check**: Doesn't check if `evaluation.evaluation` (the actual feedback JSON) is null/empty
3. **Loading message**: Shows "Generating your feedback..." but should show "Analyzing your interview..." when evaluation is null
4. **Null evaluation handling**: Code checks `!resultsData.evaluation` but doesn't check if `evaluation.evaluation` is null

## Changes Required

### 1. Update Polling Logic in Results.tsx
**File**: `workspace/frontend/src/pages/Results.tsx`

- Change `MAX_EVAL_POLLS` from 60 to 10 (30 seconds total)
- Change polling interval from 2000ms to 3000ms (3 seconds)
- Check for both `evaluation === null` AND `evaluation.evaluation === null`
- Show "Analyzing your interview..." when evaluation is null or incomplete
- Only show complete results when `evaluation.evaluation` exists and has data

### 2. Improve Loading State Messages
**File**: `workspace/frontend/src/pages/Results.tsx`

- Update "evaluating" status message to "Analyzing your interview..."
- Update description to be more specific about what's happening

### 3. Verify Backend (Already Correct)
**File**: `workspace/backend/server/routes.ts`

- Already returns `evaluation: null` when no evaluation exists
- Already returns 200 OK with interview data
- No changes needed

## Implementation Details

### Results.tsx Changes

1. **Update constants** (around line 70-71):
   ```typescript
   const MAX_EVAL_POLLS = 10; // 10 polls = 30 seconds (3s intervals)
   ```

2. **Update Phase 2 logic** (around line 135-167):
   - Check: `!resultsData.evaluation || !resultsData.evaluation.evaluation || resultsData.evaluation.status === 'pending'`
   - Change polling interval to 3000ms
   - Check for `evaluation.evaluation !== null` in polling condition

3. **Update loading message** (around line 207):
   - Change "Generating your feedback..." to "Analyzing your interview..."

## Flow Verification

1. User completes interview → navigates to `/results?sessionId=...`
2. Frontend polls for interviewId (Phase 1) ✓
3. Frontend fetches results → gets interview with `evaluation: null`
4. Frontend detects null evaluation → shows "Analyzing your interview..."
5. Frontend polls every 3s for up to 30s (10 polls)
6. Backend generates evaluation → returns `evaluation: { status: 'complete', evaluation: {...} }`
7. Frontend detects complete evaluation → shows results

## Files to Modify

- `workspace/frontend/src/pages/Results.tsx` - Update polling logic and loading messages

## Files That Don't Need Changes

- `workspace/backend/server/routes.ts` - Already returns nulls correctly
