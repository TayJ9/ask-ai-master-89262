# Automatic GitHub Push Guide

## Quick Start

You can automatically push changes to GitHub using the provided PowerShell script.

### Basic Usage

```powershell
# From the project directory, run:
.\auto_push.ps1

# Or with a custom commit message:
.\auto_push.ps1 "Your commit message here"
```

### What It Does

1. ✅ Checks for uncommitted changes
2. ✅ Stages all changes (`git add -A`)
3. ✅ Commits with your message (or auto-generated timestamp)
4. ✅ Pushes to GitHub (`git push origin main`)

## Authentication Setup (One-Time)

Before the script can push, you need to authenticate with GitHub:

### Option 1: Personal Access Token (Recommended)

1. **Create a token:**
   - Go to: https://github.com/settings/tokens/new
   - Name: "Auto Push"
   - Scopes: ✅ **repo** (all)
   - Click "Generate token"
   - **Copy the token immediately** (you won't see it again!)

2. **Save credentials (one-time):**
   ```powershell
   git push origin main
   # When prompted:
   # Username: TayJ9
   # Password: [paste your token here]
   ```

3. **Done!** Future pushes will work automatically.

### Option 2: Environment Variable

If you prefer using an environment variable:

```powershell
# Set token (current session only)
$env:GITHUB_TOKEN = "your_token_here"

# Update remote URL
git remote set-url origin https://TayJ9:$env:GITHUB_TOKEN@github.com/TayJ9/ask-ai-master-89262.git

# Now auto_push.ps1 will work
.\auto_push.ps1
```

### Option 3: SSH Key (Most Secure)

1. **Generate SSH key:**
   ```powershell
   ssh-keygen -t ed25519 -C "your_email@example.com"
   # Press Enter to accept defaults
   ```

2. **Add to GitHub:**
   ```powershell
   # Copy public key
   cat ~/.ssh/id_ed25519.pub
   ```
   - Go to: https://github.com/settings/ssh/new
   - Paste the public key
   - Click "Add SSH key"

3. **Update remote:**
   ```powershell
   git remote set-url origin git@github.com:TayJ9/ask-ai-master-89262.git
   ```

## Usage Examples

### Daily Workflow

```powershell
# Make your changes to files...

# Then push automatically:
.\auto_push.ps1 "Fixed bug in audio processing"
```

### Auto-commit with Timestamp

```powershell
# Uses automatic timestamp message
.\auto_push.ps1
# Commit message: "Auto-commit: 2024-01-15 14:30:45"
```

### Check Status First

```powershell
# See what will be committed
git status

# Then push
.\auto_push.ps1 "Descriptive commit message"
```

## Troubleshooting

### "Authentication failed"
- ✅ Verify your token has `repo` scope
- ✅ Check token hasn't expired
- ✅ Try regenerating the token

### "Nothing to commit"
- ✅ This is normal if there are no changes
- ✅ Make sure you've saved your files

### "Permission denied" (SSH)
- ✅ Verify SSH key is added to GitHub
- ✅ Test: `ssh -T git@github.com`
- ✅ Check: `git remote -v` shows SSH URL

### Script won't run
- ✅ Make sure you're in the project directory
- ✅ Check PowerShell execution policy: `Get-ExecutionPolicy`
- ✅ If restricted, run: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

## Integration with Auto-Deploy

After pushing:
- 🚂 **Railway** will automatically deploy the backend
- 🌐 **Vercel** will automatically deploy the frontend

Check deployments:
- Railway: https://railway.app
- Vercel: https://vercel.com

## Advanced: Git Hooks (Automatic on Commit)

If you want to automatically push on every commit, you can set up a git hook:

```powershell
# Create post-commit hook
New-Item -Path .git\hooks\post-commit -ItemType File -Force
Add-Content -Path .git\hooks\post-commit -Value @"
#!/bin/sh
git push origin main
"@
```

Note: This requires authentication to be set up first.
