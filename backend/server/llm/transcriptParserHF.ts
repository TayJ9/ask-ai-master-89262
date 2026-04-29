/**
 * Hugging Face fallback for transcript parsing.
 *
 * When parseTranscript returns 0 pairs (e.g., non-standard format),
 * use HF text generation to extract question-answer pairs.
 */

import { InferenceClient } from "@huggingface/inference";

function getHfClient(): InferenceClient | null {
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  if (!token || token.trim() === "") return null;
  return new InferenceClient(token);
}

/**
 * Use HF to extract Q&A pairs from a transcript when regex parsing fails.
 * Returns empty array on failure or when token not set.
 */
export async function parseTranscriptWithHF(
  transcript: string
): Promise<Array<{ question: string; answer: string }>> {
  const hf = getHfClient();
  if (!hf) return [];

  if (!transcript || transcript.trim().length < 50) return [];

  try {
    // Truncate to avoid token limits (~4000 chars)
    const text = transcript.slice(0, 4000);

    const prompt = `Extract all question-answer pairs from this interview transcript. For each pair, identify the interviewer's question and the candidate's answer. Return ONLY a valid JSON array of objects with "question" and "answer" keys. No other text.

Transcript:
${text}

JSON array:`;

    const models = [
      "mistralai/Mistral-7B-Instruct-v0.2",
      "HuggingFaceH4/zephyr-7b-beta",
      "google/flan-t5-large",
    ];

    let rawOutput = "";
    for (const model of models) {
      try {
        const result = await hf.textGeneration({
          model,
          inputs: prompt,
          parameters: {
            max_new_tokens: 1024,
            temperature: 0.1,
            do_sample: false,
          },
        });
        rawOutput = (result as any)?.generated_text ?? (result as any)?.generated ?? String(result ?? "");
        if (rawOutput && rawOutput.length > 20) break;
      } catch {
        continue;
      }
    }

    if (!rawOutput || rawOutput.length < 20) return [];

    // Extract JSON array from output (model might wrap in markdown or add extra text)
    const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : rawOutput;

    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed)) return [];

    const pairs: Array<{ question: string; answer: string }> = [];
    for (const item of parsed) {
      if (item && typeof item === "object" && "question" in item && "answer" in item) {
        const q = String((item as any).question ?? "").trim();
        const a = String((item as any).answer ?? "").trim();
        if (q.length >= 10 && a.length >= 10) {
          pairs.push({ question: q, answer: a });
        }
      }
    }

    console.log("[PARSE_TRANSCRIPT_HF] Extracted pairs:", pairs.length);
    return pairs;
  } catch (err: any) {
    console.warn("[PARSE_TRANSCRIPT_HF] Failed:", err?.message || err);
    return [];
  }
}
