"""
Dialogflow CX Interview Backend
Handles interview sessions, transcript saving, and scoring
"""

import os
import json
from typing import Dict, List, Optional
from google.cloud.dialogflowcx import SessionsClient
from google.cloud.dialogflowcx_v3 import DetectIntentRequest, QueryInput, QueryParameters
from google.oauth2 import service_account
import google.generativeai as genai

# Load credentials and configuration
def get_credentials():
    """Load Google Cloud credentials from environment variable"""
    credentials_json = os.environ.get("GOOGLE_CREDENTIALS")
    if not credentials_json:
        raise ValueError("GOOGLE_CREDENTIALS environment variable not set")
    
    try:
        credentials_dict = json.loads(credentials_json)
        return service_account.Credentials.from_service_account_info(credentials_dict)
    except json.JSONDecodeError:
        raise ValueError("GOOGLE_CREDENTIALS must be valid JSON")

def get_dialogflow_config():
    """Get Dialogflow configuration from environment"""
    # Support both naming conventions for flexibility
    project_id = os.environ.get("GCP_PROJECT_ID") or os.environ.get("DIALOGFLOW_PROJECT_ID")
    location_id = os.environ.get("DF_LOCATION_ID") or os.environ.get("DIALOGFLOW_LOCATION_ID", "us-central1")
    agent_id = os.environ.get("DF_AGENT_ID") or os.environ.get("DIALOGFLOW_AGENT_ID")
    language_code = os.environ.get("DIALOGFLOW_LANGUAGE_CODE", "en")
    
    if not project_id:
        raise ValueError("GCP_PROJECT_ID or DIALOGFLOW_PROJECT_ID environment variable must be set")
    if not agent_id:
        raise ValueError("DF_AGENT_ID or DIALOGFLOW_AGENT_ID environment variable must be set")
    
    return {
        "project_id": project_id,
        "location_id": location_id,
        "agent_id": agent_id,
        "language_code": language_code
    }

# Database setup - choose one: Replit DB or Firestore
USE_REPLIT_DB = os.environ.get("USE_REPLIT_DB", "true").lower() == "true"

# Initialize db_client as None - will be lazily initialized if needed
db_client = None

if USE_REPLIT_DB:
    try:
        from replit import db
        print("Using Replit Database")
    except ImportError:
        print("Replit Database not available. Install with: pip install replit")
        USE_REPLIT_DB = False

def initialize_firestore():
    """Lazy initialization of Firestore client"""
    global db_client
    if db_client is None:
        try:
            from google.cloud import firestore
            credentials = get_credentials()
            db_client = firestore.Client(credentials=credentials)
            print("Using Google Firestore")
        except Exception as e:
            print(f"Firestore initialization error: {e}")
            raise
    return db_client

def get_session_path(session_id: str) -> str:
    """Generate session path for Dialogflow"""
    config = get_dialogflow_config()
    return SessionsClient.session_path(
        project=config["project_id"],
        location=config["location_id"],
        agent=config["agent_id"],
        session=session_id
    )

# Initialize Dialogflow client
try:
    credentials = get_credentials()
    dialogflow_config = get_dialogflow_config()
    # Set API endpoint based on location using ClientOptions
    from google.api_core import client_options as ClientOptions
    api_endpoint = f"{dialogflow_config['location_id']}-dialogflow.googleapis.com"
    client_options = ClientOptions.ClientOptions(api_endpoint=api_endpoint)
    dialogflow_client = SessionsClient(credentials=credentials, client_options=client_options)
    print(f"Dialogflow client initialized for {dialogflow_config['location_id']}")
except Exception as e:
    print(f"Error initializing Dialogflow client: {e}")
    raise

