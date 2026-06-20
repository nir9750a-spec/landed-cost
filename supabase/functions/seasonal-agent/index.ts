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

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a senior sourcing & merchandising analyst for an importer who sources goods EXCLUSIVELY from CHINA (factories in mainland China only). Your job has two parts:
(A) Find the HOTTEST, best-selling, trending products WORLDWIDE worth importing for the UPCOMING season — read global demand signals, but every product MUST be sourceable directly from a Chinese factory.
(B) For each product, build a practical SOURCING DOSSIER whose guiding goal is to BYPASS MIDDLEMEN and reach the actual Chinese MANUFACTURER / factory directly — never trading companies or agents.

Method:
1. Use the web_search tool to gather CURRENT, GLOBAL evidence — recent best-seller lists, marketplace trends (Amazon, AliExpress, TikTok Shop, Temu, eBay), Google Trends-style signals, retail/seasonal trend articles from multiple countries. Prefer sources from the last 6 months.
2. Reason about IMPORT LEAD TIME: production + ocean freight from China takes ~30–60 days. Recommend products to ORDER NOW so they land before the upcoming season's sales peak. Name that season explicitly relative to the given date.
3. For each product, research and reason about:
   - The main CHINESE production hub/region (e.g. "שנזן — אלקטרוניקה", "יִוּוּ — מוצרי צריכה", "גואנגג'ואו"), and the typical port of loading.
   - Shipping/transit time to the target market, by sea AND by air.
   - Regulatory standards / approvals REQUIRED to legally import & sell it in the target market (e.g. for Israel: תקן ישראלי + מכון התקנים, יבוא רשמי; EU: CE/RoHS; electronics, toys, cosmetics, food-contact each have specific regimes). Be concrete about which apply to THIS product.
   - Realistic per-unit PURCHASE cost buying DIRECT FROM THE FACTORY (not retail/dropship), plus typical MOQ.
   - DIRECT-SOURCING PLAYBOOK to bypass middlemen: how to tell a real factory from a trading company (business license scope, "Manufacturer" vs "Trading" label, factory audit / video tour, years in business), and which factory-direct channels to use (1688.com and Made-in-China.com are factory-direct; Alibaba mixes both — filter for verified Manufacturers).
   - DIRECT FACTORY CONTACT: the concrete ways to reach the factory's sales rep directly — 1688 旺旺 (Wangwang) chat, WeChat (微信) ID, email, Alibaba RFQ/chat, Made-in-China inquiry, and offline channels (Canton Fair / Yiwu market). If web search surfaces a real factory's published email/WeChat/WhatsApp for this product category, include it; otherwise give the exact channel + search path to obtain it.
4. Favor products with genuine rising demand and a realistic margin for a small importer. Avoid oversaturated commodities and items with heavy regulatory/shipping friction unless the upside is clear (note the risk).

Output rules:
- After researching, respond with ONLY a single JSON object — no markdown fences, no prose before or after.
- All human-readable text VALUES must be written in the requested output language. JSON keys stay in English exactly as specified.
- EXCEPTION: "search_term_cn" must be the Chinese (Simplified) search keyword used to find this product factory-direct on 1688.com.
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
      "origin_country": "string — Chinese production hub/region (China only)",
      "origin_port": "string — typical port of loading",
      "transit_sea": "string — sea transit time to the target market (e.g. 'כ-32 יום לאשדוד')",
      "transit_air": "string — air transit time (e.g. 'כ-5–8 ימים')",
      "compliance": "string — specific standards/approvals required to import & sell in the target market",
      "unit_cost_usd": "string — realistic per-unit cost DIRECT FROM FACTORY (USD range)",
      "moq": "string — typical minimum order quantity",
      "direct_sourcing": "string — concrete playbook to reach the factory directly & bypass middlemen",
      "factory_contact": "string — direct contact channels to the factory: 1688 旺旺/WeChat/email/RFQ/trade fair, incl. any real contact detail found",
      "search_term_en": "string — best English search keywords for Alibaba/Made-in-China",
      "search_term_cn": "string — Chinese (Simplified) search keyword for 1688.com",
      "est_retail_price": "string — rough retail price in the market's local currency",
      "margin_note": "string — short profitability comment",
      "risk": "string — main risk (saturation, shipping, compliance) or '' if low",
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

  return jsonResponse(200, {
    result: parsed,
    usage: data.usage || null,
  });
});
