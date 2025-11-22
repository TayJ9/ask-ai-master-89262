# Railway JWT_SECRET Checklist - Secret Already Set

Since you've already added `JWT_SECRET` to Railway but build still fails, check these:

## ✅ Verification Checklist

### 1. Variable Location
- [ ] `JWT_SECRET` is set on **BACKEND SERVICE** (not project level)
- [ ] Go to: Railway Dashboard → **Your Backend Service** → Variables
- [ ] Not just at project level

### 2. Variable Details
- [ ] Name is exactly: `JWT_SECRET` (all caps, underscore)
- [ ] Value is set (shows as `••••••••` dots)
- [ ] Not empty or null

### 3. Variable Status
- [ ] Variable shows as **"Saved"** (not "Unsaved")
- [ ] No warning icons next to variable
- [ ] Variable appears in the list

### 4. Deployment
- [ ] Clicked **"Save"** or **"Deploy"** after adding variable
- [ ] Triggered a **new deployment** after saving
- [ ] Not using an old build that ran before secret was added

### 5. Service Selection
- [ ] You're looking at the **correct service** (backend, not frontend)
- [ ] Root directory is set to `backend` in Railway
- [ ] Variables are on the service that's building

## 🔧 Quick Fixes to Try

### Fix 1: Re-add the Variable

Sometimes Railway doesn't recognize it:

1. Go to Variables tab
2. **Delete** `JWT_SECRET` variable
3. **Add it again** with same name and value
4. Click **"Save"**
5. Trigger new deployment

### Fix 2: Set at Project Level Too

Try setting it at both levels:

1. **Project level**: Railway Dashboard → Project → Variables
2. **Service level**: Railway Dashboard → Backend Service → Variables
3. Set `JWT_SECRET` at both
4. Save and redeploy

### Fix 3: Use Railway CLI to Verify

```bash
railway login
railway link
railway variables
# Should show JWT_SECRET in the list
```

### Fix 4: Clear Build Cache

1. Railway Dashboard → Your Service → Settings
2. Look for **"Clear Cache"** or **"Rebuild"**
3. Clear cache and rebuild

### Fix 5: Check Variable Name

Railway is case-sensitive. Verify:
- ✅ `JWT_SECRET` (correct)
- ❌ `jwt_secret` (wrong)
- ❌ `JWT_SECRET ` (trailing space)
- ❌ `JWT-SECRET` (wrong separator)

## 🎯 Most Common Issue

**The secret is set at PROJECT level, but Railway needs it at SERVICE level.**

**Solution**:
1. Go to Railway Dashboard
2. Click on your **backend service** (not the project)
3. Go to **Variables** tab
4. Add `JWT_SECRET` there
5. Save and redeploy

## 📝 Code Changes Made

We've updated the code to reduce Railway's secret scanning:
- ✅ Removed JWT_SECRET check from `server.js`
- ✅ Only in `routes.ts` now (lazy-loaded)
- ✅ Added `.railwayignore` file
- ✅ Simplified `railway.json`

## 🆘 If Still Failing

After checking all above:

1. **Screenshot** your Railway Variables page showing `JWT_SECRET` is set
2. **Check build logs** for exact error message
3. **Try Railway CLI** to verify secret is accessible
4. **Contact Railway Support** - this might be a platform issue

The code is build-safe - Railway just needs to recognize the secret is set!

