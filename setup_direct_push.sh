#!/bin/bash
# One-time setup script to enable direct GitHub pushing
# Removes Replit dependency completely

set -e

echo "🔧 Setting up direct GitHub push (removing Replit dependency)..."

# Disable Replit askpass
git config --global core.askPass ""
unset GIT_ASKPASS

# Enable credential storage
git config --global credential.helper 'store --file ~/.git-credentials'

# Enable terminal prompts
export GIT_TERMINAL_PROMPT=1

echo ""
echo "✅ Git configured for direct authentication"
echo ""
echo "📝 Next steps:"
echo ""
echo "1. Create GitHub token:"
echo "   https://github.com/settings/tokens/new"
echo "   - Name: 'Direct Push'"
echo "   - Scopes: ✅ repo (all)"
echo ""
echo "2. Push (will prompt for credentials):"
echo "   git push origin main"
echo ""
echo "   When prompted:"
echo "   Username: TayJ9"
echo "   Password: [paste your token]"
echo ""
echo "✅ Credentials will be saved automatically!"
echo ""
echo "3. Future pushes:"
echo "   ./git_push.sh 'Your commit message'"
echo "   (No authentication needed after first push)"

