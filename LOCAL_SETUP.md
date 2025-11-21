# Local Setup Guide - VS Code

## 🎯 Goal: Copy this codebase to your local VS Code folder

## Method 1: Using Git Clone (Recommended)

If this repository is on GitHub/GitLab/Bitbucket:

### Step 1: Get Repository URL
```bash
# In your current workspace, check the remote:
git remote -v
```

### Step 2: Clone to Your Local Folder
1. **Open your empty folder in VS Code**
2. **Open integrated terminal** (`` Ctrl+` `` or View > Terminal)
3. **Clone the repository:**
   ```bash
   git clone <repository-url> .
   ```
   (The `.` clones into the current folder)

### Step 3: Install Dependencies
```bash
npm install
```

### Step 4: Set Up Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your OPENAI_API_KEY
# Open .env file and add:
OPENAI_API_KEY=your_actual_api_key_here
PORT=3001
```

### Step 5: Verify Setup
```bash
node verify_setup.js
```

### Step 6: Start the Server
```bash
npm run dev
```

---

## Method 2: Manual Copy (If Git Clone Doesn't Work)

### Step 1: Copy All Files
Copy these files/folders from `/home/runner/workspace` to your VS Code folder:

**Essential Files:**
- `server.js`
- `upload.js`
- `package.json`
- `package-lock.json`
- `.env.example`
- `resume_parser.py`

**Essential Folders:**
- `backend/` (contains `voiceServer.js`)
- `src/` (all frontend code)
- `public/` (if exists)
- `uploads/` (will be created automatically)

**Optional but Helpful:**
- `verify_setup.js`
- `QUICK_START.md`
- `VS_CODE_SETUP.md`

### Step 2: In Your VS Code Folder Terminal

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Then edit .env and add OPENAI_API_KEY

# Create uploads directory
mkdir -p uploads

# Verify setup
node verify_setup.js

# Start server
npm run dev
```

---

## Method 3: Using Git Init (If Starting Fresh)

If you want to initialize Git in your local folder:

```bash
# In your VS Code folder terminal:

# Initialize git
git init

# Add remote (if you have one)
git remote add origin <repository-url>

# Pull or copy files from remote
git pull origin main
# OR manually copy files as in Method 2

# Install dependencies
npm install

# Set up .env
cp .env.example .env
# Edit .env with your OPENAI_API_KEY

# Start server
npm run dev
```

---

## 📋 Quick Setup Checklist

Once files are in your VS Code folder:

- [ ] Files copied/cloned
- [ ] Run `npm install`
- [ ] Create `.env` file with `OPENAI_API_KEY`
- [ ] Run `node verify_setup.js` to verify
- [ ] Run `npm run dev` to start server
- [ ] Test: `curl http://localhost:3001/health`

---

## 🔧 Troubleshooting

### "npm: command not found"
- Install Node.js: https://nodejs.org/
- Restart VS Code after installing

### "Cannot find module"
- Run `npm install` again
- Check `package.json` has all dependencies

### "OPENAI_API_KEY not set"
- Create `.env` file in root folder
- Add: `OPENAI_API_KEY=your_key_here`

### Port already in use
- Change PORT in `.env`: `PORT=3002`
- Or stop other process using port 3001

---

## 🚀 After Setup

Your server should be running at:
- **HTTP**: http://localhost:3001
- **WebSocket**: ws://localhost:3001/voice
- **Health Check**: http://localhost:3001/health

Test it:
```bash
curl http://localhost:3001/health
```

