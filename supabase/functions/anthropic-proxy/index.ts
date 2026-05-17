// Anthropic API proxy — keeps the API key server-side.
// Accepts the same payload that would have been sent to api.anthropic.com/v1/messages
// and relays it with the secret ANTHROPIC_API_KEY from Supabase Secrets.
//
// Deploy: supabase functions deploy anthropic-proxy
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

const ALLOWED_ORIGINS = [
  'https://nir-sigma-liard.vercel.app',
  'http://localhost:3000',
];

const ALLOWED_MODELS = new Set([
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]);

function corsHeaders(origin: string | null) {
  const allow = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/nir-sigma-liard(-[a-z0-9-]+)?\.vercel\.app$/.test(origin)
  ) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: ANTHROPIC_API_KEY not set' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!payload.model || !ALLOWED_MODELS.has(payload.model)) {
    return new Response(JSON.stringify({ error: `Model not allowed. Allowed: ${[...ALLOWED_MODELS].join(', ')}` }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (typeof payload.max_tokens === 'number' && payload.max_tokens > 8192) {
    return new Response(JSON.stringify({ error: 'max_tokens cannot exceed 8192' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      ...cors,
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    },
  });
});
