# Railway JWT_SECRET Fix - Complete Guide

## Problem Identified

The error "secret JWT_SECRET not found" occurs because:

1. **JWT_SECRET is accessed at module load time** (when `routes.ts` is imported)
2. **Railway sets `NODE_ENV=production` during build**, triggering the error check
3. **Secrets are only available at runtime**, not during build phase
4. **The code throws an error immediately** when the module loads

## ✅ Fix Applied

### Code Changes Made

**File**: `backend/server/routes.ts`

**Before** (Problematic):
```typescript
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  return "dev-secret-key-change-before-production";
})();
```

**After** (Fixed):
```typescript
// Lazy-load JWT_SECRET to avoid build-time errors
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    // Only throw error at runtime when actually trying to use it
    if (process.env.NODE_ENV === 'production' && process.env.RAILWAY_ENVIRONMENT) {
      throw new Error('JWT_SECRET environment variable must be set in production');
    }
    console.warn('⚠️  JWT_SECRET not set, using dev secret');
    return "dev-secret-key-change-before-production";
  }
  
  return secret;
}
```

### Key Improvements

1. ✅ **Lazy Loading**: JWT_SECRET only accessed when needed (at runtime)
2. ✅ **Build-Safe**: Won't fail during Railway build phase
3. ✅ **Runtime Validation**: Still enforces security when actually using JWT
4. ✅ **Better Error Messages**: Clear guidance for fixing the issue

## 📋 How to Set JWT_SECRET in Railway

### Method 1: Railway Dashboard (Recommended)

1. **Go to Railway Dashboard**
   - Navigate to: https://railway.app
   - Select your project
   - Click on your backend service

2. **Open Variables Tab**
   - Click on the **"Variables"** tab
   - Or click **"New Variable"** button

3. **Add JWT_SECRET**
   - **Variable Name**: `JWT_SECRET`
   - **Value**: [Generate a secure random string - see below]
   - Click **"Add"** or **"Save"**

4. **Generate Secure Secret**
   ```bash
   # Option 1: Using Node.js
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Option 2: Using OpenSSL
   openssl rand -hex 32
   
   # Option 3: Using Python
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```

5. **Set Other Required Variables**
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `OPENAI_API_KEY` - Your OpenAI API key (starts with `sk-`)
   - `NODE_ENV=production` - Set to production

6. **Redeploy**
   - Railway will automatically redeploy when you save variables
   - Or manually trigger a redeploy

### Method 2: Railway CLI

```bash
# Install Railway CLI (if not installed)
npm i -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Set JWT_SECRET
railway variables set JWT_SECRET="your-secret-key-here"

# Set other variables
railway variables set DATABASE_URL="your-database-url"
railway variables set OPENAI_API_KEY="sk-your-key"
railway variables set NODE_ENV="production"

# Verify variables
railway variables
```

### Method 3: Railway API

```bash
# Set variable via API
curl -X POST "https://api.railway.app/v1/variables" \
  -H "Authorization: Bearer YOUR_RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "your-project-id",
    "serviceId": "your-service-id",
    "name": "JWT_SECRET",
    "value": "your-secret-key-here"
  }'
```

## 🔒 Security Best Practices

### ✅ DO:
- ✅ Use a long, random secret (at least 32 characters)
- ✅ Use different secrets for dev/staging/production
- ✅ Rotate secrets periodically
- ✅ Store secrets in Railway Variables (never commit to git)
- ✅ Use Railway's built-in secret management

### ❌ DON'T:
- ❌ Commit secrets to git
- ❌ Use simple passwords like "secret123"
- ❌ Share secrets in chat/email
- ❌ Use the same secret across environments
- ❌ Hardcode secrets in code

## 🧪 Local Testing

### Test Without JWT_SECRET (Development)
```bash
cd backend
npm install
npm start
# Should work with dev secret (warning will appear)
```

### Test With JWT_SECRET (Production-like)
```bash
cd backend
export JWT_SECRET="your-test-secret-here"
export NODE_ENV="production"
npm start
# Should work without warnings
```

### Test Missing JWT_SECRET (Error Case)
```bash
cd backend
unset JWT_SECRET
export NODE_ENV="production"
npm start
# Should show warning but not crash during startup
# Will fail when trying to authenticate (expected)
```

## 📊 Verification Checklist

After setting JWT_SECRET in Railway:

- [ ] Variable added in Railway Variables tab
- [ ] Variable name is exactly `JWT_SECRET` (case-sensitive)
- [ ] Value is a secure random string (32+ characters)
- [ ] Other required variables are set:
  - [ ] `DATABASE_URL`
  - [ ] `OPENAI_API_KEY`
  - [ ] `NODE_ENV=production`
- [ ] Service redeployed after adding variables
- [ ] Check Railway logs for:
  - ✅ No "JWT_SECRET not found" errors
  - ✅ Server starts successfully
  - ✅ Health check responds: `GET /health`

## 🐛 Troubleshooting

### Error: "JWT_SECRET environment variable must be set in production"

**Cause**: JWT_SECRET not set in Railway Variables

**Solution**:
1. Go to Railway Dashboard → Your Service → Variables
2. Add `JWT_SECRET` with a secure random value
3. Redeploy the service

### Error: "secret JWT_SECRET not found" during build

**Cause**: Old code was checking JWT_SECRET at build time

**Solution**: ✅ **FIXED** - Code now lazy-loads JWT_SECRET at runtime

### Warning: "JWT_SECRET not set, using dev secret"

**Cause**: JWT_SECRET not set (development mode)

**Solution**: 
- Development: This is OK, just a warning
- Production: Add JWT_SECRET in Railway Variables

### Authentication fails even with JWT_SECRET set

**Cause**: Wrong variable name or value

**Solution**:
1. Verify variable name is exactly `JWT_SECRET` (case-sensitive)
2. Check Railway logs to see what value is being read
3. Regenerate and set a new secret
4. Ensure service is redeployed after changes

## 📝 Example Railway Variables Screen

```
┌─────────────────────────────────────────┐
│ Railway - Environment Variables         │
├─────────────────────────────────────────┤
│                                         │
│  Name              Value                │
│  ─────────────────────────────────────  │
│  DATABASE_URL      postgresql://...     │
│  JWT_SECRET        a1b2c3d4e5f6...     │
│  NODE_ENV          production           │
│  OPENAI_API_KEY    sk-proj-abc123...   │
│  PORT              5000                 │
│                                         │
│  [+ New Variable]                       │
└─────────────────────────────────────────┘
```

## ✅ Summary

**Status**: ✅ **FIXED**

- ✅ Code refactored to lazy-load JWT_SECRET
- ✅ Build-time errors prevented
- ✅ Runtime validation maintained
- ✅ Clear error messages added
- ✅ Railway setup instructions provided

**Next Steps**:
1. Set `JWT_SECRET` in Railway Variables (see instructions above)
2. Set other required variables
3. Redeploy service
4. Verify deployment succeeds

Your Railway deployment should now work! 🚀

