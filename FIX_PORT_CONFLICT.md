# Fix: Port Conflict Between Node.js and Python Backend

## Problem Identified ✅ FIXED

Your Node.js server is running on port 5000, and the Python backend was also trying to use port 5000. When Node.js tried to proxy requests to `http://localhost:5000/api/voice-interview/start`, it was hitting ITSELF instead of the Python backend!

**Evidence from logs:**
```
Authentication check for: /api/voice-interview/start  ← First request (with token) ✅
...
Proxying voice interview start to http://localhost:5000/api/voice-interview/start
...
Authentication check for: /api/voice-interview/start  ← Second request (NO token) ❌
Authorization header present: false  ← This was the Node.js server hitting itself!
```

## Solution ✅ AUTOMATED

### Changes Made Automatically:

1. ✅ **Updated Python backend default port** to 5001 (was 5000)
2. ✅ **Updated Node.js proxy** to use port 5001 by default
3. ✅ **Created startup script** (`start_python_backend.sh`)
4. ✅ **Added helpful messages** when Python backend starts

### What You Need to Do:

**Just start the Python backend on port 5001!**

**Option 1: Use the script (Easiest)**
```bash
./start_python_backend.sh
```

**Option 2: Manual command**
```bash
cd python_backend
PORT=5001 python app.py
```

**Option 3: Set environment variable (if you want different port)**
```bash
export PORT=5001
cd python_backend
python app.py
```

## Verification

After starting Python backend, verify it's working:
```bash
curl http://localhost:5001/health
# Should return: {"status": "healthy"}
```

Then when you try to start the interview, you should see in logs:
```
[VOICE-INTERVIEW-START] Proxying to http://localhost:5001/api/voice-interview/start
[VOICE-INTERVIEW-START] Fetch completed, status: 200
Python backend success response
```

## Current Status

✅ Code updated to default to port 5001
✅ Python backend default port changed to 5001
✅ Startup script created
✅ Error handling improved
⏳ **YOU NEED TO:** Start Python backend on port 5001 (see above)

## Important Notes

- **Node.js server** runs on port **5000** (already running)
- **Python backend** must run on port **5001** (you need to start this)
- Both need to be running at the same time for voice interviews to work
- The Python backend will automatically use port 5001 (no need to set environment variables)

