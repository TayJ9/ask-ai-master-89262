import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  profiles,
  interviews,
  interviewEvaluations,
  elevenLabsInterviewSessions,
} from "../shared/schema";
import { sendResultsEmail } from "./email";

function getFrontendUrl(): string {
  const url = process.env.FRONTEND_URL?.trim();
  if (url) return url.replace(/\/$/, "");
  return "http://localhost:5173";
}

type CandidateContext = {
  firstName?: string;
  major?: string;
  role?: string;
};

/**
 * Sends results summary email once per completed evaluation (idempotent).
 */
export async function sendResultsEmailIfEligible(interviewId: string): Promise<void> {
  const [row] = await db
    .select({
      evaluationId: interviewEvaluations.id,
      overallScore: interviewEvaluations.overallScore,
      evaluationJson: interviewEvaluations.evaluationJson,
      resultsEmailSentAt: interviewEvaluations.resultsEmailSentAt,
      userId: interviews.userId,
      userEmail: profiles.email,
      emailVerifiedAt: profiles.emailVerifiedAt,
      fullName: profiles.fullName,
      candidateContext: elevenLabsInterviewSessions.candidateContext,
    })
    .from(interviewEvaluations)
    .innerJoin(interviews, eq(interviewEvaluations.interviewId, interviews.id))
    .innerJoin(profiles, eq(interviews.userId, profiles.id))
    .leftJoin(
      elevenLabsInterviewSessions,
      eq(elevenLabsInterviewSessions.interviewId, interviews.id),
    )
    .where(eq(interviewEvaluations.interviewId, interviewId))
    .limit(1);

  if (!row) {
    console.warn(`[RESULTS_EMAIL] No evaluation row for interview ${interviewId}`);
    return;
  }

  if (row.resultsEmailSentAt) {
    return;
  }

  if (!row.emailVerifiedAt) {
    console.log(`[RESULTS_EMAIL] Skipping — user email not verified (${interviewId})`);
    return;
  }

  if (!row.userEmail) {
    console.warn(`[RESULTS_EMAIL] Skipping — no email on profile (${interviewId})`);
    return;
  }

  if (row.overallScore == null) {
    console.warn(`[RESULTS_EMAIL] Skipping — no overall score (${interviewId})`);
    return;
  }

  const ctx = (row.candidateContext ?? {}) as CandidateContext;
  const evalJson = (row.evaluationJson ?? {}) as { overall_strengths?: string[] };
  const strengths = Array.isArray(evalJson.overall_strengths)
    ? evalJson.overall_strengths.slice(0, 3)
    : [];

  const firstName =
    ctx.firstName?.trim() ||
    row.fullName?.split(/\s+/)[0]?.trim() ||
    "there";

  const sent = await sendResultsEmail(row.userEmail, {
    firstName,
    overallScore: row.overallScore,
    strengths,
    resultsUrl: `${getFrontendUrl()}/results?interviewId=${interviewId}`,
  });

  if (!sent) {
    return;
  }

  await db
    .update(interviewEvaluations)
    .set({ resultsEmailSentAt: new Date(), updatedAt: new Date() })
    .where(eq(interviewEvaluations.id, row.evaluationId));

  console.log(`[RESULTS_EMAIL] Sent results email for interview ${interviewId}`);
}
