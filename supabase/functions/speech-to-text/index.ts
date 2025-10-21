import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audio } = await req.json();

    if (!audio) {
      return new Response(
        JSON.stringify({ error: 'No audio provided' }),
        { status: 400, headers: corsHeaders }
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
      { headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Speech-to-text failed' }),
      { status: 500, headers: corsHeaders }
    );
  }
});