# Initialize Gemini for scoring
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    # Try gemini-2.5-flash first, then fallback to other models
    try:
        gemini_model = genai.GenerativeModel('gemini-2.5-flash')
        print("Gemini 2.5 Flash model initialized for scoring")
    except:
        try:
            gemini_model = genai.GenerativeModel('gemini-2.0-flash-exp')
            print("Gemini 2.0 Flash Experimental model initialized for scoring")
        except:
            try:
                gemini_model = genai.GenerativeModel('gemini-1.5-flash')
                print("Gemini 1.5 Flash model initialized for scoring")
            except:
                try:
                    gemini_model = genai.GenerativeModel('gemini-1.5-pro')
                    print("Gemini 1.5 Pro model initialized for scoring")
                except:
                    gemini_model = genai.GenerativeModel('gemini-pro')
                    print("Gemini Pro model initialized for scoring")
else:
    print("Warning: GEMINI_API_KEY not set. Scoring will not work.")
    gemini_model = None

# Database helper functions
def save_to_database(session_id: str, key: str, value: any):
    """Save data to database (Replit DB or Firestore)"""
    if USE_REPLIT_DB:
        db_key = f"{session_id}_{key}"
        db[db_key] = value
    else:
        # Lazy initialization of Firestore client
        initialize_firestore()
        doc_ref = db_client.collection("interview_sessions").document(session_id)
        doc_ref.set({key: value}, merge=True)

def get_from_database(session_id: str, key: str) -> any:
    """Get data from database"""
    if USE_REPLIT_DB:
        db_key = f"{session_id}_{key}"
        return db.get(db_key)
    else:
        # Lazy initialization of Firestore client
        initialize_firestore()
        doc_ref = db_client.collection("interview_sessions").document(session_id)
        doc = doc_ref.get()
        if doc.exists:
            return doc.to_dict().get(key)
        return None

def get_transcript(session_id: str) -> List[Dict[str, str]]:
    """Get full interview transcript from database"""
    transcript = get_from_database(session_id, "transcript")
    if transcript is None:
        return []
    return transcript if isinstance(transcript, list) else []

def save_transcript_entry(session_id: str, question: str, answer: str):
    """Save a Q&A pair to the transcript"""
    transcript = get_transcript(session_id)
    
    # Add new Q&A pair
    turn_number = len(transcript) + 1
    entry = {
        "turn": turn_number,
        "question": question,
        "answer": answer
    }
    
    transcript.append(entry)
    save_to_database(session_id, "transcript", transcript)
    
    print(f"Saved transcript entry {turn_number} for session {session_id}")

def detect_intent(session_id: str, user_message: str, last_agent_question: Optional[str] = None) -> Dict:
    """
    Modified detect_intent function that saves transcript before sending to Dialogflow
    
    IMPORTANT: This function must use the SAME session_id that was used in start_interview_session
    to maintain conversation context. Do NOT generate a new session_id for subsequent turns.
    
    This function:
    1. Saves the Q&A pair (last_agent_question + user_message) to database
    2. Sends user_message to Dialogflow (NO session parameters on subsequent calls)
    3. Gets and returns the agent's response
    4. Stores the new agent question for the next turn
    
    Args:
        session_id: Unique session identifier (MUST be the same as start_interview_session)
        user_message: User's answer/response
        last_agent_question: The agent's previous question (retrieved from DB if not provided)
    
    Returns:
        Dict containing agent response, intent, and end status
    """
    try:
        session_path = get_session_path(session_id)
        
        # If last_agent_question not provided, try to get it from database
        if not last_agent_question:
            try:
                last_agent_question = get_from_database(session_id, "last_agent_question")
            except Exception as db_error:
                print(f"Warning: Could not retrieve last question from DB: {db_error}")
        
        # Save the Q&A pair BEFORE sending to Dialogflow
        if last_agent_question:
            try:
                save_transcript_entry(session_id, last_agent_question, user_message)
                print(f"Saved Q&A pair for session {session_id}")
            except Exception as db_error:
                print(f"Warning: Could not save transcript entry: {db_error}")
        else:
            print(f"Warning: No last_agent_question found for session {session_id}")
        
        # Build the query input
        query_input = QueryInput(
            text=QueryInput.Text(text=user_message),
            language_code=dialogflow_config["language_code"]
        )
        
        # Create the request - NO session parameters on subsequent calls
        # Session parameters were set in start_interview_session and persist
        request = DetectIntentRequest(
            session=session_path,
            query_input=query_input
        )
        
        # Call Dialogflow API
        print(f"Calling Dialogflow CX detect_intent for session: {session_path}")
        response = dialogflow_client.detect_intent(request=request)
        
        # Extract agent response
        agent_response = ""
        response_messages = response.query_result.response_messages
        
        for message in response_messages:
            if message.text and message.text.text:
                agent_response = message.text.text[0]
                break
        
        # Check if interview is ending
        intent_name = response.query_result.intent.display_name if response.query_result.intent else ""
        is_end = any(keyword in intent_name.lower() for keyword in ["end", "complete", "finish", "done"])
        
        # Save the agent's NEW question for next turn (if interview continues)
        if agent_response and not is_end:
            try:
                # Store the agent's question so we can save it with the next user answer
                save_to_database(session_id, "last_agent_question", agent_response)
            except Exception as db_error:
                print(f"Warning: Could not save last_agent_question: {db_error}")
        
        return {
            "agent_response": agent_response,
            "intent": intent_name,
            "is_end": is_end,
            "session_id": session_id
        }
    
    except Exception as e:
        print(f"Error in detect_intent: {e}")
        import traceback
        traceback.print_exc()
        raise

