// Best-effort freight market rate fetcher.
//
// Source: Freightos FBX13 (China/East Asia → Mediterranean) public page.
// Israel ports (Ashdod/Haifa) are part of the Mediterranean region the
// FBX13 index covers, so this is the most relevant single rate for our
// small importer.
//
// The Freightos page exposes the latest weekly rate as plain text in the
// HTML. We fetch server-side (no CORS), parse the dollar amount, and
// return JSON. If parsing fails or the page is unreachable, we return
// available:false so the client falls back to a manual-update reminder.
//
// LCL per-CBM rate has no equivalent free public source — left manual.
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

const FREIGHTOS_URL =
  'https://www.freightos.com/enterprise/terminal/fbx-13-china-to-mediterranean/';

// Looks for the current FBX13 rate in the HTML. The page shows the rate as
// something like "$3,663.20" near terms like "FBX13" / "40ft" / "current".
// Returns USD value or null if no plausible rate is found.
function extractFbx13Rate(html: string): number | null {
  const patterns: RegExp[] = [
    // Rate immediately after FBX13/FBX-13 keyword
    /FBX[\s-]*13[\s\S]{0,400}?\$([\d,]+(?:\.\d{2})?)/i,
    // "Current Rate" anchor
    /current\s+rate[\s\S]{0,200}?\$([\d,]+(?:\.\d{2})?)/i,
    // Anywhere near "per 40" or "40ft" / "FEU"
    /\$([\d,]+(?:\.\d{2})?)\s*(?:per\s*40|\/\s*40|\s*\/\s*FEU|\s*per\s*FEU)/i,
    // Any plausible 4-figure dollar amount near China→Med language
    /(?:china[\s\S]{0,80}mediterranean|mediterranean[\s\S]{0,80}china)[\s\S]{0,500}?\$([\d,]+(?:\.\d{2})?)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(v) && v >= 500 && v <= 20000) return v;
    }
  }
  return null;
}

async function fetchFbx13(): Promise<number | null> {
  try {
    const res = await fetch(FREIGHTOS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractFbx13Rate(html);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const rate = await fetchFbx13();
  if (rate == null) {
    return new Response(JSON.stringify({
      available: false,
      reason: 'לא הצלחתי לפענח את שער FBX13 מ-Freightos כרגע. עדכן ידנית בבאנר.',
      fetched_at: new Date().toISOString(),
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    available: true,
    source: 'Freightos FBX13 (China → Mediterranean)',
    rates: {
      fcl_40ft_china_med: rate,
    },
    note: 'LCL/CBM ו-Air אין במקור חינמי — עדכן אותם ידנית',
    fetched_at: new Date().toISOString(),
  }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
