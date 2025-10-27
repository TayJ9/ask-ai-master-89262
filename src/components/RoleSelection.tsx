import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Package, TrendingUp, ArrowRight, Bot } from "lucide-react";
import AICoach from "@/components/AICoach";

const roles = [
  {
    id: "software-engineer",
    title: "Software Engineer",
    description: "Practice technical interviews and coding discussions",
    icon: Briefcase,
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    id: "product-manager",
    title: "Product Manager",
    description: "Master product strategy and prioritization questions",
    icon: Package,
    gradient: "from-purple-500 to-pink-500",
  },
  {
    id: "marketing",
    title: "Marketing",
    description: "Prepare for marketing strategy and campaign discussions",
    icon: TrendingUp,
    gradient: "from-orange-500 to-red-500",
  },
];

interface RoleSelectionProps {
  onSelectRole: (role: string, difficulty: string) => void;
}

export default function RoleSelection({ onSelectRole }: RoleSelectionProps) {
  const [showCoach, setShowCoach] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("");
  // Track difficulty per role - using an object to store difficulty for each role
  const [difficulties, setDifficulties] = useState<Record<string, string>>({
    "software-engineer": "medium",
    "product-manager": "medium",
    "marketing": "medium",
  });

  return (
    <div className="min-h-screen p-6 gradient-secondary">
      <div className="max-w-6xl mx-auto space-y-8 animate-scale-in">
        <div className="text-center space-y-3">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Choose Your Role
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Select the role you want to practice for and start improving your interview skills
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {roles.map((role, index) => {
            const Icon = role.icon;
            return (
              <Card
                key={role.id}
                className="hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer group"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardHeader className="space-y-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${role.gradient} flex items-center justify-center shadow-lg group-hover:shadow-glow transition-all`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">{role.title}</CardTitle>
                    <CardDescription className="text-base mt-2">
                      {role.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Difficulty Level</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setDifficulties(prev => ({ ...prev, [role.id]: "easy" }))}
                        className={`px-3 py-2 rounded-md text-sm transition-all ${
                          difficulties[role.id] === "easy"
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "bg-muted hover:bg-muted/80"
                        }`}
                      >
                        Easy
                      </button>
                      <button
                        onClick={() => setDifficulties(prev => ({ ...prev, [role.id]: "medium" }))}
                        className={`px-3 py-2 rounded-md text-sm transition-all ${
                          difficulties[role.id] === "medium"
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "bg-muted hover:bg-muted/80"
                        }`}
                      >
                        Medium
                      </button>
                      <button
                        onClick={() => setDifficulties(prev => ({ ...prev, [role.id]: "hard" }))}
                        className={`px-3 py-2 rounded-md text-sm transition-all ${
                          difficulties[role.id] === "hard"
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "bg-muted hover:bg-muted/80"
                        }`}
                      >
                        Hard
                      </button>
                    </div>
                  </div>
                  <Button
                    onClick={() => onSelectRole(role.id, difficulties[role.id])}
                    className="w-full gradient-primary text-white shadow-md hover:shadow-glow"
                    data-testid={`button-select-${role.id}`}
                  >
                    Start Practice
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedRole(role.id);
                      setShowCoach(true);
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <Bot className="w-4 h-4 mr-2" />
                    Ask Coach
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* AI Coach */}
        {showCoach && (
          <div className="mt-8">
            <AICoach role={selectedRole} />
          </div>
        )}
      </div>
    </div>
  );
}
