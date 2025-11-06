# ✅ Deployment Configuration Verification

## Configuration Check

### 1. ✅ Startup Script (`start_production.sh`)
- ✅ Script exists and is executable
- ✅ Starts Python backend on port 5001
- ✅ Waits for Python backend to be ready (health check)
- ✅ Starts Node.js server on port 5000
- ✅ Proper cleanup on exit

### 2. ✅ `.replit` Configuration
- ✅ Deployment uses `./start_production.sh`
- ✅ Build command: `npm run build`
- ✅ Ports configured: 5000 (external 80), 5001 (external 3003)

### 3. ✅ Python Backend Files
- ✅ `python_backend/app.py` - Flask server
- ✅ `python_backend/dialogflow_voice.py` - Voice interaction
- ✅ `python_backend/dialogflow_interview.py` - Scoring
- ✅ `python_backend/requirements.txt` - Dependencies

### 4. ✅ Node.js Server Configuration
- ✅ Uses `http://127.0.0.1:5001` for Python backend
- ✅ Proper error handling for connection issues
- ✅ Authentication middleware working

## Pre-Deployment Checklist

### Required Environment Variables (Replit Secrets)
Make sure these are set in Replit Secrets for deployment:

- ✅ `GOOGLE_CREDENTIALS` - Google Cloud service account JSON
- ✅ `GCP_PROJECT_ID` - Your GCP project ID
- ✅ `DF_AGENT_ID` - Dialogflow agent ID
- ✅ `DF_LOCATION_ID` - Location (e.g., "us-east1")
- ✅ `GEMINI_API_KEY` - Gemini API key
- ✅ `JWT_SECRET` - JWT secret for authentication
- ✅ `DATABASE_URL` - PostgreSQL connection string

### Python Dependencies
The startup script will use the system Python. Make sure Python packages are installed or the script installs them.

**Note**: In Replit deployments, Python packages might need to be installed. Consider adding to startup script:

```bash
# Install Python dependencies if needed
cd python_backend
pip install -r requirements.txt --quiet
cd ..
```

## Deployment Steps

1. **Verify Environment Variables** - All secrets set in Replit
2. **Deploy** - Click "Deploy" or use Replit deployment
3. **Check Logs** - Verify both servers start:
   - "Python backend is ready!"
   - "Starting Node.js server..."
   - "Server running on port 5000"
4. **Test** - Try voice interview on deployed URL

## Troubleshooting

### If Python backend doesn't start:
- Check logs for Python errors
- Verify `GOOGLE_CREDENTIALS` is set
- Check if Python packages are installed

### If connection still fails:
- Verify Python backend health: `curl http://127.0.0.1:5001/health`
- Check if both processes are running
- Verify port 5001 is accessible

### If deployment fails:
- Check startup script permissions: `chmod +x start_production.sh`
- Verify Python is available in deployment environment
- Check deployment logs for errors

