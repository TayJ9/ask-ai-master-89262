/**
 * Compare heuristic resume processing (production fallback) vs Hugging Face NER + summarization.
 * Run: npx tsx backend/scripts/compare-resume-old-vs-hf.ts
 */
import "dotenv/config";
import { buildResumeProfile } from "../server/resumeProfileHeuristic";
import { stripResumeContactInfo } from "../server/resumeSanitize";
import {
  extractResumeProfileWithNER,
  summarizeResume,
} from "../server/llm/huggingfaceResume";

/** Structured so `buildResumeProfile` picks up Skills: line; body still realistic for NER/summarization */
const SAMPLE_RESUME = `
Alex Rivera
alex.rivera@email.com | (555) 010-2030 | Boston, MA

SUMMARY
Full-stack engineer with 4 years shipping B2B SaaS. Focus on TypeScript, PostgreSQL, and AWS.

Skills: TypeScript, React, Node.js, PostgreSQL, AWS, Docker, Kubernetes, GraphQL, Jest, CI/CD

EXPERIENCE
Senior Software Engineer — Northwind Analytics (2022–Present)
- Owned billing microservices (Node.js, Postgres); cut p99 latency 40%.
- Led migration from REST to GraphQL for partner API.

Software Engineer — Contoso Labs (2020–2022)
- Built React dashboards and Python ETL jobs for customer health metrics.

EDUCATION
BS Computer Science, Northeastern University, 2020

PROJECTS
Open-source CLI for schema diffing (Go); 800+ GitHub stars.
`;

const MAX_SUMMARY = 1500;
const MAX_HIGHLIGHTS = 500;

function printSection(title: string) {
  console.log(`\n${"=".repeat(64)}\n${title}\n${"=".repeat(64)}`);
}

function printProfile(label: string, p: Record<string, unknown>) {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(p, null, 2));
}

function printTextBlock(label: string, text: string, maxPreview = 400) {
  console.log(`\n--- ${label} (${text.length} chars) ---`);
  const preview = text.slice(0, maxPreview);
  console.log(preview + (text.length > maxPreview ? "…" : ""));
}

async function main() {
  const text = stripResumeContactInfo(SAMPLE_RESUME.trim());
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  console.log("Hugging Face token:", token?.trim() ? "set" : "NOT set (HF will match heuristic for profile; summary = slice)");

  printSection("OLD: Heuristic only (same as upload fallback)");
  const oldProfile = buildResumeProfile(text);
  printProfile("resumeProfile (buildResumeProfile)", oldProfile as any);
  const oldSummary = text.slice(0, MAX_SUMMARY);
  const oldHighlights = text.slice(0, MAX_HIGHLIGHTS);
  printTextBlock("resume_summary (first 1500 chars of raw text)", oldSummary);
  printTextBlock("resume_highlights (first 500 chars of raw text)", oldHighlights);

  printSection("NEW: HF NER merge + HF summarization (same as upload when token works)");
  const hfProfile = await extractResumeProfileWithNER(text, { ...oldProfile });
  printProfile("resumeProfile (after extractResumeProfileWithNER)", hfProfile as any);

  const hfSummaryResult = await summarizeResume(text, {
    maxSummaryChars: MAX_SUMMARY,
    maxHighlightsChars: MAX_HIGHLIGHTS,
  });
  if (hfSummaryResult) {
    printTextBlock("resume_summary (HF summarization)", hfSummaryResult.summary);
    printTextBlock("resume_highlights (truncated from summary)", hfSummaryResult.highlights);
  } else {
    console.log("\n--- HF summarization ---");
    console.log("Returned null (no token, all models failed, or empty output).");
    console.log("Upload route would keep heuristic slices for summary/highlights.");
  }

  printSection("Quick delta");
  const skillsOld = new Set(oldProfile.skills);
  const skillsNew = new Set(hfProfile.skills);
  const addedSkills = [...skillsNew].filter((s) => !skillsOld.has(s));
  console.log(
    "Skills only in HF profile (vs heuristic):",
    addedSkills.length ? addedSkills : "(none — identical set or HF skipped)"
  );
  console.log(
    "HF companies field:",
    hfProfile.companies?.length ? hfProfile.companies : "(none / undefined)"
  );
  if (hfSummaryResult) {
    const sameStart =
      hfSummaryResult.summary.slice(0, 80) === oldSummary.slice(0, 80);
    console.log(
      "Summary starts same as raw slice (first 80 chars):",
      sameStart ? "yes (unexpected)" : "no (HF produced different text)"
    );
  }

  printSection("Summary only — old vs new (for quick reading)");
  console.log("\n>>> OLD (heuristic): first 1500 characters of raw resume text\n");
  console.log(oldSummary);
  console.log("\n>>> NEW (HF summarization model)\n");
  console.log(hfSummaryResult?.summary ?? "(HF summarization unavailable — would match OLD slice in production.)");

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
