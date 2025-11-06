"""
Test script to verify scoring function outputs individual question scores and overall summary
"""

from dialogflow_interview import score_interview, save_to_database, save_transcript_entry

def test_scoring_with_sample_data():
    """Test scoring with sample interview transcript"""
    
    session_id = "test_scoring_session"
    
    # Create a sample transcript with 5 Q&A pairs
    sample_transcript = [
        {
            "turn": 1,
            "question": "Tell me about your experience with microservices architecture.",
            "answer": "I have 5 years of experience working with microservices. I've designed and implemented several services using Docker and Kubernetes. I've worked on breaking down monolithic applications into smaller, independent services that communicate via REST APIs."
        },
        {
            "turn": 2,
            "question": "How do you handle database consistency in a distributed system?",
            "answer": "I use eventual consistency patterns. For critical operations, I implement two-phase commit protocols. I also use message queues to ensure data synchronization across services."
        },
        {
            "turn": 3,
            "question": "Explain how you would scale a system to handle 10 million requests per day.",
            "answer": "I would start by implementing caching layers using Redis. Then I'd add load balancers and horizontal scaling. I'd also optimize database queries and consider read replicas."
        },
        {
            "turn": 4,
            "question": "What is your approach to debugging production issues?",
            "answer": "I check application logs first, then look at error tracking tools like Sentry. I also review metrics and use distributed tracing to understand the flow of requests across services."
        },
        {
            "turn": 5,
            "question": "How do you ensure code quality in your team?",
            "answer": "We use code reviews for all pull requests. We also have automated testing including unit tests and integration tests. We run CI/CD pipelines that check code quality before deployment."
        }
    ]
    
    # Save transcript to database
    save_to_database(session_id, "transcript", sample_transcript)
    
    print("=" * 70)
    print("TESTING INTERVIEW SCORING FUNCTION")
    print("=" * 70)
    print(f"\nSample transcript with {len(sample_transcript)} questions loaded.")
    print("\nCalling score_interview()...\n")
    
    try:
        # Score the interview
        score_report = score_interview(session_id)
        
        print("\n" + "=" * 70)
        print("SCORING RESULTS VERIFICATION")
        print("=" * 70)
        
        # Verify structure
        assert 'question_scores' in score_report, "Missing 'question_scores' in response"
        assert 'overall_score' in score_report, "Missing 'overall_score' in response"
        assert 'summary' in score_report, "Missing 'summary' in response"
        
        question_scores = score_report['question_scores']
        print(f"\n✓ Found {len(question_scores)} individual question scores")
        
        # Verify each question has score and justification
        for i, q_score in enumerate(question_scores, 1):
            assert 'question_number' in q_score, f"Question {i} missing 'question_number'"
            assert 'score' in q_score, f"Question {i} missing 'score'"
            assert 'justification' in q_score, f"Question {i} missing 'justification'"
            assert isinstance(q_score['score'], (int, float)), f"Question {i} score must be numeric"
            assert 1 <= q_score['score'] <= 10, f"Question {i} score must be between 1-10"
            assert len(q_score['justification']) > 0, f"Question {i} justification is empty"
            print(f"  ✓ Q{q_score['question_number']}: Score {q_score['score']}/10 - Has feedback")
        
        # Verify overall score
        overall_score = score_report['overall_score']
        assert isinstance(overall_score, (int, float)), "Overall score must be numeric"
        assert 1 <= overall_score <= 10, "Overall score must be between 1-10"
        print(f"\n✓ Overall score: {overall_score}/10")
        
        # Verify summary
        summary = score_report['summary']
        assert isinstance(summary, str), "Summary must be a string"
        assert len(summary) > 50, "Summary should be at least 2-3 sentences"
        print(f"✓ Summary length: {len(summary)} characters")
        
        print("\n" + "=" * 70)
        print("DETAILED RESULTS")
        print("=" * 70)
        
        # Display individual scores
        print("\nINDIVIDUAL QUESTION SCORES & FEEDBACK:")
        print("-" * 70)
        for q_score in question_scores:
            print(f"\nQuestion {q_score['question_number']}: {q_score['score']}/10")
            print(f"Feedback: {q_score['justification']}")
        
        # Display overall summary
        print("\n" + "-" * 70)
        print("OVERALL ASSESSMENT:")
        print("-" * 70)
        print(f"Overall Score: {overall_score}/10")
        print(f"\nSummary:\n{summary}")
        
        print("\n" + "=" * 70)
        print("✓ ALL TESTS PASSED - Scoring function works correctly!")
        print("=" * 70)
        
        return score_report
        
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    test_scoring_with_sample_data()


