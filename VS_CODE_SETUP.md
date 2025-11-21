# VS Code Setup Guide

## Opening This Repository in VS Code

### Option 1: Open Existing Folder
1. Open VS Code
2. Go to **File > Open Folder...** (or `Ctrl+K Ctrl+O` / `Cmd+K Cmd+O`)
3. Navigate to your workspace folder:
   ```
   /home/runner/workspace
   ```
4. Click "Select Folder"

### Option 2: Use Command Line
```bash
cd /home/runner/workspace
code .
```

### Option 3: Clone to Local Machine
If you want to work on your local machine:

1. **If this is a Git repository:**
   ```bash
   git clone <repository-url> <your-local-folder>
   cd <your-local-folder>
   code .
   ```

2. **If you need to initialize Git:**
   ```bash
   cd /home/runner/workspace
   git init
   git add .
   git commit -m "Initial commit"
   # Then push to your remote repository
   ```

## Recommended VS Code Extensions

For this Node.js/TypeScript project, consider installing:

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **TypeScript and JavaScript Language Features** - Built-in
- **Thunder Client** or **REST Client** - API testing
- **GitLens** - Git integration
- **Error Lens** - Inline error highlighting

## Workspace Settings

VS Code will automatically detect:
- TypeScript configuration (`tsconfig.json`)
- Node.js project structure
- Package.json dependencies

## Working with the Project

### Terminal in VS Code
- Open integrated terminal: `` Ctrl+` `` (backtick)
- Run commands directly:
  ```bash
  npm run dev          # Start development server
  node verify_setup.js # Verify setup
  ```

### Debugging
VS Code can debug Node.js:
- Set breakpoints in `.js` files
- Use "Run and Debug" panel
- Select "Node.js" configuration

### File Structure
The project structure is already set up:
```
workspace/
├── server.js                    # Main server
├── backend/
│   └── voiceServer.js          # Voice interview server
├── src/
│   ├── components/            # React components
│   └── pages/                 # Page components
└── package.json               # Dependencies
```

## Tips

1. **Multi-root Workspace**: If you have multiple folders, use File > Add Folder to Workspace
2. **Git Integration**: VS Code has built-in Git support
3. **Extensions**: Install extensions for better development experience
4. **Terminal**: Use integrated terminal for running npm commands

## Troubleshooting

### Can't see files?
- Check if you opened the correct folder
- Use File > Open Folder to navigate

### Extensions not working?
- Reload VS Code: `Ctrl+Shift+P` > "Reload Window"
- Check extension compatibility

### Terminal issues?
- Check terminal shell: Settings > Terminal > Integrated > Shell
- Try opening new terminal: `` Ctrl+Shift+` ``


