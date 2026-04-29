/**
 * Compare regex-only parseTranscript vs HF fallback vs combined.
 * Run: npx tsx backend/scripts/compare-transcript-parse.ts
 */
import "dotenv/config";
import { parseTranscript, parseTranscriptWithFallback } from "../server/evaluation";
import { parseTranscriptWithHF } from "../server/llm/transcriptParserHF";

/** Blank-line paragraphs — regex Strategy 2 usually succeeds */
const TRANSCRIPT_PARAGRAPHS = `
Can you tell me about yourself and your background?

Hi, I'm a junior computer science major. I've done two internships and I'm interested in full-stack development.

Tell me about a project you're proud of.

I built a course scheduling app for our school using React and Node.js. The hardest part was handling conflicts when multiple people tried to add the same class.
`;

/** Single block, no double newlines; Strategy 3 drops pairs because ? is stripped from sentence tokens */
const TRANSCRIPT_REGEX_FAILS = `What are your strengths? I am very detail-oriented and collaborative. Where do you see yourself in five years? I hope to grow into a tech lead role.`;

/** Non-standard speaker labels (not AI/User/Interviewer/Candidate/Agent) */
const TRANSCRIPT_WEIRD_LABELS = `Host: Why this role?\nGuest: I want to build products users love.\nHost: Biggest challenge?\nGuest: Prioritizing under tight deadlines.`;

function summarize(
  label: string,
  pairs: Array<{ question: string; answer: string }>
) {
  console.log(`\n--- ${label} (${pairs.length} pairs) ---`);
  pairs.forEach((p, i) => {
    console.log(`${i + 1}. Q: ${p.question.slice(0, 72)}${p.question.length > 72 ? "…" : ""}`);
    console.log(`   A: ${p.answer.slice(0, 72)}${p.answer.length > 72 ? "…" : ""}`);
  });
}

async function runCase(name: string, text: string) {
  console.log(`\n${"=".repeat(60)}\n${name}\n${"=".repeat(60)}`);
  const regexPairs = parseTranscript(text);
  summarize("Old: parseTranscript (regex/heuristics only)", regexPairs);

  const hfOnly =
    regexPairs.length === 0
      ? await parseTranscriptWithHF(text)
      : ([] as Array<{ question: string; answer: string }>);
  if (regexPairs.length === 0) {
    summarize("HF only: parseTranscriptWithHF (when regex returned 0)", hfOnly);
  } else {
    console.log("\n--- HF only: skipped (regex already found pairs) ---");
  }

  const combined = await parseTranscriptWithFallback(text);
  summarize("New: parseTranscriptWithFallback (regex then HF if needed)", combined);
}

async function main() {
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  console.log("Hugging Face token:", token?.trim() ? "set" : "NOT set (HF will return [])");

  await runCase("A) Paragraph breaks (typical formatted transcript)", TRANSCRIPT_PARAGRAPHS);
  await runCase("B) Single paragraph Q&A (regex often fails)", TRANSCRIPT_REGEX_FAILS);
  await runCase("C) Host/Guest labels (regex speaker rules miss)", TRANSCRIPT_WEIRD_LABELS);

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
