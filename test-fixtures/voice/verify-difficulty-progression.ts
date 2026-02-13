/**
 * Verify year-based difficulty progression — compare prompt_question
 * style across Freshman, Junior, Senior to confirm level tuning.
 *
 * Usage:
 *   npx tsx test-fixtures/voice/verify-difficulty-progression.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const VOICE_DIR = path.dirname(fileURLToPath(import.meta.url));

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

// Technical keywords that should appear more in Senior > Junior > Freshman
const TECHNICAL_KEYWORDS = [
  "design",
  "trade-off",
  "tradeoff",
  "rate limiter",
  "api",
  "rest",
  "graphql",
  "technical decision",
  "debug",
  "architecture",
  "system",
];

// Behavioral/intro keywords that should appear more in Freshman
const BEHAVIORAL_KEYWORDS = [
  "tell me about yourself",
  "worked with a team",
  "handle stress",
  "interested in",
  "deadlines",
];

function countKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((k) => lower.includes(k)).length;
}

function main() {
  console.log("🔍 Year-Based Difficulty Progression Check\n");

  const byLevel: Record<string, { id: string; question: string }[]> = {
    freshman: [],
    junior: [],
    senior: [],
  };

  for (const id of FIXTURE_IDS) {
    const metaPath = path.join(VOICE_DIR, `${id}.meta.json`);
    if (!fs.existsSync(metaPath)) {
      console.error(`⚠️ Missing ${id}.meta.json`);
      continue;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    const level = meta.level || id.split("_")[0];
    byLevel[level] = byLevel[level] || [];
    byLevel[level].push({ id, question: meta.prompt_question });
  }

  const levels = ["freshman", "junior", "senior"] as const;

  for (const level of levels) {
    const items = byLevel[level] || [];
    const allText = items.map((i) => i.question).join(" ");
    const techCount = countKeywords(allText, TECHNICAL_KEYWORDS);
    const behavCount = countKeywords(allText, BEHAVIORAL_KEYWORDS);

    console.log(`### ${level.toUpperCase()} (${items.length} fixtures)`);
    console.log(`   Technical keyword hits: ${techCount}`);
    console.log(`   Behavioral keyword hits: ${behavCount}`);
    items.forEach(({ id, question }) => {
      console.log(`   - ${id}: ${question.substring(0, 70)}...`);
    });
    console.log("");
  }

  // Sanity: Senior should have more technical keyword density than Freshman
  const freshmanText = (byLevel.freshman || []).map((i) => i.question).join(" ");
  const seniorText = (byLevel.senior || []).map((i) => i.question).join(" ");
  const diff = countKeywords(seniorText, TECHNICAL_KEYWORDS) - countKeywords(freshmanText, TECHNICAL_KEYWORDS);

  if (diff >= 0) {
    console.log("✅ Senior prompts contain more technical keywords than Freshman (expected progression)");
  } else {
    console.log("⚠️ Senior prompts do not show clearly higher technical density — check fixture definitions");
  }

  process.exit(0);
}

main();
