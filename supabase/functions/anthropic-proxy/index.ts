// Anthropic API proxy — keeps the API key server-side.
// Accepts the same payload that would have been sent to api.anthropic.com/v1/messages
// and relays it with the secret ANTHROPIC_API_KEY from Supabase Secrets.
//
// Deploy: supabase functions deploy anthropic-proxy --no-verify-jwt
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

function jsonResponse(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: cors });
    }

    if (req.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' }, cors);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return jsonResponse(500, { error: 'Server misconfigured: ANTHROPIC_API_KEY not set' }, cors);
    }

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' }, cors);
    }

    if (!payload.model || !ALLOWED_MODELS.has(payload.model)) {
      return jsonResponse(400, { error: `Model not allowed. Allowed: ${[...ALLOWED_MODELS].join(', ')}` }, cors);
    }

    if (typeof payload.max_tokens === 'number' && payload.max_tokens > 8192) {
      return jsonResponse(400, { error: 'max_tokens cannot exceed 8192' }, cors);
    }

    // Retry transient upstream errors (529 Overloaded, 503/502 transient failures).
    // Backoff: 1s, 2s, 4s. 4 attempts total.
    const RETRY_STATUSES = new Set([502, 503, 529]);
    const MAX_RETRIES = 3;
    let upstream: Response | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(payload),
        });
        if (!RETRY_STATUSES.has(upstream.status)) break;
      } catch (err) {
        lastErr = err;
      }
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }

    if (!upstream) {
      return jsonResponse(502, {
        error: 'שירות ה-AI לא זמין כרגע. נסה שוב בעוד דקה.',
        detail: lastErr instanceof Error ? lastErr.message : String(lastErr),
      }, cors);
    }

    // Still overloaded after retries — translate to a user-friendly message.
    if (RETRY_STATUSES.has(upstream.status)) {
      const detail = await upstream.text();
      return jsonResponse(503, {
        error: 'שירות ה-AI עמוס כרגע. נסה שוב בעוד דקה-שתיים.',
        upstream_status: upstream.status,
        upstream_detail: detail.slice(0, 500),
      }, cors);
    }

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err) {
    // Catch-all so we never return a response without CORS headers.
    return jsonResponse(500, {
      error: 'Internal proxy error',
      detail: err instanceof Error ? err.message : String(err),
    }, cors);
  }
});
