/**
 * OpenAI-based Interview Evaluator
 * 
 * Uses OpenAI Responses API with Structured Outputs (json_schema) to generate
 * consistent, schema-validated evaluation results.
 */

import { z } from "zod";

// Zod schema for evaluation output
export const EvaluationJsonSchema = z.object({
  overall_score: z.number().min(0).max(100),
  overall_strengths: z.array(z.string()).min(1).max(5),
  overall_improvements: z.array(z.string()).min(1).max(5),
  questions: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
      score: z.number().min(0).max(100),
      strengths: z.array(z.string()).min(1).max(3),
      improvements: z.array(z.string()).min(1).max(3),
      sample_better_answer: z.string().min(20).max(500),
    })
  ).min(1),
});

export type EvaluationJson = z.infer<typeof EvaluationJsonSchema>;

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
            sample_better_answer: {
              type: "string",
              minLength: 20,
              maxLength: 500,
              description: "A sample better answer (2-4 sentences, beginner-friendly, no invented facts)",
            },
          },
          required: ["question", "answer", "score", "strengths", "improvements", "sample_better_answer"],
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
  questions: Array<{ question: string; answer: string }>;
}

/**
 * Score an interview using OpenAI with structured outputs
 */
export async function scoreInterview({
  role,
  major,
  questions,
}: ScoreInterviewParams): Promise<EvaluationJson> {
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
  const context = contextParts.length > 0 ? `\n\nContext: ${contextParts.join(", ")}` : "";

  // Build questions text
  const questionsText = questions
    .map((qa, idx) => `Question ${idx + 1}:\nQ: ${qa.question}\nA: ${qa.answer}`)
    .join("\n\n");

  const systemPrompt = `You are an evaluator for internship and entry-level job interviews. Your task is to evaluate candidate answers and provide constructive feedback.

EVALUATION RUBRIC (Score 0-100 per answer):
- Clarity (20 points): Is the answer clear and easy to understand?
- Specificity (20 points): Does the answer include specific examples, metrics, or concrete details?
- STAR Structure (15 points): Does the answer follow Situation-Task-Action-Result format when appropriate?
- Relevance (15 points): Does the answer directly address the question?
- Impact (10 points): Does the answer demonstrate impact or results?
- Ownership (10 points): Does the answer show personal responsibility and action ("I did X" not "we did X")?
- Communication (5 points): Is the answer well-structured and professional?
- Coachability (5 points): Does the answer show openness to learning and growth?

CONSTRAINTS:
- Strengths and improvements must be concrete and tied to the specific answer content.
- sample_better_answer should be 2-4 sentences, beginner-friendly, and realistic (do NOT invent facts about the candidate).
- Keep strengths and improvements arrays to 1-3 items each.
- Do NOT mention that you are an AI or use AI-related language.
- Be encouraging but honest - even lower scores should have constructive feedback.
- Overall strengths/improvements should synthesize patterns across all answers.`;

  const userPrompt = `Evaluate this interview${context}.

${questionsText}

Provide a strict JSON evaluation matching the schema. Score each answer individually, then calculate the overall_score as a weighted average (weighted by question importance if applicable, otherwise simple average).`;

  try {
    // Use json_object format for compatibility (works with all models)
    // We'll validate with Zod to ensure schema compliance
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cost-effective model suitable for evaluation
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt + "\n\nIMPORTANT: Return ONLY valid JSON matching the exact schema structure. Do not include any text outside the JSON object." },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Low temperature for determinism
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("OpenAI did not return content");
    }

    // Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseError: any) {
      throw new Error(`Failed to parse OpenAI response as JSON: ${parseError.message}`);
    }

    // Validate with Zod (ensures schema compliance)
    const validated = EvaluationJsonSchema.parse(parsed);

    return validated;
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

