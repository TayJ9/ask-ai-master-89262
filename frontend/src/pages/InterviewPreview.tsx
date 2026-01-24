/**
 * Interview UI Preview Page
 * Shows the interview interface without requiring authentication or starting a real interview
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Volume2, Loader2, User, Headphones, ArrowLeft, Volume1, VolumeX } from "lucide-react";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import AudioVisualizer from "@/components/ui/AudioVisualizer";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useAmbientSound } from "@/hooks/useAmbientSound";
import { Slider } from "@/components/ui/slider";

type ConversationMode = 'idle' | 'ai_speaking' | 'listening' | 'user_speaking' | 'processing';

export default function InterviewPreview() {
  const [, setLocation] = useLocation();
  const [conversationMode, setConversationMode] = useState<ConversationMode>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.3);
  
  // Manual volume controls for testing
  const [manualInputVolume, setManualInputVolume] = useState(0.7);
  const [manualOutputVolume, setManualOutputVolume] = useState(0.8);

  const isAiSpeaking = conversationMode === 'ai_speaking';
  
  // Ambient sound hook
  const { isLoaded: soundsLoaded, setVolume } = useAmbientSound(conversationMode, {
    enabled: soundEnabled,
    volume: soundVolume
  });

  const handleModeChange = (mode: ConversationMode) => {
    setConversationMode(mode);
    if (mode !== 'idle') {
      setIsConnected(true);
    }
  };

  return (
    <AnimatedBackground className="p-6 min-h-screen flex items-center justify-center">
      <div className="max-w-6xl mx-auto w-full">
        <Card className="shadow-2xl border-2 border-primary/20 bg-white/90 backdrop-blur-md">
          <CardContent className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold">Voice Interview Preview</h2>
                <p className="text-muted-foreground">
                  Computer Science • Junior
                </p>
              </div>
              <div className="flex items-center gap-4">
                {/* Connection Status Indicator */}
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                  isConnected 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    isConnected 
                      ? 'bg-green-500 animate-pulse' 
                      : 'bg-gray-400'
                  }`} />
                  {isConnected ? 'Connected' : 'Disconnected'}
                </div>
                
                {/* Sound Toggle Button */}
                <Button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  variant={soundEnabled ? "default" : "outline"}
                  size="sm"
                  title={soundEnabled ? "Ambient sound enabled - click to disable" : "Ambient sound disabled - click to enable"}
                >
                  {soundEnabled ? (
                    <Volume1 className="w-4 h-4" />
                  ) : (
                    <VolumeX className="w-4 h-4" />
                  )}
                </Button>
                
                <Button
                  onClick={() => setLocation('/')}
                  variant="outline"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>

            {/* Mode Selector (for preview only) */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-3">Preview Mode Selector:</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={conversationMode === 'idle' ? 'default' : 'outline'}
                  onClick={() => handleModeChange('idle')}
                >
                  Idle
                </Button>
                <Button
                  size="sm"
                  variant={conversationMode === 'listening' ? 'default' : 'outline'}
                  onClick={() => handleModeChange('listening')}
                >
                  Listening
                </Button>
                <Button
                  size="sm"
                  variant={conversationMode === 'user_speaking' ? 'default' : 'outline'}
                  onClick={() => handleModeChange('user_speaking')}
                >
                  User Speaking
                </Button>
                <Button
                  size="sm"
                  variant={conversationMode === 'ai_speaking' ? 'default' : 'outline'}
                  onClick={() => handleModeChange('ai_speaking')}
                >
                  AI Speaking
                </Button>
                <Button
                  size="sm"
                  variant={conversationMode === 'processing' ? 'default' : 'outline'}
                  onClick={() => handleModeChange('processing')}
                >
                  Processing
                </Button>
              </div>
            </div>

            {/* Idle State - Show Start Interview Button */}
            {conversationMode === 'idle' ? (
              <motion.div 
                className="flex flex-col items-center justify-center py-12"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <motion.div 
                  className="text-center mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <h3 className="text-xl font-semibold mb-2">Ready to Begin</h3>
                  <p className="text-muted-foreground max-w-md">
                    Click the button below to start your voice interview. 
                    You'll be asked to allow microphone access.
                  </p>
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    onClick={() => handleModeChange('listening')}
                    size="lg"
                    className="w-48 h-48 rounded-full text-xl font-bold shadow-2xl bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Mic className="w-12 h-12" />
                      <span>Start Interview</span>
                    </div>
                  </Button>
                </motion.div>
                
                <motion.p 
                  className="text-xs text-muted-foreground mt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                >
                  Make sure you're in a quiet environment
                </motion.p>
              </motion.div>
            ) : (
              <>
                {/* Status Indicator - Clear visual feedback for each state */}
                <motion.div 
                  className="text-center mb-6"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  {!isConnected ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <div className="w-3 h-3 bg-muted-foreground rounded-full" />
                      <span className="font-medium">Not connected</span>
                    </div>
                  ) : isAiSpeaking ? (
                    <div className="flex items-center justify-center gap-2 text-blue-600">
                      <div className="flex items-center justify-center">
                        <div className="w-5 h-5 bg-blue-600 rounded-full animate-pulse" />
                      </div>
                      <span className="font-medium text-lg">AI is speaking...</span>
                    </div>
                  ) : conversationMode === 'user_speaking' ? (
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <User className="w-5 h-5 animate-pulse" />
                      <span className="font-medium text-lg">You are speaking...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-amber-600">
                      <Headphones className="w-5 h-5" />
                      <span className="font-medium text-lg">Listening... Speak when ready</span>
                    </div>
                  )}
                </motion.div>

                {/* Volume Control Sliders for Testing */}
                <motion.div 
                  className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg max-w-md mx-auto"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  <p className="text-sm font-medium text-purple-900 mb-3">🎛️ Test Audio Reactivity:</p>
                  
                  {/* User Input Volume */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-purple-700">
                        User Voice Volume
                      </label>
                      <span className="text-xs text-purple-600 font-mono">
                        {Math.round(manualInputVolume * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[manualInputVolume * 100]}
                      onValueChange={(value) => setManualInputVolume(value[0] / 100)}
                      min={0}
                      max={100}
                      step={1}
                      className="cursor-pointer"
                    />
                  </div>

                  {/* AI Output Volume */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-purple-700">
                        AI Voice Volume
                      </label>
                      <span className="text-xs text-purple-600 font-mono">
                        {Math.round(manualOutputVolume * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[manualOutputVolume * 100]}
                      onValueChange={(value) => setManualOutputVolume(value[0] / 100)}
                      min={0}
                      max={100}
                      step={1}
                      className="cursor-pointer"
                    />
                  </div>

                  <p className="text-xs text-purple-600 mt-3 text-center">
                    Adjust sliders to see how the blob reacts to different audio levels
                  </p>
                </motion.div>

                {/* Audio Visualizer */}
                <motion.div 
                  className="mb-6 flex flex-col items-center justify-center"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <AudioVisualizer
                    inputVolume={conversationMode === 'user_speaking' ? manualInputVolume : conversationMode === 'listening' ? manualInputVolume * 0.4 : 0}
                    outputVolume={conversationMode === 'ai_speaking' ? manualOutputVolume : 0}
                    mode={conversationMode === 'idle' ? 'listening' : conversationMode}
                  />
                </motion.div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AnimatedBackground>
  );
}
