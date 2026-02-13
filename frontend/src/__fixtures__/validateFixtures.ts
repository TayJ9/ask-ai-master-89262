/**
 * Dev-only: validates that enhanced and legacy fixtures can be rendered by Results page.
 * Run via: import and call checkFixturesRenderable() when fixture param is used.
 */

export interface FixtureCheckResult {
  ok: boolean;
  errors: string[];
}

export function checkFixturesRenderable(
  enhanced: unknown,
  legacy: unknown
): { enhanced: FixtureCheckResult; legacy: FixtureCheckResult } {
  const check = (data: unknown, expectEnhanced: boolean): FixtureCheckResult => {
    const errors: string[] = [];
    if (!data || typeof data !== "object") {
      return { ok: false, errors: ["Fixture must be an object"] };
    }
    const d = data as Record<string, unknown>;
    if (!d.evaluation || typeof d.evaluation !== "object") {
      errors.push("Missing evaluation");
    } else {
      const ev = d.evaluation as Record<string, unknown>;
      if (!ev.evaluation || typeof ev.evaluation !== "object") {
        errors.push("Missing evaluation.evaluation");
      } else {
        const qs = (ev.evaluation as Record<string, unknown>).questions;
        if (!Array.isArray(qs) || qs.length === 0) {
          errors.push("evaluation.evaluation.questions must be non-empty array");
        } else {
          const q0 = qs[0] as Record<string, unknown>;
          if (!q0.question || !q0.answer || typeof q0.score !== "number") {
            errors.push("Each question needs question, answer, score");
          }
          if (expectEnhanced && qs.some((q: unknown) => (q as Record<string, unknown>).question_type)) {
            // enhanced has at least one question_type
          } else if (expectEnhanced) {
            errors.push("Enhanced fixture should have question_type on questions");
          }
        }
      }
    }
    if (!d.interview || typeof d.interview !== "object") {
      errors.push("Missing interview");
    }
    return { ok: errors.length === 0, errors };
  };
  return {
    enhanced: check(enhanced, true),
    legacy: check(legacy, false),
  };
}
