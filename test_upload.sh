#!/bin/bash
# Test script for the /api/upload-resume endpoint
# This demonstrates how to test the endpoint using curl

echo "Testing /api/upload-resume endpoint..."
echo ""

# Check if a PDF file is provided as argument
if [ -z "$1" ]; then
    echo "Usage: ./test_upload.sh <path_to_pdf_file>"
    echo ""
    echo "Example: ./test_upload.sh sample_resume.pdf"
    echo ""
    echo "Note: Make sure OPENAI_API_KEY is set in your .env file"
    exit 1
fi

PDF_FILE="$1"

# Check if file exists
if [ ! -f "$PDF_FILE" ]; then
    echo "Error: File '$PDF_FILE' not found"
    exit 1
fi

# Check if file is a PDF
if ! file "$PDF_FILE" | grep -q "PDF"; then
    echo "Warning: File does not appear to be a PDF"
fi

echo "Uploading: $PDF_FILE"
echo ""

# Make the POST request with multipart/form-data
curl -X POST http://localhost:3001/api/upload-resume \
  -F "resume=@$PDF_FILE" \
  -F "name=John Doe" \
  -F "major=Computer Science" \
  -F "year=Senior" \
  -H "Content-Type: multipart/form-data" \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo "Test complete!"

