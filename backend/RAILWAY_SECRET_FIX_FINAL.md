# Railway Metal Builder - Final Fix for JWT_SECRET Error

## 🔴 The Problem

Railway's Metal builder (Railpack) is **validating secrets during build phase** and failing with:
```
Build Failed: bc.Build: failed to solve: secret JWT_SECRET not found
```

This happens because Railway scans your code for `process.env.JWT_SECRET` references and tries to validate the secret exists **before building**.

## ✅ The Solution

**You MUST add JWT_SECRET to Railway Variables BEFORE building.**

Railway's Metal builder requires secrets to be set **before** it will allow the build to proceed, even if the code doesn't use them during build.

## 🚀 Step-by-Step Fix

### Step 1: Add JWT_SECRET to Railway (CRITICAL - Do This First!)

1. **Go to Railway Dashboard**
   - Navigate to: https://railway.app
   - Select your project
   - Click on your **backend service**

2. **Open Variables Tab**
   - Click on **"Variables"** tab (or **"Settings"** → **"Variables"**)

3. **Add JWT_SECRET**
   - Click **"New Variable"** or **"Add Variable"**
   - **Variable Name**: `JWT_SECRET`
   - **Variable Value**: Generate using command below
   - Click **"Add"** or **"Save"**

4. **Generate Secure Secret**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   
   Copy the output (looks like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`)

5. **Add Other Required Variables**
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `OPENAI_API_KEY` - Your OpenAI API key (starts with `sk-`)
   - `NODE_ENV` - Set to `production`

6. **Save All Variables**
   - Make sure to click **"Save"** or **"Deploy"** button
   - Railway will automatically trigger a new build

### Step 2: Verify Build Configuration

Make sure your `railway.json` is correct:

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install"
  },
  "deploy": {
    "startCommand": "npm start"
  }
}
```

### Step 3: Redeploy

After adding JWT_SECRET:
- Railway will **automatically redeploy** when you save variables
- Or manually trigger redeploy from Railway dashboard
- Build should now succeed ✅

## 🎯 Why This Happens

Railway's Metal builder (Railpack) does **static code analysis**:
1. Scans your code for `process.env.*` references
2. Tries to validate those secrets exist **before building**
3. Fails build if secret is referenced but not set

**This is Railway platform behavior** - not a bug, but a security feature.

## ✅ What We've Fixed in Code

Our code is already build-safe:
- ✅ `getJWTSecret()` never throws errors
- ✅ Always returns a value (dev secret during build)
- ✅ Only accessed at runtime when actually needed
- ✅ Build script doesn't execute code

**But Railway still validates secrets exist before building.**

## 📋 Complete Variable Checklist

Before building, ensure these are set in Railway:

| Variable | Required | Status |
|----------|----------|--------|
| `JWT_SECRET` | ✅ **CRITICAL** | ⚠️ **Must be set BEFORE build** |
| `DATABASE_URL` | ✅ Yes | Set from Railway PostgreSQL |
| `OPENAI_API_KEY` | ✅ Yes | Set from OpenAI dashboard |
| `NODE_ENV` | ✅ Yes | Set to `production` |
| `PORT` | ❌ No | Railway sets automatically |

## 🔧 Alternative: Use Railway CLI

If dashboard doesn't work, use CLI:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to project
railway link

# Set JWT_SECRET BEFORE building
railway variables set JWT_SECRET="your-generated-secret-here"

# Set other variables
railway variables set DATABASE_URL="your-db-url"
railway variables set OPENAI_API_KEY="sk-your-key"
railway variables set NODE_ENV="production"

# Deploy (build will now succeed)
railway up
```

## 🐛 Troubleshooting

### Error: "secret JWT_SECRET not found" during build

**Cause**: JWT_SECRET not added to Railway Variables

**Solution**: 
1. **Add JWT_SECRET in Railway Variables** (see Step 1 above)
2. **Save and redeploy**
3. Build should succeed ✅

### Build succeeds but runtime fails

**Cause**: JWT_SECRET not set or wrong value

**Solution**:
1. Check Railway Variables - ensure JWT_SECRET is set
2. Verify variable name is exactly `JWT_SECRET` (case-sensitive)
3. Check Railway logs for error messages
4. Regenerate and set new secret if needed

### Variables set but build still fails

**Possible causes**:
1. Variables not saved - click "Save" button
2. Wrong service - ensure variables are set on backend service
3. Need to manually trigger redeploy

**Solution**:
1. Double-check variables are saved
2. Manually trigger redeploy from Railway dashboard
3. Check build logs for specific error

## ✅ Summary

**The Fix**: Add JWT_SECRET to Railway Variables **BEFORE building**

**Why**: Railway's Metal builder validates secrets during build phase

**Steps**:
1. ✅ Generate JWT_SECRET
2. ✅ Add to Railway Variables
3. ✅ Add other required variables
4. ✅ Save and redeploy
5. ✅ Build should succeed

**Your code is already build-safe** - you just need to add the secret to Railway! 🚀

