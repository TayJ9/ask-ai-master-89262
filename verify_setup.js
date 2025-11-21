#!/usr/bin/env node
/**
 * Verification Script for Voice Interview Setup
 * Checks that all required components are properly configured
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Voice Interview Setup...\n');

let allChecksPassed = true;

// Check 1: Environment Variables
console.log('1. Checking Environment Variables...');
if (process.env.OPENAI_API_KEY) {
  console.log('   ✓ OPENAI_API_KEY is set');
} else {
  console.log('   ✗ OPENAI_API_KEY is NOT set');
  console.log('     Please add OPENAI_API_KEY=your_key_here to your .env file');
  allChecksPassed = false;
}

if (process.env.PORT) {
  console.log(`   ✓ PORT is set to ${process.env.PORT}`);
} else {
  console.log('   ℹ PORT not set (will default to 3001)');
}

// Check 2: Required Files
console.log('\n2. Checking Required Files...');
const requiredFiles = [
  'server.js',
  'backend/voiceServer.js',
  'upload.js',
  'src/components/ResumeUpload.tsx',
  'src/components/VoiceInterviewWebSocket.tsx',
  'src/pages/Index.tsx',
  'resume_parser.py'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(path.join(__dirname, file))) {
    console.log(`   ✓ ${file} exists`);
  } else {
    console.log(`   ✗ ${file} is missing`);
    allChecksPassed = false;
  }
});

// Check 3: Dependencies
console.log('\n3. Checking Dependencies...');
try {
  require('express');
  console.log('   ✓ express');
} catch (e) {
  console.log('   ✗ express not installed');
  allChecksPassed = false;
}

try {
  require('cors');
  console.log('   ✓ cors');
} catch (e) {
  console.log('   ✗ cors not installed');
  allChecksPassed = false;
}

try {
  require('dotenv');
  console.log('   ✓ dotenv');
} catch (e) {
  console.log('   ✗ dotenv not installed');
  allChecksPassed = false;
}

try {
  require('ws');
  console.log('   ✓ ws');
} catch (e) {
  console.log('   ✗ ws not installed');
  allChecksPassed = false;
}

try {
  require('multer');
  console.log('   ✓ multer');
} catch (e) {
  console.log('   ✗ multer not installed');
  allChecksPassed = false;
}

try {
  require('uuid');
  console.log('   ✓ uuid');
} catch (e) {
  console.log('   ✗ uuid not installed');
  allChecksPassed = false;
}

// Check 4: Backend Module Loading
console.log('\n4. Checking Backend Modules...');
try {
  const { createVoiceServer } = require('./backend/voiceServer');
  console.log('   ✓ Voice server module loads successfully');
} catch (e) {
  console.log(`   ✗ Voice server module failed to load: ${e.message}`);
  allChecksPassed = false;
}

try {
  const uploadRouter = require('./upload');
  console.log('   ✓ Upload router module loads successfully');
} catch (e) {
  console.log(`   ✗ Upload router module failed to load: ${e.message}`);
  allChecksPassed = false;
}

// Check 5: Directory Structure
console.log('\n5. Checking Directory Structure...');
const requiredDirs = ['backend', 'uploads', 'src/components', 'src/pages'];
requiredDirs.forEach(dir => {
  if (fs.existsSync(path.join(__dirname, dir))) {
    console.log(`   ✓ ${dir}/ directory exists`);
  } else {
    console.log(`   ✗ ${dir}/ directory is missing`);
    allChecksPassed = false;
  }
});

// Summary
console.log('\n' + '='.repeat(60));
if (allChecksPassed) {
  console.log('✅ All checks passed! Setup is complete.');
  console.log('\nNext steps:');
  console.log('1. Start the server: npm run dev');
  console.log('2. Open your browser to https://mockly.replit.app');
  console.log('3. Select a role and choose "Voice Interview"');
  console.log('4. Fill in your name, major, and year');
  console.log('5. Upload your resume PDF');
  console.log('6. The WebSocket connection will establish automatically');
} else {
  console.log('⚠️  Some checks failed. Please fix the issues above.');
  console.log('\nTo install missing dependencies:');
  console.log('  npm install express cors dotenv ws multer uuid');
}
console.log('='.repeat(60));

process.exit(allChecksPassed ? 0 : 1);

