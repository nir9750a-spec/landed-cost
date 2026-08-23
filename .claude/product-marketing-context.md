# 4Elements — Marketing Context

**Read this before any marketing task.** Every agent and skill reads this file first.
Pattern borrowed from the `marketing-skill` plugin's `marketing-context/` foundation:
one context file, loaded once, so no agent invents brand facts.

Verified against the live systems 23.8.2026.

---

## Business

| | |
|---|---|
| Name | 4Elements · ניר ולנסיה |
| What | Camping / outdoor gear + 4x4 upgrades. Direct import China → Israel |
| Site | https://www.4elements.co.il (WooCommerce) |
| Phone | 052-891-3135 |
| Promise | "כל מה שצריך כדי לצאת החוצה — במחיר של יבואן ישיר" |
| Market | Israel. **Hebrew only.** RTL |
| Model | D2C ecommerce — **not SaaS** |

## Budget: organic only

Paid marketing is **out of scope**. The money is already spent on Higgsfield (Ultra),
which is the *content* budget, not a distribution budget. Any recommendation that needs
ad spend is out of scope — say so instead of quietly designing around it.

## Hard rules — non-negotiable

1. **Prices, SKUs and specs ONLY from the catalog.** Never invent a spec or a price.
2. **NEVER fake reviews, stars, buyer counts, stock levels or urgency.**
3. **Free shipping threshold is ₪350.** Not ₪250. A basket under ₪350 must not promise it.
4. Hebrew, natural, not over-salesy. Verify spelling twice.
5. Use the **real** 4Elements logo — never redraw it.
6. Supplier branding (HISPEED) printed on the physical item **may stay** — the photo must
   show the product as it ships. Never pass a supplier's mark off as ours.
7. Realistic look: phone-photo feel. No plastic CGI sheen.
8. **Nothing publishes without Nir's ✅** on the Telegram card (`@elements4_approve_bot`).

### The grounding rule — adopted from `ad-creative`

> "No invented claims, stats, or testimonials — ever. If inputs are empty, **stop and ask**
> the user to populate them before generating."

This is the one rule worth importing wholesale. When a product profile, price or photo is
missing: **stop and ask.** Do not fill the gap with something plausible.

## Catalog

`ads/product-profiles.json` — 30 products. Each: id, name, price, category, hook, angle,
audience, scene, source, status.

Categories: כיסאות ושולחנות · אביזרים לשטח · בישול שטח · שדרוגי 4x4

**Routing rule** (`ads/channel_plan.py`): price ≥ ₪800 or category = שדרוגי 4x4 skips the
feed entirely — different buyer, weeks-long cycle. Those go to Yad2, 4x4 forums, WhatsApp.

## Angles

The engine ships 3 (`price` · `problem` · `lifestyle`, in `ads/scout.py`). The
`ad-creative` skill tests 8. These extra ones are compatible with our rules:

| Angle | Use | Note |
|---|---|---|
| pain | "הרוח מכבה לך את הגזייה" | ✅ |
| outcome | what life looks like after | ✅ |
| curiosity | withhold the mechanism | ✅ |
| comparison | vs AliExpress: in stock in Israel, invoice, warranty | ✅ our real edge |
| identity | "אם אתה מנגליסט אמיתי…" | ✅ |
| contrarian | "לא צריך מנגל ענק" | ✅ |
| social proof | ⚠️ **only if real.** No invented reviews | rule 2 |
| urgency | ⚠️ **only if true** — real season or real stock | rule 2 |

## Channels — and where the reach actually is

| Surface | Organic reach | Automated? |
|---|---|---|
| Facebook **Groups** | **20–40% of members** 🥇 | ❌ manual |
| Instagram **Reels** | ~2.25× a still · 55% non-followers 🥈 | ✅ Make `6903724` (**off**) |
| **TikTok** | search +150% YoY 🥉 | ✅ **fully automated** |
| IG + FB feed | — | ✅ Make `6869166` (on) |
| Facebook **Page** | **1–6% of followers** | ✅ same scenario |
| Marketplace / Yad2 | search intent, free | ❌ manual, 6–8/day |
| WhatsApp | closing, not distribution | ❌ manual by design |

Under 10k followers reach runs 8–15% — small is an advantage here.

## Ceilings

| Resource | Limit |
|---|---|
| Make | **Free: 2 active scenarios, 1,000 ops/month** (~4 ops per publish) |
| Higgsfield | Ultra · ~1,900 credits · +1,000 on the 18th · ~25/reel · keep 150 reserve |
| Meta conn `9617477` | **expires 07.10.2026** — renew or IG+FB dies silently |
| Scene bank | ~5 days runway |

## Verification — three layers

Automation that ran leaves traces. No trace = it did not run.

1. Routine fired? → Routines bar
2. GitHub Actions green? → `/actions`
3. Make execution with `operations >= 4`? → make.com History
   · TikTok: `tiktok_publish_status` = `PUBLISH_COMPLETE`

Never trust a status document without checking the live API. `DIAGNOSIS-2026-08-22.md` was
right the day it was written and wrong the next.

## Environment limits (this sandbox)

- `4elements.co.il` and the Higgsfield CDN are **blocked by egress policy** here.
  Rendering with real photos must run in **CI** or in the **Higgsfield sandbox**
  (`sandbox_exec`), both of which reach the CDN fine.
- No GitHub Actions dispatch permission — Nir triggers runs manually.
