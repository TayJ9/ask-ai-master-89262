/**
 * AudioWorklet processor for capturing microphone audio
 * Replaces deprecated ScriptProcessorNode
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (e) => {
      if (e.data === 'stop') {
        this.stopProcessing = true;
      }
    };
    this.stopProcessing = false;
  }

  process(inputs, outputs) {
    // Only process if we have input and not stopped
    if (this.stopProcessing || !inputs[0] || !inputs[0][0]) {
      return !this.stopProcessing; // Return false to stop processing when stopped
    }

    const inputData = inputs[0][0];
    
    // Send audio data to main thread
    this.port.postMessage({
      type: 'audioData',
      data: inputData.slice() // Copy the array
    });

    return true; // Keep processing
  }
}

registerProcessor('audio-processor', AudioProcessor);

