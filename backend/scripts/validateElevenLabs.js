/**
 * ElevenLabs Configuration Validation Script
 * 
 * This script validates that all ElevenLabs components are properly configured
 * for Railway deployment. Run at startup to ensure everything is set up correctly.
 * 
 * Usage: node scripts/validateElevenLabs.js
 * Or import and call validateElevenLabsConfig() at server startup
 */

// ElevenLabs Configuration Constants (must match voiceServer.js)
const ELEVENLABS_API_URL = 'wss://api.elevenlabs.io/v1/convai/conversation';
const ELEVENLABS_AGENT_ID = 'agent_8601kavsezrheczradx9qmz8qp3e';
const ELEVENLABS_VOICE_ID = 'kdmDKE6EkgrWrrykO9Qt';
const ELEVENLABS_LLM = 'gpt-5.1';

/**
 * Validates ElevenLabs configuration and logs results
 * @returns {Object} Validation result with status and details
 */
function validateElevenLabsConfig() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 ELEVENLABS CONFIGURATION VALIDATION');
  console.log('='.repeat(80));
  
  const results = {
    valid: true,
    errors: [],
    warnings: [],
    config: {}
  };
  
  // Check 1: ELEVENLABS_API_KEY
  console.log('\n[1/5] Checking ELEVENLABS_API_KEY...');
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    results.valid = false;
    results.errors.push('ELEVENLABS_API_KEY is not set');
    console.log('   ❌ FAILED: ELEVENLABS_API_KEY environment variable is not set');
    console.log('   💡 Set this in Railway dashboard: Settings > Variables > Add ELEVENLABS_API_KEY');
  } else if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    results.valid = false;
    results.errors.push('ELEVENLABS_API_KEY is empty or invalid');
    console.log('   ❌ FAILED: ELEVENLABS_API_KEY is empty or invalid');
  } else {
    // Validate API key format (ElevenLabs API keys are typically long alphanumeric strings)
    const maskedKey = apiKey.length > 11 
      ? `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`
      : '***';
    
    if (apiKey.length < 20) {
      results.warnings.push('ELEVENLABS_API_KEY seems unusually short - verify it\'s correct');
      console.log('   ⚠️  WARNING: API key seems unusually short');
    }
    
    results.config.apiKey = maskedKey;
    console.log('   ✅ PASSED: ELEVENLABS_API_KEY is set');
    console.log(`   📝 Key: ${maskedKey} (${apiKey.length} characters)`);
  }
  
  // Check 2: VOICE_PROVIDER (optional, defaults to 'elevenlabs')
  console.log('\n[2/5] Checking VOICE_PROVIDER...');
  const voiceProvider = process.env.VOICE_PROVIDER || 'elevenlabs';
  results.config.voiceProvider = voiceProvider;
  
  if (voiceProvider !== 'elevenlabs' && voiceProvider !== 'openai') {
    results.warnings.push(`VOICE_PROVIDER is set to '${voiceProvider}' - expected 'elevenlabs' or 'openai'`);
    console.log(`   ⚠️  WARNING: VOICE_PROVIDER is '${voiceProvider}' (expected 'elevenlabs' or 'openai')`);
  } else {
    console.log(`   ✅ PASSED: VOICE_PROVIDER is '${voiceProvider}'`);
  }
  
  if (voiceProvider !== 'elevenlabs') {
    console.log('   ℹ️  INFO: ElevenLabs will not be used (provider is set to ' + voiceProvider + ')');
  }
  
  // Check 3: ELEVENLABS_AGENT_ID (hardcoded constant)
  console.log('\n[3/5] Checking ELEVENLABS_AGENT_ID...');
  if (!ELEVENLABS_AGENT_ID || ELEVENLABS_AGENT_ID.length === 0) {
    results.valid = false;
    results.errors.push('ELEVENLABS_AGENT_ID is not configured');
    console.log('   ❌ FAILED: ELEVENLABS_AGENT_ID is not set in code');
  } else {
    results.config.agentId = ELEVENLABS_AGENT_ID;
    console.log('   ✅ PASSED: ELEVENLABS_AGENT_ID is configured');
    console.log(`   📝 Agent ID: ${ELEVENLABS_AGENT_ID}`);
  }
  
  // Check 4: ELEVENLABS_VOICE_ID (hardcoded constant)
  console.log('\n[4/5] Checking ELEVENLABS_VOICE_ID...');
  if (!ELEVENLABS_VOICE_ID || ELEVENLABS_VOICE_ID.length === 0) {
    results.valid = false;
    results.errors.push('ELEVENLABS_VOICE_ID is not configured');
    console.log('   ❌ FAILED: ELEVENLABS_VOICE_ID is not set in code');
    console.log('   [4/5] CHECK COMPLETE');
  } else {
    results.config.voiceId = ELEVENLABS_VOICE_ID;
    console.log('   ✅ PASSED: ELEVENLABS_VOICE_ID is configured');
    console.log(`   📝 Voice ID: ${ELEVENLABS_VOICE_ID}`);
    console.log('   [4/5] CHECK COMPLETE');
  }
  
  // Check 5: ELEVENLABS_LLM (hardcoded constant)
  console.log('\n[5/5] Checking ELEVENLABS_LLM...');
  if (!ELEVENLABS_LLM || ELEVENLABS_LLM.length === 0) {
    results.valid = false;
    results.errors.push('ELEVENLABS_LLM is not configured');
    console.log('   ❌ FAILED: ELEVENLABS_LLM is not set in code');
    console.log('   [5/5] CHECK COMPLETE');
  } else {
    results.config.llm = ELEVENLABS_LLM;
    console.log('   ✅ PASSED: ELEVENLABS_LLM is configured');
    console.log(`   📝 LLM: ${ELEVENLABS_LLM}`);
    console.log('   [5/5] CHECK COMPLETE');
  }
  
  // Force flush stdout to ensure all checks are visible before summary
  // This helps Railway's log viewer display all checks properly
  if (process.stdout && typeof process.stdout.write === 'function') {
    process.stdout.write(''); // Force flush
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(80));
  
  if (results.valid && results.errors.length === 0) {
    console.log('✅ ALL CHECKS PASSED - ElevenLabs is properly configured!');
    console.log('\n📋 Configuration Summary:');
    console.log(`   API Key: ${results.config.apiKey || 'NOT SET'}`);
    console.log(`   Voice Provider: ${results.config.voiceProvider}`);
    console.log(`   Agent ID: ${results.config.agentId || 'NOT SET'}`);
    console.log(`   Voice ID: ${results.config.voiceId || 'NOT SET'}`);
    console.log(`   LLM: ${results.config.llm || 'NOT SET'}`);
    console.log(`   API URL: ${ELEVENLABS_API_URL}`);
  } else {
    console.log('❌ VALIDATION FAILED - Please fix the following issues:');
    results.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
    
    if (results.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      results.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
    }
    
    console.log('\n💡 FIX INSTRUCTIONS:');
    console.log('   1. Go to Railway Dashboard > Your Project > Settings > Variables');
    console.log('   2. Add ELEVENLABS_API_KEY with your ElevenLabs API key');
    console.log('   3. Redeploy the service');
    console.log('   4. Verify the key is correct (starts with your account prefix)');
  }
  
  console.log('='.repeat(80) + '\n');
  
  return results;
}

// Export for use in other files
export { validateElevenLabsConfig, ELEVENLABS_AGENT_ID, ELEVENLABS_VOICE_ID, ELEVENLABS_LLM };

// If run directly, execute validation
// Check if this is the main module (ES module way)
import { fileURLToPath } from 'url';
import { argv } from 'process';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = import.meta.url === `file://${argv[1]}` || process.argv[1]?.endsWith('validateElevenLabs.js');

if (isMainModule) {
  const results = validateElevenLabsConfig();
  process.exit(results.valid ? 0 : 1);
}

