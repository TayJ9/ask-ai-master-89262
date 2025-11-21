# Navigate to Correct Project Folder

## Problem
You're running commands from the wrong folder!

Your project files are in a **subfolder** called `ask-ai-master-89262-main`, but you're running commands from the parent folder `College_Interview_AI_`.

## Solution: Navigate to the Project Folder

### In VS Code Terminal, run:

```powershell
# Navigate into the project folder
cd ask-ai-master-89262-main

# Verify you're in the right place
pwd
# Should show: ...\College_Interview_AI_\ask-ai-master-89262-main

# Check that package.json exists here
Test-Path package.json
# Should return: True

# Now install dependencies
npm install

# Now run dev
npm run dev
```

---

## Alternative: Move Files Up One Level

If you want to work from the parent folder instead:

### Option 1: Move files manually
1. Open File Explorer
2. Go to: `College_Interview_AI_\ask-ai-master-89262-main`
3. Select ALL files and folders
4. Cut (Ctrl+X)
5. Go up to: `College_Interview_AI_`
6. Paste (Ctrl+V)
7. Delete the now-empty `ask-ai-master-89262-main` folder

### Option 2: Use PowerShell commands
```powershell
# Navigate to parent folder
cd "C:\Users\tayjs\OneDrive - College of Charleston\Desktop\College_Interview_AI_"

# Move all files from subfolder to current folder
Move-Item -Path "ask-ai-master-89262-main\*" -Destination . -Force

# Remove empty subfolder
Remove-Item -Path "ask-ai-master-89262-main" -Force
```

---

## Recommended: Just Navigate Into the Folder

The easiest solution is to just `cd` into the subfolder:

```powershell
cd ask-ai-master-89262-main
npm install
npm run dev
```

---

## Verify You're in the Right Place

After navigating, check:

```powershell
# Should show the subfolder path
pwd

# Should list project files
dir

# Should see: server.js, package.json, backend/, src/, etc.
```

---

## Quick Fix Steps

1. **Navigate to project folder:**
   ```powershell
   cd ask-ai-master-89262-main
   ```

2. **Install dependencies:**
   ```powershell
   npm install
   ```

3. **Start server:**
   ```powershell
   npm run dev
   ```

That's it! The project files are in that subfolder.

