# How to Create .env File in VS Code

## Method 1: Copy from Example (Easiest)

### In VS Code Terminal:
```powershell
copy .env.example .env
```

### Then Edit .env File:
1. Click on `.env` file in VS Code file explorer
2. It should contain:
   ```
   PORT=3001
   OPENAI_API_KEY=your_openai_api_key_here
   ```
3. Replace `your_openai_api_key_here` with your actual OpenAI API key
4. Save the file (Ctrl+S)

---

## Method 2: Create New File Manually

### Step 1: Create the File
1. In VS Code file explorer (left sidebar), right-click
2. Select **"New File"**
3. Type exactly: `.env` (with the dot at the beginning)
4. Press Enter

### Step 2: Add Content
Copy and paste this into the `.env` file:
```
PORT=3001
OPENAI_API_KEY=your_openai_api_key_here
```

### Step 3: Replace API Key
- Replace `your_openai_api_key_here` with your actual OpenAI API key
- Get your key from: https://platform.openai.com/api-keys

### Step 4: Save
- Press **Ctrl+S** to save

---

## Method 3: Using PowerShell Command

### In VS Code Terminal:
```powershell
# Create .env file with content
@"
PORT=3001
OPENAI_API_KEY=your_openai_api_key_here
"@ | Out-File -FilePath .env -Encoding utf8
```

Then edit `.env` and replace `your_openai_api_key_here` with your actual key.

---

## Verify .env File Was Created

In VS Code terminal:
```powershell
# Check if file exists
Test-Path .env

# View contents (will show your API key, so be careful!)
Get-Content .env
```

---

## Important Notes

1. **File name must be exactly**: `.env` (with the dot)
2. **No spaces** around the `=` sign
3. **No quotes** needed around values (unless they contain spaces)
4. **Get your OpenAI API key** from: https://platform.openai.com/api-keys

---

## Example .env File Content

```
PORT=3001
OPENAI_API_KEY=sk-proj-4lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Replace the `sk-proj-4l...` part with your actual API key!

---

## Troubleshooting

### File not showing in VS Code?
- Refresh file explorer: Right-click → Refresh
- Or restart VS Code

### Can't create file starting with dot?
- Use Method 1 (copy command) instead
- Or create it via terminal: `New-Item -Path .env -ItemType File`

### File created but not working?
- Make sure it's named exactly `.env` (not `env` or `.env.txt`)
- Check it's in the root folder (same level as `package.json`)
- Verify no extra spaces or quotes

