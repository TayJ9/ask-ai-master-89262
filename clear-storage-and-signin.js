/**
 * Browser Console Script
 * Copy and paste this into your browser console (F12) to:
 * 1. Clear localStorage
 * 2. Sign in with test user
 * 3. Verify authentication
 * 
 * Usage: Copy the entire script and paste into browser console
 */

(async function() {
  console.log('🧹 Clearing localStorage...');
  localStorage.clear();
  console.log('✅ localStorage cleared!');
  
  console.log('🔐 Signing in with test user...');
  
  // Use relative path to leverage Vite proxy (avoids CORS issues)
  const API_URL = '/api';
  const TEST_USER = {
    email: 'test123@gmail.com',
    password: 'Test123'
  };
  
  try {
    const response = await fetch(`${API_URL}/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(TEST_USER)
    });
    
    const data = await response.json();
    
    if (response.ok && data.token) {
      localStorage.setItem('auth_token', data.token.trim());
      localStorage.setItem('user', JSON.stringify(data.user));
      console.log('✅ Signed in successfully!');
      console.log('User:', data.user.email);
      console.log('Token stored in localStorage');
      
      // Verify authentication
      console.log('🔍 Verifying authentication...');
      const verifyResponse = await fetch(`${API_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${data.token.trim()}`
        }
      });
      
      if (verifyResponse.ok) {
        const userData = await verifyResponse.json();
        console.log('✅ Authentication verified!');
        console.log('User ID:', userData.id);
        console.log('Email:', userData.email);
        console.log('');
        console.log('🎯 Ready to test interview!');
        console.log('Navigate to the interview page and click "Start Interview"');
      } else {
        console.error('❌ Authentication verification failed');
      }
    } else {
      console.error('❌ Sign in failed:', data.error || 'Unknown error');
      console.log('Make sure both frontend and backend are running');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('Make sure:');
    console.log('1. Backend is running on http://localhost:3000');
    console.log('2. Frontend is running on http://localhost:5173');
    console.log('3. You are on http://localhost:5173 (not a different URL)');
  }
})();
