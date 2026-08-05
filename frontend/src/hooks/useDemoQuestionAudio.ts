import { useEffect, useRef, useState } from "react";

type UseQuestionPlaybackOptions = {
  audioSrc: string | null;
  enabled: boolean;
  onEnded?: () => void;
  onDuration?: (seconds: number) => void;
};

/**
 * Plays demo question MP3s and exposes analyser-driven volume for the voice orb.
 */
export function useQuestionPlayback({
  audioSrc,
  enabled,
  onEnded,
  onDuration,
}: UseQuestionPlaybackOptions) {
  const [outputVolume, setOutputVolume] = useState(0);
  const onEndedRef = useRef(onEnded);
  const onDurationRef = useRef(onDuration);
  onEndedRef.current = onEnded;
  onDurationRef.current = onDuration;

  useEffect(() => {
    if (!enabled || !audioSrc) {
      setOutputVolume(0);
      return;
    }

    const audio = new Audio(audioSrc);
    let ctx: AudioContext | null = null;
    let raf: number | null = null;
    let cancelled = false;

    const stopLoop = () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    };

    const run = async () => {
      try {
        ctx = new AudioContext();
        await ctx.resume();
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyser.connect(ctx.destination);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) sum += freqData[i];
          const avg = sum / freqData.length / 255;
          setOutputVolume(Math.min(1, avg * 2.4 + 0.12));
          raf = requestAnimationFrame(tick);
        };

        audio.addEventListener("loadedmetadata", () => {
          if (Number.isFinite(audio.duration)) {
            onDurationRef.current?.(audio.duration);
          }
        });
        audio.addEventListener("ended", () => {
          stopLoop();
          setOutputVolume(0);
          onEndedRef.current?.();
        });

        await audio.play();
        tick();
      } catch {
        setOutputVolume(0.75);
        onDurationRef.current?.(8);
        window.setTimeout(() => {
          if (!cancelled) onEndedRef.current?.();
        }, 8000);
      }
    };

    void run();

    return () => {
      cancelled = true;
      stopLoop();
      audio.pause();
      audio.src = "";
      setOutputVolume(0);
      if (ctx) void ctx.close();
    };
  }, [enabled, audioSrc]);

  return { outputVolume };
}
