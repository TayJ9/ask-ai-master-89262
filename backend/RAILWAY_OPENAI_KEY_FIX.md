# Railway Deployment Fix - OPENAI_API_KEY Missing

## Problem

Server crashes on startup with:
```
OpenAIError: The OPENAI_API_KEY environment variable is missing or empty
```

## Root Cause

1. **Missing Environment Variable**: `OPENAI_API_KEY` is not set in Railway Variables
2. **Typo Detected**: Logs show `OPEN_API_KEY` exists (typo - missing 'I')
3. **Module Load Crash**: OpenAI client was instantiated at module load time, causing immediate crash

## Solution Applied

### 1. Made OpenAI Client Lazy-Loaded ✅

Changed from immediate initialization to lazy loading:
- **Before**: `const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });` (at module load)
- **After**: `getOpenAIClient()` function that only creates client when needed

### 2. Better Error Messages ✅

- Detects common typo: `OPEN_API_KEY` → `OPENAI_API_KEY`
- Provides clear instructions on where to get API key
- Error only thrown when OpenAI functions are actually called

### 3. Server Won't Crash on Startup ✅

- Server can start without `OPENAI_API_KEY`
- Only fails when AI features are actually used
- Better user experience - API endpoints still work

## Required Action: Set Environment Variable

### Step 1: Get Your OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Sign in or create account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)

### Step 2: Add to Railway Variables

1. Go to Railway Dashboard
2. Select your **backend service**
3. Go to **Variables** tab
4. Click **"New Variable"**
5. Set:
   - **Name**: `OPENAI_API_KEY` (exact spelling - note the 'I')
   - **Value**: `sk-your-key-here`
6. Click **"Save"**

### Step 3: Fix Typo (If Present)

If you see `OPEN_API_KEY` in your variables:
1. **Delete** `OPEN_API_KEY` variable
2. **Add** `OPENAI_API_KEY` with correct name
3. Use the same value

### Step 4: Redeploy

After setting the variable:
- Railway will automatically redeploy
- Or manually trigger a new deployment

## Verification

After setting `OPENAI_API_KEY`:

1. **Check Railway Logs**:
   - Should see server starting successfully
   - No OpenAI errors

2. **Test Health Endpoint**:
   ```bash
   curl https://your-app.railway.app/health
   ```

3. **Test AI Features**:
   - Sign up/login should work
   - Interview features that use AI will work

## Environment Variables Checklist

Make sure these are set in Railway Variables (backend service):

- [x] `JWT_SECRET` - JWT token signing key
- [x] `DATABASE_URL` - PostgreSQL connection string
- [ ] `OPENAI_API_KEY` - **MISSING - NEEDS TO BE SET**
- [ ] `NODE_ENV` - Set to `production` (optional)

## Code Changes

### `server/openai.ts`
- ✅ Lazy-load OpenAI client
- ✅ Detect `OPEN_API_KEY` typo
- ✅ Better error messages
- ✅ Server can start without key

### `server/scoring.ts`
- ✅ Better error handling
- ✅ Typo detection

## Why This Works

1. **Lazy Loading**: Client only created when AI functions are called
2. **Graceful Degradation**: Server starts, API works, only AI features fail
3. **Better UX**: Clear error messages guide user to fix the issue
4. **Typo Detection**: Catches common mistake (`OPEN_API_KEY` vs `OPENAI_API_KEY`)

## Troubleshooting

### Error: "OPENAI_API_KEY not configured"

**Solution**: Add `OPENAI_API_KEY` to Railway Variables

### Error: "Found OPEN_API_KEY but need OPENAI_API_KEY"

**Solution**: 
1. Delete `OPEN_API_KEY` variable
2. Add `OPENAI_API_KEY` with same value

### Server starts but AI features don't work

**Check**:
1. Is `OPENAI_API_KEY` set? (not `OPEN_API_KEY`)
2. Is the key valid? (starts with `sk-`)
3. Does the key have credits/quota?

### Still having issues?

1. **Check Railway Variables**:
   - Go to Railway Dashboard → Backend Service → Variables
   - Verify `OPENAI_API_KEY` is listed (exact spelling)
   - Check it has a value (shows as `••••••••`)

2. **Check Logs**:
   - Look for error messages
   - Verify server started successfully

3. **Test Locally**:
   ```bash
   export OPENAI_API_KEY="sk-your-key"
   cd backend
   npm start
   ```

## Summary

✅ **Code Fixed**: Server won't crash on startup
✅ **Better Errors**: Clear messages guide user to fix issue
✅ **Action Required**: Set `OPENAI_API_KEY` in Railway Variables

Once `OPENAI_API_KEY` is set, the deployment will work correctly! 🚀

