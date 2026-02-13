/**
 * Automated browser test for signin
 * Uses Puppeteer to automate the browser and test the signin flow
 * 
 * Run with: node test-signin-automated.js
 */

const puppeteer = require('puppeteer');

async function testSignin() {
  console.log('🚀 Starting automated signin test...\n');
  
  let browser;
  try {
    // Launch browser
    console.log('📱 Launching browser...');
    browser = await puppeteer.launch({ 
      headless: false, // Set to true to run in background
      devtools: true, // Open devtools for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });
    
    // Navigate to frontend
    console.log('🌐 Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Check if we're on the auth page
    console.log('🔍 Checking page content...');
    const pageTitle = await page.title();
    console.log(`   Page title: ${pageTitle}`);
    
    // Try to find email input
    console.log('🔍 Looking for email input...');
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { timeout: 5000 });
    
    // Fill in email
    console.log('✍️  Filling in email: test123@gmail.com');
    await page.type('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'test123@gmail.com', { delay: 50 });
    
    // Fill in password
    console.log('✍️  Filling in password: Test123');
    await page.type('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'Test123', { delay: 50 });
    
    // Wait a bit
    await page.waitForTimeout(500);
    
    // Click sign in button
    console.log('🖱️  Clicking sign in button...');
    const signInButton = await page.$('button:has-text("Sign In"), button:has-text("Login"), button[type="submit"]');
    if (signInButton) {
      await signInButton.click();
    } else {
      // Try pressing Enter
      await page.keyboard.press('Enter');
    }
    
    // Wait for response
    console.log('⏳ Waiting for signin response...');
    await page.waitForTimeout(3000);
    
    // Check for errors in console
    console.log('🔍 Checking browser console for errors...');
    const logs = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('error') || text.includes('Error') || text.includes('401')) {
        console.log(`   ⚠️  Console: ${text}`);
      }
    });
    
    // Check for network errors
    page.on('response', response => {
      if (response.url().includes('/api/auth/signin')) {
        console.log(`\n📡 Signin API Response:`);
        console.log(`   Status: ${response.status()}`);
        console.log(`   URL: ${response.url()}`);
      }
    });
    
    // Wait a bit more
    await page.waitForTimeout(2000);
    
    // Check if we're still on the same page (signin failed) or navigated (signin succeeded)
    const currentUrl = page.url();
    console.log(`\n📍 Current URL: ${currentUrl}`);
    
    // Check localStorage
    const token = await page.evaluate(() => {
      return localStorage.getItem('auth_token');
    });
    
    if (token) {
      console.log('\n✅ SIGN IN SUCCESSFUL!');
      console.log(`   Token stored in localStorage: ${token.substring(0, 20)}...`);
      console.log(`   Token length: ${token.length}`);
    } else {
      console.log('\n❌ SIGN IN FAILED');
      console.log('   No token found in localStorage');
    }
    
    // Take a screenshot
    console.log('\n📸 Taking screenshot...');
    await page.screenshot({ path: 'signin-test-result.png', fullPage: true });
    console.log('   Screenshot saved to: signin-test-result.png');
    
    // Keep browser open for inspection (comment out if you want it to close)
    console.log('\n⏸️  Keeping browser open for 10 seconds for inspection...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n✅ Browser closed');
    }
  }
}

// Run the test
testSignin().catch(console.error);
