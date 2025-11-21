// ============================================================================
// AI Interview Server - Express HTTP Server with WebSocket Support
// ============================================================================
// This server provides both HTTP endpoints and WebSocket connections for
// real-time communication. Perfect for building an AI interview application.
//
// To run this server:
//   1. Install dependencies: npm install express cors dotenv ws multer uuid
//   2. Create a .env file with:
//      - PORT=3001 (optional - defaults to 3001)
//      - OPENAI_API_KEY=your_key_here (required for resume parsing)
//   3. Run with Node: node server.js
//   4. Run with nodemon for auto-restart: npm run dev
//
// Available endpoints:
//   - GET  /health - Health check
//   - POST /api/upload-resume - Upload and parse resume PDF
// ============================================================================

// Import required modules
// express: Creates the HTTP server
const express = require('express');

// cors: Allows cross-origin requests (needed when frontend and backend are on different domains)
const cors = require('cors');

// dotenv: Loads environment variables from a .env file
require('dotenv').config();

// ws: WebSocket library for real-time bidirectional communication
const WebSocket = require('ws');

// http: Built-in Node.js module needed to create an HTTP server that WebSocket can attach to
const http = require('http');

// upload: Import the resume upload route handler
const uploadRouter = require('./upload');

// voiceServer: Import the voice interview WebSocket server
const { createVoiceServer } = require('./backend/voiceServer');

// ============================================================================
// STEP 1: Create Express Application
// ============================================================================
// Express is a web framework that makes it easy to create HTTP servers
const app = express();

console.log('✓ Express application created');

// ============================================================================
// STEP 2: Configure Middleware
// ============================================================================
// Middleware are functions that run before your route handlers
// They can modify requests, add headers, parse data, etc.

// Enable CORS (Cross-Origin Resource Sharing) for all origins
// This allows your frontend (running on a different port/domain) to make requests
app.use(cors());

// Parse JSON request bodies (allows us to read JSON data from POST requests)
app.use(express.json());

console.log('✓ Middleware configured (CORS and JSON parsing enabled)');

// ============================================================================
// STEP 2.5: Mount Route Handlers
// ============================================================================
// Mount the upload router at /api prefix
// This means all routes in upload.js will be accessible at /api/...
app.use('/api', uploadRouter);

console.log('✓ Upload routes mounted at /api');

// ============================================================================
// STEP 3: Create HTTP Server
// ============================================================================
// We need to create an HTTP server (not just Express app) because WebSocket
// requires an HTTP server instance to attach to
const server = http.createServer(app);

console.log('✓ HTTP server created');

// ============================================================================
// STEP 3.5: Set Up Voice Interview WebSocket Server
// ============================================================================
// Create the voice interview WebSocket server
// This handles real-time voice communication with OpenAI Realtime API
const voiceWss = createVoiceServer(server);

console.log('✓ Voice interview WebSocket server created');

// ============================================================================
// STEP 4: Set Up General WebSocket Server
// ============================================================================
// WebSocket allows real-time, bidirectional communication between client and server
// Unlike HTTP (request-response), WebSocket keeps a connection open for instant messaging

// Create a WebSocket server attached to our HTTP server
const wss = new WebSocket.Server({ server });

console.log('✓ WebSocket server created');

// Handle new WebSocket connections
wss.on('connection', (ws) => {
  // This function runs every time a new client connects
  
  console.log('✓ Client connected - WebSocket connection established');

  // Send a welcome message to the newly connected client
  // ws.send() sends data to this specific client
  ws.send('Welcome to the AI Interview Server');
  
  console.log('✓ Welcome message sent to client');

  // Handle messages received from the client
  ws.on('message', (message) => {
    // This runs whenever the client sends us a message
    console.log('📨 Message received from client:', message.toString());
    
    // You can add your message handling logic here
    // For example, echo the message back:
    // ws.send(`Echo: ${message}`);
  });

  // Handle client disconnection
  ws.on('close', () => {
    // This runs when the client closes the connection
    console.log('✓ Client disconnected - WebSocket connection closed');
  });

  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// ============================================================================
// STEP 5: Define HTTP Routes
// ============================================================================
// Routes define what happens when someone visits a specific URL

// Health check endpoint - useful for monitoring if the server is running
// GET /health returns a JSON response indicating the server is healthy
app.get('/health', async (req, res) => {
  // async/await allows us to write asynchronous code in a cleaner way
  // Even though this endpoint doesn't need async operations, we're using
  // async to demonstrate modern JavaScript syntax
  
  console.log('✓ Health check endpoint accessed');
  
  // Send JSON response with status information
  res.json({ status: 'healthy' });
});

console.log('✓ Health check route registered at GET /health');

// ============================================================================
// STEP 6: Start the Server
// ============================================================================
// Determine which port to use: check environment variable first, fallback to 3001
// process.env.PORT is useful for deployment platforms (like Heroku) that set this automatically
const PORT = process.env.PORT || 3001;

// Start listening for HTTP requests and WebSocket connections
server.listen(PORT, async () => {
  // Using async/await syntax (even though we don't need it here)
  // This demonstrates modern JavaScript patterns
  
  console.log('='.repeat(60));
  console.log(`🚀 Server is running!`);
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
  console.log(`🎤 Voice Interview: ws://localhost:${PORT}/voice`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
  console.log(`📤 Resume Upload: POST http://localhost:${PORT}/api/upload-resume`);
  console.log('='.repeat(60));
  console.log('✓ Server is ready to accept connections');
  
  // Check if OPENAI_API_KEY is set (warn if missing)
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY environment variable is not set');
    console.warn('   Resume parsing will fail. Set it in your .env file.');
  } else {
    console.log('✓ OPENAI_API_KEY is configured');
  }
});

// ============================================================================
// BONUS: Error Handling
// ============================================================================
// Handle server-level errors gracefully
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  
  // If the port is already in use, provide helpful error message
  if (error.code === 'EADDRINUSE') {
    console.error(`⚠️  Port ${PORT} is already in use. Try a different port.`);
  }
});

// Handle unhandled promise rejections (good practice for async code)
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

