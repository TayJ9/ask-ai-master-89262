# Complete Setup Check & Fix Guide

## 🚀 Quick Start

Run these commands in VS Code terminal (in your project folder):

```powershell
# 1. Run the verification script
node verify_and_fix_setup.js

# 2. If backend folder is missing, create it
.\create_missing_backend.ps1

# 3. Check what's missing
dir backend
```

---

## 📋 What Gets Checked

The `verify_and_fix_setup.js` script checks:

### ✅ Required Files:
- `server.js` - Main server file
- `package.json` - Package configuration  
- `upload.js` - Upload route handler
- `backend/voiceServer.js` - Voice interview server (CRITICAL)
- `.env` - Environment variables
- `.env.example` - Environment template

### ✅ Folder Structure:
- `backend/` folder
- `backend/routes/` folder
- `src/` folder
- `uploads/` folder (auto-created)

### ✅ Package.json:
- Scripts: `dev`, `server`
- Dependencies: `express`, `cors`, `dotenv`, `ws`, `multer`, `uuid`
- DevDependencies: `nodemon`

### ✅ Environment Variables:
- `PORT` configured
- `OPENAI_API_KEY` configured (and not placeholder)

---

## 🔧 Common Issues & Fixes

### Issue 1: Missing `backend/voiceServer.js`

**Symptom:** Server crashes with "Cannot find module './backend/voiceServer'"

**Fix Options:**

**Option A: Re-download from GitHub (Recommended)**
1. Go to: https://github.com/TayJ9/ask-ai-master-89262
2. Download ZIP
3. Extract `backend/voiceServer.js` to your project

**Option B: Ask me to create it**
Just say: "Create the backend/voiceServer.js file" and I'll generate it for you!

**Option C: Create manually**
```powershell
# Create backend folder
mkdir backend

# Then I'll help you create the file content
```

---

### Issue 2: Missing npm scripts

**Symptom:** `npm run dev` says "Missing script: dev"

**Fix:**
1. Open `package.json`
2. Make sure `scripts` section has:
```json
"scripts": {
  "dev": "nodemon server.js",
  "server": "node server.js"
}
```

---

### Issue 3: Missing dependencies

**Symptom:** "Cannot find module 'express'" (or other modules)

**Fix:**
```powershell
npm install
```

---

### Issue 4: Missing .env file

**Symptom:** Server runs but OpenAI API key error

**Fix:**
```powershell
# Copy example file
copy .env.example .env

# Edit .env and add your OPENAI_API_KEY
```

---

## 📝 Step-by-Step Verification

### Step 1: Run Verification Script
```powershell
node verify_and_fix_setup.js
```

### Step 2: Review Output
The script will show:
- ✅ What exists
- ❌ What's missing
- ⚠️ What needs attention

### Step 3: Fix Missing Files
Based on the output, fix missing files:
- If `backend/voiceServer.js` is missing → Re-download or ask me to create it
- If scripts are missing → Update `package.json`
- If dependencies are missing → Run `npm install`

### Step 4: Verify Again
```powershell
node verify_and_fix_setup.js
```

Should show all ✅ checks passed!

### Step 5: Start Server
```powershell
npm run dev
```

---

## 🎯 Expected Output

When everything is correct, you should see:

```
✅ All checks passed! Your setup looks good.

🚀 Next steps:
   1. Make sure .env has your OPENAI_API_KEY
   2. Run: npm install
   3. Run: npm run dev
```

---

## 💡 Need Help?

Just ask me:
- "Check if backend folder exists"
- "Create the missing backend files"
- "Verify my setup"
- "Fix the server errors"

I'm here to help! 🚀











