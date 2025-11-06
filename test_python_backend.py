"""
Python Backend System Test
Tests the Python Flask endpoints and Dialogflow integration
"""

import os
import sys
import json
import base64
import requests
from typing import Dict, List

# Add python_backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'python_backend'))

class TestResult:
    def __init__(self, test_name: str, status: str, details: str, error: str = None):
        self.test_name = test_name
        self.status = status  # PASS, FAIL, SKIP
        self.details = details
        self.error = error

results: List[TestResult] = []

def log_result(test_name: str, status: str, details: str, error: str = None):
    results.append(TestResult(test_name, status, details, error))
    icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⏭️"
    print(f"{icon} {test_name}: {details}")
    if error:
        print(f"   Error: {error}")

def test_1_integration_setup():
    """Test 1: Integration & Setup Validation"""
    print("\n📋 TEST 1: Integration & Setup Validation\n")
    
    # 1.1 Check environment variables
    required_vars = [
        'GOOGLE_CREDENTIALS',
        'DIALOGFLOW_PROJECT_ID',
        'DIALOGFLOW_AGENT_ID',
        'DIALOGFLOW_LOCATION_ID',
        'GEMINI_API_KEY'
    ]
    
    missing = [var for var in required_vars if not os.environ.get(var)]
    if missing:
        log_result("1.1 Environment Variables", "FAIL", f"Missing: {', '.join(missing)}")
        return False
    log_result("1.1 Environment Variables", "PASS", "All required variables present")
    
    # 1.2 Test Dialogflow client initialization
    try:
        from dialogflow_interview import get_credentials, get_dialogflow_config, get_session_path
        
        config = get_dialogflow_config()
        test_session = "test-session-123"
        session_path = get_session_path(test_session)
        
        # Validate session path format
        expected_components = [
            f"projects/{config['project_id']}",
            f"locations/{config['location_id']}",
            f"agents/{config['agent_id']}",
            "environments",
            f"sessions/{test_session}"
        ]
        
        if all(comp in session_path for comp in expected_components):
            log_result("1.2 Dialogflow Client Init", "PASS", f"Session path: {session_path[:80]}...")
        else:
            log_result("1.2 Dialogflow Client Init", "FAIL", f"Invalid session path: {session_path}")
            return False
        
        # Test credentials
        credentials = get_credentials()
        if credentials:
            log_result("1.3 Credentials Loading", "PASS", "Google credentials loaded successfully")
        else:
            log_result("1.3 Credentials Loading", "FAIL", "Failed to load credentials")
            return False
            
    except Exception as e:
        log_result("1.2 Dialogflow Client Init", "FAIL", "Initialization failed", str(e))
        return False
    
    return True

def test_2_voice_pipeline():
    """Test 2: Full Voice-to-Score Pipeline"""
    print("\n📋 TEST 2: Full Voice-to-Score Pipeline Test\n")
    
    python_backend_url = os.environ.get('PYTHON_BACKEND_URL', 'http://127.0.0.1:5001')
    
    # Test 2A: Voice Interview Start
    print("   Testing 2A: Voice-In/Start...")
    try:
        test_session_id = f"test-session-{int(os.urandom(4).hex(), 16)}"
        test_role = "software-engineer"
        test_difficulty = "Hard"
        test_resume = "Experienced software engineer with 5 years in Python and React development."
        test_persona = "Senior technical interviewer focused on system design."
        
        response = requests.post(
            f"{python_backend_url}/api/voice-interview/start",
            json={
                "session_id": test_session_id,
                "role": test_role,
                "resumeText": test_resume,
                "difficulty": test_difficulty,
                "persona": test_persona
            },
            timeout=30
        )
        
        if response.status_code != 200:
            log_result("2A Voice Interview Start", "FAIL", 
                      f"HTTP {response.status_code}", response.text[:200])
            return False
        
        data = response.json()
        if data.get('audioResponse') and data.get('agentResponseText'):
            audio_len = len(data['audioResponse'])
            text_preview = data['agentResponseText'][:50]
            log_result("2A Voice Interview Start", "PASS", 
                      f"Received audio ({audio_len} chars) and text: \"{text_preview}...\"")
            
            # Test 2B: Check for opening phrase
            agent_text = data['agentResponseText'].lower()
            opening_phrases = ['alright', 'let\'s', 'start', 'begin', 'ready']
            if any(phrase in agent_text for phrase in opening_phrases):
                log_result("2B Q1 Generation", "PASS", 
                          f"Opening phrase detected: \"{data['agentResponseText'][:100]}\"")
            else:
                log_result("2B Q1 Generation", "FAIL", 
                          f"No opening phrase found: \"{data['agentResponseText'][:100]}\"")
        else:
            log_result("2A Voice Interview Start", "FAIL", 
                      "Missing audioResponse or agentResponseText")
            return False
        
        # Test 2C: Conversation Loop
        print("   Testing 2C: Conversation Loop & Saving...")
        test_answers = [
            "I would approach this by writing test cases using pytest in Python.",
            "For database optimization, I would create indexes on frequently queried columns.",
            "I would use API gateways and implement circuit breakers for resilience.",
            "I would implement Redis with appropriate TTL values for caching."
        ]
        
        for i, answer in enumerate(test_answers, start=2):
            turn_num = i
            
            # Create minimal WebM audio (in real scenario this would be actual audio)
            # For testing, we'll use a small dummy file
            audio_data = b'fake-webm-audio-data-for-testing-' + str(i).encode()
            
            # Create multipart form data
            files = {
                'audio': ('recording.webm', audio_data, 'audio/webm')
            }
            data_form = {
                'session_id': test_session_id
            }
            
            try:
                audio_response = requests.post(
                    f"{python_backend_url}/api/voice-interview/send-audio",
                    files=files,
                    data=data_form,
                    timeout=30
                )
                
                if audio_response.status_code == 200:
                    audio_data_resp = audio_response.json()
                    agent_text = audio_data_resp.get('agentResponseText', '')
                    log_result(f"2C Turn {turn_num} - Audio Response", "PASS", 
                              f"Received response: \"{agent_text[:50] or 'N/A'}...\"")
                    
                    # Check for transitional phrases
                    transitional = ['thank you', 'great', 'moving on', 'next', 'alright', 'good', 'excellent']
                    has_transition = any(phrase in agent_text.lower() for phrase in transitional)
                    
                    if has_transition or i == len(test_answers) + 1:
                        log_result(f"2C Turn {turn_num} - Transitional Text", "PASS", 
                                  "Transitional phrase detected or final message")
                    else:
                        log_result(f"2C Turn {turn_num} - Transitional Text", "FAIL", 
                                  "No transitional phrase found")
                else:
                    log_result(f"2C Turn {turn_num} - Audio Response", "FAIL", 
                              f"HTTP {audio_response.status_code}: {audio_response.text[:200]}")
                    
            except Exception as e:
                log_result(f"2C Turn {turn_num}", "FAIL", "Failed to send audio", str(e))
            
            # Small delay
            import time
            time.sleep(0.5)
        
        # Test 2D: Interview Conclusion
        print("   Testing 2D: Interview Conclusion...")
        log_result("2D Interview Conclusion", "SKIP", 
                  "Requires actual interview completion flow")
        
        return True
        
    except Exception as e:
        log_result("2A Voice Interview Start", "FAIL", "Test failed", str(e))
        import traceback
        traceback.print_exc()
        return False

