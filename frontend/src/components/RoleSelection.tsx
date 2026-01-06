import { Button } from "@/components/ui/button";
import { ArrowRight, Mic } from "lucide-react";
import AnimatedBackground from "@/components/ui/AnimatedBackground";

interface RoleSelectionProps {
  onSelectRole: (role: string, mode?: "text" | "voice") => void;
}

export default function RoleSelection({ onSelectRole }: RoleSelectionProps) {
  const handleBeginInterview = () => {
    console.log('Begin Interview clicked: software-engineer, voice');
    onSelectRole("software-engineer", "voice");
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

        <Button
          onClick={handleBeginInterview}
          size="lg"
          className="gradient-primary text-white shadow-md hover:shadow-glow text-lg px-8 py-6"
          data-testid="button-begin-interview"
        >
          <Mic className="w-5 h-5 mr-2" />
          Begin Interview
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </AnimatedBackground>
  );
}
