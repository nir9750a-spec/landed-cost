// Bank of Israel USD/ILS exchange rate proxy.
// Browser cannot call boi.org.il directly (no CORS headers) — this proxy fetches
// server-side and returns JSON with permissive CORS for our origins.
//
// Deploy: supabase functions deploy boi-usd-rate

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

function validRate(r: unknown): r is number {
  return typeof r === 'number' && r > 1 && r < 20;
}

async function tryBoi(): Promise<{ rate: number; source: string } | null> {
  try {
    const res = await fetch(
      'https://boi.org.il/PublicApi/GetExchangeRates?currencyCode=USD',
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rate = Number(
      data?.exchangeRates?.find((r: { key?: string }) => r.key === 'USD')?.currentExchangeRate,
    );
    if (validRate(rate)) return { rate, source: 'boi' };
  } catch {}
  return null;
}

async function tryOpenErApi(): Promise<{ rate: number; source: string } | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/ILS');
    if (!res.ok) return null;
    const data = await res.json();
    const usdPerIls = Number(data?.rates?.USD);
    if (usdPerIls && usdPerIls > 0) {
      const ilsPerUsd = Number((1 / usdPerIls).toFixed(4));
      if (validRate(ilsPerUsd)) return { rate: ilsPerUsd, source: 'open-er-api' };
    }
  } catch {}
  return null;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const result = (await tryBoi()) ?? (await tryOpenErApi());
  if (!result) {
    return new Response(
      JSON.stringify({ error: 'All exchange rate sources failed' }),
      { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
  return new Response(
    JSON.stringify({ ...result, fetched_at: new Date().toISOString() }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
