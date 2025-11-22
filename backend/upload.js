// ============================================================================
// Resume Upload Route Handler
// ============================================================================
// This module handles resume file uploads, validates the data, calls a Python
// script to parse the resume, and returns a session ID for the candidate.
//
// Endpoint: POST /api/upload-resume
// Accepts: multipart/form-data with:
//   - resume: PDF file (max 10MB)
//   - name: string (candidate name)
//   - major: string (candidate's major/field of study)
//   - year: string (academic year)
// ============================================================================

// Import required modules
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Create an Express router to define our routes
// A router is like a mini-app that we can mount on the main Express app
const router = express.Router();

// ============================================================================
// STEP 1: Configure File Upload Storage
// ============================================================================
// Multer is middleware that handles multipart/form-data (file uploads)
// We configure it to store files in the 'uploads' directory

// Define where to store uploaded files
const uploadsDir = path.join(__dirname, 'uploads');

// Ensure the uploads directory exists
// This is async, so we'll create it when needed in the route handler
async function ensureUploadsDir() {
  try {
    await fs.access(uploadsDir);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(uploadsDir, { recursive: true });
    console.log('✓ Created uploads directory');
  }
}

// Configure multer storage
// diskStorage stores files on the filesystem (as opposed to memory)
const storage = multer.diskStorage({
  // Destination: where to save the file
  destination: async (req, file, cb) => {
    await ensureUploadsDir();
    cb(null, uploadsDir);
  },
  // Filename: what to name the file
  // We use the original name with a timestamp to avoid conflicts
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `resume-${uniqueSuffix}${ext}`);
  }
});

// Configure multer middleware
// fileFilter: only accept PDF files
// limits: restrict file size to 10MB
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Check if the file is a PDF
    if (file.mimetype === 'application/pdf') {
      cb(null, true); // Accept the file
    } else {
      cb(new Error('Only PDF files are allowed'), false); // Reject the file
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB in bytes (10 * 1024 * 1024)
  }
});

console.log('✓ Multer configured for PDF uploads (max 10MB)');

// ============================================================================
// STEP 2: Input Validation Helper Functions
// ============================================================================
// These functions help us validate and sanitize user input

/**
 * Validates that a string is not empty and sanitizes it
 * @param {string} value - The value to validate
 * @param {string} fieldName - Name of the field (for error messages)
 * @returns {string} - Sanitized string
 * @throws {Error} - If validation fails
 */
