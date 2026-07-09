import { storage } from "./storage";
import { extractResumeProfileWithNER, summarizeResume } from "./llm/huggingfaceResume";
import { buildResumeProfile } from "./resumeProfileHeuristic";
import { buildInterviewResumeBrief } from "./resumeInterviewBrief";
import { stripResumeContactInfo } from "./resumeSanitize";

const MAX_RESUME_TEXT_CHARS = 50_000;
export { MAX_RESUME_TEXT_CHARS };

export type PersistedResumePayload = {
  sessionId: string;
  resumeText: string;
  resumeProfile: ReturnType<typeof buildResumeProfile>;
  resume_summary: string;
  resume_highlights: string;
  briefSource: "structured" | "prose_fallback" | "slice_fallback";
};

/**
 * Sanitize, enrich, and store resume content keyed by session/interview id.
 * Dynamic vars get a structured interview brief; full text stays for server tools.
 */
export async function persistResumeForSession(
  sessionId: string,
  rawResumeText: string,
  logPrefix = "[RESUME-PERSIST]",
  userId?: string | null,
): Promise<PersistedResumePayload> {
  let resumeText = rawResumeText.trim();
  if (!resumeText) {
    throw new Error("Resume text is empty");
  }
  if (resumeText.length > MAX_RESUME_TEXT_CHARS) {
    resumeText = resumeText.substring(0, MAX_RESUME_TEXT_CHARS);
  }

  const resumeFulltext = stripResumeContactInfo(resumeText);
  let resumeProfile = buildResumeProfile(resumeFulltext);

  try {
    resumeProfile = await extractResumeProfileWithNER(resumeFulltext, resumeProfile);
  } catch (hfErr: unknown) {
    const msg = hfErr instanceof Error ? hfErr.message : String(hfErr);
    console.warn(`${logPrefix} HF NER skipped:`, msg);
  }

  // Hybrid strategy (option D):
  // 1) Structured brief from profile → ElevenLabs dynamic vars (primary)
  // 2) Full resume stays in DB for GetResumeProfile / GetResumeFullText
  // 3) HF prose summarization only if structured signal is too weak
  const preliminary = buildInterviewResumeBrief(resumeProfile, resumeFulltext);
  let proseSummary: string | null = null;
  if (preliminary.source !== "structured") {
    try {
      const hfSummary = await summarizeResume(resumeFulltext);
      proseSummary = hfSummary?.summary ?? null;
    } catch (hfErr: unknown) {
      const msg = hfErr instanceof Error ? hfErr.message : String(hfErr);
      console.warn(`${logPrefix} HF summarization skipped:`, msg);
    }
  }

  const brief = buildInterviewResumeBrief(resumeProfile, resumeFulltext, {
    proseSummary,
  });

  await storage.upsertResume(sessionId, resumeFulltext, resumeProfile, userId);
  console.log(`${logPrefix} Stored resume for session`, {
    sessionId,
    hasUserId: !!userId,
    resumeTextLength: resumeFulltext.length,
    hasProfile: !!resumeProfile,
    briefSource: brief.source,
    summaryLength: brief.resume_summary.length,
    highlightsLength: brief.resume_highlights.length,
  });

  return {
    sessionId,
    resumeText: resumeFulltext,
    resumeProfile,
    resume_summary: brief.resume_summary,
    resume_highlights: brief.resume_highlights,
    briefSource: brief.source,
  };
}
