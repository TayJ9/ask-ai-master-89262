/**
 * OpenAI-based Interview Evaluator
 * 
 * Uses OpenAI Responses API with Structured Outputs (json_schema) to generate
 * consistent, schema-validated evaluation results.
 */

import { z } from "zod";
import { stripResumeContactInfo } from "../resumeSanitize";
import {
  analyzeAnswerQuality,
  buildCoachingImprovements,
  capQuestionScore,
  extractVagueQuote,
  inferQuestionType,
  isGenericImprovement,
  mergeCoachingImprovements,
  type QuestionTypeHint,
} from "./answerQuality";

// STAR breakdown rating: strong | weak | missing
const StarRatingSchema = z.enum(["strong", "weak", "missing"]);

// Optional fields for enhanced coaching UI; safe for older evaluations.
const QuestionItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string()).min(1).max(3),
  improvements: z.array(z.string()).min(1).max(3),
  // Optional fields for enhanced coaching UI; safe for older evaluations.
  question_type: z.enum(["behavioral", "technical", "situational", "informational"]).optional(),
  star_breakdown: z.object({
    situation: StarRatingSchema,
    task: StarRatingSchema,
    action: StarRatingSchema,
    result: StarRatingSchema,
  }).optional(),
  improvement_quote: z.string().optional(),
  sample_better_answer: z.string().optional(),
  vagueness_flags: z.array(z.string()).optional(),
  score_capped: z.boolean().optional(),
});

// Zod schema for evaluation output
export const EvaluationJsonSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  overall_strengths: z.array(z.string()).min(1).max(5),
  overall_improvements: z.array(z.string()).min(1).max(5),
  questions: z.array(QuestionItemSchema).min(1),
});

export type EvaluationJson = z.infer<typeof EvaluationJsonSchema>;

/** Input QA pairs passed to the evaluator (for filling missing question/answer) */
export type InputQAPair = { question: string; answer: string };

/**
 * Normalize raw OpenAI (or any) evaluation response into canonical EvaluationJson.
 * Handles: raw.questions, raw.evaluations, raw.evaluation (array or single object).
 * Uses inputQAPairs to fill missing question/answer when possible.
 */
export function normalizeEvaluationJson(
  raw: any,
  inputQAPairs: InputQAPair[] = []
): EvaluationJson {
  // Resolve per-question array: questions | evaluations | evaluation (array or single object)
  let items: any[] = [];
  if (Array.isArray(raw.questions) && raw.questions.length > 0) {
    items = raw.questions;
  } else if (Array.isArray(raw.evaluations) && raw.evaluations.length > 0) {
    items = raw.evaluations;
  } else if (raw.evaluation != null) {
    const ev = raw.evaluation;
    items = Array.isArray(ev) ? ev : [ev];
  } else if (raw.evaluation?.evaluation != null) {
    const ev = raw.evaluation.evaluation;
    items = Array.isArray(ev) ? ev : [ev];
  }

  if (items.length === 0 && inputQAPairs.length > 0) {
    // API returned no per-question data; build minimal items from input QA pairs
    const overall = typeof raw.overall_score === "number"
      ? Math.max(0, Math.min(100, Math.round(raw.overall_score)))
      : 0;
    items = inputQAPairs.map((qa) => ({
      question: qa.question,
      answer: qa.answer,
      score: overall,
      strengths: ["Response received"],
      improvements: ["Could provide more specific details"],
    }));
  }
  if (items.length === 0) {
    throw new Error("No questions found in evaluation response");
  }

  // Map each item to canonical question shape
  const questions = items.map((item: any, index: number) => {
    const qa = inputQAPairs[index];
    let score = 0;
    if (typeof item.score === "number") {
      score = Math.round(item.score);
    } else if (item.score && typeof item.score === "object" && typeof item.score.total === "number") {
      score = Math.round(item.score.total);
    }
    score = Math.max(0, Math.min(100, score));

    const strengths = Array.isArray(item.strengths) ? item.strengths : [];
    const improvements = Array.isArray(item.improvements) ? item.improvements : [];
    const question = (qa?.question ?? item.question ?? `Question ${index + 1}`).toString();
    const answer = (qa?.answer ?? item.answer ?? "").toString();

    const sb = item.star_breakdown;
    const hasValidStarBreakdown =
      sb &&
      typeof sb === "object" &&
      "situation" in sb &&
      "task" in sb &&
      "action" in sb &&
      "result" in sb;

    return {
      question,
      answer,
      score,
      strengths: strengths.length > 0 ? strengths : ["Provided a response to the question"],
      improvements: improvements.length > 0 ? improvements : ["Could provide more specific details"],
      ...(item.question_type && { question_type: item.question_type }),
      ...(hasValidStarBreakdown && { star_breakdown: sb }),
      ...(item.improvement_quote != null && { improvement_quote: item.improvement_quote }),
      ...(item.sample_better_answer != null && { sample_better_answer: item.sample_better_answer }),
    };
  });

  // Overall score: always average of per-question scores (ignore LLM overall to prevent inflation)
  const scores = questions.map((q) => q.score);
  let overallScore =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  overallScore = Math.max(0, Math.min(100, overallScore));

  // Overall strengths/improvements
  const allStrengths = new Set<string>();
  questions.forEach((q) => (q.strengths || []).forEach((s: string) => allStrengths.add(s)));
  let overall_strengths: string[] =
    Array.isArray(raw.overall_strengths) && raw.overall_strengths.length > 0
      ? raw.overall_strengths.slice(0, 5)
      : Array.from(allStrengths).slice(0, 5);
  if (overall_strengths.length === 0) overall_strengths = ["Demonstrated technical knowledge"];

  const allImprovements = new Set<string>();
  questions.forEach((q) => (q.improvements || []).forEach((i: string) => allImprovements.add(i)));
  let overall_improvements: string[] =
    Array.isArray(raw.overall_improvements) && raw.overall_improvements.length > 0
      ? raw.overall_improvements.slice(0, 5)
      : Array.from(allImprovements).slice(0, 5);
  if (overall_improvements.length === 0) overall_improvements = ["Could provide more specific examples"];

  return {
    overall_score: overallScore,
    overall_strengths,
    overall_improvements,
    questions,
  };
}

