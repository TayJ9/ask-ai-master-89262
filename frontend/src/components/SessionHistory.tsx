import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Calendar, Award, Loader2 } from "lucide-react";
import { format } from "date-fns";
import AnimatedBackground from "@/components/ui/AnimatedBackground";

interface SessionHistoryProps {
  userId: string;
  onBack: () => void;
}

interface VoiceInterviewListItem {
  id: string;
  status: string;
  durationSeconds: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
  overallScore: number | null;
  evaluationStatus: string | null;
  role: string | null;
  major: string | null;
}

export default function SessionHistory({ userId, onBack }: SessionHistoryProps) {
  const [, setLocation] = useLocation();

  const { data: interviews = [], isLoading } = useQuery<VoiceInterviewListItem[]>({
    queryKey: ["/api/interviews", userId],
  });

  const completedInterviews = interviews.filter(
    (item) => item.evaluationStatus === "complete" && item.overallScore != null,
  );

  const totalSessions = completedInterviews.length;
  const averageScore =
    completedInterviews.length > 0
      ? Math.round(
          completedInterviews.reduce((sum, s) => sum + (s.overallScore || 0), 0) /
            completedInterviews.length,
        )
      : 0;

  const streak = useMemo(() => {
    if (completedInterviews.length === 0) return 0;
    const dates = completedInterviews
      .map((s) => {
        const raw = s.endedAt || s.createdAt;
        return raw ? new Date(raw).toDateString() : null;
      })
      .filter(Boolean)
      .sort()
      .reverse();

    let streakCount = 0;
    if (dates.length > 0) {
      const now = Date.now();
      const today = new Date(now).toDateString();
      const yesterday = new Date(now - 86400000).toDateString();

      if (dates[0] === today || dates[0] === yesterday) {
        streakCount = 1;
        for (let i = 1; i < dates.length; i++) {
          const currentDate = new Date(dates[i - 1]!);
          const prevDate = new Date(currentDate.getTime() - 86400000);
          if (dates[i] === prevDate.toDateString()) {
            streakCount++;
          } else {
            break;
          }
        }
      }
    }

    return streakCount;
  }, [completedInterviews]);

  const formatInterviewDate = (item: VoiceInterviewListItem) => {
    const raw = item.endedAt || item.createdAt;
    return raw ? format(new Date(raw), "MMM d, yyyy") : "—";
  };

  return (
    <AnimatedBackground className="p-6">
      <div className="max-w-6xl mx-auto space-y-6 animate-scale-in">
        <div className="flex items-center gap-4">
          <Button onClick={onBack} variant="outline" className="gap-2" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h1 className="text-4xl font-bold" data-testid="text-history-title">
              Your Progress
            </h1>
            <p className="text-muted-foreground mt-1">Track your interview practice sessions</p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground mt-4">Loading your sessions...</p>
          </div>
        ) : interviews.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground">No completed sessions yet. Start practicing!</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Total Sessions</p>
                      <p className="text-3xl font-bold text-primary">{totalSessions}</p>
                    </div>
                    <Calendar className="w-8 h-8 text-primary/30" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-700 dark:text-green-300 mb-1">Average Score</p>
                      <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {averageScore}%
                      </p>
                    </div>
                    <Award className="w-8 h-8 text-green-400 dark:text-green-600" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-orange-700 dark:text-orange-300 mb-1">Day Streak</p>
                      <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                        {streak} 🔥
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-orange-400 dark:text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {interviews.map((item) => (
                <Card
                  key={item.id}
                  className="hover:shadow-lg transition-shadow"
                  data-testid={`card-session-${item.id}`}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <CardTitle className="capitalize" data-testid={`text-role-${item.id}`}>
                          {(item.role || "General Interview").replace("-", " ")}
                        </CardTitle>
                        {item.major && (
                          <p className="text-sm text-muted-foreground mt-1">{item.major}</p>
                        )}
                        <CardDescription className="flex items-center gap-2 mt-2">
                          <Calendar className="w-4 h-4" />
                          {formatInterviewDate(item)}
                        </CardDescription>
                      </div>
                      {item.overallScore != null && item.evaluationStatus === "complete" && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full shrink-0">
                          <Award className="w-4 h-4 text-primary" />
                          <span
                            className="font-semibold text-primary"
                            data-testid={`text-score-${item.id}`}
                          >
                            {item.overallScore}%
                          </span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Evaluation</p>
                        <p className="font-semibold capitalize">
                          {item.evaluationStatus || "pending"}
                        </p>
                      </div>
                      {item.durationSeconds != null && (
                        <div>
                          <p className="text-muted-foreground">Duration</p>
                          <p className="font-semibold">
                            {Math.max(1, Math.round(item.durationSeconds / 60))} min
                          </p>
                        </div>
                      )}
                    </div>
                    {item.evaluationStatus === "complete" && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setLocation(`/results?interviewId=${item.id}`)}
                      >
                        View results
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </AnimatedBackground>
  );
}
