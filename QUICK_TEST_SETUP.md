# Quick Test Setup - Clear Storage & Test Interview

## Step 1: Clear Browser Storage

Open your browser console (F12) and run:
```javascript
localStorage.clear();
console.log('✅ Storage cleared!');
```

## Step 2: Create Test User

I've created a test user script. Run this in your backend terminal:

```bash
cd backend
tsx scripts/create-test-user-sqlite.ts
```

**OR** use the HTML test page I created:
- Open `test-user-setup.html` in your browser
- Click "Create Test User" button
- Click "Sign In" button

## Step 3: Test User Credentials

**Email:** `test123@gmail.com`  
**Password:** `Test123`

## Step 4: Sign In Locally

1. Go to http://localhost:5173
2. Sign in with the test credentials above
3. This will create a token with your local `JWT_SECRET`

## Step 5: Test Interview Start

1. Navigate to the interview page
2. Upload a resume (or skip)
3. Click "Start Interview"
4. **Check the browser console** - you should NOT see:
   - `ReferenceError: Cannot access 'k' before initialization`
5. The interview should start successfully

## Alternative: Use HTML Test Page

I've created `test-user-setup.html` which provides buttons to:
- Clear localStorage
- Create test user
- Sign in automatically
- Verify authentication
- Test resume upload
- Open interview page

Just open `test-user-setup.html` in your browser and follow the steps!
