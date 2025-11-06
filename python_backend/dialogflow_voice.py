"""
Dialogflow CX Voice Interview Backend
Handles voice-based interview sessions using Dialogflow CX native STT/TTS

CRITICAL: Audio files are NEVER stored - only transcribed text is saved.
"""

import os
import json
import base64
from typing import Dict, Optional
from google.cloud.dialogflowcx import SessionsClient
from google.cloud.dialogflowcx_v3 import (
    DetectIntentRequest, 
    QueryInput, 
    QueryParameters,
    OutputAudioConfig,
    OutputAudioEncoding,
    InputAudioConfig,
    AudioEncoding
)
from google.oauth2 import service_account

# Import shared functions from dialogflow_interview
from dialogflow_interview import (
    get_credentials,
    get_dialogflow_config,
    get_session_path,
    save_to_database,
    get_from_database,
    save_transcript_entry,
    get_transcript
)

# Initialize Dialogflow client (reuse from dialogflow_interview)
try:
    credentials = get_credentials()
    dialogflow_config = get_dialogflow_config()
    # Set API endpoint based on location using ClientOptions
    from google.api_core import client_options as ClientOptions
    api_endpoint = f"{dialogflow_config['location_id']}-dialogflow.googleapis.com"
    client_options = ClientOptions.ClientOptions(api_endpoint=api_endpoint)
    dialogflow_client = SessionsClient(credentials=credentials, client_options=client_options)
    print(f"Dialogflow voice client initialized for {dialogflow_config['location_id']}")
except Exception as e:
    print(f"Error initializing Dialogflow client: {e}")
    raise

