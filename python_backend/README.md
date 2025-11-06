# Python Backend for Dialogflow CX Interview

This Python backend handles interview sessions with Dialogflow CX, transcript saving, and AI-powered scoring.

## Setup

1. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Environment Variables:**
   Set these in your Replit Secrets:
   - `GOOGLE_CREDENTIALS` - Full JSON content of service account key
   - `DIALOGFLOW_PROJECT_ID` - Your GCP project ID
   - `DIALOGFLOW_AGENT_ID` - Your Dialogflow CX agent ID
   - `DIALOGFLOW_LOCATION_ID` - Region (default: "us-central1")
   - `GEMINI_API_KEY` or `GOOGLE_API_KEY` - For scoring interviews
   - `USE_REPLIT_DB` - Set to "true" for Replit Database, "false" for Firestore

## Database Options

### Option 1: Replit Database (Default)
- Simple key-value store
- Set `USE_REPLIT_DB=true`
- Data stored as: `{session_id}_transcript`, `{session_id}_score_report`, etc.

### Option 2: Google Firestore
- More robust, cloud-based
- Uses your existing `GOOGLE_CREDENTIALS`
- Set `USE_REPLIT_DB=false`
- Data stored in `interview_sessions` collection

## Usage

### Start Interview Session
```python
from dialogflow_interview import start_interview_session

result = start_interview_session(
    session_id="unique_session_id",
    role_selection="I want to interview for the Software Engineer role.",
    resume_summary="Expert in Python and cloud technologies.",
    difficulty="Hard"
)

first_question = result["agent_response"]
```

### Detect Intent (Save Transcript)
```python
from dialogflow_interview import detect_intent

# Get the last agent question from database
last_question = get_from_database(session_id, "last_agent_question")

# Send user answer - this will save the Q&A pair automatically
result = detect_intent(
    session_id="unique_session_id",
    user_message="My answer to the question...",
    last_agent_question=last_question
)

agent_response = result["agent_response"]
is_end = result["is_end"]
```

### Score Interview
```python
from dialogflow_interview import score_interview

# After interview ends, score it
score_report = score_interview("unique_session_id")

print(f"Overall Score: {score_report['overall_score']}")
print(f"Summary: {score_report['summary']}")

for q_score in score_report['question_scores']:
    print(f"Q{q_score['question_number']}: {q_score['score']}/10")
    print(f"  {q_score['justification']}")
```

## API Integration Example

If you're using Flask/FastAPI:

```python
from flask import Flask, request, jsonify
from dialogflow_interview import start_interview_session, detect_intent, score_interview, get_from_database

app = Flask(__name__)

@app.route("/api/start-interview", methods=["POST"])
def start_interview():
    data = request.json
    result = start_interview_session(
        session_id=data["session_id"],
        role_selection=data["role_selection"],
        resume_summary=data.get("resume_summary", ""),
        difficulty=data.get("difficulty", "Medium")
    )
    return jsonify(result)

@app.route("/api/send-message", methods=["POST"])
def send_message():
    data = request.json
    session_id = data["session_id"]
    user_message = data["user_message"]
    
    # Get last agent question
    last_question = get_from_database(session_id, "last_agent_question")
    
    result = detect_intent(session_id, user_message, last_question)
    return jsonify(result)

@app.route("/api/score-interview", methods=["POST"])
def score():
    data = request.json
    session_id = data["session_id"]
    
    score_report = score_interview(session_id)
    return jsonify(score_report)
```

## How It Works

1. **Transcript Saving**: 
   - Each time `detect_intent()` is called with a `last_agent_question`, it saves the Q&A pair to the database BEFORE sending to Dialogflow
   - The transcript is stored as a list of dictionaries: `[{"turn": 1, "question": "...", "answer": "..."}, ...]`

2. **Scoring**:
   - `score_interview()` fetches all Q&A pairs from the database
   - Formats them into the exact prompt you specified
   - Calls Gemini API to get per-question scores and overall summary
   - Saves the complete score report back to the database

3. **Database Structure**:
   - `{session_id}_transcript` - List of Q&A pairs
   - `{session_id}_score_report` - Complete scoring results
   - `{session_id}_last_agent_question` - Most recent agent question
   - `{session_id}_session_info` - Session metadata

## Testing

Run the test script:
```bash
python dialogflow_interview.py
```

This will simulate a full interview flow and scoring.


