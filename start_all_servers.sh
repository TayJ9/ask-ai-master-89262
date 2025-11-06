#!/bin/bash
# Start both Node.js and Python servers for the application

echo "Starting application servers..."

# Start Python Flask backend in background
echo "Starting Python backend on port 5001..."
cd python_backend
PORT=5001 python app.py &
PYTHON_PID=$!
cd ..

# Wait a moment for Python to start
sleep 2

# Start Node.js server
echo "Starting Node.js server on port 5000..."
npm run dev

# If Node.js exits, kill Python backend
echo "Shutting down..."
kill $PYTHON_PID 2>/dev/null

