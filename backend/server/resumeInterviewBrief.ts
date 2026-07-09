/**
 * Builds the resume context injected into ElevenLabs dynamic variables.
 *
 * Strategy: give the interviewer a structured brief (skills / projects /
 * experience / education), not the full resume. Full text stays server-side
 * for GetResumeProfile / GetResumeFullText deep follow-ups.
 */

export type InterviewResumeProfile = {
  skills?: string[];
  projects?: string[];
  experience?: string[];
  education?: string[];
  companies?: string[];
};

export type InterviewResumeBrief = {
  resume_summary: string;
  resume_highlights: string;
  source: "structured" | "prose_fallback" | "slice_fallback";
};

const DEFAULT_SUMMARY_CHARS = 1500;
const DEFAULT_HIGHLIGHTS_CHARS = 500;

function uniqPreserveOrder(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.replace(/\s+/g, " ").trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function cleanList(items: string[] | undefined, max: number, maxItemChars = 180): string[] {
  if (!items?.length) return [];
  return uniqPreserveOrder(
    items.map((item) => item.replace(/\s+/g, " ").trim().slice(0, maxItemChars)),
    max,
  );
}

function section(label: string, items: string[]): string {
  if (!items.length) return "";
  return `${label}: ${items.join("; ")}`;
}

function profileSignalCount(profile: InterviewResumeProfile): number {
  return (
    (profile.skills?.length || 0) +
    (profile.projects?.length || 0) +
    (profile.experience?.length || 0) +
    (profile.education?.length || 0) +
    (profile.companies?.length || 0)
  );
}

/**
 * Deterministic interview brief from extracted profile (+ optional prose).
 * Prefer this over news-style summarizers that drop proper nouns.
 */
export function buildInterviewResumeBrief(
  profile: InterviewResumeProfile,
  resumeFulltext: string,
  options?: {
    maxSummaryChars?: number;
    maxHighlightsChars?: number;
    /** Optional HF/news-style prose; used only when structured signal is weak. */
    proseSummary?: string | null;
  },
): InterviewResumeBrief {
  const maxSummaryChars = options?.maxSummaryChars ?? DEFAULT_SUMMARY_CHARS;
  const maxHighlightsChars = options?.maxHighlightsChars ?? DEFAULT_HIGHLIGHTS_CHARS;

  const skills = cleanList(profile.skills, 15, 40);
  const projects = cleanList(profile.projects, 6, 160);
  const experience = cleanList(profile.experience, 6, 160);
  const education = cleanList(profile.education, 5, 140);
  const companies = cleanList(profile.companies, 8, 60);

  const structuredParts = [
    section("Skills", skills),
    section("Projects", projects),
    section("Experience", experience),
    section("Education", education),
    section("Companies", companies),
  ].filter(Boolean);

  const structuredSummary = structuredParts.join("\n").trim();
  const signal = profileSignalCount({ skills, projects, experience, education, companies });

  if (structuredSummary && signal >= 2) {
    const highlightBits = uniqPreserveOrder(
      [
        ...projects.slice(0, 2),
        ...skills.slice(0, 5),
        ...companies.slice(0, 2),
        ...education.slice(0, 1),
        ...experience.slice(0, 1),
      ],
      8,
    );

    return {
      resume_summary: structuredSummary.slice(0, maxSummaryChars),
      resume_highlights: (highlightBits.join(" | ") || structuredSummary).slice(0, maxHighlightsChars),
      source: "structured",
    };
  }

  const prose = options?.proseSummary?.replace(/\s+/g, " ").trim();
  if (prose && prose.length >= 40) {
    return {
      resume_summary: prose.slice(0, maxSummaryChars),
      resume_highlights: prose.slice(0, maxHighlightsChars),
      source: "prose_fallback",
    };
  }

  const slice = resumeFulltext.replace(/\s+/g, " ").trim();
  return {
    resume_summary: slice.slice(0, maxSummaryChars),
    resume_highlights: slice.slice(0, maxHighlightsChars),
    source: "slice_fallback",
  };
}
