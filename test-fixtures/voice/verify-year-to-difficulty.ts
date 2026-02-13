/**
 * Verify yearToDifficulty mapping for Freshman, Junior, Senior.
 * Ensures getYearToDifficulty returns expected values used by dynamicVariables.
 *
 * Usage: npx tsx test-fixtures/voice/verify-year-to-difficulty.ts
 */

import { getYearToDifficulty } from "../../frontend/src/lib/yearToDifficulty";

const EXPECTED = {
  freshman: {
    technicalDifficulty: "basic",
    technicalDepth: "introductory",
    behavioralRatio: 65,
  },
  junior: {
    technicalDifficulty: "intermediate",
    technicalDepth: "moderate",
    behavioralRatio: 50,
  },
  senior: {
    technicalDifficulty: "intermediate-advanced",
    technicalDepth: "advanced",
    behavioralRatio: 45,
  },
} as const;

function main() {
  console.log("🔍 Verifying yearToDifficulty mapping\n");

  let failed = 0;

  for (const [yearLabel, yearStr] of [
    ["Freshman", "Freshman"],
    ["Junior", "Junior"],
    ["Senior", "Senior"],
  ] as const) {
    const exp = EXPECTED[yearLabel.toLowerCase() as keyof typeof EXPECTED];
    const got = getYearToDifficulty(yearStr);

    const ok =
      got.technicalDifficulty === exp.technicalDifficulty &&
      got.technicalDepth === exp.technicalDepth &&
      got.behavioralRatio === exp.behavioralRatio;

    if (ok) {
      console.log(`✅ [${yearLabel}] technicalDifficulty=${got.technicalDifficulty} technicalDepth=${got.technicalDepth} behavioralRatio=${got.behavioralRatio}`);
    } else {
      console.error(`❌ [${yearLabel}] Expected ${JSON.stringify(exp)}, got ${JSON.stringify(got)}`);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n❌ ${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\n✅ All yearToDifficulty mappings passed");
  process.exit(0);
}

main();
