/**
 * Remove email addresses and phone numbers from resume text before it is sent
 * to the voice agent (or returned by agent-facing APIs). Keeps parsing-friendly
 * structure (newlines, section headers) intact.
 */

const EMAIL_RE =
  /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}\b/g;

/** US/Canada style: (555) 123-4567, 555-123-4567, +1 555 123 4567, etc. */
const PHONE_US_CA =
  /(?:\+1[-.\s]?)?(?:\(\d{3}\)\s*|\b\d{3}[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;

/** Long international / E.164-ish (+ and 10–15 digits with optional separators) */
const PHONE_INTL_LOOSE =
  /\b\+\d{1,3}(?:[\s.-]?\d){8,14}\d\b/g;

const MAILTO_RE = /mailto:\s*[^\s>]+/gi;

export function stripResumeContactInfo(text: string): string {
  if (!text || typeof text !== "string") return text;

  let s = text.replace(MAILTO_RE, "");
  s = s.replace(EMAIL_RE, "");
  s = s.replace(PHONE_US_CA, "");
  s = s.replace(PHONE_INTL_LOOSE, "");

  // Pipes are often used as contact separators; convert leftovers to commas.
  s = s.replace(/\s*\|\s*/g, ", ");
  s = s.replace(/,\s*,+/g, ", ");

  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ");

  s = s
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*\|\s*/, "")
        .replace(/\s*\|\s*$/, "")
        .trim()
    )
    .filter((line) => !/^\s*[|•,;:\-–—]*\s*$/.test(line))
    .join("\n");

  return s.trim();
}
