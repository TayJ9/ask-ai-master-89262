/**
 * Hugging Face Resume Processing
 *
 * Priority 1: NER for resume profile extraction (skills, companies, education)
 * Priority 2: Prose summarization — used only as a weak fallback when the
 *             structured interview brief cannot be built from the profile.
 *
 * Interview dynamic vars prefer `buildInterviewResumeBrief` (structured).
 * Full resume text remains available via GetResumeFullText server tools.
 *
 * Falls back to heuristic/slice when HUGGINGFACE_TOKEN is not set or on API errors.
 */

import { InferenceClient, type InferenceProviderOrPolicy } from "@huggingface/inference";

/** Serverless HF Inference API — avoids auto-routing "provider: undefined" warnings. */
const HF_INFERENCE_PROVIDER: InferenceProviderOrPolicy =
  (process.env.HF_INFERENCE_PROVIDER?.trim() as InferenceProviderOrPolicy | undefined) ||
  "hf-inference";

/** NER models known to run on hf-inference (resume-specific repos are not hosted there). */
const NER_MODELS = [
  "dslim/bert-base-NER",
  "dbmdz/bert-large-cased-finetuned-conll03-english",
] as const;

const SUMMARIZATION_MODELS = [
  "sshleifer/distilbart-cnn-12-6",
  "facebook/bart-large-cnn",
] as const;

// Resume profile shape (matches buildResumeProfile)
export interface ResumeProfile {
  skills: string[];
  projects: string[];
  experience: string[];
  education: string[];
  companies?: string[]; // From NER
}

// NER entity from token classification
interface NEREntity {
  entity_group?: string;
  entity?: string;
  word: string;
  score?: number;
  start?: number;
  end?: number;
}

/** Single-token ORG labels that are usually tokenizer fragments or mis-tags, not employers */
const ORG_BLOCKLIST = new Set(
  [
    "no", "or", "at", "to", "an", "as", "by", "if", "of", "on", "do", "is", "be", "we", "us",
    "am", "pm", "est", "gmt", "utc", "the", "and", "for", "per", "via", "inc", "llc", "ltd",
    "post", "dock", "grap", "je", "con", "ku", "sql", "api", "rest", "node", "ci", "cd",
  ].map((s) => s.toLowerCase())
);

function normalizeEntityLabel(e: NEREntity): string {
  const raw = (e.entity_group || e.entity || "MISC").toUpperCase();
  if (raw.startsWith("B-") || raw.startsWith("I-")) return raw.slice(2);
  return raw;
}

/**
 * Merge WordPiece (##), RoBERTa Ġ/▁, adjacent character spans, and I-* BIO continuations
 * into one string per logical entity.
 */
