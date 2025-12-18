/**
 * Results Screen Component
 * 
 * Displays interview feedback immediately after interview completion.
 * Shows placeholder data while evaluation is being processed.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface InterviewData {
  candidateId?: string;
  interviewId?: string;
  conversationId?: string;
  sessionId?: string;
  status?: "completed" | "pending" | "analyzing";
  timestamp?: string;
}

interface ResultsScreenProps {
  interviewData: InterviewData;
  onBackHome: () => void;
  onPracticeAgain?: () => void;
}

export default function ResultsScreen({
  interviewData,
  onBackHome,
  onPracticeAgain,
}: ResultsScreenProps) {
  const { status = "completed" } = interviewData;

  // Placeholder data - will be replaced with actual evaluation data later
  const strengths = [
    "Strong communication and clarity",
    "Good technical depth on projects",
    "Clear thinking process",
  ];

  const improvements = [
    "Next time, be more concise in answers",
    "Next time, ask clarifying questions",
    "Next time, show more enthusiasm",
  ];

  const practiceDrills = [
    "Record a 2-min 'Tell me about yourself'",
    "Practice one behavioral STAR story",
    "Review data structures for 15 mins",
  ];

  const isPending = status === "pending" || status === "analyzing";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">Interview Results</CardTitle>
              {isPending ? (
                <Badge variant="secondary" className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Analysis Pending
                </Badge>
              ) : (
                <Badge variant="default" className="flex items-center gap-2 bg-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Interview Completed
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <p className="text-gray-600">
                Your interview has been completed. We're analyzing your performance and will have detailed feedback ready shortly.
              </p>
            ) : (
              <p className="text-gray-600">
                Great job completing the interview! Here's your performance summary and recommendations.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Strengths Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <p className="text-gray-500 italic">Analysis pending...</p>
            ) : (
              <ul className="space-y-2">
                {strengths.map((strength, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-green-600 mt-1">•</span>
                    <span className="text-gray-700">{strength}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Areas to Improve Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Areas to Improve
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <p className="text-gray-500 italic">Analysis pending...</p>
            ) : (
              <ul className="space-y-2">
                {improvements.map((improvement, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-orange-600 mt-1">•</span>
                    <span className="text-gray-700">{improvement}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Practice Drills Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Practice Drills</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <p className="text-gray-500 italic">Recommendations pending...</p>
            ) : (
              <ul className="space-y-2">
                {practiceDrills.map((drill, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-blue-600 mt-1">•</span>
                    <span className="text-gray-700">{drill}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={onBackHome} variant="outline" className="flex-1 sm:flex-none">
                Back to Home
              </Button>
              {onPracticeAgain && (
                <Button onClick={onPracticeAgain} variant="default" className="flex-1 sm:flex-none">
                  Practice Again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

