# Test Interview Start - Quick Guide

## Test User Credentials

**Email:** `test123@gmail.com`  
**Password:** `Test123`

## Quick Setup (Browser Console)

1. **Open Browser Console** (F12)
2. **Copy and paste this entire script:**

```javascript
// Clear storage and sign in
localStorage.clear();
fetch('/api/auth/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test123@gmail.com', password: 'Test123' })
})
.then(r => r.json())
.then(data => {
  if (data.token) {
    localStorage.setItem('auth_token', data.token.trim());
    localStorage.setItem('user', JSON.stringify(data.user));
    console.log('✅ Signed in! Refresh the page.');
    location.reload();
  } else {
    console.error('Sign in failed:', data.error);
  }
})
.catch(err => console.error('Error:', err));
```

3. **Press Enter** - You should see "✅ Signed in! Refresh the page."
4. **Refresh the page** (F5)
5. **Navigate to interview page**
6. **Click "Start Interview"**
7. **Check console** - Should NOT see TDZ error

## Alternative: Use HTML Test Page

1. Open `test-user-setup.html` in your browser
2. Click buttons in order:
   - "Clear localStorage"
   - "Create Test User" (if needed)
   - "Sign In"
   - "Verify Authentication"
   - "Open Interview Page"

## What to Look For

✅ **Success:**
- No `ReferenceError: Cannot access 'k' before initialization`
- Interview starts successfully
- Microphone permission requested
- Connection established

❌ **Failure:**
- TDZ error in console
- Interview doesn't start
- Component crashes

## Backend Logs

Check your backend terminal for:
```
[Auth] Token verified: true
[Auth] Token verified successfully: { userId: ..., path: ... }
```

If you see this, authentication is working!