function mergeNERSpans(entities: NEREntity[]): Array<{ group: string; text: string }> {
  type Row = {
    group: string;
    word: string;
    start?: number;
    end?: number;
    entity?: string;
  };

  const rows: Row[] = entities
    .map((e) => ({
      group: normalizeEntityLabel(e),
      word: String(e.word ?? "").trim(),
      start: typeof e.start === "number" ? e.start : undefined,
      end: typeof e.end === "number" ? e.end : undefined,
      entity: e.entity || e.entity_group,
    }))
    .filter((r) => r.word.length > 0);

  const chunks: Array<{ group: string; text: string; end?: number; start?: number }> = [];

  const pieceClean = (piece: string) => {
    let p = piece.trim();
    while (p.startsWith("##")) p = p.slice(2);
    p = p.replace(/^Ġ+/, "").replace(/^▁+/, "");
    return p;
  };

  for (const row of rows) {
    const w = row.word;
    const prev = chunks[chunks.length - 1];
    const sameGroup = prev && prev.group === row.group;
    const isSubword = /^##/.test(w);
    const adjacent =
      sameGroup &&
      prev!.end !== undefined &&
      row.start !== undefined &&
      prev!.end === row.start;
    const isBioContinue =
      sameGroup && typeof row.entity === "string" && /^I-/i.test(row.entity);

    const append = (fragment: string, end?: number) => {
      const last = chunks[chunks.length - 1];
      if (!last) return;
      last.text += fragment;
      if (end !== undefined) last.end = end;
    };

    if (sameGroup && isSubword) {
      append(pieceClean(w), row.end);
      continue;
    }

    if (sameGroup && adjacent) {
      const p = pieceClean(w);
      const sep =
        p.length > 0 && !/^[.,;:!?%]/.test(p) && !/[(-]$/.test(prev!.text) ? " " : "";
      append(`${sep}${p}`, row.end);
      continue;
    }

    if (isBioContinue) {
      const p = pieceClean(w);
      const sep = p.length > 0 && !/^[.,;:!?%]/.test(p) ? " " : "";
      append(`${sep}${p}`, row.end);
      continue;
    }

    const initial = pieceClean(w);
    chunks.push({
      group: row.group,
      text: initial,
      start: row.start,
      end: row.end,
    });
  }

  return chunks
    .map(({ group, text }) => ({
      group,
      text: text.replace(/\s+/g, " ").replace(/##+/g, "").trim(),
    }))
    .filter((c) => c.text.length > 0);
}

function isPlausibleCompanyName(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (/##/.test(t)) return false;
  const letters = (t.match(/[a-zA-Z]/g) || []).length;
  if (letters < 4) return false;
  const lower = t.toLowerCase();
  if (!t.includes(" ") && ORG_BLOCKLIST.has(lower)) return false;
  return true;
}

function isPlausibleSkillToken(text: string): boolean {
  const t = text.trim().replace(/##+/g, "");
  if (t.length < 2) return false;
  if (/##/.test(t)) return false;
  return true;
}

/** Returns null if edit distance exceeds `max` (early exit). */
function levenshteinBounded(a: string, b: string, max: number): number | null {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return null;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    if (Math.min(...cur) > max) return null;
    prev = cur;
  }
  const d = prev[n];
  return d > max ? null : d;
}

/**
 * Drop ORG spans that duplicate skills (e.g. "GrapQL" vs GraphQL), education noise ("Science"),
 * and near-duplicate company strings from the same NER pass.
 */
function postProcessCompanyNames(
  names: string[],
  resumeText: string,
  skillSet: Iterable<string>
): string[] {
  const resumeLower = resumeText.toLowerCase();
  const skillLc = new Set(
    [...skillSet].map((s) => s.toLowerCase()).filter((s) => s.length >= 2)
  );

  const filtered = names.filter((c) => {
    const lc = c.toLowerCase().trim();
    if (lc.length < 4) return false;
    if (lc === "science" && !c.includes(" ")) return false;

    for (const s of skillLc) {
      if (s.length < 4) continue;
      if (!resumeLower.includes(s)) continue;
      if (lc === s) return false;
      const d2 = levenshteinBounded(lc, s, 3);
      if (d2 !== null && d2 <= 2 && s.length >= 5) return false;
      if (s.length >= 8) {
        const d4 = levenshteinBounded(lc, s, 5);
        if (d4 !== null && d4 <= 4 && lc.length <= s.length + 1) return false;
      }
    }
    return true;
  });

  filtered.sort((a, b) => b.length - a.length);
  const out: string[] = [];
  for (const c of filtered) {
    const lc = c.toLowerCase();
    let skip = false;
    for (const e of out) {
      const el = e.toLowerCase();
      const d = levenshteinBounded(lc, el, 3);
      if (d !== null && d <= 2 && Math.abs(c.length - e.length) <= 3) {
        skip = true;
        break;
      }
    }
    if (!skip) out.push(c);
  }
  return out.slice(0, 15);
}

function getHfClient(): InferenceClient | null {
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  if (!token || token.trim() === "") return null;
  return new InferenceClient(token);
}

/**
 * Extract resume profile using Hugging Face NER.
 * Uses resume-specific model when available; falls back to generic NER + heuristic merge.
 */
export async function extractResumeProfileWithNER(
  resumeText: string,
  heuristicFallback: ResumeProfile
): Promise<ResumeProfile> {
  const hf = getHfClient();
  if (!hf) return heuristicFallback;

  try {
    // Resume text may exceed model limits; use first ~2000 chars (roughly 500 tokens)
    const textChunk = resumeText.slice(0, 2000);

    let entities: NEREntity[] = [];
    for (const model of NER_MODELS) {
      try {
        const result = await hf.tokenClassification({
          model,
          inputs: textChunk,
          provider: HF_INFERENCE_PROVIDER,
          parameters: { aggregation_strategy: "simple" },
        });
        entities = Array.isArray(result) ? result : [];
        break;
      } catch {
        continue;
      }
    }

    if (entities.length === 0) return heuristicFallback;

    const merged = mergeNERSpans(entities);

    // Map to profile - resume model uses: Skills, Companies worked at, Designation, Degree, College Name, etc.
    // Generic NER uses: PER, ORG, LOC, MISC
    const skills = new Set(heuristicFallback.skills);
    const companies = new Set<string>();
    const experience = [...heuristicFallback.experience];
    const education = [...heuristicFallback.education];
    const projects = [...heuristicFallback.projects];

    for (const { group, text } of merged) {
      if (group === "SKILLS" || group === "SKILL") {
        if (isPlausibleSkillToken(text)) skills.add(text);
      } else if (
        group === "ORG" ||
        group === "ORGANIZATION" ||
        group === "COMPANIES WORKED AT" ||
        group === "COMPANIES"
      ) {
        if (isPlausibleCompanyName(text)) companies.add(text);
      } else if (
        group === "DEGREE" ||
        group === "COLLEGE NAME" ||
        group === "COLLEGE" ||
        group === "GRADUATION YEAR"
      ) {
        if (text.length >= 4 && !education.some((e) => e.includes(text.slice(0, 12)))) {
          education.push(text);
        }
      } else if (group === "DESIGNATION" || group === "JOB TITLE") {
        if (text.length >= 4 && !experience.some((e) => e.includes(text.slice(0, 12)))) {
          experience.push(text);
        }
      }
    }

    const companyList = postProcessCompanyNames(
      [...companies],
      resumeText,
      skills
    );

    return {
      skills: Array.from(skills).slice(0, 20),
      projects,
      experience: experience.slice(0, 10),
      education: education.slice(0, 10),
      companies: companyList.length > 0 ? companyList : undefined,
    };
  } catch (err: any) {
    console.warn("[HF-RESUME] NER failed, using heuristic:", err?.message || err);
    return heuristicFallback;
  }
}

/**
 * Summarize resume text using Hugging Face summarization.
 * Returns null on failure (caller should use slice fallback).
 */
export async function summarizeResume(
  resumeText: string,
  options?: { maxSummaryChars?: number; maxHighlightsChars?: number }
): Promise<{ summary: string; highlights: string } | null> {
  const hf = getHfClient();
  if (!hf) return null;

  const maxSummaryChars = options?.maxSummaryChars ?? 1500;
  const maxHighlightsChars = options?.maxHighlightsChars ?? 500;

  try {
    // Summarization models work best with ~1024-2048 token inputs
    const textToSummarize = resumeText.slice(0, 4000);

    if (textToSummarize.length < 100) {
      return {
        summary: resumeText.slice(0, maxSummaryChars),
        highlights: resumeText.slice(0, maxHighlightsChars),
      };
    }

    // ~4 chars per token on average; target ~250 tokens for summary, ~80 for highlights
    const summaryMaxTokens = Math.min(250, Math.floor(maxSummaryChars / 4));
    const highlightsMaxTokens = Math.min(80, Math.floor(maxHighlightsChars / 4));

    let summaryText = "";
    for (const model of SUMMARIZATION_MODELS) {
      try {
        const result = await hf.summarization({
          model,
          inputs: textToSummarize,
          provider: HF_INFERENCE_PROVIDER,
          parameters: {
            max_length: summaryMaxTokens,
            min_length: Math.floor(summaryMaxTokens * 0.3),
            do_sample: false,
          },
        });
        summaryText =
          (result as any)?.summary_text ?? (result as any)?.summary ?? String(result ?? "");
        if (summaryText && summaryText.length > 20) break;
      } catch {
        continue;
      }
    }

    if (!summaryText || summaryText.length < 20) return null;

    const tidySummary = (s: string) =>
      s
        .replace(/\s+/g, " ")
        .replace(/\s+([.,;:])/g, "$1")
        .replace(/CI\/CD\/CD/gi, "CI/CD")
        .trim();

    summaryText = tidySummary(summaryText);

    // Truncate to max chars
    const summary = summaryText.slice(0, maxSummaryChars);
    // Highlights: use first part of summary (already condensed)
    const highlights = summary.slice(0, maxHighlightsChars);

    return { summary, highlights };
  } catch (err: any) {
    console.warn("[HF-RESUME] Summarization failed:", err?.message || err);
    return null;
  }
}
