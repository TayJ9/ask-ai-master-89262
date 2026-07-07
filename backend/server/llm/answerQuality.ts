/**
 * Deterministic answer-quality signals used to cap LLM scores for vague responses.
 */

export type VaguenessFlag =
  | "short_answer"
  | "high_filler"
  | "no_concrete_detail"
  | "no_outcome_language"
  | "weak_star_structure";

export type QuestionTypeHint = "behavioral" | "technical" | "situational" | "informational" | "unknown";

export interface AnswerQualityResult {
  flags: VaguenessFlag[];
  wordCount: number;
  suggestedCap: number | null;
}

const FILLER_PATTERN =
  /\b(kind of|sort of|stuff|things|basically|i guess|um+|uh+|like|something|somehow|whatever|etc)\b/gi;

const CONCRETE_PATTERN =
  /\b(\d+%?|\d{4}|january|february|march|april|may|june|july|august|september|october|november|december|\b(q[1-4]|week|month|year)s?\b|python|javascript|java|react|sql|api|project|internship|team lead|manager|gpa)\b/i;

const OUTCOME_PATTERN =
  /\b(result|outcome|improved|increased|reduced|decreased|saved|achieved|delivered|shipped|completed|succeeded|learned|impact|metric|percent|%)\b/i;

const ACTION_PATTERN =
  /\b(i\s+(built|created|developed|designed|implemented|led|managed|organized|resolved|fixed|wrote|presented|analyzed|coordinated|collaborated))\b/i;

const BEHAVIORAL_Q_PATTERN =
  /\b(tell me about a time|describe a (time|situation)|give an example|when you|have you ever)\b/i;

const TECHNICAL_Q_PATTERN =
  /\b(what is|explain|how does|difference between|define|describe how)\b/i;

const SITUATIONAL_Q_PATTERN =
  /\b(what would you do|how would you handle|if you were|hypothetical)\b/i;

export function inferQuestionType(question: string): QuestionTypeHint {
  const q = question.toLowerCase();
  if (BEHAVIORAL_Q_PATTERN.test(q)) return "behavioral";
  if (TECHNICAL_Q_PATTERN.test(q)) return "technical";
  if (SITUATIONAL_Q_PATTERN.test(q)) return "situational";
  if (/\b(tell me about yourself|why are you interested|background|introduce)\b/i.test(q)) {
    return "informational";
  }
  return "unknown";
}

export function analyzeAnswerQuality(
  question: string,
  answer: string,
  questionType?: QuestionTypeHint,
): AnswerQualityResult {
  const type = questionType ?? inferQuestionType(question);
  const text = answer.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const flags: VaguenessFlag[] = [];

  if (wordCount < 40) {
    flags.push("short_answer");
  }

  const fillerMatches = text.match(FILLER_PATTERN) ?? [];
  if (fillerMatches.length >= 2 || (wordCount > 0 && fillerMatches.length / wordCount > 0.08)) {
    flags.push("high_filler");
  }

  const hasConcrete = CONCRETE_PATTERN.test(text) || ACTION_PATTERN.test(text);
  if (!hasConcrete) {
    flags.push("no_concrete_detail");
  }

  if (type === "behavioral" && !OUTCOME_PATTERN.test(text)) {
    flags.push("no_outcome_language");
  }

  const suggestedCap = computeSuggestedCap(type, flags);
  return { flags, wordCount, suggestedCap };
}

function computeSuggestedCap(type: QuestionTypeHint, flags: VaguenessFlag[]): number | null {
  const has = (f: VaguenessFlag) => flags.includes(f);

  if (type === "behavioral") {
    if (has("weak_star_structure")) return 55;
    if (has("no_concrete_detail") && (has("short_answer") || has("no_outcome_language"))) {
      return 55;
    }
    if (has("no_concrete_detail")) return 60;
  }

  if (type === "technical") {
    if (has("no_concrete_detail") && has("short_answer")) return 55;
    if (has("no_concrete_detail")) return 60;
  }

  if (type === "situational") {
    if (has("no_concrete_detail") && has("short_answer")) return 58;
    if (has("no_concrete_detail")) return 62;
  }

  if (type === "informational" || type === "unknown") {
    if (has("no_concrete_detail") && has("short_answer")) return 60;
    if (has("no_concrete_detail")) return 65;
  }

  return null;
}

export type StarBreakdown = {
  situation: "strong" | "weak" | "missing";
  task: "strong" | "weak" | "missing";
  action: "strong" | "weak" | "missing";
  result: "strong" | "weak" | "missing";
};

export function countMissingStarComponents(star?: StarBreakdown): number {
  if (!star) return 0;
  return (["situation", "task", "action", "result"] as const).filter(
    (k) => star[k] === "missing" || star[k] === "weak",
  ).length;
}

/**
 * Full cap pass: analyze answer + optional STAR breakdown.
 */
