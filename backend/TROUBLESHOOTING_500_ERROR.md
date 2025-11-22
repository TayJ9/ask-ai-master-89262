# Troubleshooting 500 Error on Signin

## Issue
Getting 500 error when trying to sign in from Vercel frontend.

## Possible Causes

### 1. Database Connection Issue
**Check Railway logs for:**
- "DATABASE_URL must be set" error
- Database connection timeout
- SSL connection errors

**Solution:**
- Verify `DATABASE_URL` is set in Railway Variables
- Check that the Neon database is running
- Test connection: `https://your-backend.up.railway.app/health`

### 2. Database Tables Not Created
**Symptoms:**
- Error messages about missing tables (profiles, interview_sessions, etc.)
- "relation does not exist" errors

**Solution:**
The database tables need to be created. You can either:

**Option A: Use Drizzle Kit (Recommended)**
```bash
cd backend
npm install -D drizzle-kit
npx drizzle-kit push
```

**Option B: Manual SQL**
Run the schema creation SQL in your Neon database console.

### 3. Missing Environment Variables
**Check Railway Variables:**
- `DATABASE_URL` - Required
- `JWT_SECRET` - Required
- `OPENAI_API_KEY` or `OPEN_API_KEY` - Required for AI features
- `NODE_ENV=production` - Recommended

### 4. Check Railway Logs
The improved error handling will now show:
- Detailed error messages
- Stack traces (in development mode)
- Database connection status

**To check logs:**
1. Go to Railway Dashboard
2. Select your backend service
3. Click on "Logs" tab
4. Look for errors around the time of the signin attempt

## Quick Test

Test the health endpoint:
```bash
curl https://ask-ai-master-89262-production.up.railway.app/health
```

Expected response:
```json
{"status":"healthy","database":"connected"}
```

If you get `{"status":"unhealthy","database":"disconnected"}`, the database connection is the issue.

## Next Steps

1. Check Railway logs for the actual error
2. Verify DATABASE_URL is set correctly
3. Ensure database tables exist
4. Test health endpoint
5. Try signin again after fixes

