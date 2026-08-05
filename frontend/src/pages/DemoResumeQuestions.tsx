/**

 * Portfolio demo — resume-aware interview questions (mock, no API).

 * Shows how Mockly tailors questions to each candidate's background.

 */



import { useCallback, useEffect, useRef, useState } from "react";
import { useTypewriter } from "@/hooks/useTypewriter";

import { motion, AnimatePresence } from "framer-motion";

import {

  ChevronLeft,

  ChevronRight,

  FileText,

  Loader2,

  Sparkles,

} from "lucide-react";

import { Button } from "@/components/ui/button";

import { Card, CardContent } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import InterviewRoomBackground, {

  interviewRoomCardClassName,

  interviewRoomInsetPanelClassName,

} from "@/components/ui/InterviewRoomBackground";

import ChatGPTVoiceOrb from "@/components/ui/ChatGPTVoiceOrb";

import DemoBanner from "@/components/demo/DemoBanner";
import DemoResumeViewer from "@/components/demo/DemoResumeViewer";

import {

  demoResumes,

  getNextQuestion,

  type DemoResumeId,

} from "@/mocks/demoResumes";

import { isPublicDemoMode } from "@/lib/demoMode";

import { usePageMeta } from "@/hooks/usePageMeta";

import { useQuestionPlayback } from "@/hooks/useDemoQuestionAudio";



type RevealPhase = "idle" | "thinking" | "speaking" | "done";



const THINKING_DELAY_MS = 450;

const DEFAULT_TYPEWRITER_MS = 22;



