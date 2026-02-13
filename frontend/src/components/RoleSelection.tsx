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
    <AnimatedBackground className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-4xl mx-auto space-y-10 animate-scale-in flex flex-col items-center justify-center w-full py-12">
        {/* PERF: Entrance uses opacity + y only; no blur here to reduce repaint cost. */}
        <motion.div 
          className="text-center space-y-4 bg-white/70 px-8 py-6 rounded-2xl shadow-lg border border-white/30"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.33, 1, 0.68, 1] }}
        >
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Start Your Interview
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Practice your interview skills with our AI-powered voice interview platform
          </p>
        </motion.div>

        {/* PERF: One card with backdrop-blur; smaller shadow to reduce paint cost. */}
        <motion.div 
          className="w-full max-w-xl space-y-4 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-white/40 shadow-xl"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2, ease: [0.33, 1, 0.68, 1] }}
        >
          {/* PERF: Removed JS-driven blur glow and Mic scale loop; use CSS-only subtle pulse. */}
          <div className="relative">
            <Button
              onClick={handleBeginInterview}
              size="lg"
              className="relative w-full gradient-primary text-white shadow-md hover:shadow-glow text-lg px-8 py-6 hover:scale-[1.02] transition-transform duration-[400ms]"
              data-testid="button-begin-interview"
            >
              <span className="btn-pulse-hero inline-flex">
                <Mic className="w-5 h-5 mr-2" />
              </span>
              Begin Interview
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>

          {/* Enhanced Divider */}
          <div className="relative py-4">
            <motion.div 
              className="absolute inset-0 flex items-center"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1, delay: 0.8 }}
            >
              <div className="w-full h-px bg-gradient-to-r from-transparent via-purple-300 to-transparent"></div>
            </motion.div>
            <div className="relative flex justify-center">
              <span className="px-4 py-1 bg-gradient-to-r from-purple-50 to-blue-50 text-gray-600 text-sm rounded-full shadow-sm border border-purple-100">
                Or
              </span>
            </div>
          </div>

          {/* Quick Demo: Tech and Business options */}
          <div className="flex flex-row gap-3 w-full">
            <Button
              onClick={() => handleTryDemo('tech')}
              size="lg"
              variant="outline"
              className="relative flex-1 min-w-0 border-2 border-purple-500 text-purple-700 hover:bg-purple-50 hover:border-purple-600 hover:text-purple-700 shadow-md hover:shadow-lg text-sm sm:text-base px-4 sm:px-6 py-5 transition-transform duration-300 overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
              <span className="inline-flex items-center gap-0">
                <span className="inline-flex items-center gap-x-1">
                  <Zap className="w-5 h-5 shrink-0" />
                  Technical
                </span>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
                  Instant
                </span>
              </span>
            </Button>
            <Button
              onClick={() => handleTryDemo('business')}
              size="lg"
              variant="outline"
              className="relative flex-1 min-w-0 border-2 border-teal-500 text-teal-700 hover:bg-teal-50 hover:border-teal-600 hover:text-teal-700 shadow-md hover:shadow-lg text-sm sm:text-base px-4 sm:px-6 py-5 transition-transform duration-300 overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
              <span className="inline-flex items-center gap-0">
                <span className="inline-flex items-center gap-x-1">
                  <Zap className="w-5 h-5 shrink-0" />
                  Non-Tech
                </span>
                <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
                  Instant
                </span>
              </span>
            </Button>
          </div>
          <p 
            className="text-xs text-center text-gray-700 font-medium"
            style={{
              textShadow: '0 1px 2px rgba(255, 255, 255, 0.8)',
            }}
          >
            See sample results—Technical (engineering) or Non-Technical (marketing, business)
          </p>
        </motion.div>

        {/* PERF: CSS hover scale instead of Framer spring; no backdrop-blur, simpler shadow. */}
        <motion.div 
          className="flex flex-wrap justify-center gap-3 w-full max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9, ease: "easeOut" }}
        >
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-white/95 px-4 py-2 rounded-full shadow-md border border-gray-300/60 hover:shadow-lg hover:border-orange-400/40 hover:scale-105 transition-transform duration-200 group"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 group-hover:from-orange-200 group-hover:to-amber-200 transition-colors duration-200 shadow-sm">
                <feature.icon className="w-4 h-4 text-orange-600 group-hover:scale-110 transition-transform duration-200" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900">{feature.title}</span>
                <span className="text-xs text-gray-600 font-medium">{feature.description}</span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </AnimatedBackground>
  );
}

export default memo(RoleSelection);
