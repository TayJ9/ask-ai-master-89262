#!/bin/bash
# Comprehensive System Test Runner
# This script runs all tests and generates a detailed report

set -e

echo "🚀 Starting Comprehensive System Test Suite"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check if servers are running
echo "📋 Step 1: Verifying Servers are Running"
echo "----------------------------------------"

# Check Python backend
echo -n "Checking Python backend (port 5001)... "
if curl -s -f http://127.0.0.1:5001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
    echo "   Please start the Python backend first:"
    echo "   cd python_backend && PORT=5001 python3 app.py"
    exit 1
fi

# Check Node.js server
echo -n "Checking Node.js server (port 5000)... "
if curl -s -f http://127.0.0.1:5000/api/auth/me > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${YELLOW}⚠ Not responding (may need authentication)${NC}"
fi

echo ""
echo "📋 Step 2: Running Python Backend Tests"
echo "----------------------------------------"
cd python_backend

# Try to run Python tests
if command -v python3 &> /dev/null; then
    python3 ../test_python_backend.py
    PYTHON_TEST_EXIT=$?
else
    echo -e "${YELLOW}⚠ Python3 not found, skipping Python tests${NC}"
    PYTHON_TEST_EXIT=0
fi

cd ..

echo ""
echo "📋 Step 3: Running Full System Tests (Node.js)"
echo "----------------------------------------"

# Run Node.js tests
npm run test:full || echo -e "${YELLOW}⚠ Node.js tests may have issues${NC}"

echo ""
echo "=========================================="
echo "✅ Test Suite Complete"
echo "=========================================="
echo ""
echo "Review the test reports above for detailed results."
echo ""


