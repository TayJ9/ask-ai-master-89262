/**
 * Voice Interview Component
 * Voice interview component with audio recording and playback
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Volume2, Loader2, CheckCircle2 } from "lucide-react";
import AISpeakingIndicator from "@/components/ui/AISpeakingIndicator";
import AnimatedBackground from "@/components/ui/AnimatedBackground";

interface VoiceInterviewProps {
  sessionId: string;
  userId: string;
  role: string;
  difficulty: string;
  resumeText?: string;
  initialAudioResponse?: string;
  initialAgentText?: string;
  onComplete: (results: any) => void;
}

export default function VoiceInterview({
  sessionId,
  userId,
  role,
  difficulty,
  resumeText,
  initialAudioResponse,
  initialAgentText,
  onComplete,
}: VoiceInterviewProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInterviewComplete, setIsInterviewComplete] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string>("");
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const handleRecordingStopRef = useRef<(() => Promise<void>) | null>(null);
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const { toast } = useToast();

  // Get auth token
  const getAuthToken = () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('No authentication token found. Please log in again.');
    }
    return token;
  };

  // Play audio response
  const playAudioResponse = useCallback((audioBase64: string, agentText?: string) => {
    try {
      // Stop any currently playing audio
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }

      // If no audio but we have text, use text-to-speech as fallback or just continue
      if (!audioBase64 || audioBase64.trim() === '') {
        console.warn('No audio response received, continuing with text response');
        // Auto-start recording after a short delay if no audio
        if (!isInterviewComplete && !isProcessing) {
          setTimeout(() => {
            if (startRecordingRef.current) {
              startRecordingRef.current();
            }
          }, 500);
        }
        return;
      }

      // Create audio blob from base64
      const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
      const audioBlob = new Blob([audioBytes], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      setCurrentAudioUrl(audioUrl);

      audio.onplay = () => {
        setIsPlaying(true);
        setIsRecording(false); // Can't record while AI is speaking
      };

      audio.onended = () => {
        setIsPlaying(false);
        // Clean up
        setCurrentAudioUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return null;
        });
        // Auto-start recording after AI finishes speaking
        if (!isInterviewComplete && !isProcessing) {
          setTimeout(() => {
            if (startRecordingRef.current) {
              startRecordingRef.current();
            }
          }, 300);
        }
      };

      audio.onerror = (e) => {
        setIsPlaying(false);
        console.error('Audio playback error:', e);
        // Auto-start recording even if audio fails
        if (!isInterviewComplete && !isProcessing) {
          setTimeout(() => {
            if (startRecordingRef.current) {
              startRecordingRef.current();
            }
          }, 300);
        }
      };

      audio.play().catch((err) => {
        setIsPlaying(false);
        console.error('Audio play error:', err);
        // Auto-start recording even if play fails
        if (!isInterviewComplete && !isProcessing) {
          setTimeout(() => {
            if (startRecordingRef.current) {
              startRecordingRef.current();
            }
          }, 300);
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
      // Auto-start recording even on error
      if (!isInterviewComplete && !isProcessing) {
        setTimeout(() => {
          if (startRecordingRef.current) {
            startRecordingRef.current();
          }
        }, 300);
      }
    }
  }, [isInterviewComplete, isProcessing, toast]);

  // Handle recording stop and send audio
  const handleRecordingStop = useCallback(async () => {
    setIsProcessing(true);
    
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        
        // Create FormData to send raw audio file
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('session_id', sessionId);
        formData.append('audioEncoding', 'AUDIO_ENCODING_WEBM_OPUS');
        formData.append('sampleRate', '24000');

        // Check for token first
        const token = localStorage.getItem('auth_token');
        if (!token) {
          throw new Error('No authentication token found. Please log in again.');
        }
        
        const { getApiUrl } = await import('@/lib/api');
        const url = getApiUrl('/api/voice-interview/send-audio');
        
        const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type - browser will set it with boundary for FormData
        },
        body: formData,
      });

      if (!response.ok) {
        // Handle 401/403 specifically
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          throw new Error('Session expired. Please log in again.');
        }
        
        // Try to parse error as JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to send audio');
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      // Check if response is audio or JSON
      const contentType = response.headers.get('content-type');
      
      // Extract metadata from headers
      const agentResponseText = response.headers.get('X-Response-Text') || '';
      const userTranscript = response.headers.get('X-Response-Transcript') || '';
      const isEnd = response.headers.get('X-Response-IsEnd') === 'true';
      const intent = response.headers.get('X-Response-Intent') || '';

      // Update transcript
      if (userTranscript) {
        setLastTranscript(userTranscript);
      }

      // Check if interview is complete
      if (isEnd) {
        setIsInterviewComplete(true);
        toast({
          title: "Interview Complete! 🎉",
          description: "You can now end the interview to see your results.",
        });
      }

      // Handle audio response
      if (contentType && contentType.includes('audio/')) {
        // Response is raw audio file
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Play the audio directly
        const audio = new Audio(audioUrl);
        audioPlayerRef.current = audio;
        setCurrentAudioUrl(audioUrl);

        audio.onplay = () => {
          setIsPlaying(true);
          setIsRecording(false);
        };

        audio.onended = () => {
          setIsPlaying(false);
          // Clean up
          URL.revokeObjectURL(audioUrl);
          setCurrentAudioUrl(null);
          // Auto-start recording after AI finishes speaking
          if (!isInterviewComplete && !isProcessing) {
            setTimeout(() => {
              if (startRecordingRef.current) {
                startRecordingRef.current();
              }
            }, 300);
          }
        };

        audio.onerror = (e) => {
          setIsPlaying(false);
          console.error('Audio playback error:', e);
          // Auto-start recording even if audio fails
          if (!isInterviewComplete && !isProcessing) {
            setTimeout(() => {
              if (startRecordingRef.current) {
                startRecordingRef.current();
              }
            }, 300);
          }
        };

        audio.play().catch((err) => {
          setIsPlaying(false);
          console.error('Audio play error:', err);
          // Auto-start recording even if play fails
          if (!isInterviewComplete && !isProcessing) {
            setTimeout(() => {
              if (startRecordingRef.current) {
                startRecordingRef.current();
              }
            }, 300);
          }
        });
      } else {
        // Response is JSON (fallback if no audio)
        const data = await response.json();
        if (data.audioResponse || data.agentResponseText) {
          // Play audio response (will auto-start recording if no audio)
          playAudioResponse(data.audioResponse || '', data.agentResponseText);
        } else if (data.error) {
          toast({
            title: "Warning",
            description: data.error || "No audio response received.",
            variant: "destructive",
          });
          // Auto-start recording even on error
          if (!isInterviewComplete && !isProcessing) {
            setTimeout(() => {
              if (startRecordingRef.current) {
                startRecordingRef.current();
              }
            }, 500);
          }
        }
      }

      setRecordingDuration(0);
    } catch (error: any) {
      console.error('Error sending audio:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to process audio. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, playAudioResponse, toast, isInterviewComplete, isProcessing]);

  // Update refs whenever functions change
  useEffect(() => {
    handleRecordingStopRef.current = handleRecordingStop;
  }, [handleRecordingStop]);

  // Start recording microphone - uses ref to avoid circular dependency
  const startRecording = useCallback(async () => {
    try {
      // Stop any playing audio
      if (audioPlayerRef.current && !audioPlayerRef.current.paused) {
        audioPlayerRef.current.pause();
        setIsPlaying(false);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        }
      });

      // Use WebM Opus codec for better compatibility
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 64000
      };

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (handleRecordingStopRef.current) {
          handleRecordingStopRef.current();
        }
      };
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      console.log("Recording started");
    } catch (error) {
      console.error("Microphone error:", error);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Update startRecording ref
  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  // Start voice interview session (only if not already started by parent)
  useEffect(() => {
    // If we have initial audio response, session was already started by parent
    if (initialAudioResponse || initialAgentText) {
      // Play the initial audio response (even if empty, will auto-start recording)
      if (initialAudioResponse) {
        playAudioResponse(initialAudioResponse, initialAgentText);
      } else if (initialAgentText) {
        // If no audio but we have text, still auto-start recording after a moment
        setTimeout(() => {
          if (startRecordingRef.current) {
            startRecordingRef.current();
          }
        }, 1000);
      }
      toast({
        title: "Voice Interview Started",
        description: "Listen for the AI's question, then speak your answer.",
      });
      return;
    }
    
    // Don't start if we don't have a sessionId
    if (!sessionId) {
      return;
    }

    // Otherwise, start the session ourselves
    const startSession = async () => {
      try {
        setIsProcessing(true);
        
        // Check for token first
        const token = localStorage.getItem('auth_token');
        if (!token) {
          throw new Error('No authentication token found. Please log in again.');
        }
        
        const { apiPost } = await import('@/lib/api');
        const data = await apiPost('/api/voice-interview/start', {
          session_id: sessionId,
          role: role,
          resumeText: resumeText || '',
          difficulty: difficulty,
        });
        
        // Play the first audio response (will auto-start recording if no audio)
        playAudioResponse(data.audioResponse || '', data.agentResponseText);
        
        toast({
          title: "Voice Interview Started",
          description: "Listen for the AI's question, then speak your answer.",
        });
      } catch (error: any) {
        console.error('Error starting voice interview:', error);
        const errorMessage = error.message || "Failed to start voice interview.";
        
        // Check if it's an authentication error
        if (errorMessage.includes('token') || errorMessage.includes('authentication') || errorMessage.includes('401') || errorMessage.includes('403')) {
          toast({
            title: "Authentication Error",
            description: "Your session has expired. Please log in again to continue.",
            variant: "destructive",
          });
          // Clear auth data and redirect
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        } else {
          toast({
            title: "Error",
            description: errorMessage,
            variant: "destructive",
          });
        }
      } finally {
        setIsProcessing(false);
      }
    };

    // Start the session (sessionId check already done above)
    startSession();
  }, [sessionId, role, difficulty, resumeText, initialAudioResponse, toast, playAudioResponse]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current.stream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
        setIsRecording(false);

        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
      } catch (error) {
        console.error("Error stopping recording:", error);
      }
    }
  }, [isRecording]);

  // Complete interview
  const handleCompleteInterview = useCallback(async () => {
    if (confirm("Are you sure you want to end the interview? You'll receive your final feedback.")) {
      try {
        setIsProcessing(true);
        
        // Check for token first
        const token = localStorage.getItem('auth_token');
        if (!token) {
          throw new Error('No authentication token found. Please log in again.');
        }
        
        const { apiPost } = await import('@/lib/api');
        const results = await apiPost('/api/voice-interview/score', {
          session_id: sessionId,
        });
        onComplete(results);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to complete interview.",
          variant: "destructive",
        });
        setIsProcessing(false);
      }
    }
  }, [sessionId, onComplete, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
      }
      stopRecording();
    };
  }, [currentAudioUrl, stopRecording]);

  return (
    <AnimatedBackground className="p-6 flex items-center justify-center">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <Card className="shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Voice Interview</h2>
                <p className="text-muted-foreground">
                  {role.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())} • {difficulty}
                </p>
              </div>
              <Button
                onClick={handleCompleteInterview}
                variant="outline"
                disabled={isProcessing || isRecording || isPlaying}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                End Interview
              </Button>
            </div>

            {/* Status */}
            <div className="text-center mb-6">
              {isPlaying ? (
                <div className="flex items-center justify-center gap-2 text-primary">
                  <AISpeakingIndicator size="md" />
                  <span className="font-medium">AI is speaking...</span>
                </div>
              ) : isRecording ? (
                <div className="flex items-center justify-center gap-2 text-red-500">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="font-medium">Recording... {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")}</span>
                </div>
              ) : isProcessing ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">Processing...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="font-medium">Ready to speak</span>
                </div>
              )}
            </div>

            {/* Large Mic Button */}
            <div className="flex justify-center mb-6">
              <button
                onClick={() => isRecording ? stopRecording() : startRecording()}
                disabled={isProcessing || isPlaying || isInterviewComplete}
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all shadow-2xl ${
                  isRecording
                    ? "bg-red-500 text-white animate-pulse hover:bg-red-600 scale-110"
                    : isPlaying
                    ? "bg-muted text-muted-foreground opacity-50"
                    : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground hover:scale-110"
                } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
                title={
                  isPlaying
                    ? "Wait for AI to finish speaking"
                    : isRecording
                    ? "Click to stop recording and send"
                    : "Click to start recording"
                }
              >
                {isRecording ? (
                  <MicOff className="w-16 h-16" />
                ) : (
                  <Mic className="w-16 h-16" />
                )}
              </button>
            </div>

            {/* Last Transcript */}
            {lastTranscript && (
              <div className="p-4 bg-muted rounded-lg mb-4">
                <p className="text-sm font-medium mb-1">Your last response:</p>
                <p className="text-sm text-muted-foreground">{lastTranscript}</p>
              </div>
            )}

            {/* Instructions */}
            <div className="text-center text-sm text-muted-foreground space-y-1">
              <p>🎤 Click the microphone to start speaking</p>
              <p>The AI will respond with voice automatically</p>
              {isInterviewComplete && (
                <p className="text-green-600 font-medium mt-2">Interview complete! Click "End Interview" to see results.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AnimatedBackground>
  );
}

