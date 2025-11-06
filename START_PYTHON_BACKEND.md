# How to Start Python Backend

## Quick Start

### Option 1: Using the Script (Easiest)
```bash
./start_python_backend.sh
```

### Option 2: Manual Command
```bash
cd python_backend
PORT=5001 python app.py
```

### Option 3: Set Environment Variable
```bash
export PORT=5001
cd python_backend
python app.py
```

## What You Should See

When Python backend starts successfully, you should see:
```
Starting Python Flask backend on port 5001
Set PORT environment variable to use a different port
 * Running on http://0.0.0.0:5001
 * Debug mode: on
```

## Verify It's Running

In a new terminal/tab, test the health endpoint:
```bash
curl http://localhost:5001/health
```

Should return:
```json
{"status": "healthy"}
```

## Keep It Running

The Python backend needs to stay running while you use the app. In Replit:
- Keep the terminal tab open where Python backend is running
- Or run it in the background (but logs won't be visible)

## Troubleshooting

### Port Already in Use
If you see "Address already in use":
```bash
# Find what's using port 5001
lsof -i :5001
# Kill the process if needed
kill -9 <PID>
```

### Python Not Found
```bash
# Check Python version
python --version
# Or try
python3 --version
```

### Missing Dependencies
```bash
cd python_backend
pip install -r requirements.txt
```

## Next Steps

1. ✅ Start Python backend on port 5001 (see above)
2. ✅ Verify it's running: `curl http://localhost:5001/health`
3. ✅ Try starting a voice interview in your app
4. ✅ Check logs to see if it's working

## Important Notes

- **Node.js server** runs on port **5000** (already running)
- **Python backend** must run on port **5001** (you need to start this)
- Both need to be running at the same time for voice interviews to work
- The Python backend will automatically use port 5001 unless you set `PORT` environment variable

