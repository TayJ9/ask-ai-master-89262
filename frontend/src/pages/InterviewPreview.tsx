/**
 * Interview UI Preview Page
 * Shows the interview interface without requiring authentication or starting a real interview
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Loader2, User, Headphones, ArrowLeft, Volume1, VolumeX, X } from "lucide-react";
import InterviewRoomBackground, {
  interviewRoomCardClassName,
  interviewRoomInsetPanelClassName,
} from "@/components/ui/InterviewRoomBackground";
import ChatGPTVoiceOrb from "@/components/ui/ChatGPTVoiceOrb";
import DemoBanner from "@/components/demo/DemoBanner";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useAmbientSound } from "@/hooks/useAmbientSound";
import { Slider } from "@/components/ui/slider";
import { isPublicDemoMode } from "@/lib/demoMode";

type ConversationMode = 'idle' | 'ai_speaking' | 'listening' | 'user_speaking' | 'processing';

export default function InterviewPreview() {
  const [, setLocation] = useLocation();
  const publicDemo = isPublicDemoMode();
  const [conversationMode, setConversationMode] = useState<ConversationMode>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.3);
  
  // Manual volume controls for testing
  const [manualInputVolume, setManualInputVolume] = useState(0.7);
  const [manualOutputVolume, setManualOutputVolume] = useState(0.8);

  const isAiSpeaking = conversationMode === 'ai_speaking';
  
  const { setVolume: setAmbientElementVolume } = useAmbientSound(conversationMode, {
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
    <InterviewRoomBackground
      className={`flex min-h-screen flex-col items-center px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 ${
        publicDemo
          ? "pt-[max(3.75rem,calc(env(safe-area-inset-top)+3.25rem))] sm:pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))]"
          : "pt-2 sm:pt-4"
      }`}
    >
      {publicDemo && <DemoBanner className="fixed inset-x-0 top-0 z-[100]" />}
      <div className="w-full max-w-3xl">
        <Card className={interviewRoomCardClassName}>
          <CardContent className="p-5 sm:p-6">
            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {publicDemo ? "Portfolio demo" : "Preview"}
                </p>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Voice Interview Preview</h2>
                <p className="text-sm text-muted-foreground sm:text-base">
                  Computer Science <span className="text-border">·</span> Junior
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:max-w-[min(100%,20rem)] sm:justify-end">
                <Badge
                  variant="outline"
                  className={
                    isConnected
                      ? "border-emerald-500/40 bg-emerald-50 text-emerald-800"
                      : "border-border bg-muted/60 text-muted-foreground"
                  }
                >
                  <span
                    className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                      isConnected ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/50"
                    }`}
                    aria-hidden
                  />
                  {isConnected ? "Connected" : "Disconnected"}
                </Badge>

                <Button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  variant={soundEnabled ? "default" : "outline"}
                  size="sm"
                  className="shrink-0"
                  title={
                    soundEnabled
                      ? "Ambient sound enabled - click to disable"
                      : "Ambient sound disabled - click to enable"
                  }
                >
                  {soundEnabled ? <Volume1 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>

                {/* Ambient volume — desktop only; too cramped on small screens */}
                <div className="hidden min-w-[140px] max-w-[180px] flex-col gap-1 md:flex">
                  <span className="text-xs text-muted-foreground">Ambient volume</span>
                  <Slider
                    value={[soundVolume * 100]}
                    onValueChange={(value) => {
                      const v = value[0] / 100;
                      setSoundVolume(v);
                      setAmbientElementVolume(v);
                    }}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!soundEnabled}
                    className="cursor-pointer"
                  />
                </div>

                {!publicDemo && (
                  <Button
                    onClick={() => setLocation("/")}
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                  >
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Back
                  </Button>
                )}
              </div>
            </div>

            {/* Mode selector — hidden in public portfolio demo */}
            {!publicDemo && (
            <div className={`mb-6 p-4 ${interviewRoomInsetPanelClassName}`}>
              <p className="text-sm font-medium text-neutral-800 mb-3">Preview mode</p>
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
            )}

            {/* Idle State - Show Start Interview Button */}
            {conversationMode === 'idle' ? (
              <motion.div 
                className="flex flex-col items-center justify-center py-8 sm:py-12"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.65, ease: "easeOut" }}
              >
                <motion.div 
                  className="text-center mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: 0.3 }}
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
                  transition={{ duration: 0.65, delay: 0.5, ease: "easeOut" }}
                  whileHover={{
                    scale: 1.05,
                    transition: { type: "tween", duration: 0.55, ease: [0.33, 1, 0.68, 1] },
                  }}
                  whileTap={{
                    scale: 0.95,
                    transition: { type: "tween", duration: 0.4, ease: [0.33, 1, 0.68, 1] },
                  }}
                >
                  <Button
                    onClick={() => handleModeChange('listening')}
                    size="lg"
                    className="h-36 w-36 rounded-full bg-gradient-to-br from-primary to-primary/80 text-lg font-bold shadow-2xl transition-all hover:from-primary/90 hover:to-primary/70 sm:h-48 sm:w-48 sm:text-xl"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Mic className="h-10 w-10 sm:h-12 sm:w-12" />
                      <span>Start Interview</span>
                    </div>
                  </Button>
                </motion.div>
                
                <motion.p 
                  className="text-xs text-muted-foreground mt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.55, delay: 0.8 }}
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
                  transition={{ duration: 0.55 }}
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
                  ) : conversationMode === 'processing' ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-medium text-lg">Processing your response...</span>
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

                {/* Volume sliders — dev/testing only; hidden in public portfolio demo */}
                {!publicDemo && (
                <motion.div 
                  className={`mb-6 max-w-md mx-auto p-4 ${interviewRoomInsetPanelClassName}`}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  <p className="text-sm font-medium text-neutral-800 mb-3">Test audio reactivity</p>
                  
                  {/* User Input Volume */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-neutral-600">
                        User voice volume
                      </label>
                      <span className="text-xs text-neutral-500 font-mono">
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
                      <label className="text-xs font-medium text-neutral-600">
                        AI voice volume
                      </label>
                      <span className="text-xs text-neutral-500 font-mono">
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

                  <p className="text-xs text-neutral-500 mt-3 text-center">
                    Adjust sliders to see how the orb reacts to different levels
                  </p>
                </motion.div>
                )}

                {/* Voice Orb Visualizer */}
                <motion.div 
                  className="mb-4 flex flex-col items-center justify-center sm:mb-6"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.55, delay: 0.3 }}
                >
                  <div className="origin-center scale-[0.82] sm:scale-100">
                    <ChatGPTVoiceOrb
                      inputVolume={conversationMode === 'user_speaking' ? manualInputVolume : conversationMode === 'listening' ? manualInputVolume * 0.4 : 0}
                      outputVolume={conversationMode === 'ai_speaking' ? manualOutputVolume : 0}
                      mode={conversationMode === 'idle' ? 'listening' : conversationMode}
                      size={280}
                    />
                  </div>
                </motion.div>

                <div className="flex justify-center pb-2">
                  <Button
                    onClick={() => {
                      handleModeChange('idle');
                      setIsConnected(false);
                    }}
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                  >
                    {publicDemo ? (
                      <>Back to start</>
                    ) : (
                      <>
                        <X className="mr-1.5 h-4 w-4" />
                        Reset preview
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </InterviewRoomBackground>
  );
}
