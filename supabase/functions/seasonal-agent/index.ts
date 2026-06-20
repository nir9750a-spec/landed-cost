// Seasonal Product Discovery Agent — standalone.
//
// Given a target market and today's date, uses Claude + the live web_search
// tool to research the hottest / best-selling products worth importing for the
// UPCOMING season — accounting for import lead time so the user orders in time
// for the season's sales peak.
//
// This function is intentionally independent of the main Importly app: its own
// CORS, its own model allow-list, its own prompt. It only shares the
// ANTHROPIC_API_KEY secret already configured in Supabase.
//
// Deploy: supabase functions deploy seasonal-agent --no-verify-jwt
// Secret (already set for anthropic-proxy): ANTHROPIC_API_KEY=sk-ant-...

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;
const WEB_SEARCH_MAX_USES = 8;

// ── Scaling knobs (tune for your Anthropic tier) ─────────────────────────────
const CACHE_TTL_SECONDS = 36 * 3600;   // serve identical queries from cache for 36h
const RATE_LIMIT_MAX = 8;              // expensive searches per IP per window
const RATE_LIMIT_WINDOW = 600;         // window = 10 minutes

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, content-type, x-client-info, apikey",
    "Vary": "Origin",
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

// ── Supabase REST helpers (caching + rate limiting) ──────────────────────────
// Edge functions get SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for free; the
// service role bypasses RLS. All helpers FAIL OPEN — if the DB is unreachable
// we still serve the user rather than 500.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return (xff.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

function norm(s: string): string {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildCacheKey(o: { market: string; category: string; audience: string; count: number; date: string }): string {
  return [norm(o.market), norm(o.category), norm(o.audience), o.count, o.date].join("|");
}

async function cacheGet(key: string): Promise<any | null> {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/seasonal_cache?cache_key=eq.${encodeURIComponent(key)}&select=result,created_at`,
      { headers: sbHeaders },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const ageSec = (Date.now() - new Date(rows[0].created_at).getTime()) / 1000;
    if (ageSec > CACHE_TTL_SECONDS) return null;
    return rows[0].result;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, o: any, result: any): Promise<void> {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/seasonal_cache`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        cache_key: key, market: o.market, category: o.category,
        audience: o.audience, count: o.count, result, created_at: new Date().toISOString(),
      }),
    });
  } catch { /* ignore */ }
}

