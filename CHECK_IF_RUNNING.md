# Check If Both Servers Are Running

## Quick Check

In your Replit console/logs, look for:

### ✅ Python Backend Should Show:
- "Starting Python Flask backend on port 5001"
- "Gemini 2.5 Flash model initialized for scoring"
- "Dialogflow voice client initialized"

### ✅ Node.js Server Should Show:
- "Server running on port 5000"

## Test If They're Running

Run these commands in a terminal:

```bash
# Check if Python backend is responding
curl http://localhost:5001/health

# Should return: {"status": "healthy"}
```

```bash
# Check if Node.js server is responding
curl http://localhost:5000/api/auth/me

# Should return: 401 (not authenticated) or 200 (authenticated)
```

## If Both Are Running

✅ **You're good!** Just test the voice interview:
1. Go to your web app
2. Start a voice interview
3. Test it works end-to-end

## If You See Old Messages

If you see "Gemini Pro" instead of "Gemini 2.5 Flash", you need to restart to pick up the changes.

## Should You Restart?

**Yes, if:**
- You want to pick up the Gemini 2.5 Flash changes
- You're not sure if both servers started
- You want a fresh start

**No, if:**
- Both servers are clearly running
- You see "Gemini 2.5 Flash model initialized"
- You just want to test the app

## Quick Restart

1. Click "Stop" button (if available)
2. Click "Run" button again
3. Wait for both servers to start
4. Verify you see the Gemini 2.5 Flash message

