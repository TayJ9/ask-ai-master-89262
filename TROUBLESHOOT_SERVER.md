# Troubleshoot "Page Isn't Working" Error

## Check These Things:

### 1. Is the Server Actually Running?

Look at your VS Code terminal where you ran `npm run dev`. You should see:
```
🚀 Server is running!
📡 HTTP Server: http://localhost:3001
🎤 Voice Interview: ws://localhost:3001/voice
```

If you see **errors** instead, that's the problem!

---

### 2. Common Errors & Fixes

#### Error: "Cannot find module 'server.js'"
**Fix:** Make sure you're in the correct folder:
```powershell
cd ask-ai-master-89262-main
```

#### Error: "EADDRINUSE: address already in use"
**Fix:** Port 3001 is already taken. Change port:
- Edit `.env` file
- Change `PORT=3001` to `PORT=3002`
- Restart server

#### Error: "Cannot find module './backend/...'"
**Fix:** Missing backend files. Check if `backend/` folder exists:
```powershell
dir backend
```

#### Error: "OPENAI_API_KEY is not set"
**Fix:** Add your API key to `.env` file:
```
OPENAI_API_KEY=your_actual_key_here
```

---

### 3. Check Server Logs

Look at your terminal output. Common issues:

**Missing files:**
```
Error: Cannot find module './backend/routes/upload'
```
→ Check if `backend/routes/upload.js` exists

**Port already in use:**
```
Error: listen EADDRINUSE: address already in use :::3001
```
→ Change PORT in `.env` or kill the process using port 3001

**Missing dependencies:**
```
Error: Cannot find module 'express'
```
→ Run `npm install` again

---

### 4. Verify Server is Listening

In VS Code terminal, run:
```powershell
# Check if something is listening on port 3001
netstat -ano | findstr :3001
```

Or test with curl:
```powershell
curl http://localhost:3001/health
```

---

### 5. Check Browser Console

1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Try accessing http://localhost:3001
4. Look for any error messages

---

### 6. Common Fixes

#### Fix 1: Restart Server
```powershell
# Stop server (Ctrl+C)
# Then restart
npm run dev
```

#### Fix 2: Check All Files Exist
```powershell
# Verify these files exist:
Test-Path server.js
Test-Path backend/voiceServer.js
Test-Path backend/routes/upload.js
Test-Path .env
```

#### Fix 3: Reinstall Dependencies
```powershell
Remove-Item -Recurse -Force node_modules
npm install
npm run dev
```

---

## What to Share for Help

If still not working, share:
1. **Terminal output** - Copy the full error message
2. **Browser error** - What exactly does it say?
3. **File structure** - Run `dir` and share the output
4. **Port check** - Run `netstat -ano | findstr :3001`

---

## Quick Diagnostic Commands

Run these in VS Code terminal:

```powershell
# 1. Check current directory
pwd

# 2. Verify server.js exists
Test-Path server.js

# 3. Check if port is in use
netstat -ano | findstr :3001

# 4. Test server directly
node server.js

# 5. Check .env file
Get-Content .env
```

