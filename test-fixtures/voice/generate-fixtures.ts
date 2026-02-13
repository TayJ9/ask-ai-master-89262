/**
 * Generate voice regression test fixtures using ElevenLabs TTS + STT.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=your-key npx tsx test-fixtures/voice/generate-fixtures.ts
 *
 * Requires: ElevenLabs API key with TTS and STT permissions.
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

// Load .env from repo root
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: join(root, ".env") });
config({ path: join(root, "backend", ".env") });

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel - default
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)));

//////// Helpers ////////

function computeClarityScore(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.length / sentences.length; // avg words per sentence
}

async function callTTS(text: string): Promise<ArrayBuffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": API_KEY!,
    },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS failed (${res.status}): ${err}`);
  }
  return res.arrayBuffer();
}

async function callSTT(audioBuffer: ArrayBuffer): Promise<{ text: string; source: "elevenlabs_stt" | "ground_truth_fallback" }> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  formData.append("file", blob, "audio.mp3");
  formData.append("model_id", "scribe_v2");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": API_KEY! },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 && err.includes("speech_to_text")) {
      return { text: "", source: "ground_truth_fallback" };
    }
    throw new Error(`STT failed (${res.status}): ${err}`);
  }

  const json = await res.json();
  return { text: json.text || "", source: "elevenlabs_stt" };
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

//////// Main ////////

async function main() {
  if (!API_KEY) {
    console.error("❌ ELEVENLABS_API_KEY is required. Set it in .env or as env var.");
    process.exit(1);
  }

  const definitionsPath = join(OUTPUT_DIR, "fixtures-definitions.json");
  const definitions = JSON.parse(readFileSync(definitionsPath, "utf-8")) as {
    freshman: Array<{ prompt_question: string; candidate_answer_text: string }>;
    junior: Array<{ prompt_question: string; candidate_answer_text: string }>;
    senior: Array<{ prompt_question: string; candidate_answer_text: string }>;
  };

  ensureDir(OUTPUT_DIR);

  const manifest: Array<{
    level: string;
    id: string;
    prompt_question: string;
    candidate_answer_text: string;
    tts_audio_file: string;
    stt_transcript_text_file: string;
    meta_file: string;
    transcript_word_count: number;
    clarity_score: number;
    stt_source?: string;
  }> = [];

  for (const level of ["freshman", "junior", "senior"] as const) {
    const items = definitions[level];
    for (let i = 0; i < items.length; i++) {
      const id = `${level}_${String(i + 1).padStart(2, "0")}`;
      const { prompt_question, candidate_answer_text } = items[i];

      console.log(`\n📝 [${id}] ${prompt_question.substring(0, 50)}...`);

      // TTS
      console.log(`   Generating audio...`);
      const audioBuffer = await callTTS(candidate_answer_text);
      const audioPath = join(OUTPUT_DIR, `${id}.mp3`);
      writeFileSync(audioPath, Buffer.from(audioBuffer));
      console.log(`   Saved ${id}.mp3`);

      // STT (fallback to ground truth if API key lacks speech_to_text permission)
      console.log(`   Transcribing...`);
      const { text: transcript, source: sttSource } = await callSTT(audioBuffer);
      const transcriptText = transcript || candidate_answer_text;
      if (sttSource === "ground_truth_fallback" && !transcript) {
        console.log(`   ⚠ STT not available (missing permission), using ground-truth text`);
      }
      const txtPath = join(OUTPUT_DIR, `${id}.txt`);
      writeFileSync(txtPath, transcriptText, "utf-8");
      console.log(`   Saved ${id}.txt`);

      // Meta
      const wordCount = transcriptText.split(/\s+/).filter((w) => w.length > 0).length;
      const clarityScore = computeClarityScore(transcriptText);

      const meta = {
        level,
        prompt_question,
        candidate_answer_text,
        tts_audio_file: `${id}.mp3`,
        stt_transcript_text_file: `${id}.txt`,
        transcript_word_count: wordCount,
        clarity_score: Number(clarityScore.toFixed(2)),
        stt_source: transcript ? "elevenlabs_stt" : "ground_truth_fallback",
      };

      const metaPath = join(OUTPUT_DIR, `${id}.meta.json`);
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");

      manifest.push({
        level,
        id,
        prompt_question,
        candidate_answer_text,
        tts_audio_file: `${id}.mp3`,
        stt_transcript_text_file: `${id}.txt`,
        meta_file: `${id}.meta.json`,
        transcript_word_count: wordCount,
        clarity_score: meta.clarity_score,
        stt_source: meta.stt_source,
      });
    }
  }

  const usedFallback = manifest.some((m) => m.stt_source === "ground_truth_fallback");
  if (usedFallback) {
    console.log("\n⚠ Note: Some transcripts used ground-truth text (ElevenLabs API key may lack speech_to_text permission).");
  }

  // Write manifest
  const manifestPath = join(OUTPUT_DIR, "MANIFEST.md");
  const table = [
    "| Level | ID | Prompt (truncated) | Audio | Transcript | Meta | Word Count | Clarity |",
    "|-------|-----|--------------------|-------|-------------|------|------------|---------|",
    ...manifest.map(
      (m) =>
        `| ${m.level} | ${m.id} | ${m.prompt_question.substring(0, 40)}... | ${m.tts_audio_file} | ${m.stt_transcript_text_file} | ${m.meta_file} | ${m.transcript_word_count} | ${m.clarity_score} |`
    ),
  ].join("\n");

  writeFileSync(
    manifestPath,
    `# Voice Regression Test Fixtures

Generated: ${new Date().toISOString()}

## Fixtures

${table}

## File Paths (relative to test-fixtures/voice/)

${manifest.map((m) => `- \`${m.id}.mp3\` \`${m.id}.txt\` \`${m.id}.meta.json\``).join("\n")}
`,
    "utf-8"
  );

  console.log(`\n✅ Done. ${manifest.length} fixtures written to ${OUTPUT_DIR}`);
  console.log(`   See MANIFEST.md for the full table.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
