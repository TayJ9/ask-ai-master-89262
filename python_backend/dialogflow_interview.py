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
    project_id = os.environ.get("GCP_PROJECT_ID") or os.environ.get("DIALOGFLOW_PROJECT_ID")
    location_id = os.environ.get("DF_LOCATION_ID") or os.environ.get("DIALOGFLOW_LOCATION_ID", "us-central1")
    agent_id = os.environ.get("DF_AGENT_ID") or os.environ.get("DIALOGFLOW_AGENT_ID")
    environment_id = os.environ.get("DF_ENVIRONMENT_ID") or os.environ.get("DIALOGFLOW_ENVIRONMENT_ID", "DRAFT")
    language_code = os.environ.get("DIALOGFLOW_LANGUAGE_CODE", "en")
    
    if not project_id:
        raise ValueError("GCP_PROJECT_ID or DIALOGFLOW_PROJECT_ID environment variable must be set")
    if not agent_id:
        raise ValueError("DF_AGENT_ID or DIALOGFLOW_AGENT_ID environment variable must be set")
    
    return {
        "project_id": project_id,
        "location_id": location_id,
        "agent_id": agent_id,
        "environment_id": environment_id,
        "language_code": language_code
    }

# Database setup
USE_REPLIT_DB = os.environ.get("USE_REPLIT_DB", "true").lower() == "true"
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
    """Generate session path for Dialogflow CX (requires environment)"""
    config = get_dialogflow_config()
    # Dialogflow CX requires: projects/{project}/locations/{location}/agents/{agent}/environments/{environment}/sessions/{session}
    # SessionsClient.session_path() doesn't support environment, so we construct it manually
    return f"projects/{config['project_id']}/locations/{config['location_id']}/agents/{config['agent_id']}/environments/{config['environment_id']}/sessions/{session_id}"

# Initialize Dialogflow client
try:
    credentials = get_credentials()
    dialogflow_config = get_dialogflow_config()
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
    """Save data to database"""
    if USE_REPLIT_DB:
        db_key = f"{session_id}_{key}"
        db[db_key] = value
    else:
        initialize_firestore()
        doc_ref = db_client.collection("interview_sessions").document(session_id)
        doc_ref.set({key: value}, merge=True)

def get_from_database(session_id: str, key: str) -> any:
    """Get data from database"""
    if USE_REPLIT_DB:
        db_key = f"{session_id}_{key}"
        return db.get(db_key)
    else:
        initialize_firestore()
        doc_ref = db_client.collection("interview_sessions").document(session_id)
        doc = doc_ref.get()
        return doc.to_dict().get(key) if doc.exists else None

def save_transcript_entry(session_id: str, turn_number: int, question: str, answer: str):
    """Save a Q&A pair to the transcript"""
    transcript = get_transcript(session_id)
    transcript.append({
        "turn": turn_number,
        "question": question,
        "answer": answer
    })
    save_to_database(session_id, "transcript", transcript)
    print(f"Saved transcript entry {turn_number} for session {session_id}")

def get_transcript(session_id: str) -> List[Dict]:
    """Get full transcript for a session"""
    transcript = get_from_database(session_id, "transcript")
    return transcript if transcript else []

