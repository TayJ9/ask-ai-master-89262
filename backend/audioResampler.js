/**
 * Audio Resampling Utility
 * Converts PCM16 audio from any sample rate to 16kHz PCM16 mono
 * Required format for ElevenLabs Conversational AI
 */

/**
 * Resample PCM16 audio from source sample rate to target sample rate
 * Uses linear interpolation for high-quality resampling
 * 
 * @param {Buffer} pcm16Buffer - Input PCM16 audio buffer (16-bit signed integers)
 * @param {number} sourceSampleRate - Source sample rate (e.g., 44100, 48000)
 * @param {number} targetSampleRate - Target sample rate (must be 16000 for ElevenLabs)
 * @param {number} channels - Number of channels (1 = mono, 2 = stereo)
 * @returns {Buffer} Resampled PCM16 buffer at target sample rate
 */
function resamplePCM16(pcm16Buffer, sourceSampleRate, targetSampleRate = 16000, channels = 1) {
  // Validate inputs
  if (!pcm16Buffer || pcm16Buffer.length === 0) {
    throw new Error('Empty audio buffer provided');
  }
  
  if (sourceSampleRate <= 0 || targetSampleRate <= 0) {
    throw new Error(`Invalid sample rate: source=${sourceSampleRate}, target=${targetSampleRate}`);
  }
  
  // If sample rates match, return original (but ensure mono)
  if (sourceSampleRate === targetSampleRate && channels === 1) {
    return pcm16Buffer;
  }
  
  // Convert buffer to Int16Array for easier manipulation
  const samples = new Int16Array(pcm16Buffer.buffer, pcm16Buffer.byteOffset, pcm16Buffer.length / 2);
  const totalSamples = samples.length;
  
  // Validate we have samples
  if (totalSamples === 0) {
    throw new Error('Empty audio buffer - no samples to resample');
  }
  
  // Calculate samples per channel with integer division to prevent array index errors
  const samplesPerChannel = Math.floor(totalSamples / channels);
  if (samplesPerChannel === 0) {
    throw new Error(`Invalid channel count or empty buffer: ${channels} channels, ${totalSamples} total samples`);
  }
  
  // Extract mono channel if stereo (take left channel or average)
  let monoData;
  if (channels === 2) {
    // Convert stereo to mono by averaging left and right channels
    monoData = new Int16Array(samplesPerChannel);
    for (let i = 0; i < samplesPerChannel; i++) {
      const left = samples[i * 2];
      const right = samples[i * 2 + 1];
      // Average with proper rounding to prevent overflow
      monoData[i] = Math.round((left + right) / 2);
    }
  } else {
    // Already mono - create a copy to avoid reference issues
    monoData = new Int16Array(samples);
  }
  
  // Calculate resampling ratio
  const ratio = targetSampleRate / sourceSampleRate;
  const outputLength = Math.ceil(monoData.length * ratio);
  const output = new Int16Array(outputLength);
  
  // Linear interpolation resampling
  for (let i = 0; i < outputLength; i++) {
    // Calculate source position (may be fractional)
    const sourcePos = i / ratio;
    const sourceIndex = Math.floor(sourcePos);
    const fraction = sourcePos - sourceIndex;
    
    if (sourceIndex + 1 < monoData.length) {
      // Linear interpolation between two samples
      const sample1 = monoData[sourceIndex];
      const sample2 = monoData[sourceIndex + 1];
      const interpolated = sample1 + (sample2 - sample1) * fraction;
      output[i] = Math.round(interpolated);
    } else if (sourceIndex < monoData.length) {
      // Last sample, no interpolation needed
      output[i] = monoData[sourceIndex];
    } else {
      // Beyond source data, use last sample
      output[i] = monoData[monoData.length - 1];
    }
  }
  
  // Convert back to Buffer - use slice to ensure only actual data is included
  // This prevents including extra bytes beyond the Int16Array data
  return Buffer.from(output.buffer.slice(0, output.byteLength));
}

/**
 * Detect sample rate from audio buffer characteristics (heuristic)
 * This is a fallback - sample rate should be provided by frontend
 * 
 * @param {Buffer} pcm16Buffer - PCM16 audio buffer
 * @param {number} durationMs - Duration in milliseconds (if known)
 * @returns {number} Estimated sample rate
 */
