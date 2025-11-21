# Verification Guide

## Where to Run

### Option 1: Local Development (Recommended for Testing)

Run these commands on your **local machine** or in a **development environment** where you have:
- Node.js installed (v18 or higher)
- npm installed
- Access to terminal/command line

### Option 2: Cloud Run (Production)

After deploying to Cloud Run, you'll test against the deployed URL instead of `localhost:8080`.

---

## Step-by-Step Verification

### 1. Install Dependencies

First, make sure you're in the project directory:

```bash
cd /path/to/workspace
# or if you're already there:
pwd  # should show your workspace directory
```

Install dependencies:

```bash
npm install
```

**Expected output:**
```
npm WARN ... (warnings are ok)
added 50 packages in 3s
```

---

### 2. Start the Server Locally

Start the webhook server:

```bash
npm start
```

**Expected output:**
```
Serving function...
Function: dialogflowWebhook
URL: http://localhost:8080/
```

**⚠️ Keep this terminal window open** - the server needs to keep running.

---

### 3. Test the Health Endpoint

Open a **new terminal window** (keep the server running in the first one) and test the health endpoint:

```bash
curl http://localhost:8080/health
```

**Expected output:**
```json
{"status":"ok"}
```

If you see this, the server is working! ✅

---

### 4. Test the Webhook with a Sample Request

Test with the intro-to-interview payload:

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "fulfillmentInfo": {
      "tag": "Interview"
    },
    "pageInfo": {
      "currentPage": {
        "displayName": "Interview"
      }
    },
    "sessionInfo": {
      "parameters": {
        "major": "Computer Science"
      }
    }
  }'
```

**Expected output:**
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
      "section_question_count": {
        "Interest and Motivation": 1
      },
      "completed_sections": [],
      "next_page": "Interest and Motivation",
      "asked_questions": ["What motivated you to pursue a career in this field?"]
    }
  }
}
```

**In the server terminal, you should see:**
```json
{"tag":"Interview","page":"Interview","major":"Computer Science","countsSummary":{"sectionCounts":1,"completedSections":0,"askedQuestions":1},"chosenSection":"Interest and Motivation","chosenQuestionLength":54}
```

---

### 5. Test Missing Major

Test what happens when major is missing:

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "fulfillmentInfo": {
      "tag": "Interview"
    },
    "sessionInfo": {
      "parameters": {}
    }
  }'
```

**Expected output:**
```json
{
  "fulfillment_response": {
    "messages": [{
      "text": {
        "text": ["I'\''d like to know what your major is. Could you please tell me your major?"]
      }
    }]
  },
  "session_info": {
    "parameters": {
      "section_question_count": {},
      "completed_sections": [],
      "asked_questions": []
    }
  }
}
```

Notice: `asked_questions` is empty (state didn't advance) ✅

---

### 6. Test with Progress Tracking

Test with existing progress:

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "fulfillmentInfo": {
      "tag": "Interview"
    },
    "sessionInfo": {
      "parameters": {
        "major": "Cybersecurity",
        "section_question_count": {
          "Interest and Motivation": 1,
          "Academic Experience": 1
        },
        "completed_sections": [
          "Interest and Motivation",
          "Academic Experience"
        ],
        "asked_questions": [
          "What motivated you to pursue a career in this field?",
          "Can you walk me through a project from class that challenged you?"
        ],
        "next_page": "Transferable Skills"
      }
    }
  }'
```

**Expected output:**
- Should return a question from "Transferable Skills" section
- `completed_sections` should remain the same (section not yet complete)
- `section_question_count` should increment for "Transferable Skills"

---

### 7. Run the Test Suite

Stop the server (Ctrl+C in the server terminal), then run:

```bash
npm test
```

**Expected output:**
```
Dialogflow CX Webhook Test Suite
================================

Starting webhook server...
Server is ready

--- Test: Intro to Interview - resolves tag and returns question ---
Status: 200
Response keys: fulfillment_response, session_info
Question: What motivated you to pursue a career in this field?...
  ✓ Parameters validated
✓ Intro to Interview - resolves tag and returns question passed

--- Test: With progress - uses next_page and updates counts ---
Status: 200
...
✓ With progress - uses next_page and updates counts passed

--- Test: Missing major - prompts for major and does not advance state ---
Status: 200
...
✓ Missing major - prompts for major and does not advance state passed

--- Test: Health endpoint ---
✓ Health endpoint passed

================================
Test Summary:
  Passed: 4
  Failed: 0
  Total:  4
================================
```

---

## Using Test Payload Files

You can also use the test payload files directly:

```bash
# Make sure server is running (npm start in another terminal)
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d @test/payloads/intro-to-interview.json
```

---

## Verification Checklist

- [ ] `npm install` completes without errors
- [ ] `npm start` starts server on port 8080
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] First interview request returns a question
- [ ] Log shows `"tag":"Interview"` and `"chosenSection"` is a real section (not "Interview")
- [ ] Missing major returns prompt and doesn't add to `asked_questions`
- [ ] `npm test` passes all tests
- [ ] Server logs show JSON-formatted request summaries
- [ ] All responses return HTTP 200 status

---

## Troubleshooting

### Port Already in Use

If you see `EADDRINUSE: address already in use :::8080`:

```bash
# Find and kill the process using port 8080
lsof -ti:8080 | xargs kill -9

# Or use a different port
PORT=8081 npm start
# Then update curl commands to use :8081
```

### Cannot Find Module

If you see `Cannot find module '@google-cloud/functions-framework'`:

```bash
npm install
```

### Tests Fail to Start Server

If tests can't start the server:

1. Make sure `npx` is available: `which npx`
2. Try installing functions-framework globally: `npm install -g @google-cloud/functions-framework`
3. Or run server manually and update test port

### Server Doesn't Respond

1. Check server terminal for errors
2. Verify server is listening: `curl http://localhost:8080/health`
3. Check firewall settings
4. Verify Node.js version: `node --version` (should be 18+)

---

## Next Steps: Deploy to Cloud Run

Once local verification passes:

1. Deploy to Cloud Run:
   ```bash
   gcloud run deploy dialogflow-webhook \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

2. Update Dialogflow CX webhook URL to the Cloud Run URL

3. Test via Dialogflow CX console

4. Monitor logs in Cloud Run console
