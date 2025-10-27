import OpenAI, { toFile } from "openai";

// This integration uses OpenAI's API, which points to OpenAI's API servers and requires your own API key.
// The newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user

if (!process.env.OPENAI_API_KEY) {
  console.error('CRITICAL ERROR: OPENAI_API_KEY environment variable is not set!');
  console.error('Available env vars:', Object.keys(process.env).filter(k => !k.includes('SECRET')));
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function textToSpeech(text: string): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    input: text,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function speechToText(audioBuffer: Buffer): Promise<string> {
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
  const prompt = `You are an expert interview coach. Analyze this ${role} interview response.

Question: ${question}

Candidate's Answer: ${answer}

Provide a detailed analysis in JSON format with:
1. score (0-100): Overall quality of the response
2. strengths (array of strings): 2-3 specific positive aspects
3. improvements (array of strings): 2-3 concrete suggestions for improvement

Focus on: clarity, technical accuracy (if applicable), structure, communication skills, and role-specific competencies.

Return only valid JSON with this exact structure:
{
  "score": number,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}`;

  // The newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
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

  // The newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    temperature: 0.9,
    max_tokens: 350,
  });

  return response.choices[0].message.content || "Sorry, I couldn't process that. Could you try rephrasing your question?";
}
