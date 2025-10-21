import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Rate limiting (simple in-memory store for demo - use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(ip);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Basic headers
  const responseHeaders = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  };

  try {
    // Rate limiting
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: responseHeaders }
      );
    }

    // Validate request method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: responseHeaders }
      );
    }

    // Validate content type
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type must be application/json' }),
        { status: 400, headers: responseHeaders }
      );
    }

    const { question, answer, role } = await req.json();

    // Enhanced input validation with sanitization
    if (!question || typeof question !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid question input' }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Sanitize and validate question
    const sanitizedQuestion = question.trim().replace(/[<>]/g, '');
    if (sanitizedQuestion.length === 0 || sanitizedQuestion.length > 1000) {
      return new Response(
        JSON.stringify({ error: 'Invalid question input' }),
        { status: 400, headers: responseHeaders }
      );
    }

    if (!answer || typeof answer !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid answer input' }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Sanitize and validate answer
    const sanitizedAnswer = answer.trim().replace(/[<>]/g, '');
    if (sanitizedAnswer.length === 0 || sanitizedAnswer.length > 5000) {
      return new Response(
        JSON.stringify({ error: 'Invalid answer input' }),
        { status: 400, headers: responseHeaders }
      );
    }

    const allowedRoles = ['software-engineer', 'product-manager', 'marketing'];
    if (!role || typeof role !== 'string' || !allowedRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role' }),
        { status: 400, headers: responseHeaders }
      );
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const prompt = `You are an expert interview coach. Analyze this ${role} interview response.

Question: ${sanitizedQuestion}

Candidate's Answer: ${sanitizedAnswer}

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

    // Use Lovable AI for analysis
    const response = await fetch('https://api.lovable.app/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed: ${response.statusText}`);
    }

    const result = await response.json();
    const content = result.choices[0].message.content;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    const feedback = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify(feedback),
      { headers: responseHeaders }
    );
  } catch (error) {
    // Log error securely (don't expose internal details)
    console.error('Analysis error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const sanitizedError = errorMessage.replace(/[<>]/g, '');
    
    return new Response(
      JSON.stringify({ error: sanitizedError }),
      { status: 500, headers: responseHeaders }
    );
  }
});
