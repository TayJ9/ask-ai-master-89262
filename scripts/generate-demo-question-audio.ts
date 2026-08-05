/**
 * Generate ElevenLabs TTS MP3s for portfolio demo resume questions.
 * Uses the same voice as the live interview agent (ELEVENLABS_VOICE_ID).
 *
 * Usage (from repo root):
 *   npx tsx scripts/generate-demo-question-audio.ts
 *
 * Requires ELEVENLABS_API_KEY in backend/.env or repo .env
 */

import { config } from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { demoResumes } from "../frontend/src/mocks/demoResumes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

config({ path: join(ROOT, ".env") });
config({ path: join(ROOT, "backend", ".env") });

const API_KEY = process.env.ELEVENLABS_API_KEY;
/** Same default as backend/scripts/validateElevenLabs.js (live interview voice) */
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "kdmDKE6EkgrWrrykO9Qt";
const OUT_DIR = join(ROOT, "frontend", "public", "demo", "audio");

async function callTTS(text: string): Promise<ArrayBuffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": API_KEY!,
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
    }),
  });
  if (!res.ok) {
    throw new Error(`TTS failed (${res.status}): ${await res.text()}`);
  }
  return res.arrayBuffer();
}

async function main() {
  if (!API_KEY) {
    console.error("Missing ELEVENLABS_API_KEY in .env or backend/.env");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Voice ID: ${VOICE_ID}`);
  console.log(`Output: ${OUT_DIR}\n`);

  let generated = 0;
  let skipped = 0;

  for (const profile of demoResumes) {
    profile.questions.forEach((question, index) => {
      const filename = `${profile.id}-${index}.mp3`;
      const outPath = join(OUT_DIR, filename);
      if (existsSync(outPath)) {
        console.log(`  skip ${filename} (exists)`);
        skipped++;
      }
    });
  }

  for (const profile of demoResumes) {
    for (let index = 0; index < profile.questions.length; index++) {
      const question = profile.questions[index];
      const filename = `${profile.id}-${index}.mp3`;
      const outPath = join(OUT_DIR, filename);

      if (existsSync(outPath)) continue;

      console.log(`  TTS ${filename}…`);
      const audio = await callTTS(question);
      writeFileSync(outPath, Buffer.from(audio));
      generated++;

      // Gentle pacing to avoid rate limits
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  console.log(`\nDone: ${generated} generated, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
