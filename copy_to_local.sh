#!/bin/bash
# Script to help copy files to local VS Code folder
# Usage: Run this script and follow the prompts

echo "=========================================="
echo "Copy Project to Local VS Code Folder"
echo "=========================================="
echo ""

# Get current directory
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Source directory: $SOURCE_DIR"
echo ""
echo "Please provide the path to your local VS Code folder:"
read -p "Local folder path: " TARGET_DIR

if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory does not exist: $TARGET_DIR"
    exit 1
fi

echo ""
echo "Copying files to: $TARGET_DIR"
echo ""

# Essential files
echo "Copying essential files..."
cp "$SOURCE_DIR/server.js" "$TARGET_DIR/" 2>/dev/null && echo "  ✓ server.js"
cp "$SOURCE_DIR/upload.js" "$TARGET_DIR/" 2>/dev/null && echo "  ✓ upload.js"
cp "$SOURCE_DIR/package.json" "$TARGET_DIR/" 2>/dev/null && echo "  ✓ package.json"
cp "$SOURCE_DIR/package-lock.json" "$TARGET_DIR/" 2>/dev/null && echo "  ✓ package-lock.json"
cp "$SOURCE_DIR/resume_parser.py" "$TARGET_DIR/" 2>/dev/null && echo "  ✓ resume_parser.py"
cp "$SOURCE_DIR/.env.example" "$TARGET_DIR/" 2>/dev/null && echo "  ✓ .env.example"
cp "$SOURCE_DIR/verify_setup.js" "$TARGET_DIR/" 2>/dev/null && echo "  ✓ verify_setup.js"

# Essential folders
echo ""
echo "Copying essential folders..."
if [ -d "$SOURCE_DIR/backend" ]; then
    cp -r "$SOURCE_DIR/backend" "$TARGET_DIR/" 2>/dev/null && echo "  ✓ backend/"
fi

if [ -d "$SOURCE_DIR/src" ]; then
    cp -r "$SOURCE_DIR/src" "$TARGET_DIR/" 2>/dev/null && echo "  ✓ src/"
fi

if [ -d "$SOURCE_DIR/public" ]; then
    cp -r "$SOURCE_DIR/public" "$TARGET_DIR/" 2>/dev/null && echo "  ✓ public/"
fi

# Create uploads directory
mkdir -p "$TARGET_DIR/uploads" && echo "  ✓ uploads/ (created)"

echo ""
echo "=========================================="
echo "✅ Files copied successfully!"
echo "=========================================="
echo ""
echo "Next steps in your VS Code folder:"
echo "1. npm install"
echo "2. cp .env.example .env"
echo "3. Edit .env and add OPENAI_API_KEY"
echo "4. node verify_setup.js"
echo "5. npm run dev"
echo ""

