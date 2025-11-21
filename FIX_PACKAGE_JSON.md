# Fix Missing "dev" Script Issue

## Problem
You're getting: `npm error Missing script: "dev"`

This means your local `package.json` doesn't have the `dev` script.

## Solution: Update package.json

### Option 1: Check Your package.json

In VS Code, open `package.json` and look for the `"scripts"` section. It should have:

```json
"scripts": {
  "start": "functions-framework --target=dialogflowWebhook",
  "test": "node test/run-tests.js",
  "dev": "nodemon server.js",
  "server": "node server.js"
}
```

### Option 2: Add the Missing Script

If the `dev` script is missing, add it:

1. Open `package.json` in VS Code
2. Find the `"scripts"` section
3. Add this line:
   ```json
   "dev": "nodemon server.js",
   ```
4. Save the file

### Option 3: Use Alternative Command

If you can't add the script, use:
```powershell
# Instead of npm run dev, use:
node server.js

# Or install nodemon first:
npm install --save-dev nodemon
node server.js
```

### Option 4: Re-download/Update package.json

If your package.json is outdated:
1. Go to GitHub: https://github.com/TayJ9/ask-ai-master-89262
2. Download the latest `package.json`
3. Replace your local `package.json`

---

## Quick Fix Commands

In VS Code terminal:

```powershell
# Check what scripts you have
npm run

# If dev is missing, add it manually or use:
node server.js

# Or install nodemon and run directly:
npm install --save-dev nodemon
npx nodemon server.js
```

---

## Complete package.json Scripts Section

Your `package.json` should have this in the scripts section:

```json
{
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

Make sure `nodemon` is in `devDependencies` too!

