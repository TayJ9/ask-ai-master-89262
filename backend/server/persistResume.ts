import { storage } from "./storage";
import { extractResumeProfileWithNER, summarizeResume } from "./llm/huggingfaceResume";
import { buildResumeProfile } from "./resumeProfileHeuristic";
import { stripResumeContactInfo } from "./resumeSanitize";

const MAX_RESUME_TEXT_CHARS = 50_000;

export type PersistedResumePayload = {
  sessionId: string;
  resumeText: string;
  resumeProfile: ReturnType<typeof buildResumeProfile>;
  resume_summary: string;
  resume_highlights: string;
};

/**
 * Sanitize, enrich, and store resume content keyed by session/interview id
 * (used by ElevenLabs GetResumeProfile / GetResumeFullText tools).
 */
export async function persistResumeForSession(
  sessionId: string,
  rawResumeText: string,
  logPrefix = "[RESUME-PERSIST]",
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

  let resumeSummary = resumeFulltext.slice(0, 1500);
  let resumeHighlights = resumeFulltext.slice(0, 500);
  try {
    const hfSummary = await summarizeResume(resumeFulltext);
    if (hfSummary) {
      resumeSummary = hfSummary.summary;
      resumeHighlights = hfSummary.highlights;
    }
  } catch (hfErr: unknown) {
    const msg = hfErr instanceof Error ? hfErr.message : String(hfErr);
    console.warn(`${logPrefix} HF summarization skipped:`, msg);
  }

  await storage.upsertResume(sessionId, resumeFulltext, resumeProfile);
  console.log(`${logPrefix} Stored resume for session`, {
    sessionId,
    resumeTextLength: resumeFulltext.length,
    hasProfile: !!resumeProfile,
  });

  return {
    sessionId,
    resumeText: resumeFulltext,
    resumeProfile,
    resume_summary: resumeSummary,
    resume_highlights: resumeHighlights,
  };
}