export function capQuestionScore(params: {
  question: string;
  answer: string;
  score: number;
  questionType?: QuestionTypeHint;
  starBreakdown?: StarBreakdown;
}): { score: number; capped: boolean; vagueness_flags: VaguenessFlag[] } {
  const type =
    (params.questionType as QuestionTypeHint | undefined) ?? inferQuestionType(params.question);
  const quality = analyzeAnswerQuality(params.question, params.answer, type);
  const flags = [...quality.flags];

  if (type === "behavioral" && countMissingStarComponents(params.starBreakdown) >= 2) {
    if (!flags.includes("weak_star_structure")) {
      flags.push("weak_star_structure");
    }
  }

  let cappedScore = params.score;
  let capped = false;
  const cap = computeSuggestedCap(type, flags);
  if (cap != null && cappedScore > cap) {
    cappedScore = cap;
    capped = true;
  }

  return {
    score: Math.max(0, Math.min(100, cappedScore)),
    capped,
    vagueness_flags: flags,
  };
}

/** Fallback / boilerplate improvements that should be replaced with flag-specific coaching. */
export const GENERIC_IMPROVEMENT_PHRASES = [
  "could provide more specific details",
  "could provide more specific examples",
  "be more specific",
  "add more detail",
  "add more details",
  "provide more specific details",
  "could add detail",
  "could add more detail",
] as const;

export function isGenericImprovement(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\.$/, "");
  return GENERIC_IMPROVEMENT_PHRASES.some(
    (p) => normalized === p || normalized.startsWith(p + " "),
  );
}

export function extractVagueQuote(answer: string): string | undefined {
  const text = answer.trim();
  if (!text) return undefined;
  const filler = text.match(FILLER_PATTERN);
  if (filler?.[0]) return filler[0];
  if (text.length <= 60) return text;
  return undefined;
}

const STAR_LABELS: Record<keyof StarBreakdown, string> = {
  situation: "Situation (when/where/context)",
  task: "Task (your responsibility)",
  action: "Action (steps you took)",
  result: "Result (measurable outcome)",
};

/**
 * Build actionable, answer-specific improvements from quality flags (deterministic).
 */
export function buildCoachingImprovements(params: {
  flags: VaguenessFlag[];
  questionType: QuestionTypeHint;
  starBreakdown?: StarBreakdown;
  wordCount: number;
  score: number;
}): string[] {
  const { flags, questionType, starBreakdown, wordCount, score } = params;
  const tips: string[] = [];
  const has = (f: VaguenessFlag) => flags.includes(f);

  if (has("short_answer")) {
    tips.push(
      `Your answer was only ~${wordCount} words — aim for 4–6 sentences with one real example from school, work, or a project.`,
    );
  }

  if (has("high_filler")) {
    tips.push(
      "Replace vague filler (e.g. \"kind of\", \"stuff\", \"I guess\") with concrete facts: who was involved, what you did, and what happened.",
    );
  }

  if (has("no_concrete_detail")) {
    if (questionType === "behavioral") {
      tips.push(
        "Name one specific situation: your role, the problem, the action you personally took, and a result with a number or clear outcome.",
      );
    } else if (questionType === "technical") {
      tips.push(
        "Ground the explanation in something you have built or studied — a project, tool, or course assignment — not only general definitions.",
      );
    } else if (questionType === "informational") {
      tips.push(
        "Mention 1–2 specifics: your major, a relevant project or internship, and why it connects to this role.",
      );
    } else {
      tips.push(
        "Add one concrete detail: a project name, timeframe, tool, or outcome so the interviewer can picture your experience.",
      );
    }
  }

  if (has("no_outcome_language")) {
    tips.push(
      "End with a clear result: what improved, what you learned, or a metric (time saved, grade, users, bugs fixed).",
    );
  }

  if (has("weak_star_structure") && starBreakdown) {
    const weakParts = (["situation", "task", "action", "result"] as const).filter(
      (k) => starBreakdown[k] === "missing" || starBreakdown[k] === "weak",
    );
    if (weakParts.length > 0) {
      const labels = weakParts.map((k) => STAR_LABELS[k]).join("; ");
      tips.push(`Use STAR structure — strengthen: ${labels}.`);
    }
  }

  if (tips.length === 0 && score < 60) {
    tips.push(
      "Tie your answer directly to the question with a specific example the interviewer can follow step by step.",
    );
  }

  return tips.slice(0, 3);
}

/**
 * Merge LLM improvements with deterministic coaching; drop generic boilerplate.
 */
export function mergeCoachingImprovements(
  llmImprovements: string[],
  coaching: string[],
): string[] {
  const meaningful = llmImprovements.filter((i) => i.trim() && !isGenericImprovement(i));
  const merged = [...meaningful];
  for (const tip of coaching) {
    if (merged.length >= 3) break;
    const duplicate = merged.some(
      (m) => m.toLowerCase().includes(tip.slice(0, 24).toLowerCase()),
    );
    if (!duplicate) merged.push(tip);
  }
  if (merged.length === 0 && coaching.length > 0) {
    return coaching.slice(0, 3);
  }
  return merged.slice(0, 3);
}
