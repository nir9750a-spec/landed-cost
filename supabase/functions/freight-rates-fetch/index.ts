// Best-effort freight market rate fetcher.
//
// Returns the current FCL 40ft (China → Mediterranean) and LCL per-CBM rates.
// Currently no free public API exists for these — this function is a
// placeholder that returns available:false. When a real source is wired
// (Freightos API key, paid Drewry feed, etc.), only this file needs to
// change — the client will pick up the new behavior automatically.
//
// Deploy: supabase functions deploy freight-rates-fetch --no-verify-jwt

const ALLOWED_ORIGIN_REGEX = /^https:\/\/nir-sigma-liard(-[a-z0-9-]+)?\.vercel\.app$/;
const ALLOWED_ORIGINS = new Set([
  'https://nir-sigma-liard.vercel.app',
  'http://localhost:3000',
]);

function corsHeaders(origin: string | null) {
  const allow = origin && (ALLOWED_ORIGINS.has(origin) || ALLOWED_ORIGIN_REGEX.test(origin))
    ? origin
    : 'https://nir-sigma-liard.vercel.app';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // ── No public source configured yet — return structured "unavailable".
  //    The client treats this as a signal to prompt the user to update
  //    manually via the top banner.
  //
  //    To enable real fetching, replace this body with code that calls
  //    e.g. Freightos API or scrapes a public freight-index page, then
  //    returns { available: true, rates: { fcl_40ft_china_med, lcl_per_cbm } }.
  return new Response(JSON.stringify({
    available: false,
    reason: 'אין מקור ציבורי חינמי לשערי שילוח China→Israel. עדכן ידנית בבאנר העליון.',
    suggested_sources: [
      'https://fbx.freightos.com/',         // FBX13 China → Med
      'https://www.drewry.co.uk/wci',        // WCI (paid, no Israel route)
    ],
    fetched_at: new Date().toISOString(),
  }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