def detect_intent_with_audio(
    session_id: str, 
    audio_data: bytes, 
    audio_encoding: str = "AUDIO_ENCODING_WEBM_OPUS",
    sample_rate: int = 24000,
    last_agent_question: Optional[str] = None
) -> Dict:
    """
    Send audio directly to Dialogflow CX and receive audio response
    
    CRITICAL: This function does NOT store the audio file. The audio_data is:
    - Used only for the detect_intent API call
    - Discarded immediately after transcription
    - Only the transcribed text (query_result.query_text) is saved to database
    
    Args:
        session_id: Unique session identifier
        audio_data: Raw audio bytes (WebM Opus, WAV, or MP3 format)
                   NOTE: This is a temporary in-memory buffer, never saved to disk/DB
        audio_encoding: Audio encoding format (default: WEBM_OPUS)
        sample_rate: Audio sample rate in Hz (default: 24000)
        last_agent_question: Previous agent question for transcript saving
    
    Returns:
        Dict containing audio response, text transcript, intent, and end status
    """
    try:
        session_path = get_session_path(session_id)
        
        # Get last agent question from DB if not provided
        if not last_agent_question:
            try:
                last_agent_question = get_from_database(session_id, "last_agent_question")
            except Exception as db_error:
                print(f"Warning: Could not retrieve last question from DB: {db_error}")
        
        # ============================================================================
        # STEP 1: Configure audio input for Dialogflow CX
        # The audio_data is used here and then discarded - NEVER saved to disk/DB
        # ============================================================================
        encoding_map = {
            "AUDIO_ENCODING_WEBM_OPUS": AudioEncoding.AUDIO_ENCODING_WEBM_OPUS,
            "AUDIO_ENCODING_LINEAR_16": AudioEncoding.AUDIO_ENCODING_LINEAR_16,
            "AUDIO_ENCODING_MULAW": AudioEncoding.AUDIO_ENCODING_MULAW,
            "AUDIO_ENCODING_ALAW": AudioEncoding.AUDIO_ENCODING_ALAW,
        }
        audio_encoding_enum = encoding_map.get(audio_encoding, AudioEncoding.AUDIO_ENCODING_WEBM_OPUS)
        
        input_audio_config = InputAudioConfig(
            audio_encoding=audio_encoding_enum,
            sample_rate_hertz=sample_rate,
            language_code=dialogflow_config["language_code"]
        )
        
        # Build query input with audio
        # NOTE: audio_data is passed directly to Dialogflow - not stored anywhere
        query_input = QueryInput(
            audio=QueryInput.AudioInput(
                audio=audio_data,  # Temporary in-memory buffer - never saved
                config=input_audio_config
            ),
            language_code=dialogflow_config["language_code"]
        )
        
        # ============================================================================
        # STEP 2: Configure audio output (request TTS response from Dialogflow)
        # Use Chirp HD voices for high-quality speech
        # ============================================================================
        output_audio_config = OutputAudioConfig(
            synthesize_speech_config={
                "voice": {
                    "name": "en-US-Chirp-C",  # Chirp HD voice (high-quality, natural)
                    "ssml_gender": "FEMALE"
                },
                "audio_encoding": OutputAudioEncoding.OUTPUT_AUDIO_ENCODING_MP3,
                "speaking_rate": 1.0,  # Normal speaking rate
                "pitch": 0.0,  # Normal pitch
                "volume_gain_db": 0.0  # Normal volume
            }
        )
        
        # ============================================================================
        # STEP 3: Call Dialogflow CX detect_intent API
        # The audio_data is processed here and then discarded
        # ============================================================================
        request = DetectIntentRequest(
            session=session_path,
            query_input=query_input,
            output_audio_config=output_audio_config
        )
        
        print(f"Calling Dialogflow CX detect_intent with audio for session: {session_path}")
        print(f"NOTE: Audio file is temporary - will be discarded after transcription")
        response = dialogflow_client.detect_intent(request=request)
        
        # ============================================================================
        # STEP 4: Extract transcribed text (STT result)
        # This is the ONLY thing we save - the transcribed text, NOT the audio file
        # ============================================================================
        # Extract user transcript from Dialogflow STT
        # query_result.query_text contains the transcribed text from the audio
        user_transcript = response.query_result.query_text if response.query_result.query_text else ""
        
        print(f"User transcribed text: {user_transcript[:100]}..." if user_transcript else "No transcript received")
        
        # ============================================================================
        # STEP 5: Save ONLY the transcribed text (not the audio file)
        # Save Q&A pair: agent's previous question + user's transcribed answer
        # ============================================================================
        if last_agent_question and user_transcript:
            try:
                # Save transcript entry: question (from DB) + answer (transcribed text)
                save_transcript_entry(session_id, last_agent_question, user_transcript)
                print(f"✓ Saved Q&A pair to transcript (text only - audio was NOT saved)")
            except Exception as db_error:
                print(f"Warning: Could not save transcript entry: {db_error}")
        elif user_transcript and not last_agent_question:
            print(f"Warning: Have user transcript but no previous agent question to pair with")
        elif not user_transcript:
            print(f"Warning: No user transcript received from Dialogflow STT")
        
        # ============================================================================
        # STEP 6: Extract agent response (text + audio)
        # ============================================================================
        agent_response_text = ""
        response_messages = response.query_result.response_messages
        
        for message in response_messages:
            if message.text and message.text.text:
                agent_response_text = message.text.text[0]
                break
        
        # Handle empty agent response (fallback)
        if not agent_response_text:
            print(f"Warning: No text response from Dialogflow for session {session_id}")
            agent_response_text = "I didn't catch that. Could you please repeat your answer?"
        
        # Extract audio response (Dialogflow TTS) - this is returned to frontend but not saved
        output_audio = response.output_audio if hasattr(response, 'output_audio') else b''
        
        # Handle empty audio response
        if not output_audio:
            print(f"Warning: No audio response from Dialogflow for session {session_id}")
        
        # ============================================================================
        # STEP 7: Check if interview is ending
        # ============================================================================
        intent_name = response.query_result.intent.display_name if response.query_result.intent else ""
        is_end = any(keyword in intent_name.lower() for keyword in ["end", "complete", "finish", "done"])
        
        # ============================================================================
        # STEP 8: Save agent's new question for next turn (if interview continues)
        # ============================================================================
        if agent_response_text and not is_end:
            try:
                save_to_database(session_id, "last_agent_question", agent_response_text)
            except Exception as db_error:
                print(f"Warning: Could not save last_agent_question: {db_error}")
        
        # ============================================================================
        # STEP 9: Prepare response
        # NOTE: audio_data is now out of scope and will be garbage collected
        # The audio file was never saved to disk or database
        # ============================================================================
        # Convert audio to base64 for JSON response (or return as raw bytes)
        audio_base64 = base64.b64encode(output_audio).decode('utf-8') if output_audio else None
        
        return {
            "audio_response": audio_base64,
            "audio_format": "mp3",
            "agent_response_text": agent_response_text,
            "user_transcript": user_transcript,  # This is the transcribed text that was saved
            "intent": intent_name,
            "is_end": is_end,
            "session_id": session_id
        }
    
    except Exception as e:
        print(f"Error in detect_intent_with_audio: {e}")
        import traceback
        traceback.print_exc()
        raise

