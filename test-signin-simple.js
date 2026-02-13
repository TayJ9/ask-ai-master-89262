/**
 * Simple API test for signin (no browser needed)
 * Tests the signin endpoint directly
 * 
 * Run with: node test-signin-simple.js
 */

async function testSignin() {
  console.log('🚀 Testing signin API endpoint...\n');
  
  try {
    // Test 1: Direct backend call
    console.log('📡 Test 1: Direct backend call (http://localhost:3000/api/auth/signin)');
    const directResponse = await fetch('http://localhost:3000/api/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test123@gmail.com',
        password: 'Test123'
      })
    });
    
    const responseText = await directResponse.text();
    console.log(`   Status: ${directResponse.status}`);
    console.log(`   Content-Type: ${directResponse.headers.get('content-type')}`);
    
    let directData;
    try {
      directData = JSON.parse(responseText);
      console.log(`   Response:`, JSON.stringify(directData, null, 2));
      
      if (directResponse.ok && directData.token) {
        console.log('   ✅ SUCCESS! Token received');
        console.log(`   Token: ${directData.token.substring(0, 20)}...`);
        console.log(`   User: ${directData.user?.email}`);
      } else {
        console.log('   ❌ FAILED:', directData.error || 'Unknown error');
      }
    } catch (e) {
      console.log(`   ❌ Response is not JSON`);
      console.log(`   Response preview: ${responseText.substring(0, 300)}`);
      console.log(`   This usually means:`);
      console.log(`   - Backend is not running on port 3000`);
      console.log(`   - Backend returned an error page`);
      console.log(`   - Route is not registered`);
    }
    
    console.log('\n');
    
    // Test 2: Via proxy (simulating frontend)
    console.log('📡 Test 2: Via proxy (http://localhost:5173/api/auth/signin)');
    try {
      const proxyResponse = await fetch('http://localhost:5173/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test123@gmail.com',
          password: 'Test123'
        })
      });
      
      const proxyText = await proxyResponse.text();
      console.log(`   Status: ${proxyResponse.status}`);
      
      let proxyData;
      try {
        proxyData = JSON.parse(proxyText);
        console.log(`   Response:`, JSON.stringify(proxyData, null, 2));
        
        if (proxyResponse.ok && proxyData.token) {
          console.log('   ✅ SUCCESS! Token received via proxy');
        } else {
          console.log('   ❌ FAILED:', proxyData.error || 'Unknown error');
        }
      } catch (e) {
        console.log(`   Response (not JSON): ${proxyText.substring(0, 200)}`);
        console.log('   (This is expected if frontend is not running)');
      }
    } catch (proxyError) {
      console.log('   ❌ Proxy test failed:', proxyError.message);
      console.log('   (This is expected if frontend is not running)');
    }
    
    console.log('\n');
    
    // Test 3: Health check
    console.log('📡 Test 3: Backend health check');
    try {
      const healthResponse = await fetch('http://localhost:3000/health');
      const healthText = await healthResponse.text();
      console.log(`   Status: ${healthResponse.status}`);
      
      try {
        const healthData = JSON.parse(healthText);
        console.log(`   Response:`, JSON.stringify(healthData, null, 2));
        console.log('   ✅ Backend is running');
      } catch (e) {
        console.log(`   Response (not JSON): ${healthText.substring(0, 200)}`);
        console.log('   ❌ Backend health endpoint returned non-JSON');
      }
    } catch (healthError) {
      console.log('   ❌ Health check failed:', healthError.message);
      console.log('   Backend might not be running on port 3000');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.cause) {
      console.error('   Cause:', error.cause);
    }
  }
}

// Run the test
testSignin().catch(console.error);
