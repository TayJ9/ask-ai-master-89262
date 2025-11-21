# Windows Setup Guide - VS Code

## 🪟 For Windows Users

### Prerequisites to Install First

1. **Git for Windows** (if using Git method)
   - Download: https://git-scm.com/download/win
   - Install with default settings
   - Restart VS Code after installation

2. **Node.js** (required)
   - Download: https://nodejs.org/ (LTS version)
   - Install with default settings
   - Restart VS Code after installation

---

## Method 1: Download ZIP (Easiest - No Git Needed)

### Step 1: Download Repository
1. Go to: https://github.com/TayJ9/ask-ai-master-89262
2. Click the green **"Code"** button
3. Select **"Download ZIP"**
4. Save the ZIP file

### Step 2: Extract to Your VS Code Folder
1. Right-click the ZIP file → **Extract All...**
2. Extract to: `C:\Users\tayjs\OneDrive - College of Charleston\Desktop\College_Interview_AI_`
3. If it creates a subfolder, move all files up one level

### Step 3: Open in VS Code
1. Open VS Code
2. **File > Open Folder...**
3. Select: `C:\Users\tayjs\OneDrive - College of Charleston\Desktop\College_Interview_AI_`

### Step 4: Install Dependencies
In VS Code terminal (`` Ctrl+` ``), run:
```powershell
npm install
```

### Step 5: Set Up Environment
```powershell
# Copy example file
copy .env.example .env

# Edit .env file in VS Code and add:
# OPENAI_API_KEY=your_actual_key_here
# PORT=3001
```

### Step 6: Verify Setup
```powershell
node verify_setup.js
```

### Step 7: Start Server
```powershell
npm run dev
```

---

## Method 2: Install Git and Clone (Recommended for Updates)

### Step 1: Install Git
1. Download: https://git-scm.com/download/win
2. Run installer
3. Use default settings
4. **Restart VS Code** after installation

### Step 2: Verify Git Installation
In VS Code terminal:
```powershell
git --version
```
Should show: `git version 2.x.x`

### Step 3: Clone Repository
In your VS Code folder terminal:
```powershell
git clone https://github.com/TayJ9/ask-ai-master-89262.git .
```

### Step 4: Continue with Steps 4-7 from Method 1

---

## PowerShell Commands Reference

### Check if Node.js is installed:
```powershell
node --version
npm --version
```

### If Node.js not found:
- Install from: https://nodejs.org/
- Restart VS Code

### Check if Git is installed:
```powershell
git --version
```

### If Git not found:
- Install from: https://git-scm.com/download/win
- Restart VS Code

### Common PowerShell Commands:
```powershell
# List files
dir
# or
ls

# Change directory
cd "C:\path\to\folder"

# Create folder
mkdir folder-name

# Copy file
copy source.txt destination.txt

# Run npm commands
npm install
npm run dev
```

---

## Troubleshooting Windows Issues

### "npm: command not found"
- Install Node.js: https://nodejs.org/
- Restart VS Code
- Verify: `node --version`

### "git: command not found"
- Install Git: https://git-scm.com/download/win
- Restart VS Code
- Or use ZIP download method instead

### "bash: command not found"
- You're in PowerShell, not bash (this is fine!)
- Use PowerShell commands instead
- Or install Git Bash if you prefer bash

### Path with spaces (OneDrive folder)
- Use quotes: `cd "C:\Users\tayjs\OneDrive - College of Charleston\Desktop\College_Interview_AI_"`
- Or navigate in VS Code File Explorer instead

### Permission errors
- Run VS Code as Administrator (right-click → Run as administrator)
- Or check folder permissions

---

## Quick Start Checklist

- [ ] Install Node.js (if not installed)
- [ ] Download repository (ZIP or Git clone)
- [ ] Open folder in VS Code
- [ ] Run `npm install` in terminal
- [ ] Create `.env` file with `OPENAI_API_KEY`
- [ ] Run `node verify_setup.js`
- [ ] Run `npm run dev`
- [ ] Test: Open http://localhost:3001/health in browser

---

## Your Current Path
```
C:\Users\tayjs\OneDrive - College of Charleston\Desktop\College_Interview_AI_
```

This path works fine! Just make sure to:
- Use quotes if typing in terminal: `cd "C:\Users\tayjs\OneDrive - College of Charleston\Desktop\College_Interview_AI_"`
- Or use VS Code File Explorer to navigate