def start_voice_interview_session(
    session_id: str,
    role_selection_text: str,
    resume_summary: str = "",
    persona: str = "",
    difficulty: str = "Medium"
) -> Dict:
    """
    Start a voice interview session with Dialogflow CX
    
    For the first message, we still use text input but request audio output.
    Subsequent messages will use audio input/output.
    
    Args:
        session_id: Unique session identifier
        role_selection_text: User's role selection text
        resume_summary: Optional resume summary
        persona: Optional interviewer persona
        difficulty: Difficulty level
    
    Returns:
        Dict with agent's first audio response and text
    """
    try:
        session_path = get_session_path(session_id)
        print(f"Starting voice interview session: {session_id}")
        
        # Set session parameters
        custom_params = {
            "candidate_resume_summary": resume_summary or "",
            "interviewer_persona": persona or "",
            "difficulty_level": difficulty
        }
        
        # For initial message, use text input but request audio output
        query_input = QueryInput(
            text=QueryInput.Text(text=role_selection_text),
            language_code=dialogflow_config["language_code"]
        )
        
        # Configure audio output (request TTS response with Chirp HD voices)
        output_audio_config = OutputAudioConfig(
            synthesize_speech_config={
                "voice": {
                    "name": "en-US-Chirp-C",  # Chirp HD voice (high-quality, natural)
                    "ssml_gender": "FEMALE"
                },
                "audio_encoding": OutputAudioEncoding.OUTPUT_AUDIO_ENCODING_MP3,
                "speaking_rate": 1.0,
                "pitch": 0.0,
                "volume_gain_db": 0.0
            }
        )
        
        request = DetectIntentRequest(
            session=session_path,
            query_input=query_input,
            query_params=QueryParameters(parameters=custom_params),
            output_audio_config=output_audio_config
        )
        
        print(f"Calling Dialogflow CX for initial voice response...")
        response = dialogflow_client.detect_intent(request=request)
        
        # Extract agent response text
        agent_response_text = ""
        for message in response.query_result.response_messages:
            if message.text and message.text.text:
                agent_response_text = message.text.text[0]
                break
        
        if not agent_response_text:
            print(f"Warning: No text response from Dialogflow for initial session {session_id}")
            agent_response_text = "Thank you for your interest. Let's begin the interview."
        
        # Extract audio response
        output_audio = response.output_audio if hasattr(response, 'output_audio') else b''
        
        # Handle empty audio response
        if not output_audio:
            print(f"Warning: No audio response from Dialogflow for initial session {session_id}")
        
        audio_base64 = base64.b64encode(output_audio).decode('utf-8') if output_audio else None
        
        print(f"Agent response received (audio: {len(output_audio)} bytes, text: {len(agent_response_text)} chars)")
        
        # Initialize transcript and save first question
        try:
            save_to_database(session_id, "transcript", [])
            save_to_database(session_id, "last_agent_question", agent_response_text)
            save_to_database(session_id, "session_info", {
                "role": role_selection_text,
                "resume_summary": resume_summary,
                "persona": persona,
                "difficulty": difficulty,
                "started_at": str(__import__("datetime").datetime.now()),
                "mode": "voice"
            })
            print(f"Session data saved to database for {session_id}")
        except Exception as db_error:
            print(f"Warning: Database save error (non-critical): {db_error}")
        
        return {
            "audio_response": audio_base64,
            "audio_format": "mp3",
            "agent_response_text": agent_response_text,
            "session_id": session_id
        }
    
    except Exception as e:
        print(f"Error starting voice interview: {e}")
        import traceback
        traceback.print_exc()
        raise
