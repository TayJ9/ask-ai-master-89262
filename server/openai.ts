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
