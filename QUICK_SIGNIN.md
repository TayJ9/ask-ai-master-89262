# Quick Sign In - Browser Console

## Use the Proxy Path (No CORS Issues)

When you're on `http://localhost:5173`, use the **relative path** `/api` instead of `http://localhost:3000/api`. This uses Vite's proxy and avoids CORS issues.

## One-Liner (Copy & Paste)

Open browser console (F12) on `http://localhost:5173` and paste:

```javascript
localStorage.clear(); fetch('/api/auth/signin', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: 'test123@gmail.com', password: 'Test123'})}).then(r => r.json()).then(data => {if(data.token){localStorage.setItem('auth_token', data.token.trim()); localStorage.setItem('user', JSON.stringify(data.user)); console.log('✅ Signed in! Refreshing...'); location.reload();}else{console.error('Failed:', data.error);}}).catch(err => console.error('Error:', err));
```

## Test User Credentials

- **Email:** `test123@gmail.com`
- **Password:** `Test123`

## What This Does

1. Clears localStorage (removes old tokens)
2. Signs in with test user
3. Stores token in localStorage
4. Refreshes the page
5. You're now signed in!

## After Sign In

1. Navigate to the interview page
2. Click "Start Interview"
3. Check console - should NOT see TDZ error
