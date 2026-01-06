import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Mic } from "lucide-react";
import AnimatedBackground from "@/components/ui/AnimatedBackground";

interface RoleSelectionProps {
  onSelectRole: (role: string, mode?: "text" | "voice") => void;
}

export default function RoleSelection({ onSelectRole }: RoleSelectionProps) {
  const [roleInput, setRoleInput] = useState("");

  const handleBeginInterview = () => {
    // Default to "General Interview" if input is empty/whitespace
    // This ensures we never pass empty string to VoiceInterviewWebSocket
    const typedRole = roleInput.trim() || "General Interview";
    console.log('Begin Interview clicked:', typedRole, 'voice');
    onSelectRole(typedRole, "voice");
  };

  return (
    <AnimatedBackground className="p-6">
      <div className="max-w-4xl mx-auto space-y-8 animate-scale-in flex flex-col items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Start Your Interview
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Practice your interview skills with our AI-powered voice interview system
          </p>
        </div>

        <div className="w-full max-w-md space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role-input">Target Role / Major (Optional)</Label>
            <Input
              id="role-input"
              type="text"
              placeholder="e.g., Music, Finance, Software Engineering"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleBeginInterview();
                }
              }}
              className="text-lg"
              data-testid="input-role"
            />
            <p className="text-sm text-muted-foreground">
              Leave blank to use major from resume upload
            </p>
          </div>

          <Button
            onClick={handleBeginInterview}
            size="lg"
            className="w-full gradient-primary text-white shadow-md hover:shadow-glow text-lg px-8 py-6"
            data-testid="button-begin-interview"
          >
            <Mic className="w-5 h-5 mr-2" />
            Begin Interview
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    </AnimatedBackground>
  );
}
