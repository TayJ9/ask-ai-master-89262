export type CandidateContext = {
  firstName: string;
  name?: string;
  major: string;
  year: string;
  sessionId?: string;
  skills?: string[];
  experience?: string;
  education?: string;
  summary?: string;
  /**
   * Full resume text is allowed in React memory for the active tab only.
   * Never persist this field to browser storage.
   */
  resumeText?: string;
  resumeSource?: string;
  resume_summary?: string;
  resume_highlights?: string;
};

export type StoredCandidateContext = Omit<CandidateContext, "resumeText">;

export type ResumeUploadCandidateInfo = {
  firstName: string;
  major: string;
  year: string;
  sessionId?: string;
  resumeSource?: string;
  resume_summary?: string;
  resume_highlights?: string;
  skills?: string[];
};

export type ResumeUploadResponse = {
  sessionId?: string;
  resumeText?: string;
  resume_summary?: string;
  resume_highlights?: string;
  resumeProfile?: {
    skills?: string[];
  };
};

export function sanitizeCandidateContextForStorage(
  context: CandidateContext | StoredCandidateContext | null | undefined,
): StoredCandidateContext | null {
  if (!context) return null;

  const {
    resumeText: _resumeText,
    firstName,
    name,
    major,
    year,
    sessionId,
    skills,
    experience,
    education,
    summary,
    resumeSource,
    resume_summary,
    resume_highlights,
  } = context as CandidateContext;

  return {
    firstName,
    name,
    major,
    year,
    sessionId,
    skills,
    experience,
    education,
    summary,
    resumeSource,
    resume_summary,
    resume_highlights,
  };
}

export function parseStoredCandidateContext(raw: string | null): StoredCandidateContext | null {
  if (!raw) return null;

  const parsed = JSON.parse(raw) as CandidateContext;
  return sanitizeCandidateContextForStorage(parsed);
}

export function hasResumeUploadSession(data: ResumeUploadResponse | null | undefined): data is ResumeUploadResponse & { sessionId: string } {
  return typeof data?.sessionId === "string" && data.sessionId.trim().length > 0;
}

export function hasResumeContext(data: ResumeUploadResponse | null | undefined): boolean {
  return Boolean(
    data?.resumeText?.trim() ||
      data?.resume_summary?.trim() ||
      data?.resume_highlights?.trim(),
  );
}
