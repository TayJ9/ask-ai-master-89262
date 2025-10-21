import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Volume2, Loader2, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { z } from "zod";
// Type definitions for better type safety
interface InterviewQuestion {
  id: string;
  role: string;
  category: string;
  difficulty: string;
  question_text: string;
  order_index: number;
  created_at: string | null;
}

interface AnalysisResponse {
  score: number;
  strengths: string[];
  improvements: string[];
}

interface SpeechToTextResponse {
  text: string;
}

interface TextToSpeechResponse {
  audioContent: string;
}

const roleSchema = z.enum(["software-engineer", "product-manager", "marketing"]);
const questionTextSchema = z.string().min(1).max(1000);

interface InterviewSessionProps {
  role: string;
  userId: string;
  onComplete: () => void;
}

export default function InterviewSession({ role, userId, onComplete }: InterviewSessionProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingQuestion, setIsPlayingQuestion] = useState(false);
  const [transcript, setTranscript] = useState("");
  const { toast } = useToast();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const initializeSession = useCallback(async () => {
    try {
      // Validate role input
      const validatedRole = roleSchema.safeParse(role);
      if (!validatedRole.success) {
        toast({
          title: "Invalid Role",
          description: "Please select a valid role.",
          variant: "destructive",
        });
        onComplete();
        return;
      }

      // Create session
      const { data: session, error: sessionError } = await supabase
        .from("interview_sessions")
        .insert({
          user_id: userId,
          role: validatedRole.data,
          status: "in_progress",
        })
        .select()
        .single();

      if (sessionError) throw sessionError;
      setSessionId(session.id);

      // Fetch questions
      const { data: questionsData, error: questionsError } = await supabase
        .from("interview_questions")
        .select("*")
        .eq("role", role)
        .order("order_index");

      if (questionsError) throw questionsError;
      setQuestions(questionsData || []);

      // Play first question
      if (questionsData && questionsData.length > 0) {
        playQuestion(questionsData[0].question_text);
      }
    } catch (error: any) {
      console.error('Session initialization error:', error);
      toast({
        title: "Error",
        description: error.message?.replace(/[<>]/g, '') || 'Failed to initialize session',
        variant: "destructive",
      });
    }
  }, [role, userId, onComplete, toast]);

  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  const playQuestion = useCallback(async (questionText: string) => {
    setIsPlayingQuestion(true);
    try {
      // Validate question text
      const validatedText = questionTextSchema.safeParse(questionText);
      if (!validatedText.success) {
        throw new Error("Invalid question text");
      }

      const { data, error } = await supabase.functions.invoke("text-to-speech", {
        body: { text: validatedText.data },
      });

      if (error) throw error;

      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audio.onended = () => setIsPlayingQuestion(false);
      audio.onerror = () => {
        setIsPlayingQuestion(false);
        toast({
          title: "Audio Error",
          description: "Failed to play audio",
          variant: "destructive",
        });
      };
      await audio.play();
    } catch (error: any) {
      console.error('Audio playback error:', error);
      toast({
        title: "Error playing question",
        description: error.message?.replace(/[<>]/g, '') || 'Failed to play question',
        variant: "destructive",
      });
      setIsPlayingQuestion(false);
    }
  }, [toast]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = handleRecordingStop;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error: any) {
      toast({
        title: "Microphone Error",
        description: "Could not access microphone",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleRecordingStop = async () => {
    setIsProcessing(true);
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

    try {
      console.log('Processing audio...', audioBlob.size, 'bytes');
      
      // Convert to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result?.toString().split(",")[1];
        console.log('Audio converted to base64, length:', base64Audio?.length);

        // Transcribe
        console.log('Calling speech-to-text function...');
        const { data: transcriptData, error: transcriptError } = await supabase.functions.invoke(
          "speech-to-text",
          {
            body: { audio: base64Audio },
          }
        );

        if (transcriptError) {
          console.error('Speech-to-text error:', transcriptError);
          throw transcriptError;
        }
        
        console.log('Transcript received:', transcriptData);
        setTranscript(transcriptData.text);

        // Analyze response
        console.log('Calling analyze-response function...');
        const { data: feedbackData, error: feedbackError } = await supabase.functions.invoke(
          "analyze-response",
          {
            body: {
              question: questions[currentQuestionIndex].question_text,
              answer: transcriptData.text,
              role: role,
            },
          }
        );

        if (feedbackError) {
          console.error('Analyze response error:', feedbackError);
          throw feedbackError;
        }

        console.log('Feedback received:', feedbackData);

        // Save response
        console.log('Saving response to database...');
        const { error: saveError } = await supabase.from("interview_responses").insert({
          session_id: sessionId,
          question_id: questions[currentQuestionIndex].id,
          transcript: transcriptData.text,
          score: feedbackData.score,
          strengths: feedbackData.strengths,
          improvements: feedbackData.improvements,
        });

        if (saveError) {
          console.error('Database save error:', saveError);
          throw saveError;
        }

        toast({
          title: "Response Analyzed",
          description: `Score: ${feedbackData.score}/100`,
        });

        // Move to next question or complete
        if (currentQuestionIndex < questions.length - 1) {
          const nextIndex = currentQuestionIndex + 1;
          setCurrentQuestionIndex(nextIndex);
          setTranscript("");
          playQuestion(questions[nextIndex].question_text);
        } else {
          completeSession();
        }
      };
    } catch (error: any) {
      console.error('Recording stop error:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to process recording',
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const completeSession = async () => {
    if (sessionId) {
      await supabase
        .from("interview_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", sessionId);
    }
    onComplete();
  };

  // Memoized values for performance
  const currentQuestion = useMemo(() => questions[currentQuestionIndex], [questions, currentQuestionIndex]);
  const progress = useMemo(() => ((currentQuestionIndex + 1) / questions.length) * 100, [currentQuestionIndex, questions.length]);
  const isLastQuestion = useMemo(() => currentQuestionIndex >= questions.length - 1, [currentQuestionIndex, questions.length]);

  if (!questions.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 gradient-secondary">
      <div className="max-w-4xl mx-auto space-y-6 animate-scale-in">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="shadow-xl">
          <CardContent className="p-8 space-y-6">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Volume2 className="w-6 h-6 text-primary mt-1 flex-shrink-0" />
                <p className="text-2xl font-medium leading-relaxed">{currentQuestion.question_text}</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-6 py-8">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing || isPlayingQuestion}
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isRecording
                    ? "gradient-recording shadow-glow animate-pulse-slow"
                    : "gradient-primary shadow-lg hover:shadow-glow"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isProcessing ? (
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                ) : isRecording ? (
                  <MicOff className="w-12 h-12 text-white" />
                ) : (
                  <Mic className="w-12 h-12 text-white" />
                )}
              </button>

              <div className="text-center space-y-2">
                {isPlayingQuestion ? (
                  <p className="text-lg font-medium text-muted-foreground">Listening to question...</p>
                ) : isProcessing ? (
                  <p className="text-lg font-medium text-muted-foreground">Analyzing your response...</p>
                ) : isRecording ? (
                  <p className="text-lg font-medium text-primary">Recording... Tap to stop</p>
                ) : (
                  <p className="text-lg font-medium text-muted-foreground">Tap to start recording</p>
                )}
              </div>
            </div>

            {transcript && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Your Response:</p>
                <p className="text-sm text-muted-foreground">{transcript}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
