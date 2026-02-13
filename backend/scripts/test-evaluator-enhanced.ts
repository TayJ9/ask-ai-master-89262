/**
 * Test script for enhanced evaluator (question_type, star_breakdown, improvement_quote, sample_better_answer)
 *
 * Usage:
 *   OPENAI_API_KEY=your-key npx tsx backend/scripts/test-evaluator-enhanced.ts
 *   Or: cd backend && npm run test:evaluator
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import { scoreInterview, EvaluationJsonSchema } from "../server/llm/openaiEvaluator";

const BEHAVIORAL_QUESTION = "Tell me about a time when you had to resolve a conflict with a teammate.";
const BEHAVIORAL_ANSWER =
  "At my last job, a teammate and I disagreed on the API design. The situation was tense. I scheduled a meeting, we discussed pros and cons, and we chose a hybrid approach. It worked out.";

const TECHNICAL_QUESTION = "Explain the difference between REST and GraphQL.";
const TECHNICAL_ANSWER =
  "REST uses HTTP and URLs. GraphQL is different—you send a query. I think REST is simpler for basic stuff.";

const FIXTURE = {
  role: "Software Engineer Intern",
  major: "Computer Science",
  resumeText: "State University CS student. Intern at TechCorp. React, Node.js, Python. GPA 3.8.",
  questions: [
    { question: BEHAVIORAL_QUESTION, answer: BEHAVIORAL_ANSWER },
    { question: TECHNICAL_QUESTION, answer: TECHNICAL_ANSWER },
  ],
};

async function main() {
  console.log("🧪 Testing Enhanced Evaluator (question_type, star_breakdown, improvement_quote, sample_better_answer)\n");

  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY environment variable is required");
    process.exit(1);
  }

  console.log("Fixture:");
  console.log(`  role: ${FIXTURE.role}`);
  console.log(`  major: ${FIXTURE.major}`);
  console.log(`  resume: ${FIXTURE.resumeText.substring(0, 40)}...`);
  console.log(`  Q1 (behavioral): ${BEHAVIORAL_QUESTION.substring(0, 50)}...`);
  console.log(`  Q2 (technical):  ${TECHNICAL_QUESTION.substring(0, 50)}...\n`);

  try {
    const startTime = Date.now();
    const evaluation = await scoreInterview(FIXTURE);
    const duration = Date.now() - startTime;

    console.log(`✅ Evaluation completed in ${duration}ms\n`);

    // Validate with Zod schema
    const parsed = EvaluationJsonSchema.safeParse(evaluation);
    if (!parsed.success) {
      console.error("❌ Schema validation failed:");
      console.error(parsed.error.errors.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n"));
      process.exit(1);
    }
    console.log("✅ Zod schema validation passed\n");

    // Print parsed result (without full resume/transcript)
    console.log("📋 Parsed JSON (summary):");
    console.log(JSON.stringify(evaluation, null, 2));
    console.log("");

    // Assertions
    let failed = 0;

    // question_type exists for every question
    for (let i = 0; i < evaluation.questions.length; i++) {
      const q = evaluation.questions[i];
      if (!q.question_type) {
        console.error(`❌ questions[${i}].question_type is missing`);
        failed++;
      } else {
        console.log(`✅ questions[${i}].question_type = ${q.question_type}`);
      }
    }

    // If behavioral: star_breakdown exists with all 4 keys
    const behavioralIdx = evaluation.questions.findIndex((q) => q.question_type === "behavioral");
    if (behavioralIdx >= 0) {
      const q = evaluation.questions[behavioralIdx];
      const sb = q.star_breakdown;
      const keys = ["situation", "task", "action", "result"] as const;
      if (!sb) {
        console.error(`❌ questions[${behavioralIdx}] is behavioral but star_breakdown is missing`);
        failed++;
      } else {
        const missing = keys.filter((k) => !(k in sb));
        if (missing.length > 0) {
          console.error(`❌ star_breakdown missing keys: ${missing.join(", ")}`);
          failed++;
        } else {
          console.log(`✅ star_breakdown present: ${JSON.stringify(sb)}`);
        }
      }
    } else {
      console.log("⚠️ No behavioral question found; skipping star_breakdown check");
    }

    // At least one improvement_quote present OR warning
    const hasImprovementQuote = evaluation.questions.some(
      (q) => q.improvement_quote && q.improvement_quote.trim().length > 0
    );
    if (!hasImprovementQuote) {
      console.log("⚠️ No improvement_quote in any question (optional; model may omit if no suitable phrase)");
    } else {
      const idx = evaluation.questions.findIndex((q) => q.improvement_quote?.trim());
      console.log(`✅ improvement_quote present: questions[${idx}] "${evaluation.questions[idx].improvement_quote?.substring(0, 50)}..."`);
    }

    // sample_better_answer for lowest-scoring question OR any score < 60
    const lowestIdx = evaluation.questions.reduce(
      (minIdx, q, i, arr) => (q.score < arr[minIdx].score ? i : minIdx),
      0
    );
    const lowestScore = evaluation.questions[lowestIdx].score;
    const hasLowScore = evaluation.questions.some((q) => q.score < 60);
    const withSample = evaluation.questions.filter((q) => q.sample_better_answer?.trim());
    const hasSampleForLowest = evaluation.questions[lowestIdx].sample_better_answer?.trim();
    const hasSampleForUnder60 = hasLowScore && evaluation.questions.some((q) => q.score < 60 && q.sample_better_answer?.trim());

    if (!hasSampleForLowest && !hasSampleForUnder60) {
      console.log(
        `⚠️ sample_better_answer not found for lowest-scoring question (${lowestScore}/100) or any <60 (optional per prompt)`
      );
    } else {
      const q = hasSampleForUnder60
        ? evaluation.questions.find((x) => x.score < 60 && x.sample_better_answer?.trim())
        : evaluation.questions[lowestIdx];
      console.log(`✅ sample_better_answer present: questions[${evaluation.questions.indexOf(q!)}] (score ${q!.score})`);
      console.log(`   Excerpt: "${q!.sample_better_answer!.substring(0, 80)}..."`);
    }

    console.log("\n--- Summary ---");
    if (failed > 0) {
      console.error(`❌ ${failed} assertion(s) failed`);
      process.exit(1);
    }
    console.log("✅ All required assertions passed");
    process.exit(0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("\n❌ Error:", msg);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