/**
 * Apply deterministic vagueness caps to each question and recompute overall score.
 */
export function applyStrictScoreCaps(evaluation: EvaluationJson): EvaluationJson {
  const questions = evaluation.questions.map((q) => {
    const questionType = (q.question_type as QuestionTypeHint | undefined) ?? inferQuestionType(q.question);
    const quality = analyzeAnswerQuality(q.question, q.answer, questionType);
    const capped = capQuestionScore({
      question: q.question,
      answer: q.answer,
      score: q.score,
      questionType,
      starBreakdown: q.star_breakdown,
    });

    const coaching = buildCoachingImprovements({
      flags: capped.vagueness_flags,
      questionType,
      starBreakdown: q.star_breakdown,
      wordCount: quality.wordCount,
      score: capped.score,
    });
    const improvements = mergeCoachingImprovements(q.improvements, coaching);

    const vagueQuote = extractVagueQuote(q.answer);
    const improvement_quote =
      q.improvement_quote ??
      (vagueQuote && capped.vagueness_flags.length > 0 ? vagueQuote : undefined);

    return {
      ...q,
      score: capped.score,
      improvements,
      ...(improvement_quote && { improvement_quote }),
      ...(capped.vagueness_flags.length > 0 && { vagueness_flags: capped.vagueness_flags }),
      ...(capped.capped && { score_capped: true }),
    };
  });

  const overallScore =
    questions.length > 0
      ? Math.round(questions.reduce((sum, q) => sum + q.score, 0) / questions.length)
      : 0;

  const meaningfulOverall = (evaluation.overall_improvements ?? []).filter(
    (i) => !isGenericImprovement(i),
  );
  const overall_improvements =
    meaningfulOverall.length > 0
      ? meaningfulOverall.slice(0, 5)
      : [...new Set(questions.flatMap((q) => q.improvements))].slice(0, 5);

  return {
    ...evaluation,
    overall_score: overallScore,
    overall_improvements,
    questions,
  };
}

