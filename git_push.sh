#!/bin/bash
# Simple direct GitHub push - no Replit needed
# Usage: ./git_push.sh [commit_message]

set -e

COMMIT_MSG="${1:-Update}"

echo "📝 Staging changes..."
git add -A

echo "💾 Committing..."
git commit -m "$COMMIT_MSG" || echo "No changes to commit"

echo "⬆️  Pushing to GitHub..."
if git push origin main; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    echo "🚂 Railway will auto-deploy backend"
    echo "🌐 Vercel will auto-deploy frontend"
else
    echo ""
    echo "❌ Push failed - authentication required"
    echo ""
    echo "Quick setup (one-time):"
    echo "  1. Get GitHub token: https://github.com/settings/tokens/new"
    echo "  2. Run: git push origin main"
    echo "     Username: TayJ9"
    echo "     Password: [paste token]"
    echo "  3. Credentials saved - future pushes work automatically!"
    exit 1
fi

