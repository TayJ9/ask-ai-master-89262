#!/bin/bash
# Quick script to check server status and view recent logs

echo "=== Checking Server Status ==="
echo ""

echo "1. Checking if Node.js server is running..."
ps aux | grep -E "node|tsx" | grep -v grep || echo "   ❌ Node.js server not running"
echo ""

echo "2. Checking if Python server is running..."
ps aux | grep -E "python.*app.py|flask" | grep -v grep || echo "   ❌ Python server not running"
echo ""

echo "3. Checking what's listening on port 5000..."
lsof -i :5000 2>/dev/null || echo "   ❌ Nothing listening on port 5000"
echo ""

echo "=== Testing Endpoints ==="
echo ""

echo "4. Testing Node.js server health..."
curl -s http://localhost:5000/api/auth/me 2>&1 | head -1 || echo "   ❌ Cannot connect to Node.js server"
echo ""

echo "5. Testing Python backend health (port 5001)..."
curl -s http://localhost:5001/health 2>&1 || echo "   ❌ Cannot connect to Python backend on port 5001"
echo ""

echo "3b. Checking what's listening on port 5001..."
lsof -i :5001 2>/dev/null || echo "   ❌ Nothing listening on port 5001 (Python backend not running)"
echo ""

echo "=== Logs Location ==="
echo ""
echo "Check the Replit Console/Logs panel for:"
echo "  - [VOICE-INTERVIEW-START] logs"
echo "  - Authentication check logs"
echo "  - Error messages"
echo ""

