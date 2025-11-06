"""
Flask API Server for Dialogflow CX Voice Interview
Run this on Replit to handle voice interview requests

CRITICAL: Audio files are NEVER stored - only transcribed text is saved.
"""

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import os
import base64
from dialogflow_voice import (
    start_voice_interview_session,
    detect_intent_with_audio
)
from dialogflow_interview import score_interview

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

@app.route('/api/voice-interview/start', methods=['POST'])
def start_voice_interview():
    """
    Start a voice interview session
    """
    try:
        data = request.json
        session_id = data.get("session_id")
        role = data.get("role")
        resume_text = data.get("resumeText", "")
        difficulty = data.get("difficulty", "Medium")
        
        if not session_id:
            return jsonify({"error": "session_id is required"}), 400
        if not role:
            return jsonify({"error": "role is required"}), 400
        
        result = start_voice_interview_session(session_id, role, resume_text, difficulty)
        
        # Encode audio to base64 for JSON response
        audio_base64 = base64.b64encode(result["audio_response"]).decode('utf-8') if result.get("audio_response") else ""
        
        return jsonify({
            "sessionId": result["session_id"],
            "audioResponse": audio_base64,
            "audioFormat": "mp3",
            "agentResponseText": result["agent_response_text"]
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/voice-interview/send-audio', methods=['POST'])
@app.route('/api/voice-interview', methods=['POST'])
def send_audio():
    """
    Send audio to Dialogflow and receive audio response
    
    CRITICAL: Audio is NOT stored - only transcribed text is saved.
    """
    try:
        # Get audio file from request
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400
        
        audio_file = request.files['audio']
        session_id = request.form.get('session_id')
        
        if not session_id:
            return jsonify({"error": "session_id is required"}), 400
        
        # Read audio data (this is temporary, will be discarded after transcription)
        audio_data = audio_file.read()
        
        # Audio data is temporary - only transcribed text is stored
        
        # Get last agent question for transcript saving
        from dialogflow_interview import get_from_database
        last_agent_question = None
        try:
            last_agent_question = get_from_database(session_id, "last_agent_question")
        except:
            pass
        
        # Detect intent with audio
        result = detect_intent_with_audio(
            session_id=session_id,
            audio_data=audio_data,
            audio_encoding="AUDIO_ENCODING_WEBM_OPUS",
            sample_rate=24000,
            last_agent_question=last_agent_question
        )
        
        # Encode audio to base64
        audio_base64 = base64.b64encode(result["audio_response"]).decode('utf-8') if result.get("audio_response") else ""
        
        return jsonify({
            "audioResponse": audio_base64,
            "audioFormat": "mp3",
            "agentResponseText": result["agent_response_text"],
            "userTranscript": result["user_transcript"],
            "isEnd": result["is_end"]
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/voice-interview/score', methods=['POST'])
def score_interview_endpoint():
    """
    Score the interview using Gemini AI
    """
    try:
        data = request.json
        session_id = data.get("session_id")
        
        if not session_id:
            return jsonify({"error": "session_id is required"}), 400
        
        score_report = score_interview(session_id)
        
        return jsonify(score_report)
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    # Default to port 5001 to avoid conflict with Node.js server on port 5000
    port = int(os.environ.get('PORT', 5001))
    # Production mode: debug=False for security
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug_mode)

