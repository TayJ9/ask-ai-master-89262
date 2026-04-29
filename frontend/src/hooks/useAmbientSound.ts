/**
 * Ambient Sound Hook
 * Manages background sounds for interview states (writing, typing, etc.)
 */

import { useEffect, useRef, useState } from 'react';

type SoundState = 'idle' | 'processing' | 'ai_speaking' | 'user_speaking' | 'listening';

interface AmbientSoundOptions {
  enabled?: boolean;
  volume?: number;
}

const WRITE_SOUND_URLS = ['/sounds/writing.mp3', '/sounds/writing.wav'] as const;

export function useAmbientSound(
  state: SoundState,
  options: AmbientSoundOptions = {}
) {
  const { enabled = true, volume = 0.3 } = options;

  const processingAudioRef = useRef<HTMLAudioElement | null>(null);
  const targetVolumeRef = useRef(volume);
  const [isLoaded, setIsLoaded] = useState(false);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackReloadAttemptedRef = useRef(false);

  // Debounce the stop path. `processing` can flicker for a single tick between
  // `user_transcript` → `first audio chunk` → `agent_response`, and every
  // flicker used to trigger fadeOut → pause → play → fadeIn which is itself
  // an attack-click on each cycle. Keep entry into processing immediate.
  const FADE_OUT_DEBOUNCE_MS = 350;

  targetVolumeRef.current = volume;

  const clearFadeInterval = () => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  };

  const clearFadeOutTimeout = () => {
    if (fadeOutTimeoutRef.current) {
      clearTimeout(fadeOutTimeoutRef.current);
      fadeOutTimeoutRef.current = null;
    }
  };

  // Load audio once when enabled (do not recreate on volume changes — avoids pops)
  useEffect(() => {
    if (!enabled) {
      setIsLoaded(false);
      return;
    }

    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0;
    processingAudioRef.current = audio;

    let attemptIndex = 0;
    let proceduralBlobUrl: string | null = null;

    const createFallbackSound = () => {
      const sampleRate = 44100;
      const duration = 2;
      const frameCount = sampleRate * duration;
      const factory = new OfflineAudioContext(1, 1, sampleRate);
      const buffer = factory.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);

      // Two-stage filter: low-pass accumulator for body warmth, then a one-pole
      // DC blocker so random grain drift can't ramp the signal into the clipper.
      // Reduced feedback (0.5 vs prior 0.78) keeps DC gain ≈ 2x instead of ~4.5x.
      let lp = 0;
      let prevV = 0;
      let dcOut = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const slow = Math.sin(2 * Math.PI * 0.35 * t) * 0.5 + 0.5;
        const grain = (Math.random() * 2 - 1) * 0.05 * slow;
        const scratch = Math.sin(2 * Math.PI * (5.5 + 0.8 * Math.sin(t * 2.1)) * t) * 0.08 * slow;
        const v = scratch + grain + lp * 0.5;
        lp = v;
        dcOut = v - prevV + 0.995 * dcOut;
        prevV = v;
        data[i] = Math.max(-1, Math.min(1, dcOut * 0.9));
      }

      // Loop-seam taper: ramp first & last ~5 ms to zero so HTMLAudioElement's
      // loop wrap-around never hits a step discontinuity (the prior implementation
      // looped to a nonzero sample ≈ 22 times per minute → audible click each loop).
      const taperSamples = Math.min(Math.floor(sampleRate * 0.005), Math.floor(data.length / 2));
      for (let i = 0; i < taperSamples; i++) {
        const g = i / taperSamples;
        data[i] *= g;
        data[data.length - 1 - i] *= g;
      }

      const wav = audioBufferToWav(buffer);
      const blob = new Blob([wav], { type: 'audio/wav' });
      if (!processingAudioRef.current) return;
      playbackReloadAttemptedRef.current = false;
      proceduralBlobUrl = URL.createObjectURL(blob);
      processingAudioRef.current.src = proceduralBlobUrl;
      processingAudioRef.current.load();
      setIsLoaded(true);
    };

    const audioBufferToWav = (ab: AudioBuffer): ArrayBuffer => {
      const length = ab.length * ab.numberOfChannels * 2 + 44;
      const arrayBuffer = new ArrayBuffer(length);
      const view = new DataView(arrayBuffer);
      const channels = [];
      let offset = 0;
      let pos = 0;

      const setUint16 = (data: number) => {
        view.setUint16(pos, data, true);
        pos += 2;
      };
      const setUint32 = (data: number) => {
        view.setUint32(pos, data, true);
        pos += 4;
      };

      setUint32(0x46464952);
      setUint32(length - 8);
      setUint32(0x45564157);
      setUint32(0x20746d66);
      setUint32(16);
      setUint16(1);
      setUint16(ab.numberOfChannels);
      setUint32(ab.sampleRate);
      setUint32(ab.sampleRate * 2 * ab.numberOfChannels);
      setUint16(ab.numberOfChannels * 2);
      setUint16(16);
      setUint32(0x61746164);
      setUint32(length - pos - 4);

      for (let i = 0; i < ab.numberOfChannels; i++) {
        channels.push(ab.getChannelData(i));
      }

      while (pos < length) {
        for (let i = 0; i < ab.numberOfChannels; i++) {
          let sample = Math.max(-1, Math.min(1, channels[i][offset]));
          sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          view.setInt16(pos, sample, true);
          pos += 2;
        }
        offset++;
      }

      return arrayBuffer;
    };

    const handleCanPlayThrough = () => {
      playbackReloadAttemptedRef.current = false;
      setIsLoaded(true);
    };

    const handleError = () => {
      attemptIndex += 1;
      if (attemptIndex < WRITE_SOUND_URLS.length) {
        audio.src = WRITE_SOUND_URLS[attemptIndex];
        audio.load();
        return;
      }
      console.log('[AmbientSound] Packaged sounds failed; using procedural fallback');
      createFallbackSound();
    };

    audio.addEventListener('canplaythrough', handleCanPlayThrough);
    audio.addEventListener('error', handleError);

    attemptIndex = 0;
    audio.src = WRITE_SOUND_URLS[0];
    audio.load();

    return () => {
      clearFadeInterval();
      clearFadeOutTimeout();
      playbackReloadAttemptedRef.current = false;
      audio.removeEventListener('canplaythrough', handleCanPlayThrough);
      audio.removeEventListener('error', handleError);
      audio.pause();
      if (proceduralBlobUrl) {
        URL.revokeObjectURL(proceduralBlobUrl);
        proceduralBlobUrl = null;
      }
      processingAudioRef.current = null;
      setIsLoaded(false);
    };
  }, [enabled]);

  // Playback + cross-fade (stable deps — volume applied via ref / separate effect)
  useEffect(() => {
    if (!enabled || !isLoaded || !processingAudioRef.current) return;

    const audio = processingAudioRef.current;

    if (audio.error) {
      if (!playbackReloadAttemptedRef.current) {
        playbackReloadAttemptedRef.current = true;
        console.warn('[AmbientSound] Audio element has error, one-shot reload:', audio.error);
        audio.load();
      }
      return;
    }
    playbackReloadAttemptedRef.current = false;

    const fadeIn = (duration = 450) => {
      clearFadeInterval();
      clearFadeOutTimeout();
      audio.volume = 0;
      // NOTE: do NOT reset currentTime here. The buffer is a seamless loop and
      // scrubbing to 0 on every state re-entry introduces an attack transient.
      // Only seek on the very first play (when the element has never played).
      if (audio.currentTime > 0 && audio.ended) {
        try { audio.currentTime = 0; } catch { /* ignore */ }
      }
      audio.play().catch((e) => {
        console.warn('[AmbientSound] Play failed:', e);
        clearFadeInterval();
      });

      const steps = 24;
      const stepTime = duration / steps;
      let step = 0;

      fadeIntervalRef.current = setInterval(() => {
        step++;
        const target = targetVolumeRef.current;
        audio.volume = Math.min((target / steps) * step, target);
        if (step >= steps) {
          audio.volume = target;
          clearFadeInterval();
        }
      }, stepTime);
    };

    const fadeOut = (duration = 280) => {
      clearFadeInterval();
      if (audio.paused) return;

      const steps = 16;
      const stepTime = duration / steps;
      const startVolume = audio.volume;
      const volumeStep = startVolume / steps;
      let step = 0;

      fadeIntervalRef.current = setInterval(() => {
        step++;
        audio.volume = Math.max(startVolume - volumeStep * step, 0);
        if (step >= steps) {
          clearFadeInterval();
          audio.pause();
          // Leave currentTime alone so a rapid re-entry resumes gapless; if
          // the element actually reached the end, the loop already wrapped.
        }
      }, stepTime);
    };

    if (state === 'processing') {
      // Entering processing → cancel any pending stop and start/resume immediately.
      clearFadeOutTimeout();
      if (audio.paused) {
        fadeIn(450);
      } else {
        audio.volume = targetVolumeRef.current;
      }
    } else if (!audio.paused) {
      // Leaving processing → debounce the stop. If we flip back to processing
      // within the window, the timeout is cancelled and playback continues
      // without a restart click.
      if (!fadeOutTimeoutRef.current) {
        fadeOutTimeoutRef.current = setTimeout(() => {
          fadeOutTimeoutRef.current = null;
          fadeOut(280);
        }, FADE_OUT_DEBOUNCE_MS);
      }
    }

    return () => {
      clearFadeInterval();
      // Note: don't clear fadeOutTimeout here — it needs to survive across
      // rapid state transitions so the debounce actually debounces.
    };
  }, [state, enabled, isLoaded]);

  // Live volume while already playing (e.g. user moves slider)
  useEffect(() => {
    if (!enabled || !isLoaded || !processingAudioRef.current) return;
    const audio = processingAudioRef.current;
    if (state === 'processing' && !audio.paused && !fadeIntervalRef.current) {
      audio.volume = volume;
    }
  }, [volume, state, enabled, isLoaded]);

  const setVolume = (newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    targetVolumeRef.current = clampedVolume;
    if (processingAudioRef.current && !fadeIntervalRef.current) {
      processingAudioRef.current.volume = clampedVolume;
    }
  };

  return {
    isLoaded,
    setVolume
  };
}
