# 🔍 Debugging Python Backend Connection

## Issue
Node.js server can't connect to Python backend at `http://localhost:5001`

## Fix Applied
Changed `localhost` to `127.0.0.1` for better Replit compatibility.

## Next Steps

1. **Restart the Node.js server** to pick up the change:
   - Stop the current `npm run dev` process (Ctrl+C)
   - Start it again: `npm run dev`

2. **Check the server logs** when you try to start the interview:
   - Look for `[VOICE-INTERVIEW-START]` log messages
   - They will show the exact error

3. **Verify Python backend is accessible**:
   ```bash
   curl http://127.0.0.1:5001/health
   ```

4. **Try the interview again** after restarting Node.js

## If Still Not Working

Check if Python backend is actually listening:
```bash
# Check if port 5001 is listening
lsof -i :5001
# or
netstat -tlnp | grep 5001
```

The Python backend should show:
```
* Running on http://0.0.0.0:5001
```

This means it's accessible from localhost.

