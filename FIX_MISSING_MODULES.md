# Fix "Cannot find module 'uuid'" Error

## Problem
```
Error: Cannot find module 'uuid'
```

This means dependencies haven't been installed.

## Solution: Install Dependencies

### In VS Code Terminal, run:

```powershell
npm install
```

This will install all packages listed in `package.json`, including:
- uuid
- express
- cors
- dotenv
- multer
- ws
- nodemon (dev dependency)

---

## After npm install

Once `npm install` completes, try starting the server again:

```powershell
npm run dev
```

---

## If npm install fails

### Check Node.js version:
```powershell
node --version
```
Should be v14+ (you have v24.11.1, which is fine)

### Clear cache and retry:
```powershell
npm cache clean --force
npm install
```

### If still failing, check internet connection:
```powershell
npm install --verbose
```

---

## Quick Fix Steps

1. **Stop the server** (Ctrl+C if it's still running)
2. **Run**: `npm install`
3. **Wait for installation** (may take 1-2 minutes)
4. **Run**: `npm run dev`
5. **Server should start!**

---

## Expected Output After npm install

You should see something like:
```
added 150 packages, and audited 151 packages in 30s
```

Then `npm run dev` should work!

