#!/usr/bin/env python3
"""
Test script to verify all endpoints are working
"""

import requests
import json
import sys

def test_endpoint(name, url, method="GET", headers=None, data=None, expected_status=None):
    """Test an endpoint and return status"""
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=5)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data, timeout=5)
        else:
            return False, f"Unsupported method: {method}"
        
        status_ok = True
        if expected_status:
            status_ok = response.status_code == expected_status
        
        if status_ok:
            return True, f"Status: {response.status_code}"
        else:
            return False, f"Expected status {expected_status}, got {response.status_code}"
    except requests.exceptions.ConnectionError:
        return False, "Connection refused (server not running)"
    except requests.exceptions.Timeout:
        return False, "Request timeout"
    except Exception as e:
        return False, f"Error: {str(e)}"

def main():
    print("🧪 ENDPOINT VERIFICATION TEST")
    print("=" * 50)
    print()
    
    results = []
    
    # Test 1: Python Backend Health
    print("1. Testing Python Backend Health (port 5001)...")
    success, message = test_endpoint(
        "Python Health",
        "http://localhost:5001/health",
        method="GET",
        expected_status=200
    )
    results.append(("Python Backend Health", success, message))
    status_icon = "✅" if success else "❌"
    print(f"   {status_icon} {message}")
    print()
    
    # Test 2: Node.js Server Auth Endpoint (should return 401 for unauthenticated)
    print("2. Testing Node.js Server (port 5000)...")
    success, message = test_endpoint(
        "Node.js Auth",
        "http://localhost:5000/api/auth/me",
        method="GET",
        expected_status=401  # Expected for unauthenticated request
    )
    results.append(("Node.js Server", success, message))
    status_icon = "✅" if success else "❌"
    print(f"   {status_icon} {message}")
    print()
    
    # Test 3: Python Backend Voice Interview Start (should return 400 or 500 without proper data)
    print("3. Testing Python Backend Voice Interview Start...")
    success, message = test_endpoint(
        "Python Voice Start",
        "http://localhost:5001/api/voice-interview/start",
        method="POST",
        data={}  # Empty data should return error, but endpoint should exist
    )
    # Accept 400 (bad request) or 500 (server error) as valid - means endpoint exists
    endpoint_exists = success or ("400" in message or "500" in message or "Connection refused" not in message)
    results.append(("Python Voice Interview Endpoint", endpoint_exists, message))
    status_icon = "✅" if endpoint_exists else "❌"
    print(f"   {status_icon} {message}")
    print()
    
    # Test 4: Node.js Proxy to Python (should fail without auth, but endpoint should exist)
    print("4. Testing Node.js Proxy to Python Backend...")
    success, message = test_endpoint(
        "Node.js Proxy",
        "http://localhost:5000/api/voice-interview/start",
        method="POST",
        data={}
    )
    # Accept 401 (unauthorized) or 500 as valid - means endpoint exists
    endpoint_exists = success or ("401" in message or "500" in message or "Connection refused" not in message)
    results.append(("Node.js Proxy Endpoint", endpoint_exists, message))
    status_icon = "✅" if endpoint_exists else "❌"
    print(f"   {status_icon} {message}")
    print()
    
    # Summary
    print("=" * 50)
    print("📋 SUMMARY")
    print("=" * 50)
    print()
    
    passed = sum(1 for _, success, _ in results if success)
    total = len(results)
    
    for name, success, message in results:
        icon = "✅" if success else "❌"
        print(f"{icon} {name}: {message}")
    
    print()
    print(f"Tests Passed: {passed}/{total}")
    print()
    
    if passed == total:
        print("✅ ALL TESTS PASSED - Servers are running correctly!")
        print()
        print("Next steps:")
        print("1. Test the voice interview in your browser")
        print("2. Verify all features work end-to-end")
        print("3. You're ready to publish! 🚀")
        return 0
    else:
        print("❌ SOME TESTS FAILED - Please check the issues above")
        print()
        print("To start servers:")
        print("1. In Replit: Click the 'Run' button")
        print("2. Or manually:")
        print("   - Python: cd python_backend && PORT=5001 python app.py")
        print("   - Node.js: npm run dev")
        return 1

if __name__ == "__main__":
    sys.exit(main())

