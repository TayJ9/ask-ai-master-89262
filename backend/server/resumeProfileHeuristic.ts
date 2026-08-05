/**
 * Regex/line-based resume profile extraction (no external APIs).
 * Used by upload flow and as the baseline for HF NER comparison.
 */

import { structuredProfileFromStored } from "./llm/openaiResumeExtractor.js";

const SECTION_HEADERS: Record<string, "skills" | "projects" | "experience" | "education"> = {
  skills: "skills",
  skill: "skills",
  "technical skills": "skills",
  technologies: "skills",
  tech: "skills",
  "core skills": "skills",
  "core competencies": "skills",
  "programming languages": "skills",
  projects: "projects",
  project: "projects",
  "personal projects": "projects",
  "relevant projects": "projects",
  "selected projects": "projects",
  "technical projects": "projects",
  "technical project": "projects",
  "class projects": "projects",
  "academic projects": "projects",
  "capstone projects": "projects",
  "project experience": "projects",
  experience: "experience",
  work: "experience",
  "work experience": "experience",
  "professional experience": "experience",
  "relevant experience": "experience",
  "internship experience": "experience",
  internships: "experience",
  employment: "experience",
  "work history": "experience",
  education: "education",
  academic: "education",
  academics: "education",
};

function normalizeHeader(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match known section headers, including common resume variants like PROFESSIONAL EXPERIENCE. */
function resolveSectionKind(line: string): "skills" | "projects" | "experience" | "education" | null {
  const norm = normalizeHeader(line);
  if (!norm) return null;

  const exact = SECTION_HEADERS[norm];
  if (exact) return exact;

  // Short header lines that contain a section keyword (PDF extracts often add spacing/case noise).
  const words = norm.split(" ").filter(Boolean);
  if (words.length > 5) return null;

  if (/\b(professional|work|relevant|internship)?\s*experience\b/.test(norm) && !norm.includes("education")) {
    return "experience";
  }
  if (/\b(technical|personal|relevant|selected|class|academic|capstone)?\s*projects?\b/.test(norm)) {
    return "projects";
  }
  if (/\b(technical|core)?\s*(skills?|technologies|competencies)\b/.test(norm) || /\bprogramming languages\b/.test(norm)) {
    return "skills";
  }
  if (/\beducation\b/.test(norm) || /\bacademic\b/.test(norm)) return "education";

  return null;
}

function extractListAfterLabel(lines: string[], label: string): string[] {
  const line = lines.find((l) => l.toLowerCase().startsWith(label));
  if (!line) return [];
  const parts = line.split(":");
  if (parts.length < 2) return [];
  return parts[1]
    .split(/[,;•|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 15);
}

function contentAfterLabel(line: string, label: RegExp): string | null {
  if (!label.test(line)) return null;
  const idx = line.indexOf(":");
  if (idx >= 0 && idx < line.length - 1) {
    const rest = line.slice(idx + 1).trim();
    return rest || null;
  }
  // Header-only line (e.g. "Education") — no inline content
  const stripped = line.replace(label, "").replace(/^[:\-\s]+/, "").trim();
  return stripped || null;
}

/** Inline labeled rows such as "Technical Projects: Chatbot in Python". */
function extractInlineSectionLine(
  line: string,
): { kind: "skills" | "projects" | "experience" | "education"; content: string } | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx <= 0) return null;

  const label = line.slice(0, colonIdx).trim();
  const kind = resolveSectionKind(label);
  if (!kind) return null;

  const content = line.slice(colonIdx + 1).trim();
  if (!content) return null;

  return { kind, content };
}

/**
 * Collect bullet/body lines under a section header until the next known header.
 */
function collectSectionBody(lines: string[], startIdx: number): string[] {
  const body: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (resolveSectionKind(lines[i])) break;
    const cleaned = lines[i].replace(/^[-*•]\s*/, "").trim();
    if (cleaned) body.push(cleaned);
    if (body.length >= 8) break;
  }
  return body;
}

export function buildResumeProfile(resumeText: string) {
  const lines = resumeText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const skills = extractListAfterLabel(lines, "skills");
  const projects: string[] = [];
  const experience: string[] = [];
  const education: string[] = [];

  // Inline labeled lines: "Education: ..." or "Technical Projects: ..."
  for (const line of lines) {
    const inline = extractInlineSectionLine(line);
    if (inline) {
      if (inline.kind === "education") education.push(inline.content);
      if (inline.kind === "experience") experience.push(inline.content);
      if (inline.kind === "projects") projects.push(inline.content);
      if (inline.kind === "skills") {
        skills.push(
          ...inline.content
            .split(/[,;•|]/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
      continue;
    }

    const edu = contentAfterLabel(line, /^education\b/i);
    if (edu) education.push(edu);
    const exp = contentAfterLabel(line, /^(experience|work experience|employment|professional experience)\b/i);
    if (exp) experience.push(exp);
    const proj = contentAfterLabel(line, /^projects?\b/i);
    if (proj) projects.push(proj);
  }

  // Block sections: EDUCATION / PROJECTS / ... followed by body lines
  for (let i = 0; i < lines.length; i++) {
    const kind = resolveSectionKind(lines[i]);
    if (!kind || kind === "skills") continue;
    const body = collectSectionBody(lines, i);
    if (kind === "projects") projects.push(...body);
    if (kind === "experience") experience.push(...body);
    if (kind === "education") education.push(...body);
  }

  // Skills may also appear as a block of comma-separated lines under SKILLS
  if (skills.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      if (resolveSectionKind(lines[i]) !== "skills") continue;
      const body = collectSectionBody(lines, i);
      for (const row of body) {
        skills.push(
          ...row
            .split(/[,;•|]/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
      break;
    }
  }

  const uniq = (items: string[], max: number) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= max) break;
    }
    return out;
  };

  return {
    skills: uniq(skills, 20),
    projects: uniq(projects, 8),
    experience: uniq(experience, 8),
    education: uniq(education, 6),
  };
}

const FORM_PROFILE_STRING_KEYS = [
  "first_name",
  "firstName",
  "name",
  "major",
  "year",
  "role",
] as const;

/** Overlay confirm-step / form fields onto a parsed profile without dropping array sections. */
export function overlayFormFieldsOnResumeProfile(
  parsedProfile: Record<string, unknown>,
  formFields: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!formFields || typeof formFields !== "object") {
    return parsedProfile;
  }
  const overlay: Record<string, unknown> = {};
  for (const key of FORM_PROFILE_STRING_KEYS) {
    const value = formFields[key];
    if (typeof value !== "string" || !value.trim()) continue;
    if (key === "firstName") {
      overlay.first_name = value.trim();
    } else {
      overlay[key] = value.trim();
    }
  }
  if (overlay.major && !overlay.role) {
    overlay.role = overlay.major;
  }
  return { ...parsedProfile, ...overlay };
}

/**
 * Structured profile for GetResumeProfile — prefers stored LLM/heuristic arrays;
 * re-parses fulltext only for legacy rows missing structured sections.
 */
export function buildToolResumeProfile(
  storedProfile: unknown,
  resumeFulltext: string | undefined,
): Record<string, unknown> {
  const stored =
    storedProfile && typeof storedProfile === "object"
      ? (storedProfile as Record<string, unknown>)
      : {};

  const fromStored = structuredProfileFromStored(stored);
  const parsed =
    fromStored ??
    (resumeFulltext
      ? buildResumeProfile(resumeFulltext)
      : { skills: [], projects: [], experience: [], education: [] });

  return overlayFormFieldsOnResumeProfile(parsed, stored);
}