def score_interview(session_id: str) -> Dict:
    """
    Score the interview using Gemini AI
    
    This function:
    1. Fetches the full interview transcript from database
    2. Formats a detailed scoring prompt (per-question scores + overall summary)
    3. Calls Gemini API for scoring
    4. Saves the results back to database
    
    Args:
        session_id: Unique session identifier
    
    Returns:
        Dict containing scores, per-question breakdown, and summary
    """
    try:
        if not gemini_model:
            raise ValueError("GEMINI_API_KEY not configured. Cannot score interview.")
        
        # 1. Fetch transcript from database
        print(f"Fetching transcript for session {session_id}")
        try:
            transcript = get_transcript(session_id)
        except Exception as db_error:
            raise ValueError(f"Failed to fetch transcript from database: {db_error}")
        
        if not transcript or len(transcript) == 0:
            raise ValueError(f"No transcript found for session {session_id}")
        
        print(f"Found {len(transcript)} Q&A pairs in transcript")
        
        # 2. Format the transcript for the prompt
        transcript_text = "Interview Transcript:\n\n"
        for entry in transcript:
            transcript_text += f"Q{entry['turn']}: {entry['question']}\n"
            transcript_text += f"A{entry['turn']}: {entry['answer']}\n\n"
        
        # Count questions
        num_questions = len(transcript)
        
        # 3. Format the exact prompt as specified
        scoring_prompt = f"""You are a senior technical hiring manager. Your task is to analyze the following interview transcript, which contains {num_questions} question-and-answer pairs.

STEP 1: INDIVIDUAL QUESTION SCORING
For EACH of the {num_questions} questions, you MUST provide:
1. A score from 1-10 (1=Poor, 2-3=Below Average, 4-5=Average, 6-7=Good, 8-9=Very Good, 10=Excellent) for the answer's technical depth and problem-solving.
2. A detailed 1-2 sentence justification/feedback explaining WHY you gave that specific score. Be specific about what the candidate did well or what was lacking.

STEP 2: OVERALL SUMMARY
After scoring all {num_questions} questions individually, provide:
1. A final overall score (1-10) that considers the candidate's performance across all questions.
2. A comprehensive 2-3 sentence summary that:
   - Highlights the candidate's key strengths
   - Identifies areas for improvement
   - Provides an overall assessment of their technical capabilities and fit

Here is the interview transcript:

{transcript_text}

IMPORTANT: You MUST provide scores and feedback for ALL {num_questions} questions individually before providing the overall summary.

Please provide your analysis in the following JSON format (make sure all {num_questions} questions are included):
{{
  "question_scores": [
    {{
      "question_number": 1,
      "score": 8,
      "justification": "The candidate demonstrated strong technical understanding of microservices architecture. They provided specific examples of scaling challenges they've faced, though they could have mentioned more about monitoring and observability."
    }},
    {{
      "question_number": 2,
      "score": 7,
      "justification": "Good explanation of database design principles, but lacked depth in discussing trade-offs between different database types. The candidate showed solid fundamentals but could improve by discussing real-world scenarios."
    }},
    ...
    (Continue for all {num_questions} questions)
  ],
  "overall_score": 7.5,
  "summary": "Overall, the candidate demonstrates solid technical foundations with hands-on experience in distributed systems. Their strength lies in practical implementation experience, though they could benefit from deeper theoretical understanding of system design principles. The candidate shows promise and would be a good fit for a mid-level engineering role with room for growth in architectural decision-making."
}}"""
        
        # 4. Call Gemini API
        print(f"Calling Gemini API to score {num_questions} questions...")
        try:
            response = gemini_model.generate_content(scoring_prompt)
            response_text = response.text
            
            # Try to extract JSON from the response (Gemini might wrap it in markdown)
            import re
            # First, try to extract from markdown code blocks
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            if json_match:
                score_data = json.loads(json_match.group(1))
            else:
                # Try to find JSON object in the response (improved regex)
                json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text, re.DOTALL)
                if json_match:
                    score_data = json.loads(json_match.group())
                else:
                    # Fallback: try parsing the whole response
                    score_data = json.loads(response_text)
        except json.JSONDecodeError as json_error:
            raise ValueError(f"Failed to parse Gemini response as JSON: {json_error}. Response: {response_text[:500]}")
        except Exception as api_error:
            raise ValueError(f"Gemini API call failed: {api_error}")
        
        # Validate that we have scores for all questions
        question_scores = score_data.get('question_scores', [])
        if len(question_scores) != num_questions:
            print(f"Warning: Expected {num_questions} question scores, but got {len(question_scores)}")
        
        # Ensure all required fields are present
        if 'overall_score' not in score_data:
            raise ValueError("Missing 'overall_score' in response")
        if 'summary' not in score_data:
            raise ValueError("Missing 'summary' in response")
        if not question_scores:
            raise ValueError("No question scores provided")
        
        # 5. Save results to database
        print(f"Saving score report to database for session {session_id}")
        try:
            save_to_database(session_id, "score_report", score_data)
            save_to_database(session_id, "scored_at", json.dumps({"timestamp": str(__import__("datetime").datetime.now())}))
        except Exception as db_error:
            print(f"Warning: Could not save score report to database: {db_error}")
            # Continue anyway - we still return the data
        
        print(f"Interview scored for session {session_id}")
        print(f"Scored {len(question_scores)} individual questions")
        print(f"Overall score: {score_data.get('overall_score', 'N/A')}/10")
        
        # Print individual question scores for verification
        print("\nIndividual Question Scores:")
        for q_score in question_scores:
            print(f"  Q{q_score.get('question_number', '?')}: {q_score.get('score', 'N/A')}/10")
            print(f"    Feedback: {q_score.get('justification', 'N/A')[:100]}...")
        
        print(f"\nOverall Summary:\n{score_data.get('summary', 'N/A')}")
        
        return score_data
    
    except Exception as e:
        print(f"Error scoring interview: {e}")
        import traceback
        traceback.print_exc()
        raise

