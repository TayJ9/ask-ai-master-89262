import { Resend } from "resend";

function getFrontendUrl(): string {
  const url = process.env.FRONTEND_URL?.trim();
  if (url) return url.replace(/\/$/, "");
  return "http://localhost:5173";
}

function getEmailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || "Mockly <onboarding@resend.dev>";
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[EMAIL] RESEND_API_KEY not configured — skipping email send");
    return null;
  }
  return new Resend(apiKey);
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) return false;

  const verifyUrl = `${getFrontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to: email,
    subject: "Verify your Mockly email address",
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <h2>Verify your email</h2>
        <p>Thanks for signing up for Mockly. Click the button below to verify your email address and start practicing interviews.</p>
        <p style="margin: 32px 0;">
          <a href="${verifyUrl}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
            Verify email
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
        <p style="color: #666; font-size: 12px; word-break: break-all;">Or copy this link: ${verifyUrl}</p>
      </div>
    `,
    text: `Verify your Mockly email address: ${verifyUrl}\n\nThis link expires in 24 hours.`,
  });

  if (error) {
    console.error("[EMAIL] Failed to send verification email:", error);
    return false;
  }

  return true;
}

export interface ResultsEmailSummary {
  firstName: string;
  overallScore: number;
  strengths: string[];
  resultsUrl: string;
}

export async function sendResultsEmail(email: string, summary: ResultsEmailSummary): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) return false;

  const strengthsHtml =
    summary.strengths.length > 0
      ? `<ul>${summary.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
      : "<p>Review your full feedback in Mockly.</p>";

  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `Your Mockly interview results — ${summary.overallScore}/100`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <h2>Hi ${escapeHtml(summary.firstName)},</h2>
        <p>Your interview evaluation is ready.</p>
        <p style="font-size: 28px; font-weight: bold; color: #2563eb;">Overall score: ${summary.overallScore}/100</p>
        <h3>Top strengths</h3>
        ${strengthsHtml}
        <p style="margin: 32px 0;">
          <a href="${summary.resultsUrl}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
            View full results
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">You can also find this session in your interview history inside Mockly.</p>
      </div>
    `,
    text: `Hi ${summary.firstName},\n\nYour Mockly interview score: ${summary.overallScore}/100\n\nView full results: ${summary.resultsUrl}`,
  });

  if (error) {
    console.error("[EMAIL] Failed to send results email:", error);
    return false;
  }

  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
