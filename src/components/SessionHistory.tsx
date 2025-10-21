import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Calendar, Award } from "lucide-react";
import { format } from "date-fns";

interface SessionHistoryProps {
  userId: string;
  onBack: () => void;
}

export default function SessionHistory({ userId, onBack }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, [userId]);

  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from("interview_sessions")
        .select(`
          *,
          interview_responses (
            score,
            strengths,
            improvements
          )
        `)
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error("Error fetching sessions:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAverageScore = (responses: any[]) => {
    if (!responses.length) return 0;
    const total = responses.reduce((sum, r) => sum + (r.score || 0), 0);
    return Math.round(total / responses.length);
  };

  return (
    <div className="min-h-screen p-6 gradient-secondary">
      <div className="max-w-6xl mx-auto space-y-6 animate-scale-in">
        <div className="flex items-center gap-4">
          <Button
            onClick={onBack}
            variant="outline"
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h1 className="text-4xl font-bold">Your Progress</h1>
            <p className="text-muted-foreground mt-1">Track your interview practice sessions</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading your sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground">No completed sessions yet. Start practicing!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {sessions.map((session) => {
              const avgScore = calculateAverageScore(session.interview_responses);
              return (
                <Card key={session.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="capitalize">
                          {session.role.replace("-", " ")}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-2">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(session.completed_at), "MMM d, yyyy")}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full">
                        <Award className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-primary">{avgScore}%</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Questions</p>
                        <p className="font-semibold">{session.interview_responses.length}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Avg Score</p>
                        <p className="font-semibold">{avgScore}%</p>
                      </div>
                    </div>
                    
                    {session.interview_responses.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-success" />
                          Key Strengths
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {session.interview_responses[0].strengths?.slice(0, 2).map((strength: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-success mt-1">•</span>
                              {strength}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
