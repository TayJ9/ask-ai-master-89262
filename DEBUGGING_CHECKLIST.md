# Debugging Checklist - Voice Interview Start Error

## Issues Found & Fixed

### 1. ✅ Port Configuration
- **Node.js server**: Runs on port 5000 (server/index.ts)
- **Python Flask backend**: Defaults to port 5000 (python_backend/app.py)
- **Issue**: If both try to run on port 5000, there's a conflict
- **Solution**: Python backend uses `PORT` environment variable (defaults to 5000), Node.js uses hardcoded 5000
- **Action**: Ensure Python backend runs on a different port or set `PORT` environment variable

### 2. ✅ Error Handling Improvements
- Added detailed logging with `[VOICE-INTERVIEW-START]` prefix
- Better error detection for connection failures
- Improved error messages for different failure scenarios
- Fixed error propagation to avoid misleading "No token provided" messages

### 3. ✅ Authentication Flow
- Token validation happens before proxy request
- Error handling distinguishes between auth errors (401/403) and server errors (500)
- Frontend properly handles different error types

## What to Check If Still Getting Errors

### 1. Check Python Backend Status
**Check if Python backend is running:**
```bash
# In Replit, check if Python process is running
# Look for Python/Flask process in the process list
```

**Test Python backend directly:**
```bash
# Try to access the health endpoint
curl http://localhost:5000/health
# Or if running on different port/URL:
curl <PYTHON_BACKEND_URL>/health
```

**Expected response:**
```json
{"status": "healthy"}
```

### 2. Check Environment Variables
**In Replit Secrets/Environment Variables, verify:**
- `PYTHON_BACKEND_URL` - Should point to your Python backend URL
  - If Python backend is on same Replit: `http://localhost:5000` or `http://0.0.0.0:5000`
  - If Python backend is separate service: Use full URL (e.g., `https://your-python-service.replit.app`)
- `PORT` (for Python backend) - Should be different from Node.js port if running on same machine
- `GOOGLE_CREDENTIALS` - Should be valid JSON
- `GCP_PROJECT_ID` or `DIALOGFLOW_PROJECT_ID` - Should be set
- `DF_AGENT_ID` or `DIALOGFLOW_AGENT_ID` - Should be set
- `DF_LOCATION_ID` or `DIALOGFLOW_LOCATION_ID` - Should be set (default: us-central1)

### 3. Check Server Logs
**When you try to start the interview, look for these logs:**

**In Node.js server logs, you should see:**
```
Authentication check for: /api/voice-interview/start
Authorization header present: true
Token verified for user: <user-id>
[VOICE-INTERVIEW-START] Proxying to <PYTHON_BACKEND_URL>/api/voice-interview/start
[VOICE-INTERVIEW-START] Request body: {...}
[VOICE-INTERVIEW-START] Attempting fetch to: <URL>
[VOICE-INTERVIEW-START] Fetch completed, status: <status>
```

**If you see errors like:**
- `[VOICE-INTERVIEW-START] Fetch error connecting to Python backend:` → Python backend not running or not accessible
- `Cannot connect to Python backend` → Network/connection issue
- `Python backend returned status 500` → Python backend error (check Python logs)

### 4. Check Python Backend Logs
**In Python backend logs, you should see:**
```
Starting voice interview session: <session-id>
Calling Dialogflow CX for initial voice response...
Agent response received (audio: <bytes> bytes, text: <chars> chars)
Session data saved to database for <session-id>
```

**If you see errors like:**
- `Error initializing Dialogflow client` → Check GOOGLE_CREDENTIALS
- `GCP_PROJECT_ID or DIALOGFLOW_PROJECT_ID environment variable must be set` → Missing environment variable
- `Error starting voice interview: ...` → Check the full traceback for details

### 5. Check Browser Console
**In browser console, look for:**
- `Making POST request to /api/voice-interview/start {hasToken: true, ...}` → Token is present
- `Response status for /api/voice-interview/start: <status>` → Response status
- Error messages with details

**Common error patterns:**
- `500 Internal Server Error` → Check server logs for details
- `401 Unauthorized` → Token expired or invalid (try logging in again)
- `Cannot connect to Python backend` → Python backend not running

### 6. Verify Network Connectivity
**If Python backend is on different service/URL:**
- Ensure the URL is accessible from Node.js server
- Check CORS settings (Python backend has CORS enabled)
- Verify firewall/network rules allow connections

### 7. Test Python Backend Directly
**Try calling Python backend endpoint directly:**
```bash
curl -X POST http://localhost:5000/api/voice-interview/start \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-session-123",
    "role": "software-engineer",
    "resumeText": "Test resume",
    "difficulty": "Medium"
  }'
```

**Expected response:**
```json
{
  "sessionId": "test-session-123",
  "audioResponse": "<base64-encoded-audio>",
  "audioFormat": "mp3",
  "agentResponseText": "..."
}
```

### 8. Check Dialogflow Configuration
**Verify Dialogflow credentials and configuration:**
- `GOOGLE_CREDENTIALS` is valid JSON
- Project ID matches your GCP project
- Agent ID matches your Dialogflow CX agent
- Location ID matches your agent's region
- APIs enabled: Dialogflow API, Speech-to-Text API, Text-to-Speech API

## Common Issues & Solutions

### Issue: "No token provided" with 500 status
**Possible causes:**
1. Python backend not running or not accessible
2. Error from Python backend being misreported
3. Network connectivity issue

**Solution:**
- Check Python backend is running
- Check PYTHON_BACKEND_URL is correct
- Check server logs for actual error message

### Issue: "Cannot connect to Python backend"
**Possible causes:**
1. Python backend not started
2. Wrong port/URL in PYTHON_BACKEND_URL
3. Python backend crashed

**Solution:**
- Start Python backend: `python python_backend/app.py` or `flask run`
- Verify PYTHON_BACKEND_URL matches where Python backend is running
- Check Python backend logs for errors

### Issue: "Python backend returned status 500"
**Possible causes:**
1. Missing environment variables in Python backend
2. Dialogflow API errors
3. Database connection issues

**Solution:**
- Check Python backend logs for full error traceback
- Verify all required environment variables are set
- Check Dialogflow credentials and API access

### Issue: Authentication errors
**Possible causes:**
1. Token expired (7 day expiry)
2. Token not being sent correctly
3. JWT_SECRET mismatch

**Solution:**
- Try logging out and logging back in
- Check browser console for token presence
- Verify JWT_SECRET is same in both environments

## Next Steps

1. **Check server logs** - Look for `[VOICE-INTERVIEW-START]` logs
2. **Check Python backend logs** - Look for errors when starting interview
3. **Verify environment variables** - Ensure all required vars are set
4. **Test Python backend directly** - Use curl to test endpoint
5. **Check network connectivity** - Ensure Python backend is accessible

## Files to Review

- `server/routes.ts` - Proxy endpoint and error handling
- `python_backend/app.py` - Flask server and endpoints
- `python_backend/dialogflow_voice.py` - Voice interview logic
- `python_backend/dialogflow_interview.py` - Dialogflow configuration
- `src/lib/queryClient.ts` - Frontend request handling
- `src/pages/Index.tsx` - Interview start logic

