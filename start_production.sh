#!/bin/bash
# Start both servers in production mode

set -e  # Exit on error

echo "=========================================="
echo "Starting Production Servers"
echo "=========================================="

# Change to script directory
cd "$(dirname "$0")"

# Install Python dependencies if needed
echo "Checking Python dependencies..."
cd python_backend
if [ -f "requirements.txt" ]; then
    echo "Installing Python dependencies..."
    pip install -r requirements.txt --quiet --disable-pip-version-check 2>&1 | grep -v "already satisfied" || true
fi

# Start Python backend in background
echo "Starting Python backend on port 5001..."
PORT=5001 python app.py > /tmp/python_backend.log 2>&1 &
PYTHON_PID=$!

# Wait for Python backend to be ready
echo "Waiting for Python backend to start..."
BACKEND_READY=false
for i in {1..30}; do
    # Try to connect to health endpoint (use timeout to avoid hanging)
    if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/5001" 2>/dev/null || \
       curl -s -f http://127.0.0.1:5001/health > /dev/null 2>&1; then
        # Verify it actually responds
        if curl -s http://127.0.0.1:5001/health | grep -q "healthy"; then
            echo "✅ Python backend is ready!"
            BACKEND_READY=true
            break
        fi
    fi
    sleep 1
done

if [ "$BACKEND_READY" = false ]; then
    echo "❌ Python backend failed to start. Check logs:"
    tail -20 /tmp/python_backend.log
    kill $PYTHON_PID 2>/dev/null || true
    exit 1
fi

# Start Node.js server (foreground - this keeps the deployment alive)
cd ..
echo "Starting Node.js server on port 5000..."
echo "=========================================="
NODE_ENV=production tsx server/index.ts

# If Node.js exits, kill Python backend
echo "Node.js server stopped. Cleaning up..."
kill $PYTHON_PID 2>/dev/null || true

