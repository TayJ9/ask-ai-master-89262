# Quick Start - Python Backend

## Step 1: Install Dependencies

Since you're already in the `python_backend` directory, run:

```bash
python -m pip install -r requirements.txt
```

**Important:** You're already IN the `python_backend` folder, so use `requirements.txt` (not `python_backend/requirements.txt`)

## Step 2: Start the Backend

After dependencies are installed:

```bash
python app.py
```

You should see:
```
Starting Python Flask backend on port 5001
Set PORT environment variable to use a different port
 * Running on http://0.0.0.0:5001
 * Debug mode: on
```

## Troubleshooting

### If `python -m pip` doesn't work:
Try just:
```bash
pip install -r requirements.txt
```

### If you get "command not found":
- Make sure you're in the `python_backend` directory
- Check Python is installed: `python --version`

### Installation takes time:
- Google Cloud packages are large (several hundred MB)
- Wait for it to complete - this is normal!

## Verify It's Working

In another terminal:
```bash
curl http://localhost:5001/health
```

Should return: `{"status": "healthy"}`