def score_interview(session_id: str) -> Dict:
    """
    Score the interview using Gemini AI with enhanced detailed feedback
    Returns scores out of 100 with paragraph-length feedback
    """
    try:
        if not gemini_model:
            raise ValueError("GEMINI_API_KEY not configured. Cannot score interview.")
        
        transcript = get_transcript(session_id)
        if not transcript or len(transcript) == 0:
            raise ValueError(f"No transcript found for session {session_id}")
        
        print(f"Found {len(transcript)} Q&A pairs in transcript")
        
        transcript_text = "Interview Transcript:\n\n"
        for entry in transcript:
            transcript_text += f"Q{entry['turn']}: {entry['question']}\n"
            transcript_text += f"A{entry['turn']}: {entry['answer']}\n\n"
        
        num_questions = len(transcript)
        
        scoring_prompt = f"""You are a senior technical hiring manager and mentor. Your task is to provide detailed, educational feedback on the following interview transcript, which contains {num_questions} question-and-answer pairs. Your goal is to help the candidate learn and improve.

STEP 1: INDIVIDUAL QUESTION SCORING
For EACH of the {num_questions} questions, you MUST provide:
1. A score from 0-100 (0-29=Failing, 30-49=Needs Improvement, 50-69=Average, 70-84=Good, 85-94=Very Good, 95-100=Excellent) that evaluates the answer's technical depth, problem-solving approach, clarity, and completeness.
2. A detailed paragraph (approximately 4-6 sentences) of educational feedback that includes:
   - What the candidate did well (specific strengths in their answer)
   - What was missing or could be improved (specific gaps or weaknesses)
   - Specific concepts, technologies, or approaches they should study or review
   - Actionable suggestions for how to improve their answer
   - Real-world examples or scenarios they could reference to strengthen their understanding
   
   Make the feedback constructive, specific, and educational - the candidate should learn something valuable from each response.

STEP 2: OVERALL SUMMARY
After scoring all {num_questions} questions individually, provide:
1. A final overall score (0-100) that considers the candidate's performance across all questions, weighted appropriately.
2. A comprehensive paragraph (approximately 5-7 sentences) that provides:
   - A detailed assessment of the candidate's overall technical capabilities and performance
   - Key strengths demonstrated throughout the interview (with specific examples from their answers)
   - Critical areas for improvement (be specific about what knowledge gaps or skills need development)
   - Recommended learning path or study areas to focus on (specific topics, technologies, or concepts)
   - Career development perspective (what level they're at, what they're ready for, and what they need to work toward)
   - Overall fit assessment and next steps for growth

Here is the interview transcript:

{transcript_text}

IMPORTANT: You MUST provide scores and detailed, educational feedback for ALL {num_questions} questions individually before providing the overall summary. Each feedback should be a full paragraph (4-6 sentences) that helps the candidate learn and improve.

Please provide your analysis in the following JSON format (make sure all {num_questions} questions are included):
{{
  "question_scores": [
    {{
      "question_number": 1,
      "score": 82,
      "justification": "Your answer demonstrated a solid understanding of microservices architecture, particularly in how you explained the benefits of service isolation and independent scaling. You provided a concrete example from your experience, which shows practical knowledge. However, your answer could be strengthened by discussing the challenges of distributed systems, such as eventual consistency, network latency, and the complexity of debugging across services. To improve, I'd recommend studying distributed system patterns like the Saga pattern for managing transactions, understanding service mesh technologies (like Istio or Linkerd), and reading about monitoring and observability strategies for microservices. Consider also exploring how different companies have handled the transition from monoliths to microservices, as this will give you more real-world context to draw from in future interviews."
    }},
    ...
    (Continue for all {num_questions} questions with paragraph-length feedback)
  ],
  "overall_score": 75,
  "summary": "Overall, you demonstrated solid technical foundations with hands-on experience that shows you've worked on real projects. Your strength lies in practical implementation experience - you were able to speak confidently about technologies you've used and challenges you've faced. Throughout the interview, you showed particular strength in discussing system architecture and database fundamentals, which indicates good foundational knowledge. However, there are some areas that need attention: your answers would benefit from deeper theoretical understanding of distributed systems concepts, more exposure to system design trade-offs, and stronger articulation of why you made certain technical decisions. To advance your skills, I recommend focusing on studying system design patterns and principles (read 'Designing Data-Intensive Applications' by Martin Kleppmann), practicing explaining technical trade-offs (e.g., consistency vs. availability, vertical vs. horizontal scaling), and working on articulating the reasoning behind your technical choices. You're currently at a solid mid-level engineer stage, and with focused study on these areas, you'll be well-positioned for senior-level roles. For now, you'd be a good fit for a mid-level engineering position where you can continue to grow while contributing meaningfully to projects."
}}"""
        
        print(f"Calling Gemini API to score {num_questions} questions...")
        try:
            response = gemini_model.generate_content(scoring_prompt)
            response_text = response.text
            
            import re
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            if json_match:
                score_data = json.loads(json_match.group(1))
            else:
                json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text, re.DOTALL)
                if json_match:
                    score_data = json.loads(json_match.group())
                else:
                    score_data = json.loads(response_text)
        except json.JSONDecodeError as json_error:
            raise ValueError(f"Failed to parse Gemini response as JSON: {json_error}. Response: {response_text[:500]}")
        except Exception as api_error:
            raise ValueError(f"Gemini API call failed: {api_error}")
        
        question_scores = score_data.get('question_scores', [])
        if len(question_scores) != num_questions:
            print(f"Warning: Expected {num_questions} question scores, but got {len(question_scores)}")
        
        if 'overall_score' not in score_data:
            raise ValueError("Missing 'overall_score' in response")
        if 'summary' not in score_data:
            raise ValueError("Missing 'summary' in response")
        if not question_scores:
            raise ValueError("No question scores provided")
        
        save_to_database(session_id, "score_report", score_data)
        save_to_database(session_id, "scored_at", json.dumps({"timestamp": str(__import__("datetime").datetime.now())}))
        
        print(f"Interview scored for session {session_id}")
        print(f"Scored {len(question_scores)} individual questions")
        print(f"Overall score: {score_data.get('overall_score', 'N/A')}/100")
        
        return score_data
    
    except Exception as e:
        print(f"Error scoring interview: {e}")
        import traceback
        traceback.print_exc()
        raise

