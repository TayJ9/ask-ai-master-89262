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

export function useAmbientSound(
  state: SoundState,
  options: AmbientSoundOptions = {}
) {
  const { enabled = true, volume = 0.3 } = options;
  
  const processingAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize audio elements
  useEffect(() => {
    if (!enabled) return;

    // Pencil writing sound for processing state only
    processingAudioRef.current = new Audio();
    processingAudioRef.current.loop = true;
    processingAudioRef.current.volume = volume;
    
    // Using a base64 encoded short pencil writing sound (about 2 seconds)
    // This is a simple, embedded audio file that sounds like pen/pencil on paper
    // Format: MP3, mono, low quality for small size
    // You can replace this with your own audio file by placing it in public/sounds/
    processingAudioRef.current.src = '/sounds/writing.mp3';

    // Fallback: if file doesn't exist, create a simple typing sound
    const handleCanPlay = () => {
      setIsLoaded(true);
    };
    
    const handleError = () => {
      console.log('[AmbientSound] Using fallback sound generation');
      // Create a simple rhythmic clicking sound as fallback
      createFallbackSound();
    };

    const createFallbackSound = () => {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const duration = 2;
      const sampleRate = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
      const data = buffer.getChannelData(0);

      // Create clicking/tapping sounds at regular intervals
      for (let i = 0; i < duration; i += 0.3) {
        const startSample = Math.floor(i * sampleRate);
        const clickDuration = Math.floor(0.02 * sampleRate); // 20ms click
        
        for (let j = 0; j < clickDuration; j++) {
          const t = j / clickDuration;
          // Short burst of noise with envelope
          data[startSample + j] = (Math.random() * 2 - 1) * 0.15 * (1 - t);
        }
      }

      // Convert buffer to blob and create object URL
      const offlineCtx = new OfflineAudioContext(1, buffer.length, sampleRate);
      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(offlineCtx.destination);
      source.start();

      offlineCtx.startRendering().then(renderedBuffer => {
        // Convert to WAV and create blob URL
        const wav = audioBufferToWav(renderedBuffer);
        const blob = new Blob([wav], { type: 'audio/wav' });
        if (processingAudioRef.current) {
          processingAudioRef.current.src = URL.createObjectURL(blob);
          setIsLoaded(true);
        }
      });
    };

    // Helper function to convert AudioBuffer to WAV
    const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
      const length = buffer.length * buffer.numberOfChannels * 2 + 44;
      const arrayBuffer = new ArrayBuffer(length);
      const view = new DataView(arrayBuffer);
      const channels = [];
      let offset = 0;
      let pos = 0;

      // Write WAV header
      const setUint16 = (data: number) => {
        view.setUint16(pos, data, true);
        pos += 2;
      };
      const setUint32 = (data: number) => {
        view.setUint32(pos, data, true);
        pos += 4;
      };

      setUint32(0x46464952); // "RIFF"
      setUint32(length - 8); // file length - 8
      setUint32(0x45564157); // "WAVE"
      setUint32(0x20746d66); // "fmt " chunk
      setUint32(16); // length = 16
      setUint16(1); // PCM (uncompressed)
      setUint16(buffer.numberOfChannels);
      setUint32(buffer.sampleRate);
      setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels); // avg. bytes/sec
      setUint16(buffer.numberOfChannels * 2); // block-align
      setUint16(16); // 16-bit
      setUint32(0x61746164); // "data" - chunk
      setUint32(length - pos - 4); // chunk length

      // Write interleaved data
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
      }

      while (pos < length) {
        for (let i = 0; i < buffer.numberOfChannels; i++) {
          let sample = Math.max(-1, Math.min(1, channels[i][offset]));
          sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          view.setInt16(pos, sample, true);
          pos += 2;
        }
        offset++;
      }

      return arrayBuffer;
    };

    processingAudioRef.current.addEventListener('canplaythrough', handleCanPlay);
    processingAudioRef.current.addEventListener('error', handleError);
    processingAudioRef.current.load();

    return () => {
      if (processingAudioRef.current) {
        processingAudioRef.current.removeEventListener('canplaythrough', handleCanPlay);
        processingAudioRef.current.removeEventListener('error', handleError);
        processingAudioRef.current.pause();
        if (processingAudioRef.current.src.startsWith('blob:')) {
          URL.revokeObjectURL(processingAudioRef.current.src);
        }
        processingAudioRef.current = null;
      }
    };
  }, [enabled, volume]);

  // Manage playback based on state
  useEffect(() => {
    if (!enabled || !isLoaded || !processingAudioRef.current) return;

    const audio = processingAudioRef.current;
    let fadeInterval: NodeJS.Timeout | null = null;

    const fadeIn = (targetVolume: number, duration = 500) => {
      // Clear any existing fade interval
      if (fadeInterval) clearInterval(fadeInterval);
      
      audio.volume = 0;
      audio.currentTime = 0;
      audio.play().catch((e) => console.warn('[AmbientSound] Play failed:', e));
      
      const steps = 20;
      const stepTime = duration / steps;
      const volumeStep = targetVolume / steps;
      let currentStep = 0;

      fadeInterval = setInterval(() => {
        currentStep++;
        audio.volume = Math.min(volumeStep * currentStep, targetVolume);
        
        if (currentStep >= steps) {
          if (fadeInterval) clearInterval(fadeInterval);
          fadeInterval = null;
        }
      }, stepTime);
    };

    const fadeOut = (duration = 300) => {
      // Clear any existing fade interval
      if (fadeInterval) clearInterval(fadeInterval);
      
      if (audio.paused) return; // Already stopped
      
      const steps = 20;
      const stepTime = duration / steps;
      const startVolume = audio.volume;
      const volumeStep = startVolume / steps;
      let currentStep = 0;

      fadeInterval = setInterval(() => {
        currentStep++;
        audio.volume = Math.max(startVolume - (volumeStep * currentStep), 0);
        
        if (currentStep >= steps) {
          if (fadeInterval) clearInterval(fadeInterval);
          fadeInterval = null;
          audio.pause();
          audio.currentTime = 0;
        }
      }, stepTime);
    };

    // Play sound ONLY during processing state
    if (state === 'processing') {
      // Only start playing if not already playing
      if (audio.paused) {
        fadeIn(volume, 10);
      }
    } else {
      // Stop sound for all other states
      if (!audio.paused) {
        fadeOut(300);
      }
    }

    return () => {
      if (fadeInterval) clearInterval(fadeInterval);
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [state, enabled, isLoaded, volume]);

  // Volume control
  const setVolume = (newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    if (processingAudioRef.current) {
      processingAudioRef.current.volume = clampedVolume;
    }
  };

  return {
    isLoaded,
    setVolume
  };
}
