#!/bin/bash

echo "🔍 VERIFYING SERVER STATUS"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Python backend is running (port 5001)
echo "1. Checking Python Backend (port 5001)..."
if curl -s http://localhost:5001/health > /dev/null 2>&1; then
    response=$(curl -s http://localhost:5001/health)
    if echo "$response" | grep -q "healthy"; then
        echo -e "${GREEN}✅ Python Backend is running${NC}"
        echo "   Response: $response"
    else
        echo -e "${RED}❌ Python Backend responded but with unexpected format${NC}"
        echo "   Response: $response"
    fi
else
    echo -e "${RED}❌ Python Backend is NOT running${NC}"
    echo "   Check: cd python_backend && PORT=5001 python app.py"
fi
echo ""

# Check if Node.js server is running (port 5000)
echo "2. Checking Node.js Server (port 5000)..."
if curl -s http://localhost:5000/api/auth/me > /dev/null 2>&1; then
    status_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/auth/me)
    if [ "$status_code" = "401" ] || [ "$status_code" = "200" ]; then
        echo -e "${GREEN}✅ Node.js Server is running${NC}"
        echo "   Status: $status_code (expected: 401 for unauthenticated or 200 for authenticated)"
    else
        echo -e "${YELLOW}⚠️  Node.js Server responded with unexpected status: $status_code${NC}"
    fi
else
    echo -e "${RED}❌ Node.js Server is NOT running${NC}"
    echo "   Check: npm run dev"
fi
echo ""

# Check what processes are listening on ports
echo "3. Checking processes on ports 5000 and 5001..."
echo "   Port 5000 (Node.js):"
if lsof -i :5000 2>/dev/null | grep -q LISTEN; then
    echo -e "${GREEN}✅ Port 5000 is in use${NC}"
    lsof -i :5000 2>/dev/null | grep LISTEN | head -1
else
    echo -e "${RED}❌ Port 5000 is NOT in use${NC}"
fi

echo "   Port 5001 (Python):"
if lsof -i :5001 2>/dev/null | grep -q LISTEN; then
    echo -e "${GREEN}✅ Port 5001 is in use${NC}"
    lsof -i :5001 2>/dev/null | grep LISTEN | head -1
else
    echo -e "${RED}❌ Port 5001 is NOT in use${NC}"
fi
echo ""

# Check Python backend logs for critical initialization messages
echo "4. Checking Python backend initialization..."
if [ -f "python_backend/app.py" ]; then
    echo -e "${GREEN}✅ Python backend file exists${NC}"
else
    echo -e "${RED}❌ Python backend file not found${NC}"
fi
echo ""

# Check environment variables (without revealing secrets)
echo "5. Checking critical environment variables..."
if [ -n "$GEMINI_API_KEY" ]; then
    echo -e "${GREEN}✅ GEMINI_API_KEY is set${NC}"
else
    echo -e "${YELLOW}⚠️  GEMINI_API_KEY not found in environment (may be in Replit Secrets)${NC}"
fi

if [ -n "$GOOGLE_CREDENTIALS" ]; then
    echo -e "${GREEN}✅ GOOGLE_CREDENTIALS is set${NC}"
else
    echo -e "${YELLOW}⚠️  GOOGLE_CREDENTIALS not found in environment (may be in Replit Secrets)${NC}"
fi

if [ -n "$GCP_PROJECT_ID" ] || [ -n "$DIALOGFLOW_PROJECT_ID" ]; then
    echo -e "${GREEN}✅ Dialogflow Project ID is set${NC}"
else
    echo -e "${YELLOW}⚠️  Dialogflow Project ID not found in environment (may be in Replit Secrets)${NC}"
fi
echo ""

# Summary
echo "=========================="
echo "📋 SUMMARY"
echo "=========================="
echo ""

# Count issues
issues=0

if ! curl -s http://localhost:5001/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Python Backend is NOT running${NC}"
    issues=$((issues + 1))
fi

if ! curl -s http://localhost:5000/api/auth/me > /dev/null 2>&1; then
    echo -e "${RED}❌ Node.js Server is NOT running${NC}"
    issues=$((issues + 1))
fi

if [ $issues -eq 0 ]; then
    echo -e "${GREEN}✅ All servers appear to be running!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Test the voice interview flow in your browser"
    echo "2. Check browser console for any errors"
    echo "3. Verify Dialogflow and Gemini API keys are working"
else
    echo -e "${RED}❌ Found $issues issue(s) - please fix before publishing${NC}"
    echo ""
    echo "To start servers:"
    echo "1. Python Backend: cd python_backend && PORT=5001 python app.py"
    echo "2. Node.js Server: npm run dev"
    echo ""
    echo "Or use Replit's 'Run' button to start both automatically"
fi

echo ""