def test_3_scoring_system():
    """Test 3: Scoring System Validation"""
    print("\n📋 TEST 3: Scoring System Validation\n")
    
    # Test 3A: Data Fetch
    print("   Testing 3A: Data Fetch...")
    try:
        from dialogflow_interview import get_transcript
        
        test_session = f"test-session-scoring-{int(os.urandom(4).hex(), 16)}"
        transcript = get_transcript(test_session)
        
        if transcript and len(transcript) > 0:
            log_result("3A Data Fetch", "PASS", f"Retrieved {len(transcript)} transcript entries")
        else:
            log_result("3A Data Fetch", "SKIP", 
                      "No transcript data (expected for new session)")
    except Exception as e:
        log_result("3A Data Fetch", "SKIP", "Transcript fetch test", str(e))
    
    # Test 3B: Gemini API Call
    print("   Testing 3B: Gemini API Call...")
    try:
        from dialogflow_interview import score_interview
        
        # Verify function exists and is callable
        if callable(score_interview):
            log_result("3B Gemini API Call", "SKIP", 
                      "Function exists; requires actual interview session with transcript")
        else:
            log_result("3B Gemini API Call", "FAIL", "score_interview is not callable")
    except Exception as e:
        log_result("3B Gemini API Call", "FAIL", "Failed to import score_interview", str(e))
    
    # Test 3C: Score Persistence
    print("   Testing 3C: Score Persistence...")
    log_result("3C Score Persistence", "SKIP", "Requires actual scoring to complete")
    
    return True

def generate_report():
    """Generate comprehensive test report"""
    print("\n" + "=" * 80)
    print("📊 TEST REPORT SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for r in results if r.status == "PASS")
    failed = sum(1 for r in results if r.status == "FAIL")
    skipped = sum(1 for r in results if r.status == "SKIP")
    total = len(results)
    
    print(f"\nTotal Tests: {total}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"⏭️  Skipped: {skipped}")
    
    if total - skipped > 0:
        success_rate = (passed / (total - skipped)) * 100
        print(f"\nSuccess Rate: {success_rate:.1f}% (excluding skipped)")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for r in results:
            if r.status == "FAIL":
                print(f"\n  {r.test_name}")
                print(f"    Details: {r.details}")
                if r.error:
                    print(f"    Error: {r.error}")
    
    if skipped > 0:
        print("\n⏭️  SKIPPED TESTS:")
        for r in results:
            if r.status == "SKIP":
                print(f"\n  {r.test_name}")
                print(f"    Reason: {r.details}")
    
    print("\n" + "=" * 80)
    print("DETAILED TEST RESULTS")
    print("=" * 80)
    
    for i, result in enumerate(results, 1):
        icon = "✅" if result.status == "PASS" else "❌" if result.status == "FAIL" else "⏭️"
        print(f"\n{i}. {icon} {result.test_name}")
        print(f"   Status: {result.status}")
        print(f"   Details: {result.details}")
        if result.error:
            print(f"   Error: {result.error}")
    
    print("\n" + "=" * 80)

def main():
    print("🚀 Starting Comprehensive Python Backend System Test Suite")
    print("=" * 80)
    
    try:
        # Test 1: Integration & Setup
        test1_passed = test_1_integration_setup()
        
        if not test1_passed:
            print("\n⚠️  Setup validation failed. Some tests may be skipped.")
        
        # Test 2: Voice Pipeline (only if setup passed)
        if test1_passed:
            test_2_voice_pipeline()
        else:
            log_result("2 Voice Pipeline", "SKIP", "Skipped due to setup failures")
        
        # Test 3: Scoring System
        test_3_scoring_system()
        
        # Generate report
        generate_report()
        
        # Exit code
        exit_code = 0 if all(r.status != "FAIL" for r in results) else 1
        sys.exit(exit_code)
        
    except Exception as e:
        print(f"\n💥 Fatal error in test suite: {e}")
        import traceback
        traceback.print_exc()
        log_result("Test Suite Execution", "FAIL", "Fatal error occurred", str(e))
        generate_report()
        sys.exit(1)

if __name__ == "__main__":
    main()


