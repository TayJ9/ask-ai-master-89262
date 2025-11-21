# Resume Upload Endpoint Documentation

## Overview
The `/api/upload-resume` endpoint handles resume PDF uploads, validates candidate information, parses the resume using a Python script, and returns a session ID for the interview.

## Endpoint
**POST** `/api/upload-resume`

## Request Format
**Content-Type:** `multipart/form-data`

### Form Fields
- `resume` (file, required): PDF file containing the candidate's resume
  - Maximum size: 10MB
  - Accepted format: PDF only (`application/pdf`)
  
- `name` (string, required): Candidate's full name
  - Must be a non-empty string
  - Will be sanitized (alphanumeric, spaces, hyphens, apostrophes only)
  
- `major` (string, required): Candidate's field of study/major
  - Must be a non-empty string
  - Will be sanitized
  
- `year` (string, required): Academic year (e.g., "Freshman", "Sophomore", "Senior")
  - Must be a non-empty string
  - Will be sanitized

## Response Format

### Success Response (200 OK)
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "candidateName": "John Doe"
}
```

### Error Responses

#### Validation Error (400 Bad Request)
```json
{
  "error": "Validation Error",
  "message": "Resume PDF file is required"
}
```

#### Timeout Error (504 Gateway Timeout)
```json
{
  "error": "Timeout Error",
  "message": "Python script execution timed out after 30 seconds"
}
```

#### Server Error (500 Internal Server Error)
```json
{
  "error": "Server Error",
  "message": "Failed to start Python script: ..."
}
```

## Example Usage

### Using curl
```bash
curl -X POST http://localhost:3001/api/upload-resume \
  -F "resume=@path/to/resume.pdf" \
  -F "name=John Doe" \
  -F "major=Computer Science" \
  -F "year=Senior"
```

### Using the test script
```bash
./test_upload.sh path/to/resume.pdf
```

### Using JavaScript (Fetch API)
```javascript
const formData = new FormData();
formData.append('resume', fileInput.files[0]);
formData.append('name', 'John Doe');
formData.append('major', 'Computer Science');
formData.append('year', 'Senior');

const response = await fetch('http://localhost:3001/api/upload-resume', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log('Session ID:', data.sessionId);
console.log('Candidate Name:', data.candidateName);
```

## Requirements

1. **Environment Variables:**
   - `OPENAI_API_KEY` must be set in your `.env` file
   - Copy `.env.example` to `.env` and fill in your API key

2. **Python Script:**
   - `resume_parser.py` must exist in the project root
   - Must accept two arguments: PDF path and OpenAI API key
   - Must output JSON to stdout

3. **File System:**
   - `uploads/` directory will be created automatically
   - Uploaded files are automatically deleted after parsing

## Process Flow

1. File is uploaded and validated (PDF, <10MB)
2. Form fields are validated and sanitized
3. File is saved temporarily to `uploads/` directory
4. Python script `resume_parser.py` is executed with PDF path and API key
5. Python script output (JSON) is captured and parsed
6. Form data and parsed resume data are combined into `candidateContext`
7. Unique session ID (UUID) is generated
8. Temporary PDF file is deleted
9. Response is sent with `sessionId` and `candidateName`

## Error Handling

- All validation errors return 400 status
- Python script timeouts return 504 status (30 second timeout)
- All other errors return 500 status
- Temporary files are always cleaned up, even on error
- Detailed error messages are logged to console

## Notes

- The uploaded PDF is stored temporarily and deleted immediately after parsing
- The Python script has a 30-second timeout
- All inputs are sanitized to prevent injection attacks
- The endpoint uses async/await for modern JavaScript patterns

