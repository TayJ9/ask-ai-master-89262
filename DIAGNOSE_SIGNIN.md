# Sign In Issue Diagnosis

## Problem Found
The backend Express server is **NOT running** on port 3000. Something else is running on that port (possibly a static file server or old process).

## Evidence
- Test script gets 404 with HTML "File not found" error
- This means the Express backend routes are not registered
- The backend needs to be started

## Solution

### Step 1: Stop Whatever is on Port 3000
```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Step 2: Start the Backend
```powershell
cd backend
npm run dev
```

You should see:
```
✅ SQLite database connected successfully
[SERVER STARTUP] Running database schema repair...
[ROUTE REGISTRATION] All routes registered successfully
Server running on port 3000
```

### Step 3: Verify Backend is Running
```powershell
# Run the test script
node test-signin-simple.js
```

Should show:
- ✅ Status: 200 for health check
- ✅ Token received for signin

### Step 4: Try Signing In
1. Go to http://localhost:5173
2. Sign in with:
   - Email: `test123@gmail.com`
   - Password: `Test123`

## Quick Fix Script
```powershell
# Stop processes on port 3000
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Start backend
cd backend
npm run dev
```
