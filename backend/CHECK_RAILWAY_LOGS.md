# How to Check Railway Logs for 500 Errors

## Steps to Debug 500 Errors

1. **Go to Railway Dashboard**
   - Navigate to your backend service
   - Click on "Deployments" → Latest deployment
   - Click "View Logs"

2. **Look for these log entries:**
   - `[SIGNUP]` or `[SIGNIN]` - Shows step-by-step progress
   - `❌ [SIGNUP] Error:` or `❌ [SIGNIN] Error:` - Shows the actual error
   - `Database connection check failed:` - Database connection issues

3. **Common Error Patterns:**

### Database Connection Errors
```
Database connection check failed: ECONNREFUSED
```
**Fix:** Check DATABASE_URL in Railway Variables

### Table Not Found Errors
```
relation "profiles" does not exist
```
**Fix:** Run `npm run setup-db` in Railway shell

### Import/Module Errors
```
Cannot find module '...'
```
**Fix:** Check package.json dependencies

## Quick Fixes

### If tables don't exist:
```bash
# In Railway shell or via Railway CLI
cd backend
npm run setup-db
```

### If DATABASE_URL is wrong:
1. Railway Dashboard → Your Service → Variables
2. Check `DATABASE_URL` value
3. Should be: `postgresql://user:pass@host:5432/db?sslmode=require`

### If you see import errors:
Check Railway build logs for missing dependencies

## Test Database Connection

After deployment, test:
```bash
curl https://ask-ai-master-89262-production.up.railway.app/health
```

Should return:
```json
{"status":"healthy","database":"connected"}
```

If it returns `"database":"disconnected"`, check Railway logs for database connection errors.

