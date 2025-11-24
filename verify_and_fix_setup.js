// ============================================================================
// Setup Verification and Auto-Fix Script
// ============================================================================
// This script checks if all required files exist and helps fix missing files
// Run with: node verify_and_fix_setup.js

const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('🔍 Verifying Project Setup');
console.log('='.repeat(60));
console.log('');

const issues = [];
const fixes = [];

// Required files and their paths
const requiredFiles = [
  { path: 'server.js', name: 'Main server file', critical: true },
  { path: 'package.json', name: 'Package configuration', critical: true },
  { path: 'upload.js', name: 'Upload route handler', critical: true },
  { path: '.env', name: 'Environment variables', critical: false },
  { path: '.env.example', name: 'Environment template', critical: false },
  { path: 'backend/voiceServer.js', name: 'Voice server', critical: true },
  { path: 'resume_parser.py', name: 'Python resume parser', critical: false }
];

// Check each file
console.log('📁 Checking Required Files:');
console.log('');

requiredFiles.forEach(file => {
  const exists = fs.existsSync(file.path);
  const status = exists ? '✅' : '❌';
  const critical = file.critical ? ' (CRITICAL)' : '';
  
  console.log(`${status} ${file.name}: ${file.path}${critical}`);
  
  if (!exists) {
    issues.push(file);
    if (file.critical) {
      fixes.push(file);
    }
  }
});

console.log('');
console.log('='.repeat(60));

// Check folder structure
console.log('📂 Checking Folder Structure:');
console.log('');

const requiredFolders = [
  'backend',
  'backend/routes',
  'src',
  'uploads'
];

requiredFolders.forEach(folder => {
  const exists = fs.existsSync(folder);
  const status = exists ? '✅' : '❌';
  console.log(`${status} Folder: ${folder}/`);
  
  if (!exists && folder === 'backend') {
    fixes.push({ path: folder, name: 'Backend folder', type: 'folder' });
  }
  if (!exists && folder === 'uploads') {
    console.log('   ℹ️  Will be created automatically when needed');
  }
});

console.log('');
console.log('='.repeat(60));

// Check package.json scripts
console.log('📦 Checking package.json:');
console.log('');

try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const scripts = packageJson.scripts || {};
  
  const requiredScripts = ['dev', 'server'];
  requiredScripts.forEach(script => {
    const exists = scripts[script];
    const status = exists ? '✅' : '❌';
    console.log(`${status} Script: npm run ${script}`);
    
    if (!exists) {
      issues.push({ path: 'package.json', name: `Missing script: ${script}`, type: 'script' });
    }
  });
  
  // Check dependencies
  console.log('');
  console.log('📚 Checking Dependencies:');
  const requiredDeps = ['express', 'cors', 'dotenv', 'ws', 'multer', 'uuid'];
  requiredDeps.forEach(dep => {
    const exists = packageJson.dependencies && packageJson.dependencies[dep];
    const status = exists ? '✅' : '❌';
    console.log(`${status} Dependency: ${dep}`);
    
    if (!exists) {
      issues.push({ path: 'package.json', name: `Missing dependency: ${dep}`, type: 'dependency' });
    }
  });
  
  // Check devDependencies
  console.log('');
  console.log('🔧 Checking Dev Dependencies:');
  const requiredDevDeps = ['nodemon'];
  requiredDevDeps.forEach(dep => {
    const exists = packageJson.devDependencies && packageJson.devDependencies[dep];
    const status = exists ? '✅' : '❌';
    console.log(`${status} Dev Dependency: ${dep}`);
    
    if (!exists) {
      issues.push({ path: 'package.json', name: `Missing devDependency: ${dep}`, type: 'devDependency' });
    }
  });
} catch (error) {
  console.log('❌ Error reading package.json:', error.message);
  issues.push({ path: 'package.json', name: 'Cannot read package.json', type: 'error' });
}

console.log('');
console.log('='.repeat(60));

// Check .env file
console.log('🔐 Checking Environment Variables:');
console.log('');

if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  const hasPort = envContent.includes('PORT=');
  const hasOpenAI = envContent.includes('OPENAI_API_KEY=') && !envContent.includes('your_openai_api_key_here');
  
  console.log(`${hasPort ? '✅' : '⚠️'} PORT configured`);
  console.log(`${hasOpenAI ? '✅' : '⚠️'} OPENAI_API_KEY configured`);
  
  if (!hasOpenAI) {
    console.log('   ℹ️  Add your OpenAI API key to .env file');
  }
} else {
  console.log('⚠️  .env file not found');
  console.log('   ℹ️  Copy .env.example to .env and add your API key');
}

console.log('');
console.log('='.repeat(60));

// Summary
console.log('');
console.log('📊 SUMMARY:');
console.log('');

if (issues.length === 0) {
  console.log('✅ All checks passed! Your setup looks good.');
  console.log('');
  console.log('🚀 Next steps:');
  console.log('   1. Make sure .env has your OPENAI_API_KEY');
  console.log('   2. Run: npm install');
  console.log('   3. Run: npm run dev');
} else {
  console.log(`⚠️  Found ${issues.length} issue(s):`);
  console.log('');
  
  const criticalIssues = issues.filter(i => i.critical);
  const nonCriticalIssues = issues.filter(i => !i.critical);
  
  if (criticalIssues.length > 0) {
    console.log('❌ CRITICAL ISSUES (must fix):');
    criticalIssues.forEach(issue => {
      console.log(`   - ${issue.name}: ${issue.path}`);
    });
    console.log('');
  }
  
  if (nonCriticalIssues.length > 0) {
    console.log('⚠️  Non-Critical Issues:');
    nonCriticalIssues.forEach(issue => {
      console.log(`   - ${issue.name}: ${issue.path}`);
    });
    console.log('');
  }
  
  console.log('🔧 FIXES NEEDED:');
  console.log('');
  
  if (fixes.some(f => f.path === 'backend/voiceServer.js')) {
    console.log('1. Create backend/voiceServer.js file');
    console.log('   → This file is required for voice interviews');
    console.log('   → You can copy it from GitHub or I can help create it');
  }
  
  if (fixes.some(f => f.path === 'backend' && f.type === 'folder')) {
    console.log('2. Create backend/ folder');
    console.log('   → Run: mkdir backend');
  }
  
  if (fixes.some(f => f.type === 'script')) {
    console.log('3. Update package.json scripts');
    console.log('   → Add missing scripts to package.json');
  }
  
  if (fixes.some(f => f.type === 'dependency')) {
    console.log('4. Install missing dependencies');
    console.log('   → Run: npm install');
  }
  
  console.log('');
  console.log('💡 Need help? Ask me to create the missing files!');
}

console.log('');
console.log('='.repeat(60));











