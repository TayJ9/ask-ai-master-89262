# Sign In Troubleshooting

## Issue: 401 Unauthorized when signing in

If you're getting a 401 error when trying to sign in, it means:

1. **User doesn't exist** - The email `test123@gmail.com` is not in the database
2. **Password is wrong** - The password hash doesn't match

## Solution: Recreate Test User

Run this command in your backend terminal:

```bash
cd backend
tsx scripts/create-test-user-sqlite.ts
```

This will:
- Check if the user exists
- Create the user if it doesn't exist
- Update the password if it does exist

## Test User Credentials

- **Email:** `test123@gmail.com`
- **Password:** `Test123`

## Verify Sign In Works

After recreating the user, try signing in again using the browser console script:

```javascript
localStorage.clear(); fetch('/api/auth/signin', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: 'test123@gmail.com', password: 'Test123'})}).then(r => r.json()).then(data => {if(data.token){localStorage.setItem('auth_token', data.token.trim()); localStorage.setItem('user', JSON.stringify(data.user)); console.log('✅ Signed in! Refreshing...'); location.reload();}else{console.error('Failed:', data.error);}}).catch(err => console.error('Error:', err));
```

## Check Backend Logs

Look at your backend terminal. You should see:
```
[SIGNIN] Attempting signin for: test123@gmail.com
[SIGNIN] Profile found, verifying password...
[SIGNIN] Password valid, generating token...
[SIGNIN] Success! Token generated for user: <user-id>
```

If you see "No account found", the user doesn't exist - run the create script above.