function estimateSampleRate(pcm16Buffer, durationMs = null) {
  if (durationMs && durationMs > 0) {
    const samples = pcm16Buffer.length / 2; // PCM16 = 2 bytes per sample
    const estimatedRate = Math.round((samples / durationMs) * 1000);
    
    // Round to nearest common sample rate
    const commonRates = [8000, 16000, 22050, 44100, 48000];
    let closest = commonRates[0];
    let minDiff = Math.abs(estimatedRate - closest);
    
    for (const rate of commonRates) {
      const diff = Math.abs(estimatedRate - rate);
      if (diff < minDiff) {
        minDiff = diff;
        closest = rate;
      }
    }
    
    return closest;
  }
  
  // Default to 48kHz if unknown (most common modern browser rate)
  return 48000;
}

/**
 * Validate PCM16 buffer format
 * 
 * @param {Buffer} buffer - Audio buffer to validate
 * @returns {boolean} True if valid PCM16 format
 */
function isValidPCM16(buffer) {
  if (!buffer || buffer.length === 0) {
    return false;
  }
  
  // PCM16 must be multiple of 2 bytes (16-bit = 2 bytes per sample)
  if (buffer.length % 2 !== 0) {
    return false;
  }
  
  return true;
}

/**
 * Main resampling function with comprehensive logging
 * 
 * @param {Buffer} audioBuffer - Input PCM16 audio buffer
 * @param {number} sourceSampleRate - Source sample rate
 * @param {number} targetSampleRate - Target sample rate (default: 16000)
 * @param {number} channels - Number of channels (default: 1)
 * @param {Object} options - Additional options
 * @returns {Object} Resampled buffer and metadata
 */
function resampleAudio(audioBuffer, sourceSampleRate, targetSampleRate = 16000, channels = 1, options = {}) {
  const { logDetails = true } = options;
  
  // Validate input
  if (!isValidPCM16(audioBuffer)) {
    throw new Error('Invalid PCM16 buffer: length must be multiple of 2');
  }
  
  const inputSize = audioBuffer.length;
  const inputSamples = inputSize / 2;
  
  // Validate we have samples
  if (inputSamples === 0) {
    throw new Error('Empty audio buffer provided');
  }
  
  const inputDurationMs = (inputSamples / sourceSampleRate) * 1000;
  
  if (logDetails) {
    console.log(`[AUDIO-RESAMPLE] Input: ${inputSize} bytes, ${inputSamples} samples, ${sourceSampleRate}Hz, ${channels} channel(s), ${inputDurationMs.toFixed(2)}ms`);
  }
  
  // Check if resampling is needed
  if (sourceSampleRate === targetSampleRate && channels === 1) {
    if (logDetails) {
      console.log(`[AUDIO-RESAMPLE] ✅ No resampling needed - already ${targetSampleRate}Hz mono`);
    }
    return {
      buffer: audioBuffer,
      sourceSampleRate,
      targetSampleRate,
      channels: 1,
      resampled: false
    };
  }
  
  // Perform resampling
  const startTime = Date.now();
  const resampledBuffer = resamplePCM16(audioBuffer, sourceSampleRate, targetSampleRate, channels);
  const processingTime = Date.now() - startTime;
  
  const outputSize = resampledBuffer.length;
  const outputSamples = outputSize / 2;
  const outputDurationMs = (outputSamples / targetSampleRate) * 1000;
  
  if (logDetails) {
    console.log(`[AUDIO-RESAMPLE] Output: ${outputSize} bytes, ${outputSamples} samples, ${targetSampleRate}Hz, mono, ${outputDurationMs.toFixed(2)}ms`);
    console.log(`[AUDIO-RESAMPLE] ✅ Resampled ${sourceSampleRate}Hz → ${targetSampleRate}Hz (${channels === 2 ? 'stereo→mono, ' : ''}${processingTime}ms)`);
  }
  
  return {
    buffer: resampledBuffer,
    sourceSampleRate,
    targetSampleRate,
    channels: 1, // Always mono after resampling
    resampled: true,
    processingTimeMs: processingTime
  };
}

module.exports = {
  resamplePCM16,
  resampleAudio,
  estimateSampleRate,
  isValidPCM16
};

