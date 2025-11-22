# Railway Database Setup Instructions

## Issue: 500 Error on Signin/Signup

If you're getting 500 errors, the database tables likely don't exist in your Railway/Neon database.

## Solution: Run Database Setup in Railway

### Option 1: Railway CLI (Recommended)

1. **Install Railway CLI** (if not already installed):
   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. **Run the setup script**:
   ```bash
   cd backend
   railway run npm run setup-db
   ```

### Option 2: Railway Dashboard Shell

1. Go to Railway Dashboard → Your Backend Service
2. Click on "Deployments" → Latest deployment
3. Click "View Logs" → "Shell" or "Connect"
4. Run:
   ```bash
   cd backend
   npm run setup-db
   ```

### Option 3: Direct SQL in Neon Console

1. Go to your Neon database dashboard
2. Open SQL Editor
3. Copy and paste the SQL from `backend/scripts/setup-db.ts`
4. Execute the SQL statements

## Verify Setup

After running the setup, test:
```bash
curl https://ask-ai-master-89262-production.up.railway.app/health
```

Should return:
```json
{"status":"healthy","database":"connected"}
```

## Check Railway Logs

The improved logging will now show:
- Detailed error messages
- Database connection status
- Step-by-step progress for signin/signup

To view logs:
1. Railway Dashboard → Your Service → Logs
2. Look for `[SIGNUP]` or `[SIGNIN]` log entries
3. Check for database-related errors

## Common Errors

### "relation does not exist"
- **Cause**: Tables not created
- **Fix**: Run `npm run setup-db` in Railway

### "connection refused" or "ECONNREFUSED"
- **Cause**: DATABASE_URL incorrect or database not accessible
- **Fix**: Check DATABASE_URL in Railway Variables

### "DATABASE_URL must be set"
- **Cause**: Environment variable missing
- **Fix**: Add DATABASE_URL in Railway Variables

