/**
 * Transcribe voice fixture MP3 files using ElevenLabs STT (scribe_v2).
 * Upgrades transcripts from ground-truth to real STT when the API key has permission.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=your-key npx tsx test-fixtures/voice/transcribe-fixtures-elevenlabs.ts
 *
 * Requires: ElevenLabs API key with Speech-to-Text permission.
 * If STT is not enabled, the script falls back to ground-truth text and reports errors.
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: join(root, ".env") });
config({ path: join(root, "backend", ".env") });

const API_KEY = process.env.ELEVENLABS_API_KEY;
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)));
const STT_MODEL = "scribe_v2";

/** Sanitize error message to avoid leaking secrets */
function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("speech_to_text") || lower.includes("missing permission")) return "Speech-to-Text permission not enabled for API key";
  if (msg.includes("401")) return "Unauthorized (check API key and speech_to_text permission)";
  if (msg.includes("403")) return "Forbidden (speech_to_text permission may be disabled)";
  if (lower.includes("api") && lower.includes("key")) return "API key invalid or missing permission";
  return msg.substring(0, 200);
}

function computeClarityScore(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return Number((words.length / sentences.length).toFixed(2));
}

async function transcribeWithElevenLabs(audioData: Buffer | ArrayBuffer): Promise<string> {
  const formData = new FormData();
  const arr = audioData instanceof Buffer ? new Uint8Array(audioData) : new Uint8Array(audioData);
  const blob = new Blob([arr], { type: "audio/mpeg" });
  formData.append("file", blob, "audio.mp3");
  formData.append("model_id", STT_MODEL);

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": API_KEY! },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`STT failed (${res.status}): ${sanitizeError(err)}`);
  }

  const json = (await res.json()) as { text?: string };
  return (json.text || "").trim();
}

async function main() {
  const mp3Files = readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".mp3"))
    .sort();

  if (mp3Files.length === 0) {
    console.log("No .mp3 files found in test-fixtures/voice/");
    process.exit(0);
  }

  if (!API_KEY) {
    console.error("❌ ELEVENLABS_API_KEY is required. Set it in .env or as env var.");
    process.exit(1);
  }

  const sttErrors: Record<
    string,
    { status: "ok" | "fallback"; stt_source: string; stt_error?: string }
  > = {};

  console.log(`\n🔄 Transcribing ${mp3Files.length} fixture(s) with ElevenLabs STT (${STT_MODEL})...\n`);

  for (const mp3File of mp3Files) {
    const id = mp3File.replace(/\.mp3$/, "");
    const mp3Path = join(OUTPUT_DIR, mp3File);
    const txtPath = join(OUTPUT_DIR, `${id}.txt`);
    const metaPath = join(OUTPUT_DIR, `${id}.meta.json`);

    if (!existsSync(metaPath)) {
      console.warn(`⚠ [${id}] Skipping: no .meta.json found`);
      sttErrors[id] = { status: "fallback", stt_source: "ground_truth_fallback", stt_error: "Missing .meta.json" };
      continue;
    }

    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as {
      level?: string;
      prompt_question?: string;
      candidate_answer_text?: string;
      transcript_word_count?: number;
      clarity_score?: number;
      [k: string]: unknown;
    };
    const fallbackText = meta.candidate_answer_text || "";

    try {
      const audioBuffer = readFileSync(mp3Path);
      const transcript = await transcribeWithElevenLabs(audioBuffer);

      const transcriptText = transcript || fallbackText;

      writeFileSync(txtPath, transcriptText, "utf-8");

      const wordCount = transcriptText.split(/\s+/).filter((w) => w.length > 0).length;
      const clarityScore = computeClarityScore(transcriptText);

      const newMeta = {
        ...meta,
        transcript_word_count: wordCount,
        clarity_score: clarityScore,
        stt_source: transcript ? "elevenlabs_scribe_v2" : "ground_truth_fallback",
      };
      delete (newMeta as Record<string, unknown>).stt_error;

      writeFileSync(metaPath, JSON.stringify(newMeta, null, 2), "utf-8");

      sttErrors[id] = {
        status: transcript ? "ok" : "fallback",
        stt_source: transcript ? "elevenlabs_scribe_v2" : "ground_truth_fallback",
      };
      console.log(`✅ [${id}] ${transcript ? "STT transcript" : "fallback (empty STT)"}`);
    } catch (err) {
      const errMsg = sanitizeError(err);
      writeFileSync(txtPath, fallbackText, "utf-8");

      const wordCount = fallbackText.split(/\s+/).filter((w) => w.length > 0).length;
      const clarityScore = computeClarityScore(fallbackText);

      const newMeta = {
        ...meta,
        transcript_word_count: wordCount,
        clarity_score: clarityScore,
        stt_source: "ground_truth_fallback",
        stt_error: errMsg,
      };
      writeFileSync(metaPath, JSON.stringify(newMeta, null, 2), "utf-8");

      sttErrors[id] = {
        status: "fallback",
        stt_source: "ground_truth_fallback",
        stt_error: errMsg,
      };
      console.warn(`⚠ [${id}] STT failed, using ground-truth: ${errMsg}`);
    }
  }

  writeFileSync(join(OUTPUT_DIR, "STT_ERRORS.json"), JSON.stringify(sttErrors, null, 2), "utf-8");

  const okCount = Object.values(sttErrors).filter((v) => v.status === "ok").length;
  const fallbackCount = Object.values(sttErrors).filter((v) => v.status === "fallback").length;

  console.log(`\n--- Summary ---`);
  console.log(`OK (real STT): ${okCount}`);
  console.log(`Fallback (ground-truth): ${fallbackCount}`);
  console.log(`See STT_ERRORS.json for per-file status.`);

  if (fallbackCount > 0) {
    console.log(`\n⚠ STT may require Speech-to-Text permission on your ElevenLabs API key.`);
    console.log(`  Fixtures remain usable with ground-truth fallback.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
