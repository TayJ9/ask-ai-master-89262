/**
 * Evaluator JSON schema sanity check — run scoreInterview on all voice fixtures
 * and validate output against EvaluationJsonSchema.
 *
 * Usage:
 *   OPENAI_API_KEY=your-key npx tsx test-fixtures/voice/run-evaluator-sanity.ts
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backend", ".env") });

import { scoreInterview, EvaluationJsonSchema } from "../../backend/server/llm/openaiEvaluator";

const VOICE_DIR = join(dirname(fileURLToPath(import.meta.url)));

const FIXTURE_IDS = [
  "freshman_01",
  "freshman_02",
  "freshman_03",
  "freshman_04",
  "junior_01",
  "junior_02",
  "junior_03",
  "junior_04",
  "senior_01",
  "senior_02",
  "senior_03",
  "senior_04",
];

async function main() {
  console.log("🧪 Evaluator JSON Schema Sanity Check (voice fixtures)\n");

  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY required (set in backend/.env or environment)");
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const id of FIXTURE_IDS) {
    const metaPath = join(VOICE_DIR, `${id}.meta.json`);
    const txtPath = join(VOICE_DIR, `${id}.txt`);

    if (!fs.existsSync(metaPath) || !fs.existsSync(txtPath)) {
      console.error(`❌ [${id}] Missing meta or transcript file`);
      failed++;
      continue;
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    const transcript = fs.readFileSync(txtPath, "utf-8").trim();

    try {
      const evalResult = await scoreInterview({
        role: "Software Engineer Intern",
        major: "Computer Science",
        resumeText: "CS student. Python, JavaScript. GPA 3.5.",
        questions: [{ question: meta.prompt_question, answer: transcript }],
      });

      const parsed = EvaluationJsonSchema.safeParse(evalResult);
      if (!parsed.success) {
        console.error(`❌ [${id}] Schema validation failed:`, parsed.error.message);
        failed++;
      } else {
        console.log(`✅ [${id}] schema OK (overall_score=${parsed.data.overall_score})`);
        passed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ [${id}] Error:`, msg);
      failed++;
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Passed: ${passed}`);
  if (failed > 0) {
    console.error(`Failed: ${failed}`);
    process.exit(1);
  }
  console.log("✅ All fixtures passed schema validation");
  process.exit(0);
}

main();
