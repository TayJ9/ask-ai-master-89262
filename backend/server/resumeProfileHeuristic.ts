/**
 * Regex/line-based resume profile extraction (no external APIs).
 * Used by upload flow and as the baseline for HF NER comparison.
 */
export function buildResumeProfile(resumeText: string) {
  const lines = resumeText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const extractListAfterLabel = (label: string) => {
    const line = lines.find((l) => l.toLowerCase().startsWith(label));
    if (!line) return [];
    const parts = line.split(":");
    if (parts.length < 2) return [];
    return parts[1]
      .split(/[,;•|-]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 15);
  };

  const skills = extractListAfterLabel("skills");
  const educationLines = lines.filter((l) => /education/i.test(l)).slice(0, 5);
  const experienceLines = lines.filter((l) => /experience/i.test(l)).slice(0, 5);
  const projectLines = lines.filter((l) => /project/i.test(l)).slice(0, 5);

  return {
    skills,
    projects: projectLines,
    experience: experienceLines,
    education: educationLines,
  };
}
