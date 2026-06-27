// Contact enrichment — turn a manufacturer's website domain into real,
// verified email addresses so the importer can reach the factory directly.
//
// Global by design: Hunter.io's Domain Search works for any country's domain,
// not tied to a single marketplace. Phone/website verification can be added
// later via Google Places (see README).
//
// Deploy: supabase functions deploy contact-enrich --no-verify-jwt
// Secret:  supabase secrets set HUNTER_API_KEY=...   (https://hunter.io)
//
// If HUNTER_API_KEY is not set, the function responds 200 with
// { configured: false } so the UI can show a friendly "not configured" hint
// instead of erroring.

const CACHE_TTL_SECONDS = 30 * 24 * 3600; // emails are stable — cache 30 days
const RATE_LIMIT_MAX = 30;                // enrich lookups per IP per window
const RATE_LIMIT_WINDOW = 600;            // 10 minutes

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Vary": "Origin",
  };
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return (xff.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

// All DB helpers fail open — Hunter still works if the cache/limit DB is down.
async function contactCacheGet(domain: string): Promise<any | null> {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/contact_cache?domain=eq.${encodeURIComponent(domain)}&select=result,created_at`,
      { headers: sbHeaders },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    if ((Date.now() - new Date(rows[0].created_at).getTime()) / 1000 > CACHE_TTL_SECONDS) return null;
    return rows[0].result;
  } catch { return null; }
}

async function contactCacheSet(domain: string, result: any): Promise<void> {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/contact_cache`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ domain, result, created_at: new Date().toISOString() }),
    });
  } catch { /* ignore */ }
}

async function rateAllowed(bucket: string): Promise<boolean> {
  if (!SB_URL || !SB_KEY) return true;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/check_rate_limit`, {
      method: "POST",
      headers: sbHeaders,
      body: JSON.stringify({ p_bucket: bucket, p_limit: RATE_LIMIT_MAX, p_window: RATE_LIMIT_WINDOW }),
    });
    if (!r.ok) return true;
    return (await r.json()) === true;
  } catch { return true; }
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

// Extract a bare hostname from a URL, a "www.x.com" string, or an email.
function toDomain(input: string): string {
  let s = String(input || "").trim();
  if (!s) return "";
  if (s.includes("@")) s = s.split("@").pop() || "";
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  s = s.split("/")[0].split("?")[0].split("#")[0].trim().toLowerCase();
  // Basic sanity: must look like a domain.
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) ? s : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const apiKey = Deno.env.get("HUNTER_API_KEY");
  if (!apiKey) {
    return jsonResponse(200, {
      configured: false,
      error: "HUNTER_API_KEY not set — email enrichment is not configured yet.",
    });
  }

  let payload: any;
  try { payload = await req.json(); }
  catch { return jsonResponse(400, { error: "Invalid JSON body" }); }

  const domain = toDomain(payload.domain || payload.website || payload.email || "");
  if (!domain) {
    return jsonResponse(400, { error: "לא סופק דומיין תקין לחיפוש." });
  }

  // Cache first — the same factory domain is looked up by many users, and each
  // Hunter call burns quota. Cached results are free and instant.
  const hit = await contactCacheGet(domain);
  if (hit) return jsonResponse(200, { ...hit, cached: true });

  // Rate-limit the paid Hunter path per IP.
  if (!(await rateAllowed(`enrich:${clientIp(req)}`))) {
    return new Response(
      JSON.stringify({ error: "יותר מדי בקשות אימות בזמן קצר. נסה שוב בעוד כמה דקות." }),
      { status: 429, headers: { ...corsHeaders(), "Content-Type": "application/json", "Retry-After": "120" } },
    );
  }

  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}` +
    `&limit=5&api_key=${encodeURIComponent(apiKey)}`;

  let upstream: Response;
  try {
    upstream = await fetch(url);
  } catch (err) {
    return jsonResponse(502, { error: "שירות העשרת הקשר לא זמין כרגע.", detail: String(err) });
  }

  const data = await upstream.json().catch(() => null);
  if (!data || upstream.status >= 400) {
    const msg = data?.errors?.[0]?.details || data?.errors?.[0]?.id || `Hunter error ${upstream.status}`;
    return jsonResponse(upstream.status >= 400 ? upstream.status : 502, { error: msg });
  }

  const d = data.data || {};
  const emails = Array.isArray(d.emails) ? d.emails.map((e: any) => ({
    value: e.value,
    type: e.type,                 // "generic" (info@) or "personal"
    confidence: e.confidence,     // 0–100
    position: e.position || "",
    first_name: e.first_name || "",
    last_name: e.last_name || "",
  })) : [];

  // Surface generic/sales mailboxes first — best for a cold RFQ — then by confidence.
  emails.sort((a: any, b: any) => {
    const ag = a.type === "generic" ? 1 : 0, bg = b.type === "generic" ? 1 : 0;
    if (ag !== bg) return bg - ag;
    return (b.confidence || 0) - (a.confidence || 0);
  });

  const result = {
    configured: true,
    domain,
    organization: d.organization || "",
    emails,
  };
  contactCacheSet(domain, result).catch(() => {}); // store for next time
  return jsonResponse(200, { ...result, cached: false });
});
