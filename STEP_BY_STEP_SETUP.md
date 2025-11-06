# 🚀 Step-by-Step Setup Guide

## Step 1: Install Python Dependencies

Open a terminal in Replit and run:

```bash
cd python_backend
pip install -r requirements.txt
```

**Wait for this to complete** - it will install all the Python packages needed.

---

## Step 2: Start Both Servers

### Option A: Use Replit's "Run" Button (Easiest)

1. **Click the "Run" button** (top of Replit interface)
2. This will automatically start both servers:
   - Python backend on port 5001
   - Node.js server on port 5000
3. **Watch the console** - you should see:
   - `Starting Python Flask backend on port 5001`
   - `Dialogflow client initialized`
   - `Gemini 2.5 Flash model initialized`
   - `Server running on port 5000`

### Option B: Start Manually (If Run button doesn't work)

**Terminal 1 - Python Backend:**
```bash
cd python_backend
PORT=5001 python app.py
```

**Terminal 2 - Node.js Server:**
Open a NEW terminal (click the "+" button to add a terminal), then:
```bash
npm run dev
```

---

## Step 3: Verify Both Servers Are Running

Open a terminal and run:

```bash
# Check Python backend
curl http://localhost:5001/health

# Should return: {"status": "healthy"}

# Check Node.js server
curl http://localhost:5000/api/auth/me

# Should return: Status 401 (this is correct!)
```

---

## Step 4: Test Your App

1. **Open your app** in the browser (look for the webview panel or URL at the top)
2. **Log in** with your credentials
3. **Select a role** and difficulty
4. **Optionally upload a resume**
5. **Start a voice interview**
6. **Verify**:
   - Audio recording works
   - Agent speaks back
   - Conversation continues
   - You can complete the interview
   - Scoring works at the end

---

## ✅ Success Checklist

- [ ] Python dependencies installed
- [ ] Both servers running (Python 5001, Node.js 5000)
- [ ] Health checks pass
- [ ] App loads in browser
- [ ] Voice interview works
- [ ] Scoring works

**Once all checked, you're ready to publish!** 🎉

---

## 🆘 Troubleshooting

### "pip: command not found"
Use: `python -m pip install -r requirements.txt`

### "ModuleNotFoundError"
Make sure you're in the `python_backend` directory when installing

### "Port already in use"
Kill the existing process or restart Replit

### "Cannot connect to Python backend"
Make sure Python backend is running on port 5001

### "No token provided"
This is normal if you're not logged in - try logging in first

