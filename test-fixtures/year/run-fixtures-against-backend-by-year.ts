/**
 * Run voice fixtures against the backend eval-fixture endpoint with Freshman/Junior/Senior
 * year variants. Validates that the backend accepts and uses year context.
 *
 * Usage:
 *   1. Start backend: cd backend && npm run dev
 *   2. Run: npx tsx test-fixtures/year/run-fixtures-against-backend-by-year.ts
 *
 * Optional: BACKEND_URL=http://localhost:5000 (default)
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readdirSync, writeFileSync } from "fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: join(root, ".env") });
config({ path: join(root, "backend", ".env") });

import { EvaluationJsonSchema } from "../../backend/server/llm/openaiEvaluator";
import { getYearToDifficulty } from "../../frontend/src/lib/yearToDifficulty";

const PORT = process.env.PORT || 5000;
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;
const VOICE_DIR = join(root, "test-fixtures", "voice");
const OUTPUT_CSV = join(dirname(fileURLToPath(import.meta.url)), "backend_year_eval_report.csv");

const YEAR_VARIANTS = ["Freshman", "Junior", "Senior"] as const;

function getFixtureIds(): string[] {
  const files = readdirSync(VOICE_DIR);
  const ids = new Set<string>();
  for (const f of files) {
    if (f.endsWith(".meta.json")) {
      ids.add(f.replace(/\.meta\.json$/, ""));
    }
  }
  return Array.from(ids).sort();
}

async function evalFixtureWithYear(
  fixtureId: string,
  yearVariant: (typeof YEAR_VARIANTS)[number]
): Promise<{
  status: "ok" | "error";
  overallscore?: number;
  perQuestionScoreAvg?: number;
  error?: string;
}> {
  const { technicalDifficulty, technicalDepth, behavioralRatio } =
    getYearToDifficulty(yearVariant);

  const res = await fetch(`${BACKEND_URL}/api/dev/eval-fixture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fixtureId,
      studentyear: yearVariant,
      technicaldifficulty: technicalDifficulty,
      technicaldepth: technicalDepth,
      behavioralratio: String(behavioralRatio),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      status: "error",
      error: `HTTP ${res.status}: ${body.substring(0, 100)}`,
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { status: "error", error: "Invalid JSON response" };
  }

  const parsed = EvaluationJsonSchema.safeParse(data);
  if (!parsed.success) {
    return {
      status: "error",
      error: parsed.error.errors.map((e) => e.message).join("; "),
    };
  }

  const scores = parsed.data.questions.map((q) => q.score);
  const avg =
    scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : parsed.data.overall_score;

  return {
    status: "ok",
    overallscore: parsed.data.overall_score,
    perQuestionScoreAvg: Math.round(avg * 100) / 100,
  };
}

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const ids = getFixtureIds();
  if (ids.length === 0) {
    console.error("No fixtures found in test-fixtures/voice/");
    process.exit(1);
  }

  const total = ids.length * YEAR_VARIANTS.length;
  console.log(
    `\n🔄 Running ${ids.length} fixture(s) × 3 year variants = ${total} calls...`
  );
  console.log(`   Backend: ${BACKEND_URL}/api/dev/eval-fixture\n`);

  const rows: string[][] = [];

  for (const id of ids) {
    for (const yearVariant of YEAR_VARIANTS) {
      const result = await evalFixtureWithYear(id, yearVariant);
      const status =
        result.status === "ok" ? "ok" : (result.error ?? "error");
      rows.push([
        id,
        yearVariant,
        String(result.overallscore ?? ""),
        String(result.perQuestionScoreAvg ?? ""),
        status,
      ]);
      const icon = result.status === "ok" ? "✅" : "❌";
      console.log(
        `${icon} [${id}] ${yearVariant}: overall=${result.overallscore ?? "—"} avg=${result.perQuestionScoreAvg ?? "—"} ${result.error ?? ""}`
      );
    }
  }

  const csv = [
    "fixtureId,yearVariant,overallscore,perQuestionScoreAvg,status",
    ...rows.map((r) => r.map(escapeCsv).join(",")),
  ].join("\n");

  writeFileSync(OUTPUT_CSV, csv, "utf-8");

  const okCount = rows.filter((r) => r[4] === "ok").length;
  console.log(`\n--- Summary ---`);
  console.log(`OK: ${okCount}/${total}`);
  console.log(`Report: ${OUTPUT_CSV}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
