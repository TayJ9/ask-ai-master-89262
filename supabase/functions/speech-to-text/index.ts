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
    const { audio } = await req.json();

    // Input validation
    if (!audio || typeof audio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid audio input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for reasonable size (10MB max in base64)
    if (audio.length > 13500000) {
      return new Response(
        JSON.stringify({ error: 'Audio file too large (max 10MB)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Decode base64 audio
    const audioData = Uint8Array.from(atob(audio), c => c.charCodeAt(0));

    // Create FormData for multipart upload
    const formData = new FormData();
    const audioBlob = new Blob([audioData], { type: 'audio/webm' });
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');

    // Use Lovable AI for speech-to-text
    const response = await fetch('https://api.lovable.app/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Speech-to-text failed: ${response.statusText}`);
    }

    const result = await response.json();

    return new Response(
      JSON.stringify({ text: result.text }),
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
