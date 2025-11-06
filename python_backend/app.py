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

# Get JWT secret for authentication (if you have auth)
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")

@app.route('/api/voice-interview/start', methods=['POST'])
def start_voice_interview():
    """
    Start a voice interview session
    
    Request body:
    {
        "session_id": "unique_session_id",
        "role": "software-engineer",
        "resumeText": "...",
        "difficulty": "Medium"
    }
    
    Returns:
    {
        "sessionId": "...",
        "audioResponse": "base64_encoded_mp3",
        "audioFormat": "mp3",
        "agentResponseText": "..."
    }
    """
    try:
        data = request.json
        session_id = data.get("session_id")
        role = data.get("role")
        resume_text = data.get("resumeText", "")
        difficulty = data.get("difficulty", "Medium")
        
        if not session_id or not role:
            return jsonify({"error": "session_id and role are required"}), 400
        
        role_selection = f"I want to interview for the {role} role."
        
        result = start_voice_interview_session(
            session_id=session_id,
            role_selection_text=role_selection,
            resume_summary=resume_text,
            difficulty=difficulty
        )
        
        return jsonify({
            "sessionId": session_id,
            "audioResponse": result["audio_response"],
            "audioFormat": result["audio_format"],
            "agentResponseText": result["agent_response_text"]
        })
    
    except Exception as e:
        print(f"Error starting voice interview: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/voice-interview', methods=['POST'])
@app.route('/api/voice-interview/send-audio', methods=['POST'])
def send_audio():
    """
    Main voice interview endpoint - accepts raw audio, returns audio response
    
    CRITICAL: This endpoint does NOT store audio files. The audio is:
    - Used only for Dialogflow CX detect_intent API call
    - Transcribed to text (STT)
    - The transcribed text is saved to database
    - The audio file is discarded immediately
    
    Request body (multipart/form-data):
    - audio: audio file (WAV, MP3, or WebM Opus format)
    - session_id: session identifier
    - audioEncoding: (optional) AUDIO_ENCODING_WEBM_OPUS, AUDIO_ENCODING_LINEAR_16, etc.
    - sampleRate: (optional) sample rate in Hz (default: 24000)
    
    OR JSON:
    {
        "audio": "base64_encoded_audio",
        "session_id": "...",
        "audioEncoding": "AUDIO_ENCODING_WEBM_OPUS",
        "sampleRate": 24000
    }
    
    Returns:
    - If audio response available: Returns raw MP3 audio file with Content-Type: audio/mpeg
    - If audio response unavailable: Returns JSON with error message
    - Additional metadata in X-Response-* headers:
        X-Response-Text: agent response text
        X-Response-Transcript: user transcript (transcribed text from STT)
        X-Response-IsEnd: true/false
        X-Response-Intent: intent name
    """
    try:
        # ============================================================================
        # STEP 1: Receive audio file (temporary - will be discarded after use)
        # ============================================================================
        audio_data = None
        session_id = None
        audio_encoding = "AUDIO_ENCODING_WEBM_OPUS"
        sample_rate = 24000
        
        # Support both multipart file upload and JSON base64
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Handle file upload
            if 'audio' not in request.files:
                return jsonify({"error": "No audio file provided"}), 400
            
            audio_file = request.files['audio']
            session_id = request.form.get('session_id')
            
            if not session_id:
                return jsonify({"error": "session_id is required"}), 400
            
            # Read audio file into memory (temporary buffer - NOT saved to disk)
            audio_data = audio_file.read()
            print(f"Received audio file: {len(audio_data)} bytes (temporary - will be discarded)")
            
            # Detect audio format from filename/extension
            filename = audio_file.filename.lower()
            if filename.endswith('.wav'):
                audio_encoding = request.form.get('audioEncoding', 'AUDIO_ENCODING_LINEAR_16')
                sample_rate = int(request.form.get('sampleRate', 16000))
            elif filename.endswith('.mp3'):
                audio_encoding = request.form.get('audioEncoding', 'AUDIO_ENCODING_MP3')
                sample_rate = int(request.form.get('sampleRate', 24000))
            else:
                # Default to WebM Opus
                audio_encoding = request.form.get('audioEncoding', 'AUDIO_ENCODING_WEBM_OPUS')
                sample_rate = int(request.form.get('sampleRate', 24000))
        
        else:
            # Handle JSON with base64 audio
            data = request.json
            session_id = data.get("session_id")
            audio_base64 = data.get("audio")
            audio_encoding = data.get("audioEncoding", "AUDIO_ENCODING_WEBM_OPUS")
            sample_rate = data.get("sampleRate", 24000)
            
            if not session_id or not audio_base64:
                return jsonify({"error": "session_id and audio are required"}), 400
            
            # Decode base64 audio (temporary buffer - NOT saved to disk)
            audio_data = base64.b64decode(audio_base64)
            print(f"Received base64 audio: {len(audio_data)} bytes (temporary - will be discarded)")
        
        # ============================================================================
        # STEP 2: Call Dialogflow with audio
        # The audio_data is passed to Dialogflow for transcription
        # After this call, audio_data is discarded (never saved to disk/DB)
        # ============================================================================
        print(f"Processing audio for session {session_id} - audio will NOT be stored")
        result = detect_intent_with_audio(
            session_id=session_id,
            audio_data=audio_data,  # Temporary buffer - used only for transcription
            audio_encoding=audio_encoding,
            sample_rate=sample_rate
        )
        
        # At this point, audio_data is out of scope and will be garbage collected
        # The audio file was NEVER saved to disk or database
        print(f"Audio processing complete - audio file discarded (only transcribed text was saved)")
        
        # ============================================================================
        # STEP 3: Return response
        # ============================================================================
        # Return raw audio file if available, otherwise return JSON
        if result.get("audio_response"):
            # Decode base64 audio to bytes
            audio_bytes = base64.b64decode(result["audio_response"])
            
            # Create response with raw audio
            response = Response(
                audio_bytes,
                mimetype='audio/mpeg',
                headers={
                    'Content-Type': 'audio/mpeg',
                    'X-Response-Text': result.get("agent_response_text", ""),
                    'X-Response-Transcript': result.get("user_transcript", ""),  # Transcribed text
                    'X-Response-IsEnd': str(result.get("is_end", False)).lower(),
                    'X-Response-Intent': result.get("intent", ""),
                    'Content-Disposition': 'inline; filename="response.mp3"'
                }
            )
            return response
        else:
            # No audio response, return JSON with metadata
            return jsonify({
                "error": "No audio response from Dialogflow",
                "agentResponseText": result.get("agent_response_text", ""),
                "userTranscript": result.get("user_transcript", ""),  # Transcribed text
                "isEnd": result.get("is_end", False),
                "intent": result.get("intent", "")
            }), 200
    
    except Exception as e:
        print(f"Error processing audio: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/voice-interview/score', methods=['POST'])
def score_voice_interview():
    """
    Score the completed voice interview
    
    This function:
    1. Fetches the text transcript from database (no audio files)
    2. Sends transcript text to Gemini API for scoring
    3. Saves the score report back to database
    
    Request body:
    {
        "session_id": "..."
    }
    
    Returns:
    {
        "question_scores": [...],
        "overall_score": 7.5,
        "summary": "..."
    }
    """
    try:
        data = request.json
        session_id = data.get("session_id")
        
        if not session_id:
            return jsonify({"error": "session_id is required"}), 400
        
        print(f"Scoring interview for session {session_id} - using text transcript only")
        score_report = score_interview(session_id)
        
        return jsonify(score_report)
    
    except Exception as e:
        print(f"Error scoring interview: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    # Default to port 5001 to avoid conflict with Node.js server on port 5000
    port = int(os.environ.get('PORT', 5001))
    print(f"Starting Python Flask backend on port {port}")
    print(f"Set PORT environment variable to use a different port")
    app.run(host='0.0.0.0', port=port, debug=True)