def start_interview_session(session_id: str, role_selection: str, resume_summary: str = "", 
                           persona: str = "", difficulty: str = "Medium") -> Dict:
    """
    Start a new interview session with Dialogflow
    
    This function sends session parameters (resume, persona, difficulty) ONLY on the first turn
    via query_params.parameters in the DetectIntentRequest.
    
    Args:
        session_id: Unique session identifier (must be generated and reused for all turns)
        role_selection: User's role selection text
        resume_summary: Optional resume summary
        persona: Optional interviewer persona
        difficulty: Difficulty level
    
    Returns:
        Dict with agent's first question
    """
    try:
        session_path = get_session_path(session_id)
        print(f"Starting interview session: {session_id}")
        
        # Set session parameters - these go in query_params.parameters for the FIRST call only
        # Dialogflow CX will use these parameters throughout the session
        custom_params = {
            "candidate_resume_summary": resume_summary or "",
            "interviewer_persona": persona or "",
            "difficulty_level": difficulty
        }
        
        print(f"Session parameters: {custom_params}")
        
        query_input = QueryInput(
            text=QueryInput.Text(text=role_selection),
            language_code=dialogflow_config["language_code"]
        )
        
        # Create request with session parameters in query_params
        # Note: In Dialogflow CX, parameters are sent via query_params.parameters
        # They persist for the session once set
        request = DetectIntentRequest(
            session=session_path,
            query_input=query_input,
            query_params=QueryParameters(parameters=custom_params)
        )
        
        print(f"Calling Dialogflow CX detect_intent for session: {session_path}")
        response = dialogflow_client.detect_intent(request=request)
        
        # Extract agent response
        agent_response = ""
        response_messages = response.query_result.response_messages
        
        for message in response_messages:
            if message.text and message.text.text:
                agent_response = message.text.text[0]
                break
        
        if not agent_response:
            agent_response = "Thank you for your interest. Let's begin the interview."
        
        print(f"Agent response received: {agent_response[:100]}...")
        
        # Initialize transcript and save first question
        try:
            save_to_database(session_id, "transcript", [])
            save_to_database(session_id, "last_agent_question", agent_response)
            save_to_database(session_id, "session_info", {
                "role": role_selection,
                "resume_summary": resume_summary,
                "persona": persona,
                "difficulty": difficulty,
                "started_at": str(__import__("datetime").datetime.now())
            })
            print(f"Session data saved to database for {session_id}")
        except Exception as db_error:
            print(f"Warning: Database save error (non-critical): {db_error}")
        
        return {
            "agent_response": agent_response,
            "session_id": session_id
        }
    
    except Exception as e:
        print(f"Error starting interview: {e}")
        import traceback
        traceback.print_exc()
        raise