function validateString(value, fieldName) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${fieldName} is required and must be a string`);
  }
  
  // Trim whitespace and check if empty after trimming
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
  
  // Basic sanitization: remove potentially dangerous characters
  // Keep only alphanumeric, spaces, hyphens, and apostrophes
  const sanitized = trimmed.replace(/[^a-zA-Z0-9\s\-']/g, '');
  
  if (sanitized.length === 0) {
    throw new Error(`${fieldName} contains invalid characters`);
  }
  
  return sanitized;
}

/**
 * Validates the file was uploaded successfully
 * @param {Object} file - Multer file object
 * @throws {Error} - If file is missing or invalid
 */
function validateFile(file) {
  if (!file) {
    throw new Error('Resume PDF file is required');
  }
  
  if (file.mimetype !== 'application/pdf') {
    throw new Error('File must be a PDF');
  }
}

console.log('✓ Validation helpers defined');

// ============================================================================
// STEP 3: Python Script Execution Helper
// ============================================================================
/**
 * Executes the Python resume parser script and returns the parsed data
 * @param {string} pdfPath - Path to the uploaded PDF file
 * @param {string} openaiApiKey - OpenAI API key from environment variables
 * @returns {Promise<Object>} - Parsed resume data as JSON object
 * @throws {Error} - If script execution fails or times out
 */
async function runResumeParser(pdfPath, openaiApiKey) {
  return new Promise((resolve, reject) => {
    console.log(`📄 Starting resume parser for: ${pdfPath}`);
    
    // Spawn a child process to run the Python script
    // spawn() is better than exec() for long-running processes and streaming output
    // Arguments: ['python3', 'resume_parser.py', pdfPath, openaiApiKey]
    const pythonProcess = spawn('python3', [
      path.join(__dirname, 'resume_parser.py'),
      pdfPath,
      openaiApiKey
    ]);
    
    // Collect stdout data (the JSON response from Python script)
    let stdoutData = '';
    let stderrData = '';
    
    // Listen for data from stdout (standard output)
    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
      console.log('📥 Python stdout:', data.toString());
    });
    
    // Listen for data from stderr (error output)
    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      console.error('⚠️  Python stderr:', data.toString());
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      console.log(`✓ Python process exited with code ${code}`);
      
      // Non-zero exit code means an error occurred
      if (code !== 0) {
        return reject(new Error(`Python script failed with exit code ${code}. Error: ${stderrData || 'Unknown error'}`));
      }
      
      // Try to parse the JSON response
      try {
        if (!stdoutData || stdoutData.trim().length === 0) {
          throw new Error('Python script returned empty output');
        }
        
        const parsedData = JSON.parse(stdoutData.trim());
        console.log('✓ Resume parsed successfully');
        resolve(parsedData);
      } catch (parseError) {
        reject(new Error(`Failed to parse Python script output as JSON: ${parseError.message}. Output: ${stdoutData}`));
      }
    });
    
    // Handle process errors (e.g., script not found)
    pythonProcess.on('error', (error) => {
      console.error('❌ Python process error:', error);
      reject(new Error(`Failed to start Python script: ${error.message}. Make sure Python 3 and resume_parser.py are available.`));
    });
    
    // Set a timeout to prevent hanging forever (30 seconds)
    const timeout = setTimeout(() => {
      pythonProcess.kill(); // Kill the process if it takes too long
      reject(new Error('Python script execution timed out after 30 seconds'));
    }, 30000);
    
    // Clear timeout if process completes successfully
    pythonProcess.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

console.log('✓ Python script execution helper defined');

// ============================================================================
// STEP 4: Main Route Handler
// ============================================================================
// This is the POST /api/upload-resume endpoint
// upload.single('resume') means we expect one file field named 'resume'

router.post('/upload-resume', upload.single('resume'), async (req, res) => {
  // Wrap everything in try-catch for error handling
  let uploadedFilePath = null;
  
  try {
    console.log('📤 Resume upload request received');
    
    // ========================================================================
    // STEP 4a: Validate File Upload
    // ========================================================================
    validateFile(req.file);
    uploadedFilePath = req.file.path;
    console.log(`✓ File uploaded: ${uploadedFilePath}`);
    
    // ========================================================================
    // STEP 4b: Validate Form Fields
    // ========================================================================
    // Extract and validate form data
    const name = validateString(req.body.name, 'Name');
    const major = validateString(req.body.major, 'Major');
    const year = validateString(req.body.year, 'Year');
    
    console.log(`✓ Form data validated - Name: ${name}, Major: ${major}, Year: ${year}`);
    
    // ========================================================================
    // STEP 4c: Get OpenAI API Key from Environment
    // ========================================================================
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    console.log('✓ OpenAI API key loaded from environment');
    
    // ========================================================================
    // STEP 4d: Call Python Resume Parser Script
    // ========================================================================
    let parsedResumeData;
    try {
      parsedResumeData = await runResumeParser(uploadedFilePath, openaiApiKey);
    } catch (parserError) {
      // Clean up file even if parsing fails
      if (uploadedFilePath) {
        try {
          await fs.unlink(uploadedFilePath);
          console.log('✓ Cleaned up uploaded file after parser error');
        } catch (cleanupError) {
          console.error('⚠️  Failed to clean up file:', cleanupError);
        }
      }
      throw parserError; // Re-throw to be caught by outer catch
    }
    
    // ========================================================================
    // STEP 4e: Combine Form Data with Parsed Resume Data
    // ========================================================================
    // Create a comprehensive candidate context object
    const candidateContext = {
      // Form data
      name: name,
      major: major,
      year: year,
      // Parsed resume data (whatever the Python script returns)
      ...parsedResumeData
    };
    
    console.log('✓ Candidate context created');
    
    // ========================================================================
    // STEP 4f: Generate Unique Session ID
    // ========================================================================
    // UUID v4 generates a random, unique identifier
    // This will be used to track this candidate's interview session
    const sessionId = uuidv4();
    console.log(`✓ Session ID generated: ${sessionId}`);
    
    // ========================================================================
    // STEP 4g: Clean Up Temporary File
    // ========================================================================
    // Delete the uploaded PDF file immediately after parsing
    // We don't need to keep it since we've extracted the data
    try {
      await fs.unlink(uploadedFilePath);
      console.log('✓ Temporary PDF file deleted');
      uploadedFilePath = null; // Mark as cleaned up
    } catch (cleanupError) {
      console.error('⚠️  Warning: Failed to delete temporary file:', cleanupError);
      // Don't fail the request if cleanup fails, but log it
    }
    
    // ========================================================================
    // STEP 4h: Send Success Response
    // ========================================================================
    // Return sessionId and candidateName as requested
    res.status(200).json({
      sessionId: sessionId,
      candidateName: name,
      // Optionally include candidateContext if needed (commented out per requirements)
      // candidateContext: candidateContext
    });
    
    console.log(`✓ Successfully processed resume for ${name} (Session: ${sessionId})`);
    
  } catch (error) {
    // ========================================================================
    // ERROR HANDLING
    // ========================================================================
    console.error('❌ Error processing resume upload:', error);
    
    // Clean up uploaded file if it exists and hasn't been cleaned up yet
    if (uploadedFilePath) {
      try {
        await fs.unlink(uploadedFilePath);
        console.log('✓ Cleaned up uploaded file after error');
      } catch (cleanupError) {
        console.error('⚠️  Failed to clean up file during error handling:', cleanupError);
      }
    }
    
    // Send appropriate error response
    // Check error type to send appropriate status code
    if (error.message.includes('required') || error.message.includes('invalid')) {
      // Validation errors get 400 Bad Request
      res.status(400).json({
        error: 'Validation Error',
        message: error.message
      });
    } else if (error.message.includes('timeout')) {
      // Timeout errors get 504 Gateway Timeout
      res.status(504).json({
        error: 'Timeout Error',
        message: error.message
      });
    } else {
      // Other errors get 500 Internal Server Error
      res.status(500).json({
        error: 'Server Error',
        message: error.message
      });
    }
  }
});

console.log('✓ POST /api/upload-resume route registered');

// ============================================================================
// STEP 5: Export Router
// ============================================================================
// Export the router so it can be imported and used in server.js
module.exports = router;

