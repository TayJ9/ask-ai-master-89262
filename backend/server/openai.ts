/**
 * @deprecated This module is deprecated. The application has migrated to ElevenLabs for voice interview features.
 * This file is kept for reference only and should not be used in new code.
 * 
 * All OpenAI endpoints have been removed:
 * - /api/ai/text-to-speech (removed)
 * - /api/ai/speech-to-text (removed)
 * - /api/ai/analyze-response (removed)
 * - /api/ai/coach (removed)
 * 
 * Voice interview functionality now uses ElevenLabs ConvAI API via:
 * - /api/conversation-token (ElevenLabs)
 * - /webhooks/elevenlabs (ElevenLabs webhook)
 * 
 * See ELEVENLABS_ENV_VARIABLES.md for required environment variables.
 */

import OpenAI, { toFile } from "openai";

// This integration uses OpenAI's API, which points to OpenAI's API servers and requires your own API key.
// Using gpt-4o for reliable performance across all features

// Lazy-load OpenAI client to avoid crashing if API key is missing
// Only instantiate when actually needed
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    // Support both OPENAI_API_KEY and OPEN_API_KEY (user's naming convention)
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
    
    if (!apiKey) {
      throw new Error(
        'OpenAI API key not found. ' +
        'Please set either OPENAI_API_KEY or OPEN_API_KEY in Railway Variables. ' +
        'Get your API key from https://platform.openai.com/api-keys'
      );
    }
    
    // Log which variable was used (for debugging)
    if (process.env.OPEN_API_KEY && !process.env.OPENAI_API_KEY) {
      console.log('ℹ️  Using OPEN_API_KEY environment variable');
    }
    
    openaiClient = new OpenAI({ apiKey });
  }
  
  return openaiClient;
}

export async function textToSpeech(text: string): Promise<Buffer> {
  const openai = getOpenAIClient();
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    input: text,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function speechToText(audioBuffer: Buffer): Promise<string> {
  const openai = getOpenAIClient();
  const transcription = await openai.audio.transcriptions.create({
    file: await toFile(audioBuffer, "audio.webm", { type: "audio/webm" }),
    model: "whisper-1",
  });

  return transcription.text;
}

export async function analyzeInterviewResponse(
  question: string,
  answer: string,
  role: string
): Promise<{
  score: number;
  strengths: string[];
  improvements: string[];
}> {
  const roleContext: Record<string, string> = {
    'software-engineer': 'Software Engineering role focusing on technical skills, problem-solving, coding practices, system design, algorithms, and engineering best practices.',
    'product-manager': 'Product Management role focusing on strategic thinking, prioritization, user research, cross-functional collaboration, and product vision.',
    'marketing': 'Marketing role focusing on campaign strategy, analytics, creativity, customer understanding, ROI measurement, and brand positioning.'
  };
  

  const prompt = `You are an expert interview coach with 15 years of experience evaluating ${role} candidates. Your feedback should be specific, actionable, and constructive.

CONTEXT:
- Role: ${role}
- Role Focus: ${roleContext[role] || 'Professional interview'}

QUESTION: ${question}

CANDIDATE'S ANSWER: ${answer}

ANALYSIS REQUIRED:

1. **Content Analysis**:
   - Did they answer the question directly?
   - Did they provide specific examples and concrete details?
   - Is their answer relevant to the role and industry?
   - Did they demonstrate role-specific knowledge or skills?

2. **Communication Quality**:
   - Is the answer clear and well-structured?
   - Did they use appropriate professional language?
   - Was the length appropriate (not too short/too long)?
   - Did they sound confident and articulate?

3. **Technical/Professional Depth** (role-dependent):
   - Did they show expertise in key areas for this role?
   - Did they use industry terminology appropriately?
   - Did they demonstrate critical thinking?

4. **Overall Scoring Guide**:
   - 80-100: Excellent answer with specific examples, clear structure, role-relevant, professional tone
   - 60-79: Good answer but could use more specifics, better structure, or more depth
   - 40-59: Adequate answer but lacks specifics, unclear structure, or limited depth
   - 0-39: Weak answer, vague, off-topic, or unprofessional

Return JSON with this exact structure:
{
  "score": number (0-100),
  "strengths": ["specific strength with example", "specific strength with example"],
  "improvements": ["actionable improvement with 'how to' guidance", "actionable improvement with 'how to' guidance"]
}

IMPORTANT GUIDELINES:
- Strengths should reference SPECIFIC parts of their answer (e.g., "You provided a concrete example of X which demonstrates Y")
- Improvements must be ACTIONABLE and specific (e.g., "Add a specific metric or outcome to strengthen your answer" NOT "Make it better")
- Be encouraging and constructive - even for low scores
- Ensure strengths and improvements are balanced (neither overly harsh nor overly generous)`;

  // Using gpt-4o for reliable analysis
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7, // Balanced: not too robotic, but consistent
    max_tokens: 800, // More tokens for detailed feedback
  });

  const result = JSON.parse(response.choices[0].message.content);
  
  return {
    score: result.score,
    strengths: result.strengths,
    improvements: result.improvements,
  };
}

