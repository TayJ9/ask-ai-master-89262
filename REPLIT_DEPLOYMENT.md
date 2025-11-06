# Replit Deployment - Running Both Servers

## Important: You Need Both Servers Running

For your app to work, you need:
1. **Node.js server** on port 5000 (handles frontend + API)
2. **Python Flask backend** on port 5001 (handles voice interviews)

## Current Status

✅ Both servers are configured correctly
✅ Port conflict is fixed (Node.js on 5000, Python on 5001)
⚠️ **You need to configure Replit to start both servers**

## Option 1: Use Replit's Run Command (Recommended)

Create or update `.replit` file to run both servers:

```toml
[run]
command = "bash -c 'cd python_backend && PORT=5001 python app.py & npm run dev'"
```

Or create a startup script:

## Option 2: Create Startup Script

Create `start_all.sh`:

```bash
#!/bin/bash
# Start both servers

# Start Python backend in background
cd python_backend
PORT=5001 python app.py &
PYTHON_PID=$!

# Start Node.js server
cd ..
npm run dev

# If Node.js exits, kill Python backend
kill $PYTHON_PID
```

Then update `.replit`:
```toml
[run]
command = "bash start_all.sh"
```

## Option 3: Manual Start (For Testing)

For now, you can:
1. Start Python backend in one terminal
2. Start Node.js in another terminal (or let Replit auto-start it)

## For Production Deployment

If deploying to Replit Deploy:
- Make sure both services are configured
- Or use a process manager like `supervisord`
- Or use Replit's multiple services feature (if available)

## Quick Fix for "Address already in use"

The error means Flask is already running. Find and stop it:

```bash
# Find what's using port 5001
lsof -i :5001

# Kill the process (replace PID with actual process ID)
kill <PID>
```

Or just restart Replit - it will stop all processes.

## Check Before Publishing

1. ✅ Both servers can start without errors
2. ✅ Python backend accessible on port 5001
3. ✅ Node.js server accessible on port 5000
4. ✅ Environment variables set (GEMINI_API_KEY, GOOGLE_CREDENTIALS, etc.)
5. ✅ Both servers stay running

## Test Locally First

Before publishing, test that:
- Voice interview starts successfully
- Audio is sent and received
- Interview can be completed
- Scoring works at the end

