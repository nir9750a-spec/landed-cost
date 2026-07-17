// FinBot "Create Income" proxy — issues income documents (tax invoice,
// invoice/receipt, receipt, credit invoice) in the user's FinBot account.
//
// Why a server-side proxy: the FinBot API key must NEVER reach the browser
// bundle. This function holds it as a Supabase secret and injects it into the
// outgoing request, exactly like `anthropic-proxy` does for ANTHROPIC_API_KEY.
//
// Deploy:  supabase functions deploy finbot-issue-income --no-verify-jwt
// Secrets: supabase secrets set FINBOT_API_KEY=xxxxxxxx-....         (required)
//          supabase secrets set FINBOT_API_URL=https://.../create   (required)
//          supabase secrets set FINBOT_KEY_MODE=body:apiKey         (optional)
//
// ─────────────────────────────────────────────────────────────────────────────
//  ⚠️  CONFIRM AGAINST YOUR FINBOT API DOCS BEFORE GOING LIVE  ⚠️
//  Set these two secrets from the FinBot "API להפקת הכנסות" documentation page:
//    • FINBOT_API_URL   — the exact POST endpoint for creating an income document
//    • FINBOT_KEY_MODE  — how the key is passed. One of:
//        body:<field>            e.g. body:apiKey   → adds { apiKey: "<key>" } to the JSON
//        header:<name>           e.g. header:X-Api-Key
//        header:<name>:Bearer    e.g. header:Authorization:Bearer
//  Until FINBOT_API_URL is set the function is INERT and returns 501 — it never
//  calls a guessed URL, so it is safe to deploy before the contract is confirmed.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://nir-sigma-liard.vercel.app',
  'http://localhost:3000',
];

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

// Inject the secret key into the outgoing request per FINBOT_KEY_MODE.
function applyKey(
  mode: string,
  key: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
) {
  const [where, name, scheme] = mode.split(':');
  if (where === 'header') {
    headers[name] = scheme ? `${scheme} ${key}` : key;
  } else {
    // default: body field
    payload[name || 'apiKey'] = key;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, cors);

    const apiKey = Deno.env.get('FINBOT_API_KEY');
    const apiUrl = Deno.env.get('FINBOT_API_URL');
    const keyMode = Deno.env.get('FINBOT_KEY_MODE') || 'body:apiKey';

    // Inert until configured — never call a guessed URL.
    if (!apiKey || !apiUrl) {
      return jsonResponse(501, {
        error: 'חיבור פינבוט לא מוגדר עדיין. הגדר את הסודות FINBOT_API_KEY ו-FINBOT_API_URL ' +
               'לפי דף התיעוד "API להפקת הכנסות" בפינבוט.',
        configured: false,
      }, cors);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' }, cors);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    applyKey(keyMode, apiKey, headers, payload);

    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    // Pass FinBot's response through verbatim (client interprets status/data).
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
  } catch (err) {
    return jsonResponse(500, {
      error: 'שגיאה בפנייה לפינבוט',
      detail: err instanceof Error ? err.message : String(err),
    }, cors);
  }
});
