"""
Comprehensive End-to-End Test for Complete Interview Flow
Tests: Text interview, Voice interview, Database operations, Scoring
"""

import os
import sys
import uuid
import json
from typing import Dict, Any

# Import interview functions
from dialogflow_interview import (
    start_interview_session,
    detect_intent,
    score_interview,
    get_from_database,
    get_transcript,
    save_to_database
)
from dialogflow_voice import (
    start_voice_interview_session,
    detect_intent_with_audio
)

# Test configuration
TEST_ROLE = "Software Engineer"
TEST_RESUME = "Expert in Python, AWS, and Kubernetes. Led a team of 4 on a microservices migration project. 5 years of experience in distributed systems."
TEST_DIFFICULTY = "Medium"

class InterviewTester:
    """Comprehensive test suite for interview flow"""
    
    def __init__(self):
        self.test_results = []
        self.passed = 0
        self.failed = 0
        
    def log_test(self, test_name: str, passed: bool, message: str = ""):
        """Log test result"""
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"\n[{status}] {test_name}")
        if message:
            print(f"    {message}")
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "message": message
        })
        if passed:
            self.passed += 1
        else:
            self.failed += 1
    
    def test_environment_setup(self) -> bool:
        """Test 1: Verify environment variables are set"""
        print("\n" + "=" * 70)
        print("TEST 1: ENVIRONMENT SETUP")
        print("=" * 70)
        
        required_vars = [
            "GOOGLE_CREDENTIALS",
            "GCP_PROJECT_ID",
            "DF_AGENT_ID",
            "GEMINI_API_KEY"
        ]
        
        missing = []
        for var in required_vars:
            if not os.environ.get(var):
                # Try alternative names
                alt_names = {
                    "GCP_PROJECT_ID": ["DIALOGFLOW_PROJECT_ID"],
                    "DF_AGENT_ID": ["DIALOGFLOW_AGENT_ID"],
                    "GEMINI_API_KEY": ["GOOGLE_API_KEY"]
                }
                found = False
                for alt in alt_names.get(var, []):
                    if os.environ.get(alt):
                        found = True
                        break
                if not found:
                    missing.append(var)
        
        if missing:
            self.log_test("Environment Setup", False, f"Missing variables: {', '.join(missing)}")
            return False
        else:
            self.log_test("Environment Setup", True, "All required environment variables are set")
            return True
    
    def test_text_interview_flow(self) -> Dict[str, Any]:
        """Test 2: Complete text-based interview flow"""
        print("\n" + "=" * 70)
        print("TEST 2: TEXT-BASED INTERVIEW FLOW")
        print("=" * 70)
        
        session_id = f"test_text_{uuid.uuid4().hex[:8]}"
        results = {"session_id": session_id, "turns": []}
        
        try:
            # Step 2.1: Start interview
            print("\n[2.1] Starting interview session...")
            start_result = start_interview_session(
                session_id=session_id,
                role_selection=f"I want to interview for the {TEST_ROLE} role.",
                resume_summary=TEST_RESUME,
                difficulty=TEST_DIFFICULTY
            )
            
            if not start_result.get("agent_response"):
                self.log_test("Start Interview", False, "No agent response received")
                return results
            
            self.log_test("Start Interview", True, f"Session started: {session_id}")
            print(f"Agent: {start_result['agent_response'][:100]}...")
            
            last_question = start_result['agent_response']
            results["turns"].append({
                "turn": 0,
                "type": "start",
                "agent_message": last_question
            })
            
            # Step 2.2: Verify session data saved
            print("\n[2.2] Verifying session data in database...")
            saved_question = get_from_database(session_id, "last_agent_question")
            session_info = get_from_database(session_id, "session_info")
            
            if saved_question == last_question:
                self.log_test("Session Data Saved", True, "First question saved correctly")
            else:
                self.log_test("Session Data Saved", False, "First question not saved correctly")
            
            if session_info:
                self.log_test("Session Info Saved", True, "Session metadata saved")
            else:
                self.log_test("Session Info Saved", False, "Session metadata not saved")
            
            # Step 2.3: Simulate interview turns
            print("\n[2.3] Simulating interview conversation...")
            user_answers = [
                "I have 5 years of experience in Python and microservices architecture. I've worked on scaling systems to handle millions of requests per day.",
                "I've designed and implemented several microservices using Docker and Kubernetes. I also have experience with AWS services like ECS, Lambda, and RDS.",
                "I've worked with distributed systems and understand concepts like eventual consistency, CAP theorem, and how to handle database replication."
            ]
            
            for i, user_answer in enumerate(user_answers, 1):
                print(f"\n--- Turn {i} ---")
                print(f"User: {user_answer[:80]}...")
                
                try:
                    result = detect_intent(session_id, user_answer, last_question)
                    
                    if not result.get("agent_response"):
                        self.log_test(f"Turn {i} - Agent Response", False, "No agent response")
                        break
                    
                    print(f"Agent: {result['agent_response'][:100]}...")
                    
                    results["turns"].append({
                        "turn": i,
                        "user_answer": user_answer,
                        "agent_message": result['agent_response']
                    })
                    
                    last_question = result['agent_response']
                    
                    # Check if interview ended
                    if result.get("is_end"):
                        print("Interview ended by agent")
                        break
                    
                    self.log_test(f"Turn {i} - Conversation", True, "Q&A pair processed successfully")
                    
                except Exception as e:
                    self.log_test(f"Turn {i} - Error", False, str(e))
                    break
            
            # Step 2.4: Verify transcript
            print("\n[2.4] Verifying transcript...")
            transcript = get_transcript(session_id)
            print(f"Transcript entries: {len(transcript)}")
            
            if len(transcript) == len(user_answers):
                self.log_test("Transcript Verification", True, f"All {len(transcript)} Q&A pairs saved")
                for entry in transcript:
                    print(f"  Q{entry['turn']}: {entry['question'][:60]}...")
                    print(f"  A{entry['turn']}: {entry['answer'][:60]}...")
            else:
                self.log_test("Transcript Verification", False, 
                            f"Expected {len(user_answers)} entries, got {len(transcript)}")
            
            results["transcript"] = transcript
            return results
            
        except Exception as e:
            self.log_test("Text Interview Flow", False, f"Error: {str(e)}")
            import traceback
            traceback.print_exc()
            return results
    
    def test_scoring(self, session_id: str) -> Dict[str, Any]:
        """Test 3: Interview scoring"""
        print("\n" + "=" * 70)
        print("TEST 3: INTERVIEW SCORING")
        print("=" * 70)
        
        try:
            # Step 3.1: Verify transcript exists
            print("\n[3.1] Verifying transcript exists...")
            transcript = get_transcript(session_id)
            if not transcript or len(transcript) == 0:
                self.log_test("Transcript Check", False, "No transcript found for scoring")
                return {}
            
            self.log_test("Transcript Check", True, f"Found {len(transcript)} Q&A pairs")
            
            # Step 3.2: Score interview
            print("\n[3.2] Scoring interview...")
            score_report = score_interview(session_id)
            
            # Step 3.3: Verify score report structure
            print("\n[3.3] Verifying score report structure...")
            
            required_fields = ['question_scores', 'overall_score', 'summary']
            missing_fields = [f for f in required_fields if f not in score_report]
            
            if missing_fields:
                self.log_test("Score Report Structure", False, 
                            f"Missing fields: {', '.join(missing_fields)}")
            else:
                self.log_test("Score Report Structure", True, "All required fields present")
            
            # Step 3.4: Verify individual question scores
            question_scores = score_report.get('question_scores', [])
            print(f"\n[3.4] Verifying {len(question_scores)} individual question scores...")
            
            all_valid = True
            for q_score in question_scores:
                if 'question_number' not in q_score or 'score' not in q_score or 'justification' not in q_score:
                    all_valid = False
                    break
                if not (1 <= q_score['score'] <= 10):
                    all_valid = False
                    break
            
            if all_valid and len(question_scores) == len(transcript):
                self.log_test("Individual Question Scores", True, 
                            f"All {len(question_scores)} questions scored correctly")
            else:
                self.log_test("Individual Question Scores", False, 
                            f"Score validation failed or count mismatch")
            
            # Step 3.5: Verify overall score
            overall_score = score_report.get('overall_score')
            if overall_score and 1 <= overall_score <= 10:
                self.log_test("Overall Score", True, f"Overall score: {overall_score}/10")
                print(f"\nOverall Score: {overall_score}/10")
            else:
                self.log_test("Overall Score", False, "Invalid overall score")
            
            # Step 3.6: Verify summary
            summary = score_report.get('summary', '')
            if len(summary) > 50:
                self.log_test("Summary", True, f"Summary length: {len(summary)} characters")
                print(f"\nSummary: {summary[:200]}...")
            else:
                self.log_test("Summary", False, "Summary too short or missing")
            
            # Step 3.7: Verify score report saved to database
            print("\n[3.7] Verifying score report saved to database...")
            saved_report = get_from_database(session_id, "score_report")
            if saved_report:
                self.log_test("Score Report Saved", True, "Score report saved to database")
            else:
                self.log_test("Score Report Saved", False, "Score report not found in database")
            
            return score_report
            
        except Exception as e:
            self.log_test("Scoring", False, f"Error: {str(e)}")
            import traceback
            traceback.print_exc()
            return {}
    
    def test_empty_response_handling(self) -> bool:
        """Test 4: Verify empty response handling (our recent fixes)"""
        print("\n" + "=" * 70)
        print("TEST 4: EMPTY RESPONSE HANDLING")
        print("=" * 70)
        
        # This test verifies that our fixes for empty responses are in place
        # We can't easily simulate Dialogflow returning empty responses, but we can check the code
        
        try:
            # Check if detect_intent_with_audio has empty response handling
            import inspect
            from dialogflow_voice import detect_intent_with_audio
            
            source = inspect.getsource(detect_intent_with_audio)
            
            checks = [
                ("No text response" in source or "empty agent response" in source.lower()),
                ("No audio response" in source or "empty audio" in source.lower()),
                ("Warning:" in source)  # Check for warning logs
            ]
            
            if all(checks):
                self.log_test("Empty Response Handling", True, 
                            "Code includes empty response handling and warnings")
                return True
            else:
                self.log_test("Empty Response Handling", False, 
                            "Missing empty response handling code")
                return False
                
        except Exception as e:
            self.log_test("Empty Response Handling", False, f"Error: {str(e)}")
            return False
    
    def test_firestore_lazy_init(self) -> bool:
        """Test 5: Verify Firestore lazy initialization"""
        print("\n" + "=" * 70)
        print("TEST 5: FIRESTORE LAZY INITIALIZATION")
        print("=" * 70)
        
        try:
            import inspect
            from dialogflow_interview import initialize_firestore, save_to_database
            
            # Check if initialize_firestore function exists
            if 'initialize_firestore' in globals() or hasattr(sys.modules['dialogflow_interview'], 'initialize_firestore'):
                self.log_test("Lazy Init Function", True, "initialize_firestore function exists")
            else:
                self.log_test("Lazy Init Function", False, "initialize_firestore function missing")
                return False
            
            # Check if save_to_database calls initialize_firestore
            source = inspect.getsource(save_to_database)
            if 'initialize_firestore' in source:
                self.log_test("Lazy Init Usage", True, "Database functions use lazy initialization")
                return True
            else:
                self.log_test("Lazy Init Usage", False, "Database functions don't use lazy initialization")
                return False
                
        except Exception as e:
            self.log_test("Firestore Lazy Init", False, f"Error: {str(e)}")
            return False
    
    def test_voice_interview_start(self) -> bool:
        """Test 6: Voice interview session start"""
        print("\n" + "=" * 70)
        print("TEST 6: VOICE INTERVIEW START")
        print("=" * 70)
        
        session_id = f"test_voice_{uuid.uuid4().hex[:8]}"
        
        try:
            print("\n[6.1] Starting voice interview session...")
            result = start_voice_interview_session(
                session_id=session_id,
                role_selection_text=f"I want to interview for the {TEST_ROLE} role.",
                resume_summary=TEST_RESUME,
                difficulty=TEST_DIFFICULTY
            )
            
            # Check response structure
            required_fields = ['audio_response', 'audio_format', 'agent_response_text', 'session_id']
            missing = [f for f in required_fields if f not in result]
            
            if missing:
                self.log_test("Voice Start Response", False, f"Missing fields: {', '.join(missing)}")
                return False
            
            self.log_test("Voice Start Response", True, "All required fields present")
            
            # Check audio response
            if result.get('audio_response'):
                audio_size = len(result['audio_response'])
                self.log_test("Audio Response", True, f"Audio response received ({audio_size} chars base64)")
            else:
                self.log_test("Audio Response", False, "No audio response (may be expected if Dialogflow fails)")
            
            # Check text response
            if result.get('agent_response_text'):
                self.log_test("Text Response", True, f"Text response: {result['agent_response_text'][:60]}...")
            else:
                self.log_test("Text Response", False, "No text response")
            
            # Verify session data saved
            saved_question = get_from_database(session_id, "last_agent_question")
            if saved_question:
                self.log_test("Voice Session Data", True, "Session data saved to database")
            else:
                self.log_test("Voice Session Data", False, "Session data not saved")
            
            return True
            
        except Exception as e:
            self.log_test("Voice Interview Start", False, f"Error: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def run_all_tests(self):
        """Run all tests"""
        print("\n" + "=" * 70)
        print("COMPREHENSIVE INTERVIEW FLOW TEST")
        print("=" * 70)
        print("\nThis test will verify:")
        print("  1. Environment setup")
        print("  2. Complete text-based interview flow")
        print("  3. Interview scoring")
        print("  4. Empty response handling (code verification)")
        print("  5. Firestore lazy initialization (code verification)")
        print("  6. Voice interview start")
        
        # Test 1: Environment
        if not self.test_environment_setup():
            print("\n⚠️  Environment setup failed. Some tests may not work.")
            print("   Please set required environment variables before running tests.")
            response = input("\nContinue anyway? (y/n): ")
            if response.lower() != 'y':
                return
        
        # Test 2: Text interview flow
        text_results = self.test_text_interview_flow()
        
        # Test 3: Scoring (if we have a transcript)
        if text_results.get("transcript") and len(text_results["transcript"]) > 0:
            score_report = self.test_scoring(text_results["session_id"])
            text_results["score_report"] = score_report
        
        # Test 4: Empty response handling
        self.test_empty_response_handling()
        
        # Test 5: Firestore lazy init
        self.test_firestore_lazy_init()
        
        # Test 6: Voice interview start
        self.test_voice_interview_start()
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 70)
        print("TEST SUMMARY")
        print("=" * 70)
        
        total = self.passed + self.failed
        print(f"\nTotal Tests: {total}")
        print(f"Passed: {self.passed} ✓")
        print(f"Failed: {self.failed} ✗")
        
        if self.failed > 0:
            print("\nFailed Tests:")
            for result in self.test_results:
                if not result["passed"]:
                    print(f"  ✗ {result['test']}: {result['message']}")
        
        print("\n" + "=" * 70)
        if self.failed == 0:
            print("✓ ALL TESTS PASSED!")
        else:
            print(f"⚠️  {self.failed} TEST(S) FAILED - Please review the errors above")
        print("=" * 70)

if __name__ == "__main__":
    tester = InterviewTester()
    tester.run_all_tests()

