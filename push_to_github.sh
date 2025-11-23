#!/bin/bash
# Script to push commits to GitHub
# Requires GITHUB_TOKEN in Replit Secrets

set -e

echo "🚀 Pushing to GitHub..."

# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ GITHUB_TOKEN not found!"
    echo ""
    echo "To enable automatic pushing:"
    echo "1. Create GitHub Personal Access Token:"
    echo "   https://github.com/settings/tokens/new"
    echo "   - Name: 'Replit Auto Push'"
    echo "   - Scopes: ✅ repo (all)"
    echo ""
    echo "2. Add to Replit Secrets (🔒 icon):"
    echo "   Key: GITHUB_TOKEN"
    echo "   Value: [your token]"
    echo ""
    echo "3. Run this script again"
    exit 1
fi

echo "✅ GITHUB_TOKEN found"

# Configure git remote with token
echo "🔧 Configuring git remote..."
git remote set-url origin https://TayJ9:${GITHUB_TOKEN}@github.com/TayJ9/ask-ai-master-89262.git

# Show commits to be pushed
echo ""
echo "📦 Commits to push:"
git log --oneline origin/main..HEAD || echo "No commits to push"

# Push to GitHub
echo ""
echo "⬆️  Pushing to GitHub..."
if git push origin main; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo "🚂 Railway will auto-deploy backend"
    echo "🌐 Vercel will auto-deploy frontend"
    echo ""
    echo "Next steps:"
    echo "1. Verify Railway deployment in Railway dashboard"
    echo "2. Verify Vercel deployment in Vercel dashboard"
    echo "3. Set NEXT_PUBLIC_API_URL in Vercel to your Railway backend URL"
else
    echo ""
    echo "❌ Push failed. Check:"
    echo "- Token has 'repo' scope"
    echo "- Repository exists and you have access"
    echo "- Network connection"
    exit 1
fi

