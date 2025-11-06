# How to Check Server Logs

## In Replit

### Method 1: Replit Console (Main Logs)
1. **Look at the bottom panel** of your Replit window
2. There's usually a **Console** or **Shell** tab
3. This shows logs from your running Node.js server
4. Look for logs that start with:
   - `Authentication check for:`
   - `[VOICE-INTERVIEW-START]`
   - `Error proxying voice interview start:`

### Method 2: Replit Logs Panel
1. Click on the **"Logs"** button/icon in the Replit sidebar (usually on the left)
2. This shows all console output from your running processes
3. You can filter or search for specific log messages

### Method 3: Terminal Output
1. If you started the server manually, check the terminal where it's running
2. Node.js logs will appear there with `console.log()`, `console.error()`, etc.

### Method 4: Replit Shell (if server is running via command)
1. Open the **Shell** tab in Replit
2. If you started the server with `npm run dev` or `npm start`, logs appear there
3. You can also run commands to check:
   ```bash
   # Check if Node.js server is running
   ps aux | grep node
   
   # Check if Python server is running
   ps aux | grep python
   ```

## What to Look For in Node.js Logs

### When you try to start a voice interview, you should see:

```
Authentication check for: /api/voice-interview/start
Authorization header present: true
Authorization header value: Bearer eyJhbGciOiJ...
Token verified for user: <user-id>
[VOICE-INTERVIEW-START] Proxying to http://localhost:5000/api/voice-interview/start
[VOICE-INTERVIEW-START] Request body: {"session_id":"...","role":"...","difficulty":"..."}
[VOICE-INTERVIEW-START] Request userId: <user-id>
[VOICE-INTERVIEW-START] Python backend URL: http://localhost:5000
[VOICE-INTERVIEW-START] Attempting fetch to: http://localhost:5000/api/voice-interview/start
[VOICE-INTERVIEW-START] Fetch completed, status: 200
Python backend success response
```

### If there's an error, you might see:

```
[VOICE-INTERVIEW-START] Fetch error connecting to Python backend: ...
[VOICE-INTERVIEW-START] Error name: TypeError
[VOICE-INTERVIEW-START] Error message: fetch failed
```

OR

```
Python backend response status: 500
Python backend error response: {"error": "..."}
Python backend error text: ...
```

## What to Look For in Python Backend Logs

### If Python backend is running, you should see:

```
Starting voice interview session: <session-id>
Calling Dialogflow CX for initial voice response...
Agent response received (audio: <bytes> bytes, text: <chars> chars)
Session data saved to database for <session-id>
```

### If there's an error, you might see:

```
Error starting voice interview: <error message>
Traceback (most recent call last):
  ...
```

## Quick Check Commands

### Check if Node.js server is running:
```bash
# In Replit Shell
ps aux | grep -E "node|tsx" | grep -v grep
```

### Check if Python server is running:
```bash
# In Replit Shell
ps aux | grep -E "python|flask" | grep -v grep
```

### Check what's listening on port 5000:
```bash
# In Replit Shell
lsof -i :5000
# Or
netstat -tulpn | grep 5000
```

### Test Node.js server directly:
```bash
curl http://localhost:5000/api/auth/me
# Should return 401 if not authenticated, or user info if authenticated
```

### Test Python backend directly:
```bash
curl http://localhost:5000/health
# Should return: {"status": "healthy"}
```

## Real-time Log Monitoring

### In Replit, you can:
1. **Keep the Console/Logs panel open** while testing
2. **Filter logs** by typing in the search box (if available)
3. **Scroll to bottom** to see the most recent logs
4. **Clear console** if it gets too cluttered (usually a clear button)

## Troubleshooting: No Logs Showing

### If you don't see any logs:

1. **Check if server is actually running:**
   ```bash
   ps aux | grep node
   ```

2. **Check if server started correctly:**
   - Look for "Server running on port 5000" message
   - If missing, server might have crashed on startup

3. **Restart the server:**
   - Stop current process (Ctrl+C in terminal)
   - Start again: `npm run dev` or `npm start`

4. **Check for startup errors:**
   - Look at the very beginning of logs when server starts
   - Errors during startup prevent server from running

## Finding Specific Errors

### Search for errors:
- Look for lines containing: `ERROR`, `Error`, `error`
- Look for lines containing: `[VOICE-INTERVIEW-START]`
- Look for lines containing: `Authentication check`
- Look for lines containing: `Python backend`

### Common error patterns:
- `Cannot connect to Python backend` → Python backend not running
- `No token provided` → Authentication issue (but check full context)
- `Python backend returned status 500` → Python backend error
- `ECONNREFUSED` → Connection refused (backend not accessible)

## Tips

1. **Keep logs open** while testing - don't close the console
2. **Scroll to bottom** to see latest logs first
3. **Look for timestamps** - logs are usually in chronological order
4. **Check both servers** - Node.js logs AND Python backend logs
5. **Copy error messages** - full error messages help debug