export async function chatWithCoach(
  userMessage: string,
  context?: { role: string; recentSessions?: number }
): Promise<string> {
  const roleSpecificTips: Record<string, string> = {
    'software-engineer': 'For software engineering interviews, focus on technical depth and problem-solving. Common topics include: System design (scalability, databases, APIs), Data structures and algorithms, Coding best practices and testing, Experience with specific frameworks. Show your thought process, not just the answer. Interviewers want to see how you think!',
    'product-manager': 'For product management interviews, emphasize strategic thinking and user focus. Key areas: Product strategy and roadmap prioritization, User research and data-driven decisions, Cross-functional collaboration. Use frameworks like RICE or MoSCoW for prioritization discussions.',
    'marketing': 'For marketing interviews, showcase creative and analytical skills. Highlight: Campaign strategy and execution, Marketing analytics and ROI measurement, Content marketing and SEO. Share specific metrics from past campaigns - they value concrete results!'
  };

  const roleTips = roleSpecificTips[context?.role || ''] || 'general interview preparation';

  const systemPrompt = `You are Sarah, a warm and experienced interview coach with 15 years of experience helping candidates land their dream jobs.

Your coaching style:
- Be conversational and friendly (use "you" and "I'll help you")
- Give SPECIFIC, actionable advice - not generic platitudes
- Share real examples and frameworks candidates can immediately use
- Be encouraging but honest about what works and what doesn't
- Personalize your response to their specific question

LANGUAGE & TERMINOLOGY:
Use professional industry terminology with brief, natural explanations when introducing key concepts. Your audience includes both working professionals and college students.

Examples of good explanations:
✅ "Use the STAR method (Situation, Task, Action, Result) to structure your answers..."
✅ "Think about RICE prioritization - that's a framework for weighing Reach, Impact, Confidence, and Effort..."
✅ "With the Pareto Principle (80/20 rule), you're identifying what drives most value..."

Explain terms naturally in context. If using an acronym or technical term for the first time, briefly explain it. This prepares candidates to speak like professionals during interviews.

When answering questions, provide:
1. A clear, direct answer (2-3 sentences)
2. A practical framework or approach they can use
3. A specific example or tip they can remember
4. Motivation or confidence boost (end on a positive note)

Role context: ${roleTips}

Remember: Real interviews are conversations, not interrogations. Help them feel prepared and confident. Speak like a trusted mentor, not a corporate handbook.`;

  // Using gpt-4o for reliable coaching responses
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    temperature: 0.9,
    max_tokens: 350,
  });

  return response.choices[0].message.content || "Sorry, I couldn't process that. Could you try rephrasing your question?";
}
