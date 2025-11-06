# Install Python Dependencies

## Quick Fix

In the same terminal where you ran `python app.py`, run:

```bash
python -m pip install -r python_backend/requirements.txt
```

Or if that doesn't work:

```bash
pip install -r python_backend/requirements.txt
```

Or:

```bash
pip3 install -r python_backend/requirements.txt
```

## What This Installs

The requirements.txt file includes:
- `flask>=3.0.0` - Web framework
- `flask-cors>=4.0.0` - CORS support
- `google-cloud-dialogflow-cx>=5.0.0` - Dialogflow CX client
- `google-auth>=2.0.0` - Google authentication
- `google-generativeai>=0.3.0` - Gemini API
- `google-cloud-firestore>=2.0.0` - Firestore database
- `replit>=3.0.0` - Replit database (optional)

## After Installation

Once dependencies are installed, you can start the Python backend:

```bash
cd python_backend
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

### If pip is not found:
- Try: `python -m pip install ...`
- Try: `python3 -m pip install ...`
- Try: `pip3 install ...`

### If you get permission errors:
- Try: `python -m pip install --user -r requirements.txt`

### If installation is slow:
- This is normal - Google Cloud packages are large
- Wait for it to complete

### If you get "command not found":
- Make sure you're in the correct directory
- Check if Python is installed: `python --version`
- In Replit, Python should be available automatically

