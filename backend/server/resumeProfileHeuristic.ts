/**
 * Regex/line-based resume profile extraction (no external APIs).
 * Used by upload flow and as the baseline for HF NER comparison.
 */

const SECTION_HEADERS: Record<string, "skills" | "projects" | "experience" | "education"> = {
  skills: "skills",
  skill: "skills",
  "technical skills": "skills",
  technologies: "skills",
  tech: "skills",
  projects: "projects",
  project: "projects",
  experience: "experience",
  work: "experience",
  "work experience": "experience",
  employment: "experience",
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

/**
 * Collect bullet/body lines under a section header until the next known header.
 */
function collectSectionBody(lines: string[], startIdx: number): string[] {
  const body: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const header = SECTION_HEADERS[normalizeHeader(lines[i])];
    if (header) break;
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

  // Inline labeled lines: "Education: College of Charleston, CS"
  for (const line of lines) {
    const edu = contentAfterLabel(line, /^education\b/i);
    if (edu) education.push(edu);
    const exp = contentAfterLabel(line, /^(experience|work experience|employment)\b/i);
    if (exp) experience.push(exp);
    const proj = contentAfterLabel(line, /^projects?\b/i);
    if (proj) projects.push(proj);
  }

  // Block sections: EDUCATION / PROJECTS / ... followed by body lines
  for (let i = 0; i < lines.length; i++) {
    const kind = SECTION_HEADERS[normalizeHeader(lines[i])];
    if (!kind || kind === "skills") continue;
    const body = collectSectionBody(lines, i);
    if (kind === "projects") projects.push(...body);
    if (kind === "experience") experience.push(...body);
    if (kind === "education") education.push(...body);
  }

  // Skills may also appear as a block of comma-separated lines under SKILLS
  if (skills.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      if (SECTION_HEADERS[normalizeHeader(lines[i])] !== "skills") continue;
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