// JSON Schema for OpenAI Structured Outputs
const evaluationJsonSchema = {
  name: "InterviewEvaluation",
  schema: {
    type: "object",
    properties: {
      overall_score: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Overall interview score from 0-100",
      },
      overall_strengths: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 5,
        description: "Overall strengths demonstrated across all answers",
      },
      overall_improvements: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 5,
        description: "Overall areas for improvement across all answers",
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The interview question",
            },
            answer: {
              type: "string",
              description: "The candidate's answer",
            },
            score: {
              type: "integer",
              minimum: 0,
              maximum: 100,
              description: "Score for this specific answer (0-100)",
            },
            strengths: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 3,
              description: "Specific strengths in this answer",
            },
            improvements: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 3,
              description: "Specific areas for improvement in this answer",
            },
            // Optional fields for enhanced coaching UI; safe for older evaluations.
            question_type: {
              type: "string",
              enum: ["behavioral", "technical", "situational", "informational"],
              description: "Question classification for adaptive rubric",
            },
            star_breakdown: {
              type: "object",
              properties: {
                situation: { type: "string", enum: ["strong", "weak", "missing"] },
                task: { type: "string", enum: ["strong", "weak", "missing"] },
                action: { type: "string", enum: ["strong", "weak", "missing"] },
                result: { type: "string", enum: ["strong", "weak", "missing"] },
              },
              description: "STAR structure rating (for behavioral questions only)",
            },
            improvement_quote: {
              type: "string",
              description: "Exact substring from the candidate answer that could be improved",
            },
            sample_better_answer: {
              type: "string",
              description: "Short rewrite (2-6 sentences) showing a stronger answer",
            },
          },
          required: ["question", "answer", "score", "strengths", "improvements"],
        },
        minItems: 1,
        description: "Evaluation for each question-answer pair",
      },
    },
    required: ["overall_score", "overall_strengths", "overall_improvements", "questions"],
    additionalProperties: false,
  },
  strict: true,
} as const;

interface ScoreInterviewParams {
  role?: string;
  major?: string;
  resumeText?: string;
  questions: Array<{ question: string; answer: string }>;
  /** Optional: student year context for evaluation (e.g. "Freshman", "Senior") */
  studentYear?: string;
  /** Optional: technical difficulty level (e.g. "basic", "advanced") */
  technicalDifficulty?: string;
  /** Optional: technical depth (e.g. "introductory", "deep") */
  technicalDepth?: string;
  /** Optional: behavioral question ratio 0-100 */
  behavioralRatio?: number | string;
}

/**
 * Score an interview using OpenAI with structured outputs
 */
