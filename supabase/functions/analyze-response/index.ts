import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { question, answer, role } = await req.json();

    // Input validation
    if (!question || typeof question !== 'string' || question.length > 1000) {
      return new Response(
        JSON.stringify({ error: 'Invalid question input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!answer || typeof answer !== 'string' || answer.length > 5000) {
      return new Response(
        JSON.stringify({ error: 'Invalid answer input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allowedRoles = ['software-engineer', 'product-manager', 'marketing'];
    if (!role || !allowedRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
