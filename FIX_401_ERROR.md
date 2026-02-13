# Fix 401 Unauthorized Error

## Problem
You're getting `401 Unauthorized` errors when trying to upload a resume. This happens because:

1. **Token Mismatch**: The JWT token in your browser's localStorage was created with a different `JWT_SECRET` than what your local backend is using
2. **Old Token**: The token might be from a previous session (production/deployed version)

## Quick Fix

### Option 1: Clear localStorage and Sign In Again (Recommended)

1. **Open Browser Console** (F12)
2. **Run this command:**
   ```javascript
   localStorage.clear();
   ```
3. **Refresh the page** (F5)
4. **Sign in again** with your credentials
5. **Try uploading the resume again**

### Option 2: Check Backend Logs

Look at your backend terminal window. You should see logs like:
```
[Auth] Header present: true
[Auth] Authorization header received: {...}
[Auth] Token verified: false
[Auth] Error: {...}
```

The error message will tell you:
- `JsonWebTokenError` = Token format issue
- `TokenExpiredError` = Token expired
- `secret` in error = JWT_SECRET mismatch

## Why This Happens

When you sign in:
- **Production**: Token is signed with Railway's `JWT_SECRET`
- **Local Dev**: Token should be signed with `backend/.env` `JWT_SECRET` (`local-dev-jwt-secret-12345`)

If you signed in on production and then try to use that token locally, it won't work because the secrets don't match.

## Prevention

Always sign in locally when testing locally. The tokens are environment-specific.

## Verify It's Fixed

After signing in locally, check the backend logs:
```
[Auth] Token verified: true
[Auth] Token verified successfully: { userId: ..., path: ... }
```

If you see this, authentication is working!
