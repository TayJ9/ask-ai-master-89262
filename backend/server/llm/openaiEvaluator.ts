/**
 * OpenAI-based Interview Evaluator
 * 
 * Uses OpenAI Responses API with Structured Outputs (json_schema) to generate
 * consistent, schema-validated evaluation results.
 */

import { z } from "zod";

// Zod schema for evaluation output
export const EvaluationJsonSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  overall_strengths: z.array(z.string()).min(1).max(5),
  overall_improvements: z.array(z.string()).min(1).max(5),
  questions: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
      score: z.number().int().min(0).max(100),
      strengths: z.array(z.string()).min(1).max(3),
      improvements: z.array(z.string()).min(1).max(3),
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
}

/**
 * Score an interview using OpenAI with structured outputs
 */
export async function scoreInterview({
  role,
  major,
  resumeText,
  questions,
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
  const context = contextParts.length > 0 ? `\n\nContext: ${contextParts.join(", ")}` : "";

  // Build resume context
  const resumeContext = resumeText 
    ? `\n\nCANDIDATE RESUME:\n${resumeText.substring(0, 2000)}${resumeText.length > 2000 ? '...' : ''}\n\nWhen evaluating, consider whether answers align with skills/experience mentioned in the resume.`
    : "";

  // Build questions text
  const questionsText = questions
    .map((qa, idx) => `Question ${idx + 1}:\nQ: ${qa.question}\nA: ${qa.answer}`)
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
- **Coachability (15 points for entry-level)**: For entry-level candidates, emphasize growth mindset and learning ability. This is especially important for candidates with limited experience.
- **Resume Alignment**: If a resume is provided, consider whether answers align with claimed skills/experience. Note inconsistencies or missed opportunities to highlight relevant experience.

CONSTRAINTS:
- Strengths and improvements must be concrete and tied to the specific answer content.
- Keep strengths and improvements arrays to 1-3 items each.
- Do NOT mention that you are an AI or use AI-related language.
- Be encouraging but honest - even lower scores should have constructive feedback.
- Overall strengths/improvements should synthesize patterns across all answers.
- For entry-level candidates, emphasize potential and coachability over extensive experience.
- All scores must be positive integers (0-100), no decimals.`;

  const userPrompt = `Evaluate this interview${context}${resumeContext}

${questionsText}

IMPORTANT INSTRUCTIONS:
1. For EACH question, first classify it as: behavioral, technical, situational, or informational
2. Apply the appropriate rubric weights based on question type
3. STAR Structure should ONLY be evaluated for behavioral questions (0 points for other types)
4. For entry-level candidates, give significant weight to coachability (15 points) when appropriate
5. If a resume is provided, note any alignment or inconsistencies between answers and resume claims

Provide a strict JSON evaluation matching the schema. Score each answer individually using the adaptive rubric, then calculate the overall_score as a weighted average (weighted by question importance if applicable, otherwise simple average). All scores must be integers (round to nearest whole number).`;

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
      max_tokens: 2000,
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

    // Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseError: any) {
      throw new Error(`Failed to parse OpenAI response as JSON: ${parseError.message}`);
    }

    // Log what we received for debugging
    console.log('[OPENAI_EVALUATOR] Raw OpenAI response:', {
      hasOverallScore: 'overall_score' in parsed,
      hasOverallStrengths: 'overall_strengths' in parsed,
      hasOverallImprovements: 'overall_improvements' in parsed,
      hasQuestions: 'questions' in parsed,
      hasEvaluations: 'evaluations' in parsed,
      questionsCount: parsed.questions?.length || 0,
      evaluationsCount: parsed.evaluations?.length || 0,
      keys: Object.keys(parsed),
      parsedPreview: JSON.stringify(parsed).substring(0, 500),
    });

    // Transform OpenAI response to match our schema if needed
    let transformed = parsed;
    
    // If OpenAI returned "evaluations" instead of "questions", transform it
    if (parsed.evaluations && !parsed.questions) {
      console.log('[OPENAI_EVALUATOR] Transforming "evaluations" to "questions" format');
      transformed = {
        ...parsed,
        questions: parsed.evaluations.map((evalItem: any, index: number) => {
          // Find the corresponding question from our input
          const qaPair = inputQuestions[index];
          
          // Handle score - could be a number, object with breakdown, or object with 'total'
          let score = 0;
          if (typeof evalItem.score === 'number') {
            score = Math.round(evalItem.score);
          } else if (evalItem.score && typeof evalItem.score === 'object') {
            // If score is an object, try to get 'total' field or sum the values
            if (typeof evalItem.score.total === 'number') {
              score = Math.round(evalItem.score.total);
            } else {
              // Sum all numeric values in the score object
              const scoreValues = Object.values(evalItem.score).filter(v => typeof v === 'number') as number[];
              if (scoreValues.length > 0) {
                score = Math.round(scoreValues.reduce((sum, val) => sum + val, 0));
              }
            }
          }
          
          // Ensure score is in valid range
          score = Math.max(0, Math.min(100, score));
          
          // Ensure strengths and improvements are arrays
          const strengths = Array.isArray(evalItem.strengths) ? evalItem.strengths : [];
          const improvements = Array.isArray(evalItem.improvements) ? evalItem.improvements : [];
          
          return {
            question: qaPair?.question || evalItem.question || `Question ${index + 1}`,
            answer: qaPair?.answer || evalItem.answer || '',
            score: score,
            strengths: strengths.length > 0 ? strengths : ['Provided a response to the question'],
            improvements: improvements.length > 0 ? improvements : ['Could provide more specific details'],
          };
        }),
      };
      delete transformed.evaluations;
    }

    // Generate overall_strengths and overall_improvements if missing
    if (!transformed.overall_strengths && transformed.questions) {
      console.log('[OPENAI_EVALUATOR] Generating overall_strengths from question strengths');
      const allStrengths = new Set<string>();
      transformed.questions.forEach((q: any) => {
        if (Array.isArray(q.strengths)) {
          q.strengths.forEach((s: string) => allStrengths.add(s));
        }
      });
      transformed.overall_strengths = Array.from(allStrengths).slice(0, 5);
      if (transformed.overall_strengths.length === 0) {
        transformed.overall_strengths = ['Demonstrated technical knowledge'];
      }
    }

    if (!transformed.overall_improvements && transformed.questions) {
      console.log('[OPENAI_EVALUATOR] Generating overall_improvements from question improvements');
      const allImprovements = new Set<string>();
      transformed.questions.forEach((q: any) => {
        if (Array.isArray(q.improvements)) {
          q.improvements.forEach((i: string) => allImprovements.add(i));
        }
      });
      transformed.overall_improvements = Array.from(allImprovements).slice(0, 5);
      if (transformed.overall_improvements.length === 0) {
        transformed.overall_improvements = ['Could provide more specific examples'];
      }
    }

    // Ensure questions array exists and is properly formatted
    if (!transformed.questions && transformed.evaluations) {
      transformed.questions = transformed.evaluations;
      delete transformed.evaluations;
    }

    // Ensure schema compliance: fix empty strengths arrays and round scores to integers
    if (transformed.questions) {
      transformed.questions = transformed.questions.map((q: any) => {
        // Round score to integer
        if (typeof q.score === 'number') {
          q.score = Math.round(q.score);
        } else {
          q.score = 0;
        }
        
        // Ensure score is in valid range
        q.score = Math.max(0, Math.min(100, q.score));
        
        // Ensure strengths array has at least 1 item
        if (!Array.isArray(q.strengths) || q.strengths.length === 0) {
          q.strengths = ['Provided a response to the question'];
        }
        
        // Ensure improvements is an array
        if (!Array.isArray(q.improvements)) {
          q.improvements = [];
        }
        
        return q;
      });
    }
    
    // Round overall_score to integer
    if (typeof transformed.overall_score === 'number') {
      transformed.overall_score = Math.round(transformed.overall_score);
      transformed.overall_score = Math.max(0, Math.min(100, transformed.overall_score));
    } else {
      transformed.overall_score = 0;
    }

    // Validate with Zod (ensures schema compliance)
    try {
      const validated = EvaluationJsonSchema.parse(transformed);
      console.log('[OPENAI_EVALUATOR] ✅ Schema validation passed after transformation');
      return validated;
    } catch (zodError: any) {
      if (zodError instanceof z.ZodError) {
        console.error('[OPENAI_EVALUATOR] Schema validation failed. Received:', {
          keys: Object.keys(parsed),
          overallScore: parsed.overall_score,
          overallStrengths: parsed.overall_strengths,
          overallImprovements: parsed.overall_improvements,
          questions: parsed.questions,
          errors: zodError.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        });
        throw new Error(`Schema validation failed: ${zodError.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(", ")}`);
      }
      throw zodError;
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

