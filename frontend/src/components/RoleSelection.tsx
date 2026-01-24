import { Button } from "@/components/ui/button";
import { ArrowRight, Mic, Zap, MessageSquare, BarChart3, Clock } from "lucide-react";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

interface RoleSelectionProps {
  onSelectRole: (role: string, mode?: "text" | "voice") => void;
}

export default function RoleSelection({ onSelectRole }: RoleSelectionProps) {
  const [, setLocation] = useLocation();

  const handleBeginInterview = () => {
    // Role/major will be captured during resume upload
    console.log('Begin Interview clicked: General Interview voice');
    onSelectRole("General Interview", "voice");
  };

  const handleTryDemo = () => {
    // Instantly navigate to results with mock data
    setLocation('/results?mock=true&interviewId=demo&demo=true');
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
        {/* Heading with entrance animation */}
        <motion.div 
          className="text-center space-y-4 bg-white/60 backdrop-blur-sm px-8 py-6 rounded-2xl shadow-lg border border-white/30"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Start Your Interview
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Practice your interview skills with our AI-powered voice interview system
          </p>
        </motion.div>

        {/* Buttons Section with Enhanced Card Background */}
        <motion.div 
          className="w-full max-w-md space-y-4 bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-white/40"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
          style={{
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2), 0 0 40px rgba(255, 255, 255, 0.3)',
          }}
        >
          {/* Begin Interview Button with Pulsing Animation */}
          <div className="relative">
            <motion.div
              className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary to-secondary opacity-75 blur-xl"
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.5, 0.7, 0.5]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <Button
              onClick={handleBeginInterview}
              size="lg"
              className="relative w-full gradient-primary text-white shadow-md hover:shadow-glow text-lg px-8 py-6 hover:scale-105 transition-all duration-300"
              data-testid="button-begin-interview"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <Mic className="w-5 h-5 mr-2" />
              </motion.div>
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
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              <div className="w-full h-px bg-gradient-to-r from-transparent via-purple-300 to-transparent"></div>
            </motion.div>
            <div className="relative flex justify-center">
              <span className="px-4 py-1 bg-gradient-to-r from-purple-50 to-blue-50 text-gray-600 text-sm rounded-full shadow-sm border border-purple-100">
                Or
              </span>
            </div>
          </div>

          {/* Demo Button with Shimmer Effect */}
          <Button
            onClick={handleTryDemo}
            size="lg"
            variant="outline"
            className="relative w-full border-2 border-purple-500 text-purple-700 hover:bg-purple-50 hover:border-purple-600 hover:text-purple-700 shadow-md hover:shadow-lg text-lg px-8 py-6 transition-all duration-300 overflow-hidden group"
          >
            {/* Shimmer effect overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Zap className="w-5 h-5 mr-2" />
            </motion.div>
            Try Quick Demo
            <motion.span 
              className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold relative overflow-hidden"
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(168, 85, 247, 0.4)",
                  "0 0 0 4px rgba(168, 85, 247, 0)",
                  "0 0 0 0 rgba(168, 85, 247, 0)"
                ]
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <motion.span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
              <span className="relative">Instant Results</span>
            </motion.span>
          </Button>
          <p 
            className="text-xs text-center text-gray-700 font-medium"
            style={{
              textShadow: '0 1px 2px rgba(255, 255, 255, 0.8)',
            }}
          >
            See sample results instantly without doing an interview
          </p>
        </motion.div>

        {/* Feature Cards - Compact Design */}
        <motion.div 
          className="flex flex-wrap justify-center gap-3 w-full max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              className="flex items-center gap-2 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-gray-300/60 hover:shadow-xl hover:border-orange-400/40 transition-all duration-300 group"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
              style={{
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1), 0 0 20px rgba(255, 255, 255, 0.4)',
              }}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 group-hover:from-orange-200 group-hover:to-amber-200 transition-all duration-300 shadow-sm">
                <feature.icon className="w-4 h-4 text-orange-600 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900">{feature.title}</span>
                <span className="text-xs text-gray-600 font-medium">{feature.description}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </AnimatedBackground>
  );
}
