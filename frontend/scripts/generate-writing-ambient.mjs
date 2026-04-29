/**
 * Generates a short looping WAV (~2s) — soft pencil-on-paper-ish texture.
 * Run: node scripts/generate-writing-ambient.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "../public/sounds/writing.wav");

const sampleRate = 44100;
const durationSec = 2;
const numSamples = sampleRate * durationSec;
const numChannels = 1;
const bitsPerSample = 16;

// Float pass first so we can apply a DC blocker and a head/tail taper for a
// seamless loop. Previous revision ended on an arbitrary filter-state value
// while the first sample was 0, so HTMLAudioElement's loop=true produced an
// audible click every 2 seconds at the wrap-around.
const floatData = new Float32Array(numSamples);
let last = 0;
let prevV = 0;
let dcOut = 0;
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const slow = Math.sin(2 * Math.PI * 0.35 * t) * 0.5 + 0.5;
  const scratch = Math.sin(2 * Math.PI * (6 + Math.sin(t * 1.7) * 2) * t) * slow;
  const grain = (Math.random() * 2 - 1) * 0.04 * slow;
  // Lower feedback coefficient (0.5 instead of 0.72) to keep DC gain bounded.
  const v = scratch * 0.045 + grain + last * 0.5;
  last = v;
  // One-pole DC blocker: y[n] = x[n] - x[n-1] + 0.995 * y[n-1]
  dcOut = v - prevV + 0.995 * dcOut;
  prevV = v;
  floatData[i] = dcOut;
}

// Seamless-loop taper: first & last ~5 ms ramp to zero so the loop wrap is
// continuous. At 44.1 kHz this is ~220 samples; inaudible as a fade but
// removes the step discontinuity at the loop seam entirely.
const taperSamples = Math.min(Math.floor(sampleRate * 0.005), Math.floor(numSamples / 2));
for (let i = 0; i < taperSamples; i++) {
  const g = i / taperSamples;
  floatData[i] *= g;
  floatData[numSamples - 1 - i] *= g;
}

const data = new Int16Array(numSamples);
for (let i = 0; i < numSamples; i++) {
  const s = Math.max(-1, Math.min(1, floatData[i] * 0.9));
  data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
}

const dataBytes = data.length * 2;
const headerSize = 44;
const buf = Buffer.alloc(headerSize + dataBytes);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(numChannels, 22);
buf.writeUInt32LE(sampleRate, 24);
buf.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
buf.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
buf.writeUInt16LE(bitsPerSample, 34);
buf.write("data", 36);
buf.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < data.length; i++) {
  buf.writeInt16LE(data[i], headerSize + i * 2);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buf);
console.log("Wrote", outPath, `(${numSamples} samples)`);
