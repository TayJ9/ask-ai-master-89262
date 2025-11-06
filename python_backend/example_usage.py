"""
Example usage of the Dialogflow interview backend
"""

from dialogflow_interview import (
    start_interview_session,
    detect_intent,
    score_interview,
    get_from_database,
    get_transcript
)

def run_example_interview():
    """Run a complete example interview flow"""
    
    # Generate a unique session ID
    import uuid
    session_id = f"session_{uuid.uuid4().hex[:8]}"
    
    print("=" * 60)
    print("DIALOGFLOW INTERVIEW EXAMPLE")
    print("=" * 60)
    
    # Step 1: Start the interview
    print("\n[1] Starting interview session...")
    try:
        start_result = start_interview_session(
            session_id=session_id,
            role_selection="I want to interview for the Software Engineer role.",
            resume_summary="Expert in Python, AWS, and Kubernetes. Led a team of 4 on a microservices migration project.",
            difficulty="Hard"
        )
        print(f"✓ Session started: {session_id}")
        print(f"\nAgent: {start_result['agent_response']}")
        last_question = start_result['agent_response']
    except Exception as e:
        print(f"✗ Error starting interview: {e}")
        return
    
    # Step 2: Simulate interview turns
    print("\n[2] Simulating interview conversation...")
    
    # Turn 1
    print("\n--- Turn 1 ---")
    user_answer_1 = "I have 5 years of experience in Python and microservices architecture. I've worked on scaling systems to handle millions of requests per day."
    print(f"User: {user_answer_1}")
    
    try:
        result_1 = detect_intent(session_id, user_answer_1, last_question)
        print(f"Agent: {result_1['agent_response']}")
        last_question = result_1['agent_response']
    except Exception as e:
        print(f"✗ Error in turn 1: {e}")
        return
    
    # Turn 2
    print("\n--- Turn 2 ---")
    user_answer_2 = "I've designed and implemented several microservices using Docker and Kubernetes. I also have experience with AWS services like ECS, Lambda, and RDS."
    print(f"User: {user_answer_2}")
    
    try:
        result_2 = detect_intent(session_id, user_answer_2, last_question)
        print(f"Agent: {result_2['agent_response']}")
        last_question = result_2['agent_response']
    except Exception as e:
        print(f"✗ Error in turn 2: {e}")
        return
    
    # Turn 3
    print("\n--- Turn 3 ---")
    user_answer_3 = "I've worked with distributed systems and understand concepts like eventual consistency, CAP theorem, and how to handle database replication."
    print(f"User: {user_answer_3}")
    
    try:
        result_3 = detect_intent(session_id, user_answer_3, last_question)
        print(f"Agent: {result_3['agent_response']}")
        last_question = result_3['agent_response']
    except Exception as e:
        print(f"✗ Error in turn 3: {e}")
        return
    
    # Step 3: View transcript
    print("\n[3] Viewing saved transcript...")
    transcript = get_transcript(session_id)
    print(f"\nTotal Q&A pairs saved: {len(transcript)}")
    for entry in transcript:
        print(f"\nQ{entry['turn']}: {entry['question'][:100]}...")
        print(f"A{entry['turn']}: {entry['answer'][:100]}...")
    
    # Step 4: Score the interview
    print("\n[4] Scoring interview...")
    try:
        score_report = score_interview(session_id)
        
        print("\n" + "=" * 60)
        print("SCORING RESULTS")
        print("=" * 60)
        
        print(f"\nOverall Score: {score_report.get('overall_score', 'N/A')}/10")
        print(f"\nSummary:\n{score_report.get('summary', 'N/A')}")
        
        print("\n" + "-" * 60)
        print("INDIVIDUAL QUESTION SCORES & FEEDBACK")
        print("-" * 60)
        for q_score in score_report.get('question_scores', []):
            print(f"\n  Question {q_score.get('question_number', '?')}: {q_score.get('score', 'N/A')}/10")
            print(f"  Feedback: {q_score.get('justification', 'N/A')}")
        
        print("\n" + "-" * 60)
        print("OVERALL ASSESSMENT")
        print("-" * 60)
        
        print("\n" + "=" * 60)
        
    except Exception as e:
        print(f"✗ Error scoring interview: {e}")
        import traceback
        traceback.print_exc()
    
    # Step 5: Retrieve score report from database
    print("\n[5] Retrieving score report from database...")
    saved_report = get_from_database(session_id, "score_report")
    if saved_report:
        print("✓ Score report successfully saved to database")
    else:
        print("✗ Score report not found in database")

if __name__ == "__main__":
    run_example_interview()

