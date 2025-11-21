# Troubleshooting npm Scripts Not Showing

## Problem
`npm run` only shows "test" script, but your package.json has "dev" and "server"

## Possible Causes & Solutions

### 1. Package.json Not Saved
- Make sure you saved `package.json` in VS Code (Ctrl+S)
- Check the file tab shows no unsaved indicator

### 2. Syntax Error in package.json
- Check for missing commas, quotes, or brackets
- Validate JSON syntax

### 3. Wrong Directory
- Make sure you're in the folder with `package.json`
- Check: `dir package.json` should show the file

### 4. npm Cache Issue
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again

---

## Quick Fix Steps

### Step 1: Verify You're in Right Folder
```powershell
# Check current directory
pwd

# Should show: C:\Users\tayjs\OneDrive - College of Charleston\Desktop\College_Interview_AI_

# Verify package.json exists
Test-Path package.json
# Should return: True
```

### Step 2: Check package.json Content
```powershell
# View package.json
Get-Content package.json
```

### Step 3: Validate JSON Syntax
```powershell
# Try to parse JSON
node -e "require('./package.json')"
```

### Step 4: Reinstall Dependencies
```powershell
# Remove node_modules and lock file
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue

# Reinstall
npm install
```

### Step 5: Try Again
```powershell
npm run
```

---

## Alternative: Run Commands Directly

If scripts still don't work, run commands directly:

```powershell
# Instead of npm run dev, use:
node server.js

# Or install nodemon globally and use:
npm install -g nodemon
nodemon server.js
```

---

## Verify package.json Format

Your package.json should look exactly like this (no extra spaces, correct commas):

```json
{
  "main": "index.js",
  "type": "commonjs",
  "dependencies": {
    "@google-cloud/functions-framework": "^3.0.0",
    "cors": "^2.8.5",
    "dotenv": "^17.2.3",
    "express": "^4.21.2",
    "multer": "^2.0.2",
    "uuid": "^13.0.0",
    "ws": "^8.18.3"
  },
  "scripts": {
    "start": "functions-framework --target=dialogflowWebhook",
    "test": "node test/run-tests.js",
    "dev": "nodemon server.js",
    "server": "node server.js"
  },
  "devDependencies": {
    "nodemon": "^3.1.11"
  }
}
```

Make sure:
- No trailing commas after last items in objects/arrays
- All strings are in double quotes
- Commas between properties
- Proper closing braces

