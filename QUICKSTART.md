# Quick Start - Verify the Webhook

## Where to Run

**Run all commands in your terminal/command line**, in the project directory (`/home/runner/workspace` or your local copy).

---

## Quick Verification (3 Steps)

### Step 1: Start the Server

Open a terminal and run:

```bash
cd /home/runner/workspace  # or your project directory
npm start
```

**You should see:**
```
Serving function...
Function: dialogflowWebhook
URL: http://localhost:8080/
```

**⚠️ Keep this terminal open** - the server runs here.

---

### Step 2: Test in a New Terminal

Open a **second terminal window** (keep the server running) and run:

```bash
# Test health endpoint
curl http://localhost:8080/health
```

**Expected:** `{"status":"ok"}`

```bash
# Test webhook with interview request
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "fulfillmentInfo": {"tag": "Interview"},
    "sessionInfo": {"parameters": {"major": "Computer Science"}}
  }'
```

**Expected:** JSON response with a question like "What motivated you to pursue a career in this field?"

**Check the server terminal** - you should see a JSON log line like:
```json
{"tag":"Interview","page":null,"major":"Computer Science","countsSummary":{...},"chosenSection":"Interest and Motivation","chosenQuestionLength":54}
```

**Key things to verify:**
- ✅ `"tag":"Interview"` (original tag)
- ✅ `"chosenSection":"Interest and Motivation"` (resolved section, NOT "Interview")
- ✅ Response has a question
- ✅ Response status is 200 (success)

---

### Step 3: Run Tests

Stop the server (Ctrl+C) and run:

```bash
npm test
```

**Expected:** All tests pass ✅

---

## What Success Looks Like

### ✅ Server Terminal Shows:
```
Serving function...
Function: dialogflowWebhook
URL: http://localhost:8080/
{"tag":"Interview","page":null,"major":"Computer Science","countsSummary":{"sectionCounts":1,"completedSections":0,"askedQuestions":1},"chosenSection":"Interest and Motivation","chosenQuestionLength":54}
```

### ✅ curl Response Shows:
```json
{
  "fulfillment_response": {
    "messages": [{
      "text": {
        "text": ["What motivated you to pursue a career in this field?"]
      }
    }]
  },
  "session_info": {
    "parameters": {
      "major": "Computer Science",
      "section_question_count": {"Interest and Motivation": 1},
      "completed_sections": [],
      "next_page": "Interest and Motivation",
      "asked_questions": ["What motivated you to pursue a career in this field?"]
    }
  }
}
```

### ✅ Tests Show:
```
Test Summary:
  Passed: 4
  Failed: 0
```

---

## Common Issues

### "Port 8080 already in use"
```bash
# Kill the process using port 8080
lsof -ti:8080 | xargs kill -9
# Or use a different port
PORT=8081 npm start
```

### "Cannot find module"
```bash
npm install
```

### Server won't start
- Check Node.js version: `node --version` (needs 18+)
- Check you're in the right directory: `pwd` should show your workspace
- Check for errors in terminal output

---

## Next: Deploy to Cloud Run

Once local tests pass, deploy to Google Cloud Run for production use with Dialogflow CX.

See `VERIFICATION.md` for detailed testing instructions.