# Example usage (for testing)
if __name__ == "__main__":
    # Test session
    test_session_id = "test_session_123"
    
    # Start interview
    print("Starting interview...")
    start_result = start_interview_session(
        session_id=test_session_id,
        role_selection="I want to interview for the Software Engineer role.",
        resume_summary="Expert in Python, AWS, and Kubernetes.",
        difficulty="Hard"
    )
    print(f"First question: {start_result['agent_response']}")
    
    # Simulate a few turns
    last_question = start_result['agent_response']
    
    # Turn 1
    print("\n--- Turn 1 ---")
    user_answer_1 = "I have 5 years of experience in Python and microservices architecture."
    result_1 = detect_intent(test_session_id, user_answer_1, last_question)
    print(f"Agent: {result_1['agent_response']}")
    last_question = result_1['agent_response']
    
    # Turn 2
    print("\n--- Turn 2 ---")
    user_answer_2 = "I've worked on scaling systems to handle millions of requests."
    result_2 = detect_intent(test_session_id, user_answer_2, last_question)
    print(f"Agent: {result_2['agent_response']}")
    last_question = result_2['agent_response']
    
    # Score interview
    print("\n--- Scoring Interview ---")
    try:
        scores = score_interview(test_session_id)
        print(f"\nOverall Score: {scores.get('overall_score')}")
        print(f"Summary: {scores.get('summary')}")
    except Exception as e:
        print(f"Scoring error: {e}")

