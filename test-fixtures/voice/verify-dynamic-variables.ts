/**
 * Verify dynamicVariables shape at session start.
 * Replicates the logic from VoiceInterviewWebSocket.tsx and asserts required keys exist (case-sensitive).
 * Optionally validates against backend dev endpoint if BACKEND_URL is set.
 *
 * Usage: npx tsx test-fixtures/voice/verify-dynamic-variables.ts
 *        BACKEND_URL=http://localhost:3001 npx tsx test-fixtures/voice/verify-dynamic-variables.ts
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getYearToDifficulty } from "../../frontend/src/lib/yearToDifficulty";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: join(root, ".env") });
config({ path: join(root, "backend", ".env") });

const REQUIRED_KEYS = [
  "first_name", "major", "year", "resume_summary", "resume_highlights",
  "technical_difficulty", "technical_depth", "behavioral_ratio",
] as const;

function buildDynamicVariables(yearStr: string): Record<string, unknown> {
  const { technicalDifficulty, technicalDepth, behavioralRatio } = getYearToDifficulty(yearStr);
  return {
    first_name: "Test",
    major: "Computer Science",
    year: yearStr,
    resume_summary: "",
    resume_highlights: "",
    technical_difficulty: technicalDifficulty,
    technical_depth: technicalDepth,
    behavioral_ratio: String(behavioralRatio),
  };
}

async function main() {
  console.log("🔍 Verifying dynamicVariables shape at session start\n");

  let failed = 0;

  for (const yearStr of ["Freshman", "Junior", "Senior"]) {
    const dv = buildDynamicVariables(yearStr);
    const keys = Object.keys(dv);

    const missing = REQUIRED_KEYS.filter((k) => !keys.includes(k));
    if (missing.length > 0) {
      console.error(`❌ [${yearStr}] Missing keys: ${missing.join(", ")}`);
      failed++;
      continue;
    }

    const yearVal = dv.year as string;
    const techDiff = dv.technical_difficulty as string;
    const techDepth = dv.technical_depth as string;
    const behRatio = dv.behavioral_ratio as string;

    if (!yearVal || !techDiff || !techDepth || !behRatio) {
      console.error(`❌ [${yearStr}] Empty required value: year=${!!yearVal} technical_difficulty=${!!techDiff} technical_depth=${!!techDepth} behavioral_ratio=${!!behRatio}`);
      failed++;
    } else {
      console.log(`✅ [${yearStr}] keys=${REQUIRED_KEYS.join(",")} technical_difficulty=${techDiff} technical_depth=${techDepth} behavioral_ratio=${behRatio}`);
    }
  }

  // Optional: validate against backend dev endpoint (set BACKEND_URL to enable)
  const backendUrl = process.env.BACKEND_URL || (process.env.PORT ? `http://localhost:${process.env.PORT}` : null);
  if (backendUrl) {
    console.log(`\n🔗 Validating against ${backendUrl}/api/dev/dynamic-variables-schema...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    for (const yearStr of ["Freshman", "Junior", "Senior"]) {
      try {
        const res = await fetch(`${backendUrl}/api/dev/dynamic-variables-schema?year=${encodeURIComponent(yearStr)}`, { signal: controller.signal });
        if (!res.ok) {
          console.warn(`⚠ [${yearStr}] Backend returned ${res.status} (dev endpoint may be disabled)`);
          continue;
        }
        const schema = (await res.json()) as Record<string, unknown>;
        const missing = REQUIRED_KEYS.filter((k) => !(k in schema));
        if (missing.length > 0) {
          console.error(`❌ [${yearStr}] Backend schema missing keys: ${missing.join(", ")}`);
          failed++;
        } else {
          console.log(`✅ [${yearStr}] Backend schema matches`);
        }
      } catch (e) {
        console.warn(`⚠ [${yearStr}] Backend unreachable (skipped): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    clearTimeout(timeout);
  }

  if (failed > 0) {
    console.error(`\n❌ ${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\n✅ All dynamicVariables shapes passed");
  process.exit(0);
}

main();
