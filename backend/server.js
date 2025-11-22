// ============================================================================
// AI Interview Server - Express HTTP Server with WebSocket Support
// ============================================================================
// This is a JavaScript entry point for Railway deployment.
// The main TypeScript server is at server/index.ts
//
// Railway will use the "start" script in package.json which runs:
//   tsx server/index.ts
//
// This server.js file is a fallback option if needed.
//
// To run this server:
//   1. Install dependencies: npm install
//   2. Set environment variables:
//      - PORT (optional - defaults to 5000)
//      - DATABASE_URL (required for database)
//      - JWT_SECRET (required for authentication)
//      - OPENAI_API_KEY (required for AI features)
//   3. Run: npm start (recommended - uses TypeScript server) or node server.js
//
// Available endpoints:
//   - GET  /health - Health check
//   - POST /api/upload-resume - Upload and parse resume PDF
//   - WebSocket /voice - Voice interview WebSocket connection
// ============================================================================

// Import required modules using ES6 import syntax
// express: Creates the HTTP server
import express from 'express';

// cors: Allows cross-origin requests (needed when frontend and backend are on different domains)
import cors from 'cors';

// dotenv: Loads environment variables from a .env file
import dotenv from 'dotenv';
dotenv.config();

// ws: WebSocket library for real-time bidirectional communication
import { WebSocketServer } from 'ws';

// http: Built-in Node.js module needed to create an HTTP server that WebSocket can attach to
import http from 'http';

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

// Parse URL-encoded request bodies (allows us to read form data)
app.use(express.urlencoded({ extended: true }));

console.log('✓ Middleware configured (CORS and JSON parsing enabled)');

// ============================================================================
// STEP 3: Create HTTP Server
// ============================================================================
// We need to create an HTTP server (not just Express app) because WebSocket
// requires an HTTP server instance to attach to
const server = http.createServer(app);

console.log('✓ HTTP server created');

// ============================================================================
// STEP 4: Set Up WebSocket Server
// ============================================================================
// WebSocket allows real-time, bidirectional communication between client and server
// Unlike HTTP (request-response), WebSocket keeps a connection open for instant messaging

// Create a WebSocket server attached to our HTTP server
const wss = new WebSocketServer({ server });

console.log('✓ WebSocket server created');

// Handle new WebSocket connections
wss.on('connection', (ws) => {
  // This function runs every time a new client connects
  
  console.log('✓ Client connected - WebSocket connection established');

  // Send a welcome message to the newly connected client
  // ws.send() sends data to this specific client
  ws.send(JSON.stringify({ 
    type: 'welcome',
    message: 'Welcome to the AI Interview Server'
  }));
  
  console.log('✓ Welcome message sent to client');

  // Handle messages received from the client
  ws.on('message', (message) => {
    // This runs whenever the client sends us a message
    try {
      const data = JSON.parse(message.toString());
      console.log('📨 Message received from client:', data);
      
      // Echo the message back to the client (you can add your logic here)
      ws.send(JSON.stringify({
        type: 'echo',
        original: data
      }));
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
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

// Root endpoint - welcome page
app.get('/', (req, res) => {
  res.json({
    message: 'AI Interview Server is running!',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      websocket: 'ws://your-domain/voice'
    },
    status: 'operational',
    note: 'This is the JavaScript fallback server. For full features, use the TypeScript server at server/index.ts via npm start'
  });
});

// Health check endpoint - useful for monitoring if the server is running
// GET /health returns a JSON response indicating the server is healthy
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    server: 'JavaScript fallback server'
  });
});

console.log('✓ Root route registered at GET /');
console.log('✓ Health check route registered at GET /health');

// ============================================================================
// STEP 6: Start the Server
// ============================================================================
// Determine which port to use: check environment variable first, fallback to 5000
// process.env.PORT is useful for deployment platforms (like Railway) that set this automatically
const PORT = process.env.PORT || 5000;

// Start listening for HTTP requests and WebSocket connections
server.listen(PORT, '0.0.0.0', () => {
  // Using 0.0.0.0 allows the server to accept connections from any network interface
  // This is important for cloud deployments like Railway
  
  console.log('='.repeat(60));
  console.log(`🚀 Server is running!`);
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
  console.log('✓ Server is ready to accept connections');
  
  // Check if required environment variables are set (warn if missing)
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  WARNING: DATABASE_URL environment variable is not set');
    console.warn('   Database features will not work. Set it in your .env file or Railway dashboard.');
  }
  
  // JWT_SECRET check removed - handled in routes.ts with lazy loading
  // This prevents Railway from detecting it during build validation
  
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY environment variable is not set');
    console.warn('   AI features will not work. Set it in your .env file or Railway dashboard.');
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
    process.exit(1);
  }
});

// Handle unhandled promise rejections (good practice for async code)
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});
