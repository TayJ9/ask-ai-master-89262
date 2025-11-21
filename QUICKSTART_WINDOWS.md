# Quick Start - Windows (PowerShell)

## Where are your project files?

The project files need to be on your Windows machine. They're probably in one of these places:

1. **If you downloaded/cloned the project:**
   - Check your Downloads folder: `C:\Users\tayjs\Downloads`
   - Check your Documents folder: `C:\Users\tayjs\Documents`
   - Or wherever you saved the project

2. **If you're using Git:**
   ```powershell
   # Navigate to where you cloned the repo
   cd C:\Users\tayjs\Documents\your-project-name
   # or
   cd C:\Users\tayjs\Desktop\your-project-name
   ```

3. **If you're using Cursor/VS Code:**
   - The workspace folder should be shown in the file explorer
   - Right-click the `workspace` folder and select "Open in Terminal" or "Reveal in File Explorer"

---

## Step 1: Find Your Project Directory

### Option A: Using File Explorer
1. Open File Explorer
2. Navigate to where you saved the project (Downloads, Documents, Desktop, etc.)
3. Look for a folder called `workspace` or your project name
4. Right-click the folder → "Open in Terminal" or "Open PowerShell window here"

### Option B: Using PowerShell
```powershell
# List folders in your current directory
ls

# Or search for the workspace folder
Get-ChildItem -Path C:\Users\tayjs -Recurse -Directory -Filter "workspace" -ErrorAction SilentlyContinue
```

### Option C: Check if you're already in the project
```powershell
# Check current directory
pwd
# or
Get-Location

# List files to see if you're in the right place
ls
# You should see: index.js, package.json, test/, etc.
```

---

## Step 2: Navigate to Project Directory

Once you find your project folder, navigate there:

```powershell
# Example: if project is in Documents
cd C:\Users\tayjs\Documents\workspace

# Example: if project is in Downloads  
cd C:\Users\tayjs\Downloads\workspace

# Example: if project is on Desktop
cd C:\Users\tayjs\Desktop\workspace

# Check you're in the right place
ls
# Should show: index.js, package.json, test/, etc.
```

---

## Step 3: Install Dependencies

```powershell
npm install
```

**Expected output:**
```
added 66 packages...
```

---

## Step 4: Start the Server

```powershell
npm start
```

**Expected output:**
```
Serving function...
Function: dialogflowWebhook
URL: http://localhost:8080/
```

**⚠️ Keep this PowerShell window open** - the server runs here.

---

## Step 5: Test in a New PowerShell Window

Open a **new PowerShell window** (keep the server running) and run:

```powershell
# Test health endpoint
curl http://localhost:8080/health
```

**Expected:** `{"status":"ok"}`

```powershell
# Test webhook (use backticks for line continuation in PowerShell)
curl -X POST http://localhost:8080/ `
  -H "Content-Type: application/json" `
  -d '{\"fulfillmentInfo\":{\"tag\":\"Interview\"},\"sessionInfo\":{\"parameters\":{\"major\":\"Computer Science\"}}}'
```

**Or use Invoke-WebRequest (PowerShell native):**
```powershell
$body = @{
    fulfillmentInfo = @{
        tag = "Interview"
    }
    sessionInfo = @{
        parameters = @{
            major = "Computer Science"
        }
    }
} | ConvertTo-Json -Depth 10

Invoke-WebRequest -Uri http://localhost:8080/ -Method POST -Body $body -ContentType "application/json" | Select-Object -ExpandProperty Content
```

**Expected:** JSON response with a question.

---

## Step 6: Run Tests

Stop the server (Ctrl+C) and run:

```powershell
npm test
```

---

## Windows-Specific Tips

### PowerShell vs Command Prompt
- **PowerShell** (what you're using): More modern, better JSON handling
- **Command Prompt (cmd)**: Older, simpler, but works too

### Path Syntax
- **PowerShell**: Can use forward slashes `/` or backslashes `\`
- **Command Prompt**: Use backslashes `\`
- **Examples:**
  ```powershell
  # Both work in PowerShell
  cd C:\Users\tayjs\Documents
  cd C:/Users/tayjs/Documents
  ```

### Node.js on Windows
- Make sure Node.js is installed: `node --version`
- If not installed, download from: https://nodejs.org/
- Restart PowerShell after installing Node.js

### Port Already in Use
```powershell
# Find process using port 8080
netstat -ano | findstr :8080

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

---

## Quick Check: Are You in the Right Directory?

Run this to verify:

```powershell
# Check current directory
pwd

# List files - you should see:
ls
# Expected: index.js, package.json, test/, TROUBLESHOOTING.md, etc.

# If you don't see these files, you're in the wrong directory!
```

---

## Still Can't Find It?

1. **If using Cursor/VS Code:**
   - Look at the file explorer sidebar
   - The open folder is your workspace
   - Right-click `index.js` → "Reveal in File Explorer"

2. **If you downloaded a ZIP:**
   - Extract the ZIP file first
   - Navigate to the extracted folder

3. **If using Git:**
   ```powershell
   # Clone the repo first (if you haven't)
   cd C:\Users\tayjs\Documents
   git clone <your-repo-url>
   cd <repo-name>
   ```

4. **Check if files exist:**
   ```powershell
   # Search for index.js
   Get-ChildItem -Path C:\Users\tayjs -Recurse -Filter "index.js" -ErrorAction SilentlyContinue
   ```


