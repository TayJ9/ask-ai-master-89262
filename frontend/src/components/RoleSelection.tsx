/**
 * PERF SUMMARY:
 * - Replace looping Framer Motion with CSS keyframes (transform/opacity only).
 * - Reduce backdrop-blur to one card; use solid/semi-opaque elsewhere.
 * - Replace feature card whileHover with CSS transition; simplify shadows.
 */
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Mic, Zap, MessageSquare, BarChart3, Clock } from "lucide-react";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

interface RoleSelectionProps {
  onSelectRole: (role: string, mode?: "text" | "voice") => void;
}

function RoleSelection({ onSelectRole }: RoleSelectionProps) {
  const [, setLocation] = useLocation();

  const handleBeginInterview = () => {
    // Role/major will be captured during resume upload
    console.log('Begin Interview clicked: General Interview voice');
    onSelectRole("General Interview", "voice");
  };

  const handleTryDemo = (variant: 'tech' | 'business' = 'tech') => {
    setLocation(`/results?mock=true&interviewId=demo&demo=${variant}`);
  };

  const features = [
    {
      icon: MessageSquare,
      title: "Voice-Powered AI",
      description: "Natural conversation with advanced AI"
    },
    {
      icon: BarChart3,
      title: "Instant Feedback",
      description: "Detailed analysis of your performance"
    },
    {
      icon: Clock,
      title: "Practice Anytime",
      description: "Available 24/7 at your convenience"
    }
  ];

  return (
    <AnimatedBackground className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="animate-scale-in flex w-full max-w-3xl flex-col items-center justify-center gap-8 py-10 sm:py-14">
        <motion.div
          className="w-full space-y-4 text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.33, 1, 0.68, 1] }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            For students &amp; new grads
          </p>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            The voice interview that feels{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              real
            </span>
          </h1>
          <p className="text-balance text-lg text-muted-foreground sm:text-xl">
            One focused session, tailored feedback, and a scorecard you can share with coaches or mentors.
          </p>
        </motion.div>

        <motion.div
          className="w-full max-w-lg space-y-5 rounded-2xl border border-white/70 bg-card/95 p-6 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200/70 backdrop-blur-sm sm:p-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12, ease: [0.33, 1, 0.68, 1] }}
        >
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="text-base font-semibold text-foreground">Start a session</h2>
            <p className="text-sm text-muted-foreground">
              We&apos;ll ask for a resume next so the AI can anchor questions to your background.
            </p>
          </div>
          <div className="relative">
            <Button
              onClick={handleBeginInterview}
              size="lg"
              className="btn-pulse-hero !inline-flex w-full !gap-0 items-center justify-evenly bg-primary px-2 py-6 text-base font-semibold text-primary-foreground shadow-md transition-transform duration-500 ease-out hover:scale-[1.01] hover:bg-primary/90 sm:px-4"
              data-testid="button-begin-interview"
            >
              <Mic className="h-5 w-5 shrink-0" aria-hidden />
              <span className="min-w-0 text-center leading-tight">Begin interview</span>
              <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
            </Button>
          </div>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 py-0.5 text-muted-foreground">or preview a report</span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:gap-3">
            <Button
              onClick={() => handleTryDemo("tech")}
              size="lg"
              variant="outline"
              className="!inline-flex h-auto min-h-[3.25rem] w-full flex-1 items-center justify-center !gap-2 border-primary/20 px-3 py-4 text-foreground sm:min-w-0"
            >
              <span className="inline-flex min-w-0 items-center justify-center gap-1 text-sm font-medium">
                <Zap className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 truncate">Technical</span>
              </span>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sample
              </span>
            </Button>
            <Button
              onClick={() => handleTryDemo("business")}
              size="lg"
              variant="outline"
              className="!inline-flex h-auto min-h-[3.25rem] w-full flex-1 items-center justify-center !gap-2 border-secondary/25 px-3 py-4 text-foreground sm:min-w-0"
            >
              <span className="inline-flex min-w-0 items-center justify-center gap-1 text-sm font-medium">
                <Zap className="h-4 w-4 shrink-0 text-secondary" aria-hidden />
                <span className="min-w-0 truncate">Non-technical</span>
              </span>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sample
              </span>
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Opens a read-only results demo—no audio, perfect for a quick product walkthrough.
          </p>
        </motion.div>

        {/* PERF: CSS hover scale instead of Framer spring; no backdrop-blur, simpler shadow. */}
        <motion.div
          className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35, ease: "easeOut" }}
        >
          {features.map((feature, index) => (
            <div
              key={index}
              className="group flex items-start gap-3 rounded-xl border border-white/70 bg-card/90 px-4 py-3 shadow-md shadow-slate-900/5 ring-1 ring-slate-200/60 transition-all duration-500 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:border-primary/25 hover:bg-card/95 hover:shadow-xl hover:shadow-slate-900/10"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
                <feature.icon className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 text-left">
                <span className="block text-sm font-semibold text-foreground">{feature.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {feature.description}
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </AnimatedBackground>
  );
}

export default memo(RoleSelection);