// Atomic fixed-window limiter via the check_rate_limit() SQL function.
async function rateAllowed(bucket: string): Promise<boolean> {
  if (!SB_URL || !SB_KEY) return true; // fail open
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/check_rate_limit`, {
      method: "POST",
      headers: sbHeaders,
      body: JSON.stringify({ p_bucket: bucket, p_limit: RATE_LIMIT_MAX, p_window: RATE_LIMIT_WINDOW }),
    });
    if (!r.ok) return true;
    return (await r.json()) === true;
  } catch {
    return true;
  }
}

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a senior sourcing & merchandising analyst for an importer. Your job has two parts:
(A) Find the HOTTEST, best-selling, trending products WORLDWIDE worth importing for the UPCOMING season — read global demand signals.
(B) For each product, build a practical SOURCING DOSSIER whose guiding goal is to BYPASS MIDDLEMEN and reach the actual MANUFACTURER / factory directly — never trading companies or agents.

SOURCING SCOPE: source GLOBALLY, not only China. For each product choose the BEST origin among CHINA, the USA, EUROPE, AUSTRALIA, and CANADA — weighing factory-direct unit cost, quality, MOQ, lead time to the target market, and tariffs. China is often cheapest, but US/EU/AU/CA factories can win on quality, speed, lower MOQ, "Made in X" appeal, or tariff treatment. Pick the origin that genuinely makes the most sense for THIS product and explain why; if two origins are viable, name the runner-up in the dossier.

Method:
1. Use the web_search tool to gather CURRENT, GLOBAL evidence — recent best-seller lists, marketplace trends (Amazon, AliExpress, TikTok Shop, Temu, eBay), Google Trends-style signals, retail/seasonal trend articles from multiple countries. Prefer sources from the last 6 months.
2. Reason about IMPORT LEAD TIME for the chosen origin (production + freight). Recommend products to ORDER NOW so they land before the upcoming season's sales peak. Name that season explicitly relative to the given date.
3. For each product, research and reason about:
   - The chosen origin COUNTRY and its main production hub/region (e.g. China: "שנזן — אלקטרוניקה", "יִוּוּ"; USA: relevant state; Europe: country/region), and the typical port/airport of loading.
   - Shipping/transit time to the target market, by sea AND by air.
   - Regulatory standards / approvals REQUIRED to legally import & sell it in the target market (e.g. Israel: תקן ישראלי + מכון התקנים; EU: CE/RoHS; electronics, toys, cosmetics, food-contact each have specific regimes). Be concrete about which apply to THIS product.
   - Realistic per-unit PURCHASE cost buying DIRECT FROM THE FACTORY (not retail/dropship), plus typical MOQ.
   - DIRECT-SOURCING PLAYBOOK to bypass middlemen, ADAPTED TO THE ORIGIN: how to tell a real factory from a trader, and which factory-direct directories to use:
       • China → 1688.com, Made-in-China.com, Global Sources (Alibaba mixes both — filter "Manufacturer").
       • USA / Canada → ThomasNet, Maker's Row, MFG.com, direct manufacturer websites, NAICS/industry associations.
       • Europe → Europages, Kompass, "Wer liefert was" (DE), national chambers of commerce.
       • Australia → IndustrySearch, Australian Made directory.
   - MANUFACTURER-vs-TRADER CHECK for THIS product: the specific question(s) to ask, which document/certificate proves real in-house production for this category (e.g. machinery list, production-line video, ISO 9001, category test reports), and the category-specific red flags that signal a reseller rather than the maker.
   - DIRECT FACTORY CONTACT, ADAPTED TO THE ORIGIN: concrete ways to reach the factory sales rep — China: 1688 旺旺/WeChat (微信)/email/Alibaba RFQ/Canton-Yiwu fairs; USA/EU/AU/CA: company email, phone, LinkedIn, RFQ form, regional trade shows. If web search surfaces a real published contact for this product category, include it; otherwise give the exact channel + search path to obtain it.
   - NAMED CANDIDATE MANUFACTURERS (GLOBAL, not only China): actively search the open web for 2–4 REAL manufacturer/factory companies that make this product, from any suitable country. Prefer actual makers (not resellers) that publish contact details on their own website. For each, capture: company name, country, official website URL, and any PUBLICLY listed email and phone. NEVER fabricate a contact detail — leave "" if you did not find it on the open web.
4. Favor products with genuine rising demand and a realistic margin for a small importer. Avoid oversaturated commodities and items with heavy regulatory/shipping friction unless the upside is clear (note the risk).

Output rules:
- After researching, respond with ONLY a single JSON object — no markdown fences, no prose before or after.
- All human-readable text VALUES must be written in the requested output language. JSON keys stay in English exactly as specified.
- "sourcing_country" MUST be one of exactly: "China" | "USA" | "Europe" | "Australia" | "Canada" | "Other" (it drives factory-directory links).
- "search_term_cn" is the Chinese (Simplified) keyword for 1688 — fill it ONLY when sourcing_country is "China", otherwise use "".
- Base claims on what you actually found; do not invent specific statistics or fake contact details. If evidence is thin, give a short reasoned estimate.
- Put 1–3 real source URLs you used into each idea's "sources" array.

JSON schema:
{
  "as_of_date": "YYYY-MM-DD",
  "market": "string — the target market",
  "upcoming_season": "string — the season/event you are sourcing for, e.g. 'חזרה לבית הספר (אוגוסט–ספטמבר)'",
  "order_window": "string — by when to place the order to arrive in time",
  "ideas": [
    {
      "name": "string — concise product name",
      "category": "string",
      "why_now": "string — why this product fits the upcoming season (global demand signal)",
      "demand": "high | rising | medium",
      "trend_evidence": "string — what the web search showed (platform, signal, country)",
      "competition": "low | medium | high",
      "target_audience": "string",
      "sourcing_country": "China | USA | Europe | Australia | Canada | Other",
      "origin_country": "string — chosen origin country + production hub, and why it's best (optionally name a runner-up origin)",
      "origin_port": "string — typical port/airport of loading",
      "transit_sea": "string — sea transit time to the target market (e.g. 'כ-32 יום לאשדוד')",
      "transit_air": "string — air transit time (e.g. 'כ-5–8 ימים')",
      "compliance": "string — specific standards/approvals required to import & sell in the target market",
      "unit_cost_usd": "string — realistic per-unit cost DIRECT FROM FACTORY (USD range)",
      "moq": "string — typical minimum order quantity",
      "direct_sourcing": "string — origin-appropriate playbook to reach the factory directly & bypass middlemen",
      "factory_contact": "string — origin-appropriate direct contact channels, incl. any real contact detail found",
      "manufacturer_check": "string — how to verify a REAL manufacturer (not a trader) for THIS product: what to ask, which license/certificate proves real production, and category-specific red flags",
      "manufacturers": [
        { "company": "string — real manufacturer company name", "country": "string", "website": "string — official site URL", "email": "string — public email or ''", "phone": "string — public phone or ''" }
      ],
      "search_term_en": "string — best English search keywords for the factory directories",
      "search_term_cn": "string — Chinese keyword for 1688.com (only if sourcing_country=China, else '')",
      "est_retail_price": "string — rough retail price in the market's local currency",
      "margin_note": "string — short profitability comment",
      "risk": "string — main risk (saturation, shipping, compliance, tariffs) or '' if low",
      "sources": ["url", "..."]
    }
  ],
  "notes": "string — any cross-cutting advice or caveats"
}`;
}

