# Secure API Key Setup Guide

## ✅ Your `.env` file is already protected!

Your `.gitignore` file already excludes `.env` files (line 66), so your API keys will **never** be committed to git.

## How to Add Your OpenAI API Key

### Option 1: Edit the `.env` file directly (Recommended)

1. Open `backend/.env` in your editor
2. Find the line:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```
3. Replace `your_openai_api_key_here` with your actual API key:
   ```
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```
4. Save the file

### Option 2: Set environment variable (Temporary)

**Windows PowerShell:**
```powershell
$env:OPENAI_API_KEY="sk-your-actual-api-key-here"
```

**Linux/Mac:**
```bash
export OPENAI_API_KEY="sk-your-actual-api-key-here"
```

Note: This only lasts for the current terminal session.

## Security Checklist

✅ `.env` is in `.gitignore` - won't be committed  
✅ `.env` is in the backend directory - not in root  
✅ Test scripts load from `.env` automatically  
✅ No hardcoded keys in source code  

## Verify It's Working

After adding your key, run:
```bash
cd backend
npx tsx test-adaptive-evaluator.ts
```

If it works, you'll see the full evaluation results!

## Important Security Notes

1. **Never commit `.env` files** - Already protected by `.gitignore`
2. **Never share your API key** - Keep it private
3. **Rotate keys if exposed** - If you accidentally share it, generate a new one
4. **Use different keys for dev/prod** - Consider separate keys for different environments

## Current `.env` File Location

Your `.env` file is at: `backend/.env`

This file is **already excluded** from git, so it's safe to add your API key there.
