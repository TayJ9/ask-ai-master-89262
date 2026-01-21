# SSH Key Setup for GitHub

## Quick Setup

### Step 1: Check if you already have an SSH key

```powershell
# Check for existing SSH keys
ls ~/.ssh/id_*.pub
```

If you see files like `id_rsa.pub` or `id_ed25519.pub`, you already have a key! Skip to Step 3.

### Step 2: Generate a new SSH key (if needed)

```powershell
# Generate a new SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Press Enter to accept default location (~/.ssh/id_ed25519)
# Optionally set a passphrase for extra security
```

### Step 3: Start SSH agent and add your key

```powershell
# Start the SSH agent
Get-Service ssh-agent | Set-Service -StartupType Manual
Start-Service ssh-agent

# Add your SSH key to the agent (use full path in PowerShell)
ssh-add $env:USERPROFILE\.ssh\id_ed25519
# Or if you used RSA: ssh-add $env:USERPROFILE\.ssh\id_rsa

# Verify the key was added
ssh-add -l
```

### Step 4: Copy your public key

```powershell
# Display your public key (use full path in PowerShell)
cat $env:USERPROFILE\.ssh\id_ed25519.pub
# Or: cat $env:USERPROFILE\.ssh\id_rsa.pub

# Copy the entire output (starts with ssh-ed25519 or ssh-rsa)
```

### Step 5: Add key to GitHub

1. Go to: https://github.com/settings/ssh/new
2. **Title**: Give it a name (e.g., "Windows PC" or "Auto Push")
3. **Key**: Paste your public key (the entire output from Step 4)
4. Click **"Add SSH key"**

### Step 6: Test the connection

```powershell
# Test SSH connection to GitHub
ssh -T git@github.com
```

You should see:
```
Hi TayJ9! You've successfully authenticated, but GitHub does not provide shell access.
```

## Verify Setup

```powershell
# Check that remote is using SSH
git remote -v
# Should show: git@github.com:TayJ9/ask-ai-master-89262.git

# Test push (will work automatically now)
.\auto_push.ps1 "Test SSH connection"
```

## Troubleshooting

### "Permission denied (publickey)"
- ✅ Make sure SSH agent is running: `Get-Service ssh-agent`
- ✅ Add key to agent: `ssh-add $env:USERPROFILE\.ssh\id_ed25519`
- ✅ Verify key is added: `ssh-add -l`
- ✅ Check key is on GitHub: https://github.com/settings/keys

### "Could not resolve hostname"
- ✅ Check internet connection
- ✅ Try: `ssh -T git@github.com -v` for verbose output

### "Agent admitted failure to sign"
- ✅ Restart SSH agent: `Restart-Service ssh-agent`
- ✅ Re-add key: `ssh-add $env:USERPROFILE\.ssh\id_ed25519`

## Benefits of SSH

✅ **No passwords needed** - Works automatically once set up  
✅ **More secure** - Uses cryptographic keys instead of passwords  
✅ **Persistent** - Works across sessions (if agent is running)  
✅ **Better for automation** - No interactive prompts

## Auto-start SSH Agent (Optional)

To automatically start SSH agent on Windows startup, add to your PowerShell profile:

```powershell
# Edit profile
notepad $PROFILE

# Add these lines:
Get-Service ssh-agent | Set-Service -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
```
