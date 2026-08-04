/**
 * Scoring rubric metadata for observability.
 * The full rubric text lives in openaiEvaluator.ts systemPrompt; this version
 * string is attached to traces so rubric changes are visible in Arize.
 */
export const SCORING_RUBRIC_VERSION = "adaptive-v2-star-vagueness-caps";

export const SCORING_RUBRIC_SUMMARY =
  "Adaptive rubric: behavioral (STAR), technical (accuracy/depth), situational (problem-solving), informational (clarity/structure). Vagueness caps enforced post-LLM.";
