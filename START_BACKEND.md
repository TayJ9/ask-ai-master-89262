# Start Backend Server

## The Problem
The backend is **not running** on port 3000. That's why signin is failing with 401/404 errors.

## Solution: Start the Backend

### Option 1: Use the Start Script (Easiest)
```powershell
.\start-local-dev.ps1
```

This will start both frontend and backend.

### Option 2: Start Backend Manually

1. **Open a new terminal**
2. **Navigate to backend:**
   ```powershell
   cd backend
   ```
3. **Start the server:**
   ```powershell
   npm run dev
   ```

You should see:
```
✅ SQLite database connected successfully
[SERVER STARTUP] Running database schema repair...
[SERVER STARTUP] Schema repair completed
[SERVER STARTUP] Registering API routes...
[ROUTE REGISTRATION] Starting route registration...
[ROUTE REGISTRATION] All routes registered successfully
Server running on port 3000
```

### Option 3: Check if Backend is Already Running

The backend might be running on a different port. Check:
```powershell
netstat -ano | findstr LISTENING | findstr node
```

## Verify Backend is Running

After starting, test:
```powershell
node test-signin-simple.js
```

You should see:
- ✅ Status: 200 (for health check)
- ✅ Token received for signin

## Then Try Signing In

Once backend is running:
1. Go to http://localhost:5173
2. Try signing in with:
   - Email: `test123@gmail.com`
   - Password: `Test123`
