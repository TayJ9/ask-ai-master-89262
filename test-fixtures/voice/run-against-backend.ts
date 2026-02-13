/**
 * Run voice fixtures against the backend dev eval-fixture endpoint.
 * Tests the real evaluation pipeline without live voice.
 *
 * Usage:
 *   1. Start backend: cd backend && npm run dev
 *   2. Run: npx tsx test-fixtures/voice/run-against-backend.ts
 *
 * Optional: BACKEND_URL=http://localhost:5000 (default)
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readdirSync, existsSync } from "fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: join(root, ".env") });
config({ path: join(root, "backend", ".env") });

import { EvaluationJsonSchema } from "../../backend/server/llm/openaiEvaluator";

const PORT = process.env.PORT || 5000;
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;
const VOICE_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_CSV = join(VOICE_DIR, "backend_eval_report.csv");

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

async function evalFixture(fixtureId: string): Promise<{
  status: "ok" | "error";
  overallScore?: number;
  perQuestionScores?: number[];
  error?: string;
}> {
  const res = await fetch(`${BACKEND_URL}/api/dev/eval-fixture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixtureId }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { status: "error", error: `HTTP ${res.status}: ${body.substring(0, 100)}` };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { status: "error", error: "Invalid JSON response" };
  }

  const parsed = EvaluationJsonSchema.safeParse(data);
  if (!parsed.success) {
    return { status: "error", error: parsed.error.errors.map((e) => e.message).join("; ") };
  }

  const perQuestionScores = parsed.data.questions.map((q) => q.score);
  return {
    status: "ok",
    overallScore: parsed.data.overall_score,
    perQuestionScores,
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

  console.log(`\n🔄 Running ${ids.length} fixture(s) against ${BACKEND_URL}/api/dev/eval-fixture...\n`);

  const rows: string[][] = [];

  for (const id of ids) {
    const result = await evalFixture(id);
    const perQuestionScore = result.perQuestionScores?.join(";") ?? "";
    const status = result.status === "ok" ? "ok" : result.error ?? "error";
    rows.push([
      id,
      String(result.overallScore ?? ""),
      escapeCsv(perQuestionScore),
      status,
    ]);
    const icon = result.status === "ok" ? "✅" : "❌";
    console.log(`${icon} [${id}] overall=${result.overallScore ?? "—"} ${result.error ?? ""}`);
  }

  const csv = [
    "fixtureId,overallScore,perQuestionScores,status",
    ...rows.map((r) => r.map(escapeCsv).join(",")),
  ].join("\n");

  const { writeFileSync } = await import("fs");
  writeFileSync(OUTPUT_CSV, csv, "utf-8");

  const okCount = rows.filter((r) => r[3] === "ok").length;
  console.log(`\n--- Summary ---`);
  console.log(`OK: ${okCount}/${ids.length}`);
  console.log(`Report: ${OUTPUT_CSV}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