export default function DemoResumeQuestions() {

  const publicDemo = isPublicDemoMode();

  const [resumeIndex, setResumeIndex] = useState(0);

  const [usedQuestions, setUsedQuestions] = useState<Set<number>>(() => new Set());

  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);

  const [currentAudioSrc, setCurrentAudioSrc] = useState<string | null>(null);

  const [phase, setPhase] = useState<RevealPhase>("idle");

  const [typewriterMs, setTypewriterMs] = useState(DEFAULT_TYPEWRITER_MS);

  const thinkingTimerRef = useRef<number | null>(null);
  const playbackQuestionRef = useRef("");



  const profile = demoResumes[resumeIndex];

  const resumeId = profile.id as DemoResumeId;



  usePageMeta({

    title: "Mockly Demo — Resume-Aware Questions",

    description:

      "See how Mockly generates tailored interview questions from a candidate's resume — no sign-in or API keys required.",

    imagePath: "/demo/interview-ui.webp",

  });



  const handlePlaybackEnded = useCallback(() => setPhase("done"), []);



  const handlePlaybackDuration = useCallback((seconds: number) => {
    const len = playbackQuestionRef.current.length;
    if (!len) return;
    setTypewriterMs(Math.max(14, Math.min(40, (seconds * 1000) / len)));
  }, []);



  const { outputVolume: orbOutputVolume } = useQuestionPlayback({

    audioSrc: currentAudioSrc,

    enabled: phase === "speaking",

    onEnded: handlePlaybackEnded,

    onDuration: handlePlaybackDuration,

  });



  const { displayed: typedQuestion, isComplete: typewriterDone } = useTypewriter(

    currentQuestion ?? "",

    phase === "speaking",

    typewriterMs,

  );



  const clearThinkingTimer = useCallback(() => {

    if (thinkingTimerRef.current !== null) {

      window.clearTimeout(thinkingTimerRef.current);

      thinkingTimerRef.current = null;

    }

  }, []);



  useEffect(() => () => clearThinkingTimer(), [clearThinkingTimer]);



  const stopAndClearQuestion = useCallback(() => {

    clearThinkingTimer();

    setCurrentQuestion(null);

    setCurrentAudioSrc(null);

    setPhase("idle");

    setTypewriterMs(DEFAULT_TYPEWRITER_MS);

  }, [clearThinkingTimer]);



  const handleResumeChange = (nextIndex: number) => {

    clearThinkingTimer();

    stopAndClearQuestion();

    setResumeIndex(nextIndex);

    setUsedQuestions(new Set());

  };



  const cycleResume = (direction: -1 | 1) => {

    const next = (resumeIndex + direction + demoResumes.length) % demoResumes.length;

    handleResumeChange(next);

  };



  const handleAskQuestion = () => {

    if (phase === "thinking" || phase === "speaking") return;



    clearThinkingTimer();

    setPhase("thinking");



    thinkingTimerRef.current = window.setTimeout(() => {

      const working = new Set(usedQuestions);

      const next = getNextQuestion(resumeId, working);

      if (!next) {

        setPhase(currentQuestion ? "done" : "idle");

        return;

      }

      working.add(next.index);

      setUsedQuestions(working);

      playbackQuestionRef.current = next.question;

      setCurrentQuestion(next.question);

      setCurrentAudioSrc(next.audioSrc);

      setTypewriterMs(DEFAULT_TYPEWRITER_MS);

      setPhase("speaking");

      thinkingTimerRef.current = null;

    }, THINKING_DELAY_MS);

  };



  const orbMode =

    phase === "thinking"

      ? "processing"

      : phase === "speaking" || phase === "done"

        ? "ai_speaking"

        : "listening";



  const isBusy = phase === "thinking" || phase === "speaking";

  const showQuestion = currentQuestion !== null;



  return (

    <InterviewRoomBackground

      className={`flex min-h-screen flex-col items-center px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 ${

        publicDemo

          ? "pt-[max(3.75rem,calc(env(safe-area-inset-top)+3.25rem))] sm:pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))]"

          : "pt-2 sm:pt-4"

      }`}

    >

      {publicDemo && <DemoBanner className="fixed inset-x-0 top-0 z-[100]" />}



      <div className="w-full max-w-3xl space-y-4">

        <Card className={interviewRoomCardClassName}>

          <CardContent className="p-5 sm:p-6">

            <div className="mb-5 space-y-1">

              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">

                {publicDemo ? "Portfolio demo" : "Preview"}

              </p>

              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">

                Resume-aware questions

              </h1>

              <p className="text-sm text-muted-foreground">

                Mockly reads each candidate&apos;s background and asks tailored interview questions.

              </p>

            </div>



            <div className={`mb-5 p-4 ${interviewRoomInsetPanelClassName}`}>

              <div className="mb-3 flex items-center justify-between gap-2">

                <p className="text-sm font-medium text-neutral-800">Sample resume</p>

                <div className="flex items-center gap-1">

                  <Button

                    variant="outline"

                    size="icon"

                    className="h-8 w-8"

                    onClick={() => cycleResume(-1)}

                    disabled={isBusy}

                    aria-label="Previous resume"

                  >

                    <ChevronLeft className="h-4 w-4" />

                  </Button>

                  <Button

                    variant="outline"

                    size="icon"

                    className="h-8 w-8"

                    onClick={() => cycleResume(1)}

                    disabled={isBusy}

                    aria-label="Next resume"

                  >

                    <ChevronRight className="h-4 w-4" />

                  </Button>

                </div>

              </div>



              <AnimatePresence mode="wait">

                <motion.div

                  key={profile.id}

                  initial={{ opacity: 0, y: 6 }}

                  animate={{ opacity: 1, y: 0 }}

                  exit={{ opacity: 0, y: -6 }}

                  transition={{ duration: 0.25 }}

                  className="space-y-3"

                >

                  <div className="flex flex-wrap items-center gap-2">

                    <FileText className="h-4 w-4 text-primary" aria-hidden />

                    <span className="font-semibold text-foreground">{profile.name}</span>

                    <Badge variant="outline" className="text-xs">

                      {profile.major}

                    </Badge>

                    <Badge variant="secondary" className="text-xs">

                      {profile.year}

                    </Badge>

                  </div>

                  <p className="text-sm text-muted-foreground">{profile.tagline}</p>

                  <ul className="space-y-1.5 text-sm text-neutral-700">

                    {profile.highlights.map((item) => (

                      <li key={item} className="flex gap-2">

                        <Sparkles

                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70"

                          aria-hidden

                        />

                        <span>{item}</span>

                      </li>

                    ))}

                  </ul>

                  <DemoResumeViewer
                    resumeId={profile.id}
                    name={profile.name}
                    disabled={isBusy}
                  />

                </motion.div>

              </AnimatePresence>



              <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-200/50 pt-3">

                {demoResumes.map((r, i) => (

                  <Button

                    key={r.id}

                    size="sm"

                    variant={i === resumeIndex ? "default" : "outline"}

                    className="h-8 text-xs"

                    onClick={() => handleResumeChange(i)}

                    disabled={isBusy}

                  >

                    {r.name.split(" ")[0]}

                  </Button>

                ))}

              </div>

            </div>



            <div className="flex flex-col items-center">

              <motion.div className="mb-4 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

                {phase === "thinking" ? (

                  <div className="flex items-center justify-center gap-2 text-muted-foreground">

                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />

                    <span className="font-medium">Generating question…</span>

                  </div>

                ) : phase === "speaking" ? (

                  <div className="flex items-center justify-center gap-2 text-blue-600">

                    <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600" aria-hidden />

                    <span className="font-medium">AI is asking…</span>

                  </div>

                ) : phase === "done" ? (

                  <p className="text-sm font-medium text-muted-foreground">Question complete</p>

                ) : (

                  <p className="text-sm text-muted-foreground">

                    Click below to hear a tailored question for {profile.name.split(" ")[0]}

                  </p>

                )}

              </motion.div>



              <div className="origin-center scale-[0.82] sm:scale-100">

                <ChatGPTVoiceOrb

                  mode={orbMode}

                  outputVolume={

                    phase === "speaking"

                      ? orbOutputVolume

                      : phase === "done"

                        ? 0.2

                        : 0

                  }

                  inputVolume={orbMode === "processing" ? 0.3 : 0}

                  size={260}

                />

              </div>



              <AnimatePresence mode="wait">

                {showQuestion && (

                  <motion.div

                    key={currentQuestion}

                    initial={{ opacity: 0, y: 10 }}

                    animate={{ opacity: 1, y: 0 }}

                    exit={{ opacity: 0, y: -8 }}

                    transition={{ duration: 0.35 }}

                    className={`mt-5 w-full p-4 ${interviewRoomInsetPanelClassName} ${

                      phase === "thinking" ? "opacity-80" : ""

                    }`}

                    aria-live="polite"

                  >

                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">

                      Interview question

                    </p>

                    <p className="mt-2 text-base leading-relaxed text-foreground sm:text-lg">

                      {phase === "speaking" ? typedQuestion : currentQuestion}

                      {phase === "speaking" && !typewriterDone && (

                        <span className="ml-0.5 inline-block h-[1.1em] w-0.5 animate-pulse bg-primary align-text-bottom" />

                      )}

                    </p>

                  </motion.div>

                )}

              </AnimatePresence>



              <div className="mt-6 flex flex-wrap justify-center gap-3 pb-1">

                <Button size="lg" className="gap-2" onClick={handleAskQuestion} disabled={isBusy}>

                  {phase === "thinking" ? (

                    <>

                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />

                      Thinking…

                    </>

                  ) : (

                    <>

                      <Sparkles className="h-4 w-4" aria-hidden />

                      Ask a question

                    </>

                  )}

                </Button>

                {showQuestion && !isBusy && (

                  <Button variant="outline" size="lg" onClick={stopAndClearQuestion}>

                    Clear

                  </Button>

                )}

              </div>

            </div>

          </CardContent>

        </Card>



        <p className="text-center text-xs text-muted-foreground">

          Pre-recorded demo voice — the full app generates fresh questions from your uploaded resume.

        </p>

      </div>

    </InterviewRoomBackground>

  );

}