export async function scoreInterview({
  role,
  major,
  resumeText,
  questions,
  studentYear,
  technicalDifficulty,
  technicalDepth,
  behavioralRatio,
}: ScoreInterviewParams): Promise<EvaluationJson> {
  // Store questions for transformation if needed
  const inputQuestions = questions;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  // Dynamic import to avoid loading OpenAI SDK if not needed
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  // Build context string
  const contextParts: string[] = [];
  if (role) {
    contextParts.push(`Role: ${role}`);
  }
  if (major) {
    contextParts.push(`Major: ${major}`);
  }
  if (studentYear || technicalDifficulty || technicalDepth || behavioralRatio != null) {
    const yearParts: string[] = [];
    if (studentYear) yearParts.push(`Academic year: ${studentYear}`);
    if (technicalDifficulty) yearParts.push(`Technical difficulty: ${technicalDifficulty}`);
    if (technicalDepth) yearParts.push(`Technical depth: ${technicalDepth}`);
    if (behavioralRatio != null) yearParts.push(`Behavioral ratio: ${behavioralRatio}`);
    if (yearParts.length > 0) contextParts.push(`(${yearParts.join(", ")})`);
  }
  const context = contextParts.length > 0 ? `\n\nContext: ${contextParts.join(", ")}` : "";

  const safeResumeText = resumeText?.trim()
    ? stripResumeContactInfo(resumeText.trim())
    : "";

  // Resume for misalignment detection only — do not boost scores from resume content not spoken aloud
  const resumeContext = safeResumeText
    ? `\n\nCANDIDATE RESUME (reference only):\n${safeResumeText.substring(0, 2000)}${safeResumeText.length > 2000 ? "..." : ""}\n\nUse the resume ONLY to detect misalignment (e.g., claimed skill never mentioned when directly relevant). Do NOT increase scores based on resume content the candidate did not verbalize in their answer.`
    : "";

  // Build questions text with deterministic quality signals
  const questionsText = questions
    .map((qa, idx) => {
      const quality = analyzeAnswerQuality(qa.question, qa.answer);
      const signalLine =
        quality.flags.length > 0
          ? `Quality signals: ${quality.flags.join(", ")} (word count: ${quality.wordCount})`
          : `Quality signals: none detected (word count: ${quality.wordCount})`;
      return `Question ${idx + 1}:\nQ: ${qa.question}\nA: ${qa.answer}\n${signalLine}`;
    })
    .join("\n\n");

  const systemPrompt = `You are an evaluator for internship and entry-level job interviews. Your task is to evaluate candidate answers and provide constructive feedback.

IMPORTANT: You must FIRST classify each question type, then apply the appropriate rubric:

QUESTION TYPE CLASSIFICATION:
1. **Behavioral Questions**: Ask about past experiences, situations, examples (e.g., "Tell me about a time when...", "Describe a situation where...", "Give an example of...")
2. **Technical Questions**: Ask for definitions, explanations, or technical knowledge (e.g., "What is...", "Explain...", "How does...", technical terminology)
3. **Situational Questions**: Ask hypothetical scenarios or problem-solving (e.g., "What would you do if...", "How would you handle...")
4. **Informational Questions**: General questions about the candidate (e.g., "Tell me about yourself", "Why are you interested in...")

ADAPTIVE EVALUATION RUBRIC (Score 0-100 per answer):

**For BEHAVIORAL Questions:**
- STAR Structure (20 points): Does the answer follow Situation-Task-Action-Result format?
- Specificity (20 points): Does the answer include specific examples, metrics, or concrete details?
- Impact (15 points): Does the answer demonstrate impact or results?
- Ownership (15 points): Does the answer show personal responsibility while acknowledging team context when appropriate?
- Relevance (15 points): Does the answer directly address the question?
- Clarity (10 points): Is the answer clear and easy to understand?
- Communication (5 points): Is the answer well-structured and professional?

**For TECHNICAL Questions:**
- Technical Accuracy (30 points): Is the answer technically correct?
- Technical Depth (20 points): Does it show deep understanding and appropriate use of terminology?
- Relevance (15 points): Does the answer directly address the question?
- Clarity (15 points): Is the answer clear and easy to understand?
- Specificity (10 points): Does the answer include specific examples or details?
- Communication (5 points): Is the answer well-structured and professional?
- Impact (5 points): Does the answer demonstrate practical application?

**For SITUATIONAL Questions:**
- Problem-Solving Approach (25 points): Does the answer show logical thinking and a structured approach?
- Critical Thinking (20 points): Does it demonstrate analysis and consideration of multiple factors?
- Relevance (15 points): Does the answer directly address the scenario?
- Clarity (15 points): Is the answer clear and easy to understand?
- Specificity (10 points): Does the answer include specific details or examples?
- Impact (10 points): Does the answer demonstrate potential outcomes?
- Communication (5 points): Is the answer well-structured and professional?

**For INFORMATIONAL Questions:**
- Clarity (25 points): Is the answer clear and easy to understand?
- Relevance (20 points): Does the answer directly address the question and relate to the role?
- Structure (15 points): Is the answer well-organized and flows logically?
- Specificity (15 points): Does the answer include specific examples or details?
- Communication (10 points): Is the answer professional and engaging?
- Impact (10 points): Does the answer demonstrate value or interest?
- Coachability (5 points): Does the answer show openness to learning and growth?

UNIVERSAL CONSIDERATIONS:
- **Coachability**: Reward coachability only when demonstrated in the answer (reflection, learning, specific growth). Do not infer coachability from vague or generic responses.
- **Resume**: Use resume only to flag misalignment. Never inflate scores for skills/experience that appear on the resume but were not mentioned in the spoken answer.

VAGUENESS PENALTIES (mandatory — apply before finalizing each score):
- If an answer lacks a concrete example (project, role, tool, metric, or timeframe), behavioral and technical scores MUST NOT exceed 60.
- If a behavioral answer would have 2+ STAR components rated "missing" or "weak", the score MUST NOT exceed 55.
- Informational answers without specifics MUST NOT exceed 65.
- When "Quality signals" include no_concrete_detail or short_answer, score conservatively within the caps above.
- Encouragement belongs in improvements, not inflated scores.

IMPROVEMENT QUALITY (mandatory):
- Each question MUST have 1-3 UNIQUE improvements — never repeat the same phrase across questions.
- NEVER use generic-only feedback like "Could provide more specific details" without naming what to add.
- Each improvement must reference something from THAT answer (a missing STAR part, missing metric, weak phrase, or absent example).
- improvements[0] should be the highest-priority fix for that specific answer.

CONSTRAINTS:
- Strengths and improvements must be concrete and tied to the specific answer content.
- Keep strengths and improvements arrays to 1-3 items each.
- Do NOT mention that you are an AI or use AI-related language.
- Be honest and constructive — lower scores with actionable improvements are preferred over generous scoring.
- Overall strengths/improvements should synthesize patterns across all answers.
- All scores must be positive integers (0-100), no decimals.

REQUIRED ENHANCED FIELDS (per question):
- question_type: REQUIRED for every question. One of: behavioral, technical, situational, informational.
- star_breakdown: ONLY when question_type = behavioral. Rate each STAR component (situation, task, action, result) as "strong", "weak", or "missing". Omit for non-behavioral questions.
- improvement_quote: ONLY when an improvement cites vagueness or a specific weak phrase. MUST be copied verbatim from the candidate's answer—exact substring only. If you cannot find a suitable quote, omit this key entirely. Do not paraphrase or invent.
- sample_better_answer: ONLY for the single lowest-scoring question OR any question with score < 60. Keep 2-6 sentences. Ground it in the candidate's own answer and resume context—do not invent facts, roles, or experiences not in the transcript or resume. Omit for higher-scoring answers.`;

  const userPrompt = `Evaluate this interview${context}${resumeContext}

${questionsText}

IMPORTANT INSTRUCTIONS:
1. For EACH question, set question_type (required): behavioral, technical, situational, or informational
2. Apply the appropriate rubric weights based on question type
3. If question_type = behavioral, add star_breakdown with situation/task/action/result rated strong/weak/missing
4. Honor all VAGUENESS PENALTIES — vague answers should receive low scores even if polite and on-topic
5. If a resume is provided, only note misalignment; do not credit unspoken resume details

OUTPUT RULES (minimal hallucination):
- Quote exact phrases only: improvement_quote must be a verbatim substring from the candidate's answer. If no suitable phrase exists, omit improvement_quote.
- Do not invent facts: Use only what appears in the transcript or resume. No fabricated roles, companies, or experiences.
- sample_better_answer: Add ONLY for the lowest-scoring question OR any question with score < 60. One per evaluation. Ground in candidate's answer and resume.
- Keep it concise: This feeds a UI—short, actionable feedback. No essays.
- Every improvements[] entry must be a distinct, answer-specific coaching tip (not a generic placeholder).

Provide a strict JSON evaluation matching the schema. Score each answer individually using the adaptive rubric, then calculate the overall_score as a weighted average. All scores must be integers (round to nearest whole number).`;

  try {
    // Use json_object format for compatibility (works with all models)
    // We'll validate with Zod to ensure schema compliance
    // Add timeout: 60 seconds for OpenAI API call
    const OPENAI_TIMEOUT_MS = 60000;
    
    const apiCall = openai.chat.completions.create({
      model: "gpt-4o-mini", // Cost-effective model suitable for evaluation
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt + "\n\nIMPORTANT: Return ONLY valid JSON matching the exact schema structure. Do not include any text outside the JSON object." },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Low temperature for determinism
      max_tokens: 4000,
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`OpenAI API call timed out after ${OPENAI_TIMEOUT_MS}ms`));
      }, OPENAI_TIMEOUT_MS);
    });
    
    const response = await Promise.race([apiCall, timeoutPromise]);

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("OpenAI did not return content");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseError: any) {
      throw new Error(`Failed to parse OpenAI response as JSON: ${parseError.message}`);
    }

    try {
      const normalized = normalizeEvaluationJson(parsed, inputQuestions);
      const capped = applyStrictScoreCaps(normalized);
      return EvaluationJsonSchema.parse(capped);
    } catch (normErr: any) {
      if (normErr instanceof z.ZodError) {
        const msgs = normErr.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
        throw new Error(`Schema validation failed: ${msgs.join(", ")}`);
      }
      throw normErr;
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new Error(`Schema validation failed: ${error.errors.map(e => `${e.path}: ${e.message}`).join(", ")}`);
    }
    if (error.response?.status === 401) {
      throw new Error("OpenAI API key is invalid");
    }
    if (error.response?.status === 429) {
      throw new Error("OpenAI API rate limit exceeded");
    }
    throw new Error(`OpenAI API error: ${error.message || "Unknown error"}`);
  }
}

