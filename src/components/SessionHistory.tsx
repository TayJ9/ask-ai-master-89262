import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Calendar, Award, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { InterviewSession } from "@shared/schema";

interface SessionHistoryProps {
  userId: string;
  onBack: () => void;
}

interface SessionWithResponses extends InterviewSession {
  responses?: Array<{ score: number; strengths: string[]; improvements: string[] }>;
}

export default function SessionHistory({ userId, onBack }: SessionHistoryProps) {
  const { data: sessions = [], isLoading } = useQuery<SessionWithResponses[]>({
    queryKey: ['/api/sessions'],
  });

  const completedSessions = sessions.filter(s => s.status === 'completed');

  return (
    <div className="min-h-screen p-6 gradient-secondary">
      <div className="max-w-6xl mx-auto space-y-6 animate-scale-in">
        <div className="flex items-center gap-4">
          <Button
            onClick={onBack}
            variant="outline"
            className="gap-2"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h1 className="text-4xl font-bold" data-testid="text-history-title">Your Progress</h1>
            <p className="text-muted-foreground mt-1">Track your interview practice sessions</p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground mt-4">Loading your sessions...</p>
          </div>
        ) : completedSessions.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground">No completed sessions yet. Start practicing!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {completedSessions.map((session) => (
              <Card key={session.id} className="hover:shadow-lg transition-shadow" data-testid={`card-session-${session.id}`}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="capitalize" data-testid={`text-role-${session.id}`}>
                        {session.role.replace("-", " ")}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-2">
                        <Calendar className="w-4 h-4" />
                        {session.completedAt && format(new Date(session.completedAt), "MMM d, yyyy")}
                      </CardDescription>
                    </div>
                    {session.overallScore && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full">
                        <Award className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-primary" data-testid={`text-score-${session.id}`}>{session.overallScore}%</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <p className="font-semibold capitalize">{session.status}</p>
                    </div>
                    {session.overallScore && (
                      <div>
                        <p className="text-muted-foreground">Score</p>
                        <p className="font-semibold">{session.overallScore}%</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
