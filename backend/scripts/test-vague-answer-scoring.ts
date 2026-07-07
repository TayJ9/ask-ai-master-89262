/**
 * Tests stricter vagueness scoring: deterministic caps + optional live OpenAI pass.
 *
 * Usage:
 *   cd backend && npx tsx scripts/test-vague-answer-scoring.ts
 *   npm run test:vague-scoring
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import {
  analyzeAnswerQuality,
  buildCoachingImprovements,
  capQuestionScore,
  inferQuestionType,
  isGenericImprovement,
  mergeCoachingImprovements,
} from "../server/llm/answerQuality";
import {
  applyStrictScoreCaps,
  scoreInterview,
  EvaluationJsonSchema,
  type EvaluationJson,
} from "../server/llm/openaiEvaluator";

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

// --- Deterministic cap tests (no API) ---

section("1. Deterministic vagueness detection");

const vagueBehavioralQ = "Tell me about a time when you worked on a team project.";
const vagueBehavioralA =
  "Yeah I did some team stuff and it went fine. We kind of worked together on things and it was okay I guess.";

const vagueQuality = analyzeAnswerQuality(vagueBehavioralQ, vagueBehavioralA, "behavioral");
ok("vague behavioral has no_concrete_detail", vagueQuality.flags.includes("no_concrete_detail"));
ok("vague behavioral is short", vagueQuality.flags.includes("short_answer"));
ok("vague behavioral has high_filler", vagueQuality.flags.includes("high_filler"));

const strongBehavioralA =
  "Last summer I interned at TechCorp on the platform team. Our API latency jumped 40% after a release. I profiled the Node service, added Redis caching for hot endpoints, and reduced p95 latency from 800ms to 120ms. I presented the results to engineering leadership and the team shipped the fix in two weeks with no regressions.";

const strongQuality = analyzeAnswerQuality(vagueBehavioralQ, strongBehavioralA, "behavioral");
ok("strong behavioral lacks vagueness flags", strongQuality.flags.length === 0, `flags: ${strongQuality.flags.join(", ")}`);

section("2. Deterministic score caps");

const vagueCap = capQuestionScore({
  question: vagueBehavioralQ,
  answer: vagueBehavioralA,
  score: 78,
  questionType: "behavioral",
  starBreakdown: {
    situation: "missing",
    task: "weak",
    action: "weak",
    result: "missing",
  },
});
ok("inflated vague behavioral capped to <= 55", vagueCap.score <= 55, `got ${vagueCap.score}`);
ok("vague behavioral marked capped", vagueCap.capped);
ok("vague behavioral has score_capped flags", vagueCap.vagueness_flags.length > 0);

const strongCap = capQuestionScore({
  question: vagueBehavioralQ,
  answer: strongBehavioralA,
  score: 82,
  questionType: "behavioral",
  starBreakdown: {
    situation: "strong",
    task: "strong",
    action: "strong",
    result: "strong",
  },
});
ok("strong behavioral not capped", !strongCap.capped);
ok("strong behavioral keeps high score", strongCap.score >= 75, `got ${strongCap.score}`);

const vagueInfoCap = capQuestionScore({
  question: "Tell me about yourself.",
  answer: "I like tech and learning new stuff. I'm a hard worker.",
  score: 72,
  questionType: "informational",
});
ok("vague informational capped to <= 65", vagueInfoCap.score <= 65, `got ${vagueInfoCap.score}`);

section("3. applyStrictScoreCaps on mock inflated LLM output");

const inflatedMock: EvaluationJson = {
  overall_score: 78,
  overall_strengths: ["Good communication"],
  overall_improvements: ["Add more detail"],
  questions: [
    {
      question: vagueBehavioralQ,
      answer: vagueBehavioralA,
      score: 75,
      strengths: ["Answered the question"],
      improvements: ["Could add detail"],
      question_type: "behavioral",
      star_breakdown: {
        situation: "missing",
        task: "weak",
        action: "weak",
        result: "missing",
      },
    },
    {
      question: "Tell me about yourself.",
      answer: "I like learning and working with people. I'm pretty flexible.",
      score: 70,
      strengths: ["Showed interest"],
      improvements: ["Be more specific"],
      question_type: "informational",
    },
  ],
};

const strict = applyStrictScoreCaps(inflatedMock);
ok("mock overall recalculated lower", strict.overall_score <= 60, `got ${strict.overall_score}`);
ok("mock Q1 capped", (strict.questions[0].score_capped ?? false) === true);
ok("mock Q1 score <= 55", strict.questions[0].score <= 55, `got ${strict.questions[0].score}`);
ok("mock overall equals average of capped scores", strict.overall_score === Math.round(
  (strict.questions[0].score + strict.questions[1].score) / 2
));

section("4. Flag-specific coaching (replaces generic fallback)");

ok("detects generic fallback", isGenericImprovement("Could provide more specific details"));
ok("allows specific coaching", !isGenericImprovement("Name the project and your role in it"));

const coaching = buildCoachingImprovements({
  flags: ["short_answer", "high_filler", "no_concrete_detail", "no_outcome_language"],
  questionType: "behavioral",
  starBreakdown: { situation: "missing", task: "weak", action: "weak", result: "missing" },
  wordCount: 18,
  score: 40,
});
ok("coaching produces multiple tips", coaching.length >= 2, `got ${coaching.length}`);
ok(
  "coaching tips are distinct",
  new Set(coaching).size === coaching.length,
  coaching.join(" | "),
);
ok(
  "coaching mentions word count",
  coaching.some((t) => t.includes("18") || t.includes("words")),
);

const merged = mergeCoachingImprovements(
  ["Could provide more specific details"],
  coaching,
);
ok("merge replaces generic-only LLM text", !merged.every((m) => isGenericImprovement(m)));
ok("merge has flag-specific content", merged.some((m) => m.includes("STAR") || m.includes("words")));

const strictFeedback = applyStrictScoreCaps({
  ...inflatedMock,
  questions: inflatedMock.questions.map((q) => ({
    ...q,
    improvements: ["Could provide more specific details"],
  })),
});
const allImprovements = strictFeedback.questions.flatMap((q) => q.improvements);
const uniqueImprovements = new Set(allImprovements);
ok(
  "strict caps yield distinct per-question improvements",
  uniqueImprovements.size >= 2,
  allImprovements.join(" || "),
);
ok(
  "no question left with only generic fallback",
  strictFeedback.questions.every(
    (q) => q.improvements.length > 0 && !q.improvements.every((i) => isGenericImprovement(i)),
  ),
);

section("5. Question type inference");
ok("behavioral inferred", inferQuestionType("Tell me about a time when you failed.") === "behavioral");
ok("technical inferred", inferQuestionType("Explain how a hash map works.") === "technical");
ok("informational inferred", inferQuestionType("Tell me about yourself.") === "informational");

// --- Optional live OpenAI integration ---
section("6. Live OpenAI integration (optional)");

if (!process.env.OPENAI_API_KEY) {
  console.log("  ⏭️  Skipped — OPENAI_API_KEY not set");
} else {
  try {
    const live = await scoreInterview({
      role: "Software Engineer Intern",
      major: "Computer Science",
      resumeText:
        "CS student with React, Python, 3.8 GPA. Built a capstone analytics dashboard used by 200 students.",
      studentYear: "Junior",
      technicalDifficulty: "intermediate",
      technicalDepth: "moderate",
      behavioralRatio: 50,
      questions: [
        {
          question: vagueBehavioralQ,
          answer: vagueBehavioralA,
        },
        {
          question: "Tell me about yourself.",
          answer: "I'm interested in software and I learn quickly.",
        },
      ],
    });

    const parsed = EvaluationJsonSchema.safeParse(live);
    ok("live evaluation passes schema", parsed.success);
    ok("live overall score <= 60 for vague interview", live.overall_score <= 60, `got ${live.overall_score}`);
    ok(
      "live vague behavioral capped or low",
      live.questions[0].score <= 60,
      `Q1 score ${live.questions[0].score}, capped=${live.questions[0].score_capped}`,
    );
    ok(
      "live resume not credited to vague answers",
      live.questions.every((q) => q.score <= 65),
      `scores: ${live.questions.map((q) => q.score).join(", ")}`,
    );
    ok(
      "live improvements not all generic",
      live.questions.every(
        (q) => q.improvements.length > 0 && !q.improvements.every((i) => isGenericImprovement(i)),
      ),
      live.questions.map((q) => q.improvements.join("; ")).join(" | "),
    );

    console.log("\n  Live result summary:");
    console.log(`    overall_score: ${live.overall_score}`);
    for (const [i, q] of live.questions.entries()) {
      console.log(
        `    Q${i + 1}: score=${q.score} capped=${q.score_capped ?? false} flags=${(q.vagueness_flags ?? []).join(",") || "none"}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ok("live OpenAI evaluation", false, msg);
  }
}

// --- Summary ---
console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

process.exit(failed > 0 ? 1 : 0);
