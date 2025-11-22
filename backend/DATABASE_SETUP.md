# Database Setup Guide

## Issue: 500 Error on Signin

If you're getting a 500 error when trying to sign in, it's likely because the database tables don't exist yet.

## Quick Fix: Create Database Tables

### Option 1: Run Setup Script (Recommended)

1. **SSH into Railway or run locally:**
   ```bash
   cd backend
   npm run setup-db
   ```

2. **Or manually with tsx:**
   ```bash
   cd backend
   tsx scripts/setup-db.ts
   ```

### Option 2: Run SQL in Neon Console

1. Go to your Neon database dashboard
2. Open the SQL Editor
3. Run the SQL from `scripts/setup-db.ts` (the CREATE TABLE statements)

### Option 3: Use Drizzle Kit

If you have `drizzle-kit` installed:
```bash
cd backend
npx drizzle-kit push
```

## Verify Tables Exist

After running the setup, test the health endpoint:
```bash
curl https://ask-ai-master-89262-production.up.railway.app/health
```

Should return:
```json
{"status":"healthy","database":"connected"}
```

## Required Tables

The setup script creates:
- `profiles` - User accounts
- `interview_questions` - Interview questions
- `interview_sessions` - Interview sessions
- `interview_responses` - User responses
- `interview_turns` - Conversation turns

## After Setup

Once tables are created:
1. Try signing up a new account
2. Try signing in
3. The 500 error should be resolved

