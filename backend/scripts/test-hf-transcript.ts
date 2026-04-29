/**
 * Test Hugging Face transcript parsing fallback
 * Run: npx tsx backend/scripts/test-hf-transcript.ts
 */
import "dotenv/config";
import { parseTranscriptWithFallback } from "../server/evaluation";

const TRANSCRIPT_NO_LABELS = `
Can you tell me about yourself and your background?

Hi, I'm a junior computer science major. I've done two internships and I'm interested in full-stack development.

Tell me about a project you're proud of.

I built a course scheduling app for our school using React and Node.js. The hardest part was handling conflicts when multiple people tried to add the same class.
`;

async function main() {
  console.log("=== HF Transcript Parsing Fallback Test ===\n");

  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  if (!token?.trim()) {
    console.log("❌ HUGGINGFACE_TOKEN not set - HF fallback will be skipped\n");
  } else {
    console.log("✓ HUGGINGFACE_TOKEN found\n");
  }

  console.log("--- Transcript (no speaker labels) ---");
  console.log(TRANSCRIPT_NO_LABELS.slice(0, 200) + "...\n");

  console.log("--- parseTranscriptWithFallback ---");
  try {
    const pairs = await parseTranscriptWithFallback(TRANSCRIPT_NO_LABELS);
    console.log("Pairs found:", pairs.length);
    pairs.forEach((p, i) => {
      console.log(`\n${i + 1}. Q: ${p.question.slice(0, 60)}...`);
      console.log(`   A: ${p.answer.slice(0, 60)}...`);
    });
    console.log("\n✓ Test complete");
  } catch (e: any) {
    console.log("❌ Failed:", e?.message || e);
  }
}

main();
