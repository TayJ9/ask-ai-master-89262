# Correct Commands to Run

## ⚠️ Important: Navigate to workspace first!

The project files are in `/home/runner/workspace`, NOT `/home/runner`.

---

## Step 1: Navigate to Workspace Directory

```bash
cd /home/runner/workspace
```

**Verify you're in the right place:**
```bash
pwd
# Should show: /home/runner/workspace

ls
# Should show: index.js, package.json, test/, etc.
```

---

## Step 2: Install Dependencies (if not already done)

```bash
cd /home/runner/workspace
npm install
```

---

## Step 3: Start the Server

```bash
cd /home/runner/workspace
npm start
```

**Expected output:**
```
Serving function...
Function: dialogflowWebhook
URL: http://localhost:8080/
```

**⚠️ Keep this terminal open** - the server runs here.

---

## Step 4: Test in a New Terminal

Open a **new terminal** and run:

```bash
# Make sure you're in workspace directory
cd /home/runner/workspace

# Test health endpoint
curl http://localhost:8080/health

# Test webhook
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "fulfillmentInfo": {
      "tag": "Interview"
    },
    "sessionInfo": {
      "parameters": {
        "major": "Computer Science"
      }
    }
  }'
```

---

## Step 5: Run Tests

Stop the server (Ctrl+C) and run:

```bash
cd /home/runner/workspace
npm test
```

---

## Quick One-Liner to Remember

**Always start with:**
```bash
cd /home/runner/workspace
```

**Then run your command:**
```bash
npm install    # or npm start, or npm test, etc.
```

---

## Common Mistake

❌ **Wrong:**
```bash
cd /home/runner
npm install    # ERROR: Can't find package.json
```

✅ **Correct:**
```bash
cd /home/runner/workspace
npm install    # SUCCESS!
```

---

## Pro Tip: Create an Alias

Add this to your `~/.bashrc` or `~/.zshrc`:

```bash
alias ws='cd /home/runner/workspace'
```

Then just type `ws` to navigate there quickly!


