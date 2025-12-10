import { storage } from "./storage";

/**
 * @deprecated This function uses OpenAI API which has been deprecated.
 * The application has migrated to ElevenLabs for voice interview features.
 * 
 * This function is kept for backward compatibility but requires OPENAI_API_KEY.
 * Consider migrating to ElevenLabs-based analysis or removing this functionality.
 * 
 * Analyze entire interview session at the end
 * Collects all Q&A pairs and generates comprehensive feedback
 */
export async function analyzeInterviewSession(
  sessionId: string
): Promise<{
  overallScore: number;
  feedbackSummary: string;
  strengths: string[];
  improvements: string[];
  scoresByDimension: Record<string, number>;
}> {
  // Get all interview turns for this session
  const turns = await storage.getTurnsBySessionId(sessionId);
  const session = await storage.getSessionById(sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  if (!turns || turns.length === 0) {
    throw new Error("No interview turns found for analysis");
  }

  // Build conversation transcript
  const conversationTranscript = turns
    .map((turn, index) => {
      let text = `Turn ${index + 1}:\n`;
      if (turn.agentMessage) {
        text += `Interviewer: ${turn.agentMessage}\n`;
      }
      if (turn.userTranscript) {
        text += `Candidate: ${turn.userTranscript}\n`;
      }
      return text;
    })
    .join("\n");

  // Get resume context if available
  const resumeContext = session.resumeText
    ? `\n\nCANDIDATE'S RESUME SUMMARY:\n${session.resumeText}`
    : "\n\n(No resume provided)";

  // Build comprehensive analysis prompt
  const prompt = `You are an expert interview coach with 15 years of experience evaluating ${session.role} candidates. Analyze this complete interview conversation and provide comprehensive feedback.

ROLE CONTEXT:
- Position: ${session.role}
- Difficulty Level: ${session.difficulty || "Medium"}
${resumeContext}

COMPLETE INTERVIEW CONVERSATION:
${conversationTranscript}

ANALYSIS REQUIREMENTS:

1. **Overall Performance Assessment**:
   - How well did the candidate answer questions throughout the interview?
   - Did they provide specific examples and concrete details consistently?
   - Was there improvement or consistency in their responses?
   - Did they demonstrate role-specific knowledge and skills?

2. **Communication Quality**:
   - Clarity and structure of answers across all questions
   - Professional language and tone
   - Ability to articulate thoughts effectively
   - Pacing and conciseness

3. **Technical/Professional Depth**:
   - Demonstrated expertise in key areas for this role
   - Appropriate use of industry terminology
   - Critical thinking and problem-solving examples
   - Depth of understanding shown

4. **Specific Strengths**:
   - Identify 3-5 specific strengths with concrete examples from their answers
   - Reference specific turns or responses that demonstrated these strengths

5. **Areas for Improvement**:
   - Identify 3-5 actionable areas for improvement
   - Provide specific guidance on how to improve
   - Reference specific turns or responses that could be enhanced

6. **Dimension Scores** (0-100 each):
   - Content Quality: Relevance, specificity, examples
   - Communication: Clarity, structure, articulation
   - Technical Depth: Role-specific knowledge, terminology
   - Professionalism: Tone, confidence, demeanor
   - Problem Solving: Critical thinking, examples

7. **Overall Score** (0-100):
   - Weighted average considering all dimensions
   - 80-100: Excellent performance with strong examples and clear communication
   - 60-79: Good performance with room for improvement in specific areas
   - 40-59: Adequate performance but needs significant improvement
   - 0-39: Weak performance requiring substantial development

Return JSON with this exact structure:
{
  "overallScore": number (0-100),
  "feedbackSummary": "2-3 paragraph comprehensive summary of the interview performance",
  "strengths": ["specific strength with example from conversation", "specific strength with example", ...],
  "improvements": ["actionable improvement with specific guidance", "actionable improvement with specific guidance", ...],
  "scoresByDimension": {
    "contentQuality": number (0-100),
    "communication": number (0-100),
    "technicalDepth": number (0-100),
    "professionalism": number (0-100),
    "problemSolving": number (0-100)
  }
}

IMPORTANT GUIDELINES:
- Strengths should reference SPECIFIC parts of their conversation (e.g., "In Turn 3, you provided a concrete example of X which demonstrates Y")
- Improvements must be ACTIONABLE and specific with 'how to' guidance
- Be encouraging and constructive - even for lower scores
- Ensure strengths and improvements are balanced (neither overly harsh nor overly generous)
- The feedback summary should be comprehensive but concise (2-3 paragraphs)`;

  // DEPRECATED: This function uses OpenAI API
  // Note: OpenAI endpoints have been removed from the application.
  // This function is kept for backward compatibility only.
  // Consider migrating to ElevenLabs-based analysis or removing this functionality.
  
  const { default: OpenAI } = await import("openai");
  
  // Support both OPENAI_API_KEY and OPEN_API_KEY (user's naming convention)
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. " +
      "This function requires OPENAI_API_KEY but OpenAI endpoints have been deprecated. " +
      "The application has migrated to ElevenLabs. " +
      "Please set OPENAI_API_KEY in Railway Variables if you need this legacy functionality, " +
      "or consider removing this feature."
    );
  }

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 1500,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");

  return {
    overallScore: result.overallScore || 0,
    feedbackSummary: result.feedbackSummary || "No summary available.",
    strengths: result.strengths || [],
    improvements: result.improvements || [],
    scoresByDimension: result.scoresByDimension || {},
  };
}

