/**
 * OpenAI structured resume extraction — primary parser when OPENAI_API_KEY is set.
 * Falls back to heuristic profile on missing key, timeout, or validation errors.
 */

import { z } from "zod";

export const ResumeProfileSchema = z.object({
  skills: z.array(z.string()).max(25),
  projects: z.array(z.string()).max(10),
  experience: z.array(z.string()).max(10),
  education: z.array(z.string()).max(8),
});

export type StructuredResumeProfile = z.infer<typeof ResumeProfileSchema>;

export type ParsedResumeProfile = StructuredResumeProfile & {
  parse_source?: "llm" | "heuristic";
  companies?: string[];
};

const OPENAI_TIMEOUT_MS = 45_000;
const MAX_RESUME_CHARS_FOR_LLM = 24_000;

function cleanItem(text: string, maxChars = 220): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function uniqItems(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = cleanItem(raw);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** Normalize arbitrary LLM JSON into a validated profile. */
export function normalizeResumeProfileRaw(raw: unknown): StructuredResumeProfile | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  const nested =
    obj.profile && typeof obj.profile === "object"
      ? (obj.profile as Record<string, unknown>)
      : obj.resumeprofile && typeof obj.resumeprofile === "object"
        ? (obj.resumeprofile as Record<string, unknown>)
        : obj;

  const toStrings = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string");
  };

  const candidate = {
    skills: uniqItems(toStrings(nested.skills), 25),
    projects: uniqItems(toStrings(nested.projects), 10),
    experience: uniqItems(toStrings(nested.experience), 10),
    education: uniqItems(toStrings(nested.education), 8),
  };

  const parsed = ResumeProfileSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Prefer LLM sections; fill empty sections from heuristic fallback. */
export function mergeResumeProfiles(
  llm: StructuredResumeProfile,
  heuristic: StructuredResumeProfile,
): StructuredResumeProfile {
  return {
    skills: llm.skills.length > 0 ? llm.skills : heuristic.skills,
    projects: llm.projects.length > 0 ? llm.projects : heuristic.projects,
    experience: llm.experience.length > 0 ? llm.experience : heuristic.experience,
    education: llm.education.length > 0 ? llm.education : heuristic.education,
  };
}

function hasStructuredArrays(stored: Record<string, unknown>): boolean {
  return (
    Array.isArray(stored.skills) &&
    Array.isArray(stored.projects) &&
    Array.isArray(stored.experience) &&
    Array.isArray(stored.education)
  );
}

/** Read stored profile arrays (LLM or heuristic) without re-parsing fulltext. */
export function structuredProfileFromStored(
  storedProfile: unknown,
): StructuredResumeProfile | null {
  if (!storedProfile || typeof storedProfile !== "object") return null;
  const stored = storedProfile as Record<string, unknown>;
  if (!hasStructuredArrays(stored)) return null;

  return {
    skills: uniqItems(stored.skills as string[], 25),
    projects: uniqItems(stored.projects as string[], 10),
    experience: uniqItems(stored.experience as string[], 10),
    education: uniqItems(stored.education as string[], 8),
  };
}

/**
 * Extract structured resume sections using OpenAI.
 * Returns heuristic fallback unchanged when API key is missing or the call fails.
 */
export async function extractResumeProfileWithOpenAI(
  resumeText: string,
  heuristicFallback: StructuredResumeProfile,
): Promise<ParsedResumeProfile> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ...heuristicFallback, parse_source: "heuristic" };
  }

  const text = resumeText.slice(0, MAX_RESUME_CHARS_FOR_LLM);

  const systemPrompt = `You extract structured resume data for an AI interview coach.

Return JSON with exactly these keys:
- skills: programming languages, frameworks, tools, methodologies (strings)
- projects: personal, academic, technical, capstone, or portfolio projects (strings)
- experience: jobs, internships, employment, professional roles — include title, company, and 1 key detail per entry (strings)
- education: schools, degrees, GPA, graduation dates (strings)

Rules:
- Map section headers flexibly: "Technical Projects", "Relevant Projects", "PROFESSIONAL EXPERIENCE", etc.
- Do NOT put job experience under education or vice versa.
- Each array item is one concise line (not nested objects).
- Use only facts present in the resume — do not invent employers, projects, or skills.
- If a section is missing from the resume, return an empty array for that key.
- Exclude email, phone, address, and LinkedIn URLs.`;

  const userPrompt = `Extract structured resume sections from this text:

${text}

Return ONLY valid JSON with keys: skills, projects, experience, education.`;

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    const apiCall = openai.chat.completions.create({
      model: process.env.OPENAI_RESUME_MODEL?.trim() || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2500,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`OpenAI resume extraction timed out after ${OPENAI_TIMEOUT_MS}ms`));
      }, OPENAI_TIMEOUT_MS);
    });

    const response = await Promise.race([apiCall, timeoutPromise]);
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty resume extraction content");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(`Failed to parse OpenAI resume JSON: ${msg}`);
    }

    const normalized = normalizeResumeProfileRaw(parsedJson);
    if (!normalized) {
      throw new Error("OpenAI resume JSON failed schema validation");
    }

    const merged = mergeResumeProfiles(normalized, heuristicFallback);
    const hasSignal =
      merged.skills.length +
        merged.projects.length +
        merged.experience.length +
        merged.education.length >
      0;

    if (!hasSignal) {
      console.warn("[OPENAI-RESUME] LLM returned empty profile; using heuristic");
      return { ...heuristicFallback, parse_source: "heuristic" };
    }

    console.log("[OPENAI-RESUME] Extracted profile", {
      skills: merged.skills.length,
      projects: merged.projects.length,
      experience: merged.experience.length,
      education: merged.education.length,
    });

    return { ...merged, parse_source: "llm" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[OPENAI-RESUME] Extraction failed, using heuristic:", msg);
    return { ...heuristicFallback, parse_source: "heuristic" };
  }
}
