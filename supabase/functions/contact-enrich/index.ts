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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Vary": "Origin",
  };
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

  return jsonResponse(200, {
    configured: true,
    domain,
    organization: d.organization || "",
    emails,
  });
});
