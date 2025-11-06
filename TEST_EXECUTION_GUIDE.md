# Comprehensive System Test Execution Guide

## Overview
This guide provides step-by-step instructions to execute the comprehensive test suite that validates every component of the voice interview system.

## Prerequisites

1. **All servers must be running:**
   - Node.js server on port 5000
   - Python Flask backend on port 5001

2. **Environment variables must be set:**
   - `DATABASE_URL`
   - `GOOGLE_CREDENTIALS`
   - `DIALOGFLOW_PROJECT_ID`
   - `DIALOGFLOW_AGENT_ID`
   - `DIALOGFLOW_LOCATION_ID`
   - `GEMINI_API_KEY`

## Test Execution Steps

### Step 1: Verify Python Backend is Running

```bash
curl http://127.0.0.1:5001/health
```

Expected response: `{"status":"healthy"}`

### Step 2: Run Python Backend Tests

```bash
npm run test:python
```

Or manually:
```bash
cd python_backend
python3 ../test_python_backend.py
```

### Step 3: Run Full System Tests (Node.js)

```bash
npm run test:full
```

## Test Coverage

### Test 1: Integration & Setup Validation
- ✅ Replit secrets loading
- ✅ Dialogflow client initialization
- ✅ Session path generation
- ✅ Credentials validation

### Test 2: Full Voice-to-Score Pipeline
- ✅ Voice Interview Start (with session parameters)
- ✅ Q1 Generation (with opening phrase validation)
- ✅ Conversation Loop (Q2-Q5)
  - ✅ Transcript saving
  - ✅ Transitional text validation
  - ✅ Unique question generation
- ✅ Interview conclusion

### Test 3: Scoring System Validation
- ✅ Data fetch from database
- ✅ Gemini API call
- ✅ Score persistence

## Expected Results

### Test 1: All tests should PASS
- No missing environment variables
- Dialogflow client initializes successfully
- Session paths generated correctly

### Test 2: Most tests should PASS
- Voice interview starts successfully
- Audio responses received
- Transcripts saved (may be SKIP if database not accessible)
- Transitional phrases detected

### Test 3: May be SKIP for some tests
- Requires actual interview session data
- Scoring requires complete transcript

## Troubleshooting

### If Python backend tests fail:
1. Check if Python backend is running: `curl http://127.0.0.1:5001/health`
2. Check Python backend logs
3. Verify all environment variables are set

### If Node.js tests fail:
1. Check if Node.js server is running
2. Verify database connection
3. Check all environment variables

### If Dialogflow errors occur:
1. Verify `GOOGLE_CREDENTIALS` is valid JSON
2. Check Dialogflow agent is active
3. Verify project ID, location ID, and agent ID are correct

## Test Report Format

The test suite generates a detailed report with:
- Total tests count
- Pass/Fail/Skip counts
- Success rate (excluding skipped)
- Detailed results for each test
- Error messages for failed tests

## Manual Testing Alternative

If automated tests cannot run, use this manual checklist:

1. **Start Interview:**
   - [ ] Select role: Software Engineer
   - [ ] Select difficulty: Hard
   - [ ] Upload resume or skip
   - [ ] Click "Start Interview"
   - [ ] Verify AI speaks first with opening phrase

2. **Answer Questions:**
   - [ ] Answer each question (minimum 4-5 questions)
   - [ ] Verify each answer is transcribed
   - [ ] Verify AI responds with transitional phrases
   - [ ] Verify questions are unique (no repetition)

3. **End Interview:**
   - [ ] Complete interview
   - [ ] Verify scoring is triggered
   - [ ] Verify scores are displayed
   - [ ] Verify detailed feedback is shown

4. **Verify Database:**
   - [ ] Check `interview_sessions` table has entry
   - [ ] Check `interview_turns` table has all Q&A pairs
   - [ ] Verify scores are saved


