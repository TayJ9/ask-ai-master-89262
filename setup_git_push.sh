#!/bin/bash
# Setup script for automatic git pushing in Replit

echo "🔧 Setting up automatic git push..."

# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ GITHUB_TOKEN not found in environment"
    echo ""
    echo "To enable automatic pushing:"
    echo "1. Create a GitHub Personal Access Token:"
    echo "   https://github.com/settings/tokens/new"
    echo "   - Name: 'Replit Auto Push'"
    echo "   - Scopes: ✅ repo (all)"
    echo ""
    echo "2. Add it to Replit Secrets:"
    echo "   - Click 🔒 icon (Secrets) in left sidebar"
    echo "   - Add secret: GITHUB_TOKEN = [your token]"
    echo ""
    echo "3. Then run this script again or:"
    echo "   git config --global credential.helper '!f() { echo \"username=TayJ9\"; echo \"password=\$GITHUB_TOKEN\"; }; f'"
    echo "   git push origin main"
    exit 1
fi

# Configure git to use the token
echo "✅ GITHUB_TOKEN found, configuring git..."
git config --global credential.helper '!f() { echo "username=TayJ9"; echo "password=$GITHUB_TOKEN"; }; f'

# Test push
echo "🚀 Attempting to push to GitHub..."
if git push origin main; then
    echo "✅ Successfully pushed to GitHub!"
    echo "🚂 Railway will auto-deploy in a few minutes..."
else
    echo "❌ Push failed. Check your token permissions."
fi