function buildUserPrompt(opts: {
  market: string;
  date: string;
  language: string;
  count: number;
  category: string;
  audience: string;
}): string {
  const lines = [
    `Target market: ${opts.market}`,
    `Today's date: ${opts.date}`,
    `Output language for all text values: ${opts.language}`,
    `Number of product ideas to return: ${opts.count}`,
  ];
  if (opts.category.trim()) {
    lines.push(`Restrict to this category / niche: ${opts.category.trim()}`);
  }
  if (opts.audience.trim()) {
    lines.push(`Focus on this target audience: ${opts.audience.trim()}`);
  }
  lines.push(
    "",
    "Research the live web now and return the JSON object described in the system prompt.",
  );
  return lines.join("\n");
}

// Pull every text block out of Anthropic's content array and join them.
function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
}

// Find the last balanced {...} JSON object in a string and parse it.
function parseJsonObject(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse(500, {
      error: "Server misconfigured: ANTHROPIC_API_KEY not set",
    });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const opts = {
    market: String(payload.market || "ישראל").slice(0, 120),
    date: String(payload.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    language: String(payload.language || "Hebrew").slice(0, 40),
    count: Math.min(Math.max(parseInt(payload.count, 10) || 8, 3), 15),
    category: String(payload.category || "").slice(0, 200),
    audience: String(payload.audience || "").slice(0, 200),
  };

  // 1) Cache first — collapses the flood of identical queries on launch day.
  //    A cache hit returns in ~ms and costs nothing.
  const cacheKey = buildCacheKey(opts);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return jsonResponse(200, { result: cached, cached: true, usage: null });
  }

  // 2) Rate-limit the EXPENSIVE path (cache misses) per IP, so abuse/bursts
  //    can't run up the Anthropic bill. Cache hits above are never limited.
  const ip = clientIp(req);
  if (!(await rateAllowed(`seasonal:${ip}`))) {
    return new Response(
      JSON.stringify({ error: "יותר מדי חיפושים בזמן קצר. נסה שוב בעוד כמה דקות." }),
      { status: 429, headers: { ...corsHeaders(), "Content-Type": "application/json", "Retry-After": "120" } },
    );
  }

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES },
    ],
    messages: [{ role: "user", content: buildUserPrompt(opts) }],
  };

  // Retry transient upstream errors (529 Overloaded, 502/503). Backoff 1s/2s/4s.
  const RETRY_STATUSES = new Set([502, 503, 529]);
  const MAX_RETRIES = 3;
  let upstream: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
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
      error: "שירות ה-AI לא זמין כרגע. נסה שוב בעוד דקה.",
      detail: lastErr instanceof Error ? lastErr.message : String(lastErr),
    });
  }
  if (RETRY_STATUSES.has(upstream.status)) {
    const detail = await upstream.text();
    return jsonResponse(503, {
      error: "שירות ה-AI עמוס כרגע. נסה שוב בעוד דקה-שתיים.",
      upstream_status: upstream.status,
      upstream_detail: detail.slice(0, 500),
    });
  }

  const data = await upstream.json().catch(() => null);
  if (!data || upstream.status >= 400) {
    const msg = data?.error?.message || data?.error || `Anthropic error ${upstream.status}`;
    return jsonResponse(upstream.status >= 400 ? upstream.status : 502, {
      error: typeof msg === "string" ? msg : "שגיאת AI",
    });
  }

  const text = extractText(data.content);
  const parsed = parseJsonObject(text);
  if (!parsed || !Array.isArray(parsed.ideas)) {
    return jsonResponse(502, {
      error: "ה-AI לא החזיר תוצאה תקינה. נסה שוב או צמצם את החיפוש.",
      raw_preview: text.slice(0, 400),
    });
  }

  // 3) Store in cache so the next identical query is free. Don't block the
  //    response on the write.
  cacheSet(cacheKey, opts, parsed).catch(() => {});

  return jsonResponse(200, {
    result: parsed,
    cached: false,
    usage: data.usage || null,
  });
});
