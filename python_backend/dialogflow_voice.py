"""
Dialogflow CX Voice Interview Backend
Handles voice-based interview sessions using Dialogflow CX native STT/TTS

CRITICAL: Audio files are NEVER stored - only transcribed text is saved.
"""

import os
import json
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

# Initialize Dialogflow client
try:
    credentials = get_credentials()
    dialogflow_config = get_dialogflow_config()
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
    """
    try:
        session_path = get_session_path(session_id)
        
        # Get last agent question from DB if not provided
        if not last_agent_question:
            try:
                last_agent_question = get_from_database(session_id, "last_agent_question")
            except:
                pass
        
        # Configure audio input
        audio_config = InputAudioConfig(
            audio_encoding=AudioEncoding[audio_encoding] if isinstance(audio_encoding, str) else audio_encoding,
            sample_rate_hertz=sample_rate,
            language_code=get_dialogflow_config()["language_code"]
        )
        
        # Configure audio output (TTS)
        output_audio_config = OutputAudioConfig(
            audio_encoding=OutputAudioEncoding.OUTPUT_AUDIO_ENCODING_MP3,
            synthesize_speech_config={
                "voice": {
                    "name": "en-US-Journey-O"  # High-quality Chirp HD voice
                }
            }
        )
        
        # Create query input with audio
        query_input = QueryInput(audio=audio_config)
        
        # Create request
        request = DetectIntentRequest(
            session=session_path,
            query_input=query_input,
            input_audio=audio_data,
            output_audio_config=output_audio_config
        )
        
        # Call Dialogflow
        response = dialogflow_client.detect_intent(request=request)
        
        # Extract transcribed text (user's answer)
        user_transcript = response.query_result.query_text if response.query_result.query_text else ""
        
        # Extract agent response text
        agent_response_text = ""
        if response.query_result.response_messages:
            for message in response.query_result.response_messages:
                if message.text:
                    agent_response_text = message.text.text[0] if message.text.text else ""
                    break
        
        if not agent_response_text:
            agent_response_text = "I didn't catch that. Could you please repeat your answer?"
        
        # Get audio response
        output_audio = response.output_audio if response.output_audio else b""
        
        if not output_audio:
            print("Warning: No audio response from Dialogflow")
        
        # Get intent
        intent_name = response.query_result.intent.display_name if response.query_result.intent else ""
        is_end = intent_name.lower() == "end_session" or "end" in intent_name.lower()
        
        # Save transcript (text only, no audio!)
        if last_agent_question and user_transcript:
            try:
                # Get current turn number
                transcript = get_transcript(session_id)
                turn_number = len(transcript) + 1
                save_transcript_entry(session_id, turn_number, last_agent_question, user_transcript)
            except Exception as db_error:
                print(f"Warning: Could not save transcript entry: {db_error}")
        
        # Store the current agent question for next turn
        if agent_response_text:
            try:
                save_to_database(session_id, "last_agent_question", agent_response_text)
            except Exception as db_error:
                print(f"Warning: Could not save last_agent_question: {db_error}")
        
        return {
            "audio_response": output_audio,
            "agent_response_text": agent_response_text,
            "user_transcript": user_transcript,
            "intent": intent_name,
            "is_end": is_end
        }
    
    except Exception as e:
        print(f"Error in detect_intent_with_audio: {e}")
        import traceback
        traceback.print_exc()
        raise

def start_voice_interview_session(
    session_id: str,
    role: str,
    resume_text: str = "",
    difficulty: str = "Medium"
) -> Dict:
    """
    Start a voice interview session with Dialogflow CX
    Sets up session parameters and returns initial audio greeting
    """
    try:
        session_path = get_session_path(session_id)
        
        # Prepare session parameters
        resume_summary = resume_text[:500] if resume_text else ""
        
        # Create session parameters
        parameters = {
            "candidate_resume_summary": resume_summary,
            "interviewer_persona": f"Professional technical interviewer for {role} role",
            "difficulty_level": difficulty,
            "session_id": session_id,
            "role": role
        }
        
        # Create a simple text query to start the session
        # Dialogflow will use the session parameters to generate the first question
        from google.cloud.dialogflowcx_v3 import QueryInput, TextInput
        
        query_input = QueryInput(
            text=TextInput(
                text="Hello, I'm ready to start the interview."
            ),
            language_code=get_dialogflow_config()["language_code"]
        )
        
        # Configure output audio
        output_audio_config = OutputAudioConfig(
            audio_encoding=OutputAudioEncoding.OUTPUT_AUDIO_ENCODING_MP3,
            synthesize_speech_config={
                "voice": {
                    "name": "en-US-Journey-O"  # High-quality Chirp HD voice
                }
            }
        )
        
        # Create request with session parameters
        from google.cloud.dialogflowcx_v3 import DetectIntentRequest, QueryParameters
        request = DetectIntentRequest(
            session=session_path,
            query_input=query_input,
            query_params=QueryParameters(
                parameters=parameters,
                session_entity_types=[]
            ),
            output_audio_config=output_audio_config
        )
        
        # Call Dialogflow
        response = dialogflow_client.detect_intent(request=request)
        
        # Extract agent response
        agent_response_text = ""
        if response.query_result.response_messages:
            for message in response.query_result.response_messages:
                if message.text:
                    agent_response_text = message.text.text[0] if message.text.text else ""
                    break
        
        if not agent_response_text:
            agent_response_text = "Hello! I'm ready to begin the interview. Please tell me about yourself."
        
        # Get audio response
        output_audio = response.output_audio if response.output_audio else b""
        
        # Store the first question for transcript
        if agent_response_text:
            try:
                save_to_database(session_id, "last_agent_question", agent_response_text)
            except Exception as db_error:
                print(f"Warning: Could not save initial question: {db_error}")
        
        return {
            "audio_response": output_audio,
            "agent_response_text": agent_response_text,
            "session_id": session_id
        }
    
    except Exception as e:
        print(f"Error starting voice interview session: {e}")
        import traceback
        traceback.print_exc()
        raise

