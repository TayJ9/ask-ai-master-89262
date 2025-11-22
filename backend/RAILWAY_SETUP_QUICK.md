# Railway Setup - Quick Reference

## 🚨 JWT_SECRET Error - FIXED ✅

The code has been fixed to prevent build-time errors. Now you just need to set the environment variable in Railway.

## ⚡ Quick Setup (5 Minutes)

### Step 1: Generate JWT_SECRET

Run this command to generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (it will look like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`)

### Step 2: Add to Railway

1. Go to: https://railway.app
2. Select your project → Backend service
3. Click **"Variables"** tab
4. Click **"New Variable"**
5. Add these 4 variables:

```
Name: JWT_SECRET
Value: [paste the generated secret from Step 1]
```

```
Name: DATABASE_URL
Value: [from Railway PostgreSQL service - auto-provided]
```

```
Name: OPENAI_API_KEY
Value: sk-[your OpenAI API key]
```

```
Name: NODE_ENV
Value: production
```

6. Click **"Save"** - Railway will auto-redeploy

### Step 3: Verify

Check Railway logs for:
- ✅ "Server running on port [PORT]"
- ✅ No "JWT_SECRET not found" errors
- ✅ Health check works: `GET /health`

## 📋 Complete Environment Variables List

| Variable | Required | Where to Get |
|----------|----------|--------------|
| `JWT_SECRET` | ✅ Yes | Generate (see Step 1) |
| `DATABASE_URL` | ✅ Yes | Railway PostgreSQL service |
| `OPENAI_API_KEY` | ✅ Yes | https://platform.openai.com/api-keys |
| `NODE_ENV` | ✅ Yes | Set to `production` |
| `PORT` | ❌ No | Railway sets automatically |

## 🔧 What Was Fixed

- ✅ JWT_SECRET now lazy-loaded (only accessed at runtime)
- ✅ Build-time errors prevented
- ✅ Runtime validation still enforced
- ✅ Better error messages

## 📚 Full Documentation

- **Detailed Fix**: See `RAILWAY_JWT_SECRET_FIX.md`
- **Environment Variables**: See `ENVIRONMENT_VARIABLES.md`
- **Deployment Guide**: See `RAILWAY_DEPLOYMENT.md`

## ✅ You're Ready!

After setting the variables above, your Railway deployment should succeed! 🚀

