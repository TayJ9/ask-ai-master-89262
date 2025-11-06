"""
Code Verification Script for Interview Flow
Verifies code structure and logic without requiring API credentials
"""

import ast
import inspect
import sys
import os

def check_file_exists(filepath):
    """Check if a file exists"""
    return os.path.exists(filepath)

def check_function_exists(module, func_name):
    """Check if a function exists in a module"""
    try:
        return hasattr(module, func_name) or callable(getattr(module, func_name, None))
    except:
        return False

def check_code_contains(filepath, patterns):
    """Check if code file contains certain patterns"""
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        results = {}
        for pattern in patterns:
            results[pattern] = pattern in content
        return results
    except Exception as e:
        return {p: False for p in patterns}

def verify_interview_flow():
    """Verify the complete interview flow structure"""
    
    print("=" * 70)
    print("INTERVIEW FLOW CODE VERIFICATION")
    print("=" * 70)
    
    checks_passed = 0
    checks_failed = 0
    
    # 1. Check required files exist
    print("\n[1] Checking required files...")
    required_files = [
        "dialogflow_interview.py",
        "dialogflow_voice.py",
        "app.py",
        "requirements.txt"
    ]
    
    for file in required_files:
        if check_file_exists(file):
            print(f"  ✓ {file} exists")
            checks_passed += 1
        else:
            print(f"  ✗ {file} missing")
            checks_failed += 1
    
    # 2. Check dialogflow_interview.py structure
    print("\n[2] Verifying dialogflow_interview.py structure...")
    patterns_to_check = [
        "def start_interview_session",
        "def detect_intent",
        "def score_interview",
        "def save_transcript_entry",
        "def get_transcript",
        "def initialize_firestore",  # Our recent fix
        "get_credentials",
        "get_dialogflow_config"
    ]
    
    results = check_code_contains("dialogflow_interview.py", patterns_to_check)
    for pattern, found in results.items():
        if found:
            print(f"  ✓ {pattern} found")
            checks_passed += 1
        else:
            print(f"  ✗ {pattern} missing")
            checks_failed += 1
    
    # 3. Check dialogflow_voice.py structure
    print("\n[3] Verifying dialogflow_voice.py structure...")
    patterns_to_check = [
        "def start_voice_interview_session",
        "def detect_intent_with_audio",
        "QueryInput.AudioInput",
        "OutputAudioConfig",
        "InputAudioConfig"
    ]
    
    results = check_code_contains("dialogflow_voice.py", patterns_to_check)
    for pattern, found in results.items():
        if found:
            print(f"  ✓ {pattern} found")
            checks_passed += 1
        else:
            print(f"  ✗ {pattern} missing")
            checks_failed += 1
    
    # 4. Check for empty response handling (our recent fixes)
    print("\n[4] Verifying empty response handling...")
    patterns_to_check = [
        "No text response",
        "No audio response",
        "Warning:",
        "I didn't catch that"
    ]
    
    results = check_code_contains("dialogflow_voice.py", patterns_to_check)
    all_found = all(results.values())
    if all_found:
        print("  ✓ Empty response handling implemented")
        checks_passed += 1
    else:
        print("  ✗ Missing empty response handling")
        for pattern, found in results.items():
            if not found:
                print(f"    - Missing: {pattern}")
        checks_failed += 1
    
    # 5. Check for Firestore lazy initialization
    print("\n[5] Verifying Firestore lazy initialization...")
    patterns_to_check = [
        "def initialize_firestore",
        "db_client = None",
        "initialize_firestore()"
    ]
    
    results = check_code_contains("dialogflow_interview.py", patterns_to_check)
    all_found = all(results.values())
    if all_found:
        print("  ✓ Firestore lazy initialization implemented")
        checks_passed += 1
    else:
        print("  ✗ Missing Firestore lazy initialization")
        for pattern, found in results.items():
            if not found:
                print(f"    - Missing: {pattern}")
        checks_failed += 1
    
    # 6. Check Flask app structure
    print("\n[6] Verifying Flask app structure...")
    patterns_to_check = [
        "@app.route('/api/voice-interview/start'",
        "@app.route('/api/voice-interview/send-audio'",
        "@app.route('/api/voice-interview/score'",
        "def start_voice_interview",
        "def send_audio",
        "def score_voice_interview"
    ]
    
    results = check_code_contains("app.py", patterns_to_check)
    for pattern, found in results.items():
        if found:
            print(f"  ✓ {pattern} found")
            checks_passed += 1
        else:
            print(f"  ✗ {pattern} missing")
            checks_failed += 1
    
    # 7. Check transcript saving logic
    print("\n[7] Verifying transcript saving logic...")
    patterns_to_check = [
        "save_transcript_entry",
        "last_agent_question",
        "get_transcript"
    ]
    
    results = check_code_contains("dialogflow_interview.py", patterns_to_check)
    all_found = all(results.values())
    if all_found:
        print("  ✓ Transcript saving logic present")
        checks_passed += 1
    else:
        print("  ✗ Missing transcript saving components")
        checks_failed += 1
    
    # 8. Check scoring prompt structure
    print("\n[8] Verifying scoring prompt structure...")
    patterns_to_check = [
        "STEP 1: INDIVIDUAL QUESTION SCORING",
        "STEP 2: OVERALL SUMMARY",
        "question_scores",
        "overall_score",
        "justification"
    ]
    
    results = check_code_contains("dialogflow_interview.py", patterns_to_check)
    all_found = all(results.values())
    if all_found:
        print("  ✓ Scoring prompt structure correct")
        checks_passed += 1
    else:
        print("  ✗ Scoring prompt missing components")
        checks_failed += 1
    
    # 9. Check JSON parsing improvements
    print("\n[9] Verifying JSON parsing improvements...")
    patterns_to_check = [
        "```(?:json)?",
        "json_match",
        "re.search"
    ]
    
    results = check_code_contains("dialogflow_interview.py", patterns_to_check)
    all_found = any(results.values())  # At least one pattern should be found
    if all_found:
        print("  ✓ JSON parsing improvements present")
        checks_passed += 1
    else:
        print("  ✗ JSON parsing improvements missing")
        checks_failed += 1
    
    # 10. Check session parameter handling
    print("\n[10] Verifying session parameter handling...")
    patterns_to_check = [
        "QueryParameters",
        "candidate_resume_summary",
        "difficulty_level",
        "interviewer_persona"
    ]
    
    results = check_code_contains("dialogflow_interview.py", patterns_to_check)
    all_found = all(results.values())
    if all_found:
        print("  ✓ Session parameters handling correct")
        checks_passed += 1
    else:
        print("  ✗ Missing session parameter components")
        checks_failed += 1
    
    # Print summary
    print("\n" + "=" * 70)
    print("VERIFICATION SUMMARY")
    print("=" * 70)
    print(f"\nTotal Checks: {checks_passed + checks_failed}")
    print(f"Passed: {checks_passed} ✓")
    print(f"Failed: {checks_failed} ✗")
    
    if checks_failed == 0:
        print("\n✓ ALL CODE VERIFICATIONS PASSED!")
        print("\nThe interview flow code structure is correct.")
        print("Next steps:")
        print("  1. Set up environment variables (GOOGLE_CREDENTIALS, etc.)")
        print("  2. Test with actual Dialogflow API calls")
        print("  3. Verify database operations work correctly")
    else:
        print(f"\n⚠️  {checks_failed} VERIFICATION(S) FAILED")
        print("Please review the missing components above.")
    
    print("=" * 70)
    
    return checks_failed == 0

if __name__ == "__main__":
    success = verify_interview_flow()
    sys.exit(0 if success else 1)

