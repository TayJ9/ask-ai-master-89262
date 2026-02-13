/**
 * Contract test for year → difficulty mapping.
 * No ElevenLabs, no network, no secrets.
 *
 * Usage: npx tsx test-fixtures/year/test-year-mapping.ts
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync } from "fs";
import { getYearToDifficulty } from "../../frontend/src/lib/yearToDifficulty";

const OUTPUT_DIR = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(OUTPUT_DIR, "year_mapping_report.csv");

function normalizeYear(year: string | undefined): string {
  return (year || "").toLowerCase();
}

const TEST_CASES: Array<{ input: string | undefined; category: string }> = [
  // Freshman-like
  { input: "Freshman", category: "freshman" },
  { input: "freshman", category: "freshman" },
  { input: "I'm a freshman", category: "freshman" },
  { input: "High School", category: "freshman-like" },
  { input: "high school senior", category: "freshman-like" },
  // Junior
  { input: "Junior", category: "junior" },
  { input: "junior", category: "junior" },
  { input: "I'm a junior CS major", category: "junior" },
  { input: "Sophomore", category: "between" },
  // Senior/Grad
  { input: "Senior", category: "senior" },
  { input: "senior", category: "senior" },
  { input: "Post Grad", category: "grad" },
  { input: "postgrad", category: "grad" },
  { input: "Graduate student", category: "grad" },
  // Weird/missing
  { input: undefined, category: "missing" },
  { input: "", category: "empty" },
  { input: "   ", category: "whitespace" },
  { input: "random", category: "unknown" },
  { input: "3rd year", category: "weird" },
  { input: "Year 2", category: "weird" },
];

const FRESHMAN_LIKE = { technicalDifficulty: "basic", technicalDepth: "introductory", behavioralRatio: 65 };
const JUNIOR_MID = { technicalDifficulty: "intermediate", technicalDepth: "moderate", behavioralRatio: 50 };
const SENIOR_HIGH = { technicalDifficulty: "intermediate-advanced", technicalDepth: "advanced", behavioralRatio: 45 };
const GRAD_HIGHEST = { technicalDifficulty: "advanced", technicalDepth: "expert", behavioralRatio: 40 };
const DEFAULT_SAFE = { technicalDifficulty: "moderate", technicalDepth: "intermediate", behavioralRatio: 50 };

function main() {
  console.log("🔍 Year → Difficulty Mapping Contract Test\n");

  const rows: string[][] = [];
  let failed = 0;

  for (const { input, category } of TEST_CASES) {
    const result = getYearToDifficulty(input);
    const normalized = normalizeYear(input);

    rows.push([
      input ?? "(undefined)",
      normalized || "(empty)",
      result.technicalDifficulty,
      result.technicalDepth,
      String(result.behavioralRatio),
    ]);

    // Assertions
    if (category === "freshman" || category === "freshman-like") {
      const ok =
        (result.technicalDifficulty === "basic" || result.technicalDifficulty === "foundational") &&
        result.behavioralRatio >= 65;
      if (!ok) {
        console.error(`❌ [${input ?? "undefined"}] Expected freshman-like (lower technical, higher behavioral), got technicalDifficulty=${result.technicalDifficulty} behavioralRatio=${result.behavioralRatio}`);
        failed++;
      }
    } else if (category === "junior" || category === "between") {
      const ok =
        (result.technicalDifficulty === "intermediate" || result.technicalDifficulty === "basic-intermediate") &&
        result.behavioralRatio >= 50 &&
        result.behavioralRatio <= 60;
      if (!ok) {
        console.error(`❌ [${input ?? "undefined"}] Expected junior/middle, got technicalDifficulty=${result.technicalDifficulty} behavioralRatio=${result.behavioralRatio}`);
        failed++;
      }
    } else if (category === "senior" || category === "grad") {
      const ok =
        (result.technicalDifficulty === "intermediate-advanced" || result.technicalDifficulty === "advanced") &&
        result.behavioralRatio <= 45;
      if (!ok) {
        console.error(`❌ [${input ?? "undefined"}] Expected senior/grad (higher technical, lower behavioral), got technicalDifficulty=${result.technicalDifficulty} behavioralRatio=${result.behavioralRatio}`);
        failed++;
      }
    } else {
      const ok =
        result.technicalDifficulty === DEFAULT_SAFE.technicalDifficulty &&
        result.technicalDepth === DEFAULT_SAFE.technicalDepth &&
        result.behavioralRatio === DEFAULT_SAFE.behavioralRatio;
      if (!ok) {
        console.error(`❌ [${input ?? "undefined"}] Expected safe default (moderate/intermediate/50), got technicalDifficulty=${result.technicalDifficulty} technicalDepth=${result.technicalDepth} behavioralRatio=${result.behavioralRatio}`);
        failed++;
      }
    }
  }

  const csv = [
    "inputYear,normalizedYear,technicaldifficulty,technicaldepth,behavioralratio",
    ...rows.map((r) => r.map((c) => (c.includes(",") ? `"${c.replace(/"/g, '""')}"` : c)).join(",")),
  ].join("\n");

  writeFileSync(REPORT_PATH, csv, "utf-8");

  if (failed > 0) {
    console.error(`\n❌ ${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log(`✅ All assertions passed`);
  console.log(`📄 Report: ${REPORT_PATH}`);
  process.exit(0);
}

main();
