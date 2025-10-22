import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Volume2, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InterviewQuestion, InterviewSession as IInterviewSession } from "@shared/schema";

interface InterviewSessionProps {
  role: string;
  userId: string;
  onComplete: () => void;
}

export default function InterviewSession({ role, userId, onComplete }: InterviewSessionProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingQuestion, setIsPlayingQuestion] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState<{ score: number; strengths: string[]; improvements: string[] } | null>(null);
  const { toast } = useToast();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const { data: questions = [], isLoading: questionsLoading } = useQuery<InterviewQuestion[]>({
    queryKey: [`/api/questions/${role}`],
    enabled: !!role,
  });

  const createSessionMutation = useMutation({
    mutationFn: (data: { userId: string; role: string; status: string }) =>
      apiRequest('/api/sessions', 'POST', data),
    onSuccess: (data: IInterviewSession) => {
      setSessionId(data.id);
      if (questions && questions.length > 0) {
        playQuestion(questions[0].questionText);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create session. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createResponseMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/responses', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest(`/api/sessions/${id}`, 'PATCH', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
    },
  });

  useEffect(() => {
    if (!questionsLoading && questions.length > 0 && !sessionId && !createSessionMutation.isPending) {
      createSessionMutation.mutate({
        userId,
        role,
        status: "in_progress",
      });
    }
  }, [questionsLoading, questions.length, sessionId, createSessionMutation.isPending, userId, role]);

  const playQuestion = useCallback(async (questionText: string) => {
    setIsPlayingQuestion(true);
    
    try {
      const data = await apiRequest('/api/ai/text-to-speech', 'POST', { text: questionText });
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audio.onended = () => {
        setTimeout(() => {
          setIsPlayingQuestion(false);
        }, 800);
      };
      audio.onerror = () => {
        setIsPlayingQuestion(false);
        toast({
          title: "Audio Error",
          description: "Failed to play audio. You can still record your answer.",
          variant: "destructive",
        });
      };
      await audio.play();
    } catch (error: any) {
      toast({
        title: "Audio Error",
        description: error.message || "Failed to play question audio. You can still read and answer the question.",
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
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = handleRecordingStop;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
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
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleRecordingStop = async () => {
    setIsProcessing(true);
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      try {
        const base64Audio = reader.result?.toString().split(",")[1];

        const transcriptData = await apiRequest('/api/ai/speech-to-text', 'POST', { audio: base64Audio });
        setTranscript(transcriptData.text);

        const feedbackData = await apiRequest('/api/ai/analyze-response', 'POST', {
          question: questions[currentQuestionIndex].questionText,
          answer: transcriptData.text,
          role: role,
        });

        setFeedback(feedbackData);

        await createResponseMutation.mutateAsync({
          sessionId: sessionId,
          questionId: questions[currentQuestionIndex].id,
          transcript: transcriptData.text,
          score: feedbackData.score,
          strengths: feedbackData.strengths,
          improvements: feedbackData.improvements,
        });

        toast({
          title: "Response Analyzed",
          description: `Score: ${feedbackData.score}/100`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to process response",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    };
  };

  const completeSession = async () => {
    if (sessionId) {
      await updateSessionMutation.mutateAsync({
        id: sessionId,
        data: { status: "completed", completedAt: new Date().toISOString() },
      });
    }
    onComplete();
  };

  const currentQuestion = useMemo(() => questions[currentQuestionIndex], [questions, currentQuestionIndex]);
  const progress = useMemo(() => ((currentQuestionIndex + 1) / questions.length) * 100, [currentQuestionIndex, questions.length]);

  if (questionsLoading || !questions.length || createSessionMutation.isPending || (questions.length > 0 && !sessionId)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" data-testid="loader-session" />
          <p className="text-lg text-muted-foreground">
            {questionsLoading ? "Loading questions..." : "Preparing your interview session..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 gradient-secondary">
      <div className="max-w-4xl mx-auto space-y-6 animate-scale-in">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium" data-testid="text-question-progress">
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
                <p className="text-2xl font-medium leading-relaxed" data-testid="text-current-question">{currentQuestion.questionText}</p>
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
                data-testid="button-record"
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
                  <p className="text-lg font-medium text-muted-foreground" data-testid="text-status">Listening to question...</p>
                ) : isProcessing ? (
                  <p className="text-lg font-medium text-muted-foreground" data-testid="text-status">Analyzing your response...</p>
                ) : isRecording ? (
                  <p className="text-lg font-medium text-primary" data-testid="text-status">Recording... Tap to stop</p>
                ) : (
                  <p className="text-lg font-medium text-muted-foreground" data-testid="text-status">Tap to start recording</p>
                )}
              </div>
            </div>

            {transcript && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Your Response:</p>
                <p className="text-sm text-muted-foreground" data-testid="text-transcript">{transcript}</p>
              </div>
            )}

            {feedback && (
              <div className="space-y-4 animate-scale-in">
                <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg">
                  <span className="text-lg font-semibold">Your Score:</span>
                  <span className="text-3xl font-bold text-primary" data-testid="text-score">{feedback.score}/100</span>
                </div>

                {feedback.strengths.length > 0 && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="font-semibold text-green-900 dark:text-green-100 mb-2">✓ Strengths:</p>
                    <ul className="space-y-1">
                      {feedback.strengths.map((strength, idx) => (
                        <li key={idx} className="text-sm text-green-800 dark:text-green-200" data-testid={`text-strength-${idx}`}>
                          • {strength}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {feedback.improvements.length > 0 && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-2">→ Areas to Improve:</p>
                    <ul className="space-y-1">
                      {feedback.improvements.map((improvement, idx) => (
                        <li key={idx} className="text-sm text-amber-800 dark:text-amber-200" data-testid={`text-improvement-${idx}`}>
                          • {improvement}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button
                  onClick={() => {
                    if (currentQuestionIndex < questions.length - 1) {
                      const nextIndex = currentQuestionIndex + 1;
                      setCurrentQuestionIndex(nextIndex);
                      setTranscript("");
                      setFeedback(null);
                      playQuestion(questions[nextIndex].questionText);
                    } else {
                      completeSession();
                    }
                  }}
                  className="w-full"
                  data-testid="button-next-question"
                >
                  {currentQuestionIndex < questions.length - 1 ? "Next Question" : "Complete Interview"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
