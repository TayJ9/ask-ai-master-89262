# Railway Database Setup Instructions

## Issue: Database Tables Not Created

The error message "Database tables not created. Please run database setup script" means the database connection works, but the tables don't exist yet.

## Solution: Run Database Setup Script

### Option 1: Railway CLI (Recommended - Easiest)

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

   This will:
   - Connect to your Railway database
   - Create all necessary tables
   - Create indexes for performance

### Option 2: Railway Dashboard Shell

1. Go to **Railway Dashboard** → Your Backend Service
2. Click on **"Deployments"** → Latest deployment
3. Click **"View Logs"** → Look for **"Shell"** or **"Connect"** button
4. Run:
   ```bash
   cd backend
   npm run setup-db
   ```

### Option 3: Direct SQL in PostgreSQL Dashboard

If you have access to Railway's PostgreSQL dashboard:

1. Go to Railway Dashboard → Your PostgreSQL Service
2. Click **"Data"** or **"Query"** tab
3. Copy the SQL from `backend/scripts/setup-db.ts`
4. Execute the SQL statements

## What Tables Will Be Created

- `profiles` - User accounts
- `interview_questions` - Interview questions
- `interview_sessions` - Interview sessions
- `interview_responses` - Interview responses  
- `interview_turns` - Conversation turns

## Verify Setup

After running the setup, test the health endpoint:
```bash
curl https://ask-ai-master-89262-production.up.railway.app/health
```

Should return:
```json
{"status":"healthy","database":"connected"}
```

Then try signing in again - it should work!

## Troubleshooting

### If setup script fails:
- Check `DATABASE_URL` is set correctly in Railway Variables
- Verify PostgreSQL service is running
- Check Railway logs for connection errors

### If tables still don't exist:
- Check Railway logs for SQL errors
- Verify database permissions
- Try running setup script again

