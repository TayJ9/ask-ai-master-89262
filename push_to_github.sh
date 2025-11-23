#!/bin/bash
# Direct GitHub push script - works from any environment
# No Replit dependency required

set -e

echo "🚀 Pushing to GitHub..."

# Check if we have a token
if [ -n "$GITHUB_TOKEN" ]; then
    echo "✅ Using GITHUB_TOKEN from environment"
    git remote set-url origin https://TayJ9:${GITHUB_TOKEN}@github.com/TayJ9/ask-ai-master-89262.git
elif [ -f ~/.git-credentials ]; then
    echo "✅ Using stored git credentials"
else
    echo "⚠️  No authentication found"
    echo ""
    echo "To enable automatic pushing, choose one:"
    echo ""
    echo "OPTION 1: GitHub Personal Access Token (Recommended)"
    echo "  1. Create token: https://github.com/settings/tokens/new"
    echo "     - Name: 'Auto Push'"
    echo "     - Scopes: ✅ repo (all)"
    echo "  2. Run: export GITHUB_TOKEN=your_token"
    echo "  3. Run this script again"
    echo ""
    echo "OPTION 2: SSH Key"
    echo "  1. Generate: ssh-keygen -t ed25519 -C 'your_email@example.com'"
    echo "  2. Add to GitHub: Settings → SSH and GPG keys"
    echo "  3. Run: git remote set-url origin git@github.com:TayJ9/ask-ai-master-89262.git"
    echo ""
    echo "OPTION 3: Store credentials"
    echo "  Run: git push origin main"
    echo "  Enter username: TayJ9"
    echo "  Enter password: [your GitHub token]"
    echo "  Credentials will be saved for future pushes"
    exit 1
fi

# Show commits to push
echo ""
echo "📦 Commits to push:"
git log --oneline origin/main..HEAD 2>/dev/null || echo "Already up to date"

# Push
echo ""
echo "⬆️  Pushing to GitHub..."
if git push origin main; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    echo "🚂 Railway will auto-deploy backend"
    echo "🌐 Vercel will auto-deploy frontend"
    echo ""
    echo "Check deployments:"
    echo "  - Railway: https://railway.app"
    echo "  - Vercel: https://vercel.com"
else
    echo ""
    echo "❌ Push failed"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check your internet connection"
    echo "  2. Verify token has 'repo' scope"
    echo "  3. Try: git push origin main (will prompt for credentials)"
    exit 1
fi
