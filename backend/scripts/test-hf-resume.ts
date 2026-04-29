/**
 * Test Hugging Face resume NER and summarization
 * Run: npx tsx backend/scripts/test-hf-resume.ts
 */
import "dotenv/config";
import { extractResumeProfileWithNER, summarizeResume } from "../server/llm/huggingfaceResume";
import { buildResumeProfile } from "../server/resumeProfileHeuristic";

const SAMPLE_RESUME = `
John Smith
Email: john.smith@email.com | Phone: (555) 123-4567
Location: San Francisco, CA

SUMMARY
Software engineer with 5 years of experience in Python, JavaScript, and React.
Strong background in machine learning and cloud infrastructure.

EXPERIENCE
Senior Software Engineer at Google (2020-2024)
- Led development of internal tools using Python and TensorFlow
- Collaborated with cross-functional teams on ML pipelines

Software Engineer at Microsoft (2018-2020)
- Built web applications with React and Node.js
- Implemented REST APIs and microservices

EDUCATION
Bachelor of Science in Computer Science, Stanford University, 2018

Skills: Python, JavaScript, React, Node.js, TensorFlow, SQL, AWS, Docker
`;

async function main() {
  console.log("=== Hugging Face Resume Processing Test ===\n");

  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  if (!token?.trim()) {
    console.log("❌ HUGGINGFACE_TOKEN not set - will use heuristic fallback\n");
  } else {
    console.log("✓ HUGGINGFACE_TOKEN found\n");
  }

  const heuristicProfile = buildResumeProfile(SAMPLE_RESUME);

  // Test 1: NER
  console.log("--- Priority 1: NER (Profile Extraction) ---");
  try {
    const profile = await extractResumeProfileWithNER(SAMPLE_RESUME, heuristicProfile);
    console.log("Skills:", profile.skills);
    console.log("Companies:", profile.companies ?? "(none)");
    console.log("Education:", profile.education);
    console.log("Experience:", profile.experience);
    console.log("✓ NER completed\n");
  } catch (e: any) {
    console.log("❌ NER failed:", e?.message || e, "\n");
  }

  // Test 2: Summarization
  console.log("--- Priority 2: Summarization ---");
  try {
    const result = await summarizeResume(SAMPLE_RESUME);
    if (result) {
      console.log("Summary length:", result.summary.length, "chars");
      console.log("Summary preview:", result.summary.slice(0, 150) + "...");
      console.log("Highlights length:", result.highlights.length, "chars");
      console.log("Highlights preview:", result.highlights.slice(0, 100) + "...");
      console.log("✓ Summarization completed\n");
    } else {
      console.log("❌ Summarization returned null (no token or API error)\n");
    }
  } catch (e: any) {
    console.log("❌ Summarization failed:", e?.message || e, "\n");
  }

  console.log("=== Test complete ===");
}

main();
