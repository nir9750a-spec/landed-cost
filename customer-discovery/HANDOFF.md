# Importly · Session Handoff Brief

Paste this at the start of a new Claude Code conversation to bring the
assistant up to speed.

---

## Who I am
- **Nir Valencia** + partner **Yochay**, equal partners.
- Run **4Elements** — Israeli import business for 4x4 / transport-accessories from China. Operating 1+ year, warehouse, transport-products license, real revenue.
- Email: nir9750a@gmail.com.
- **Working language preference: clean English only in your replies** (Hebrew TTS is garbled when mixed). I can write to you in Hebrew; you reply in English. Hebrew strings are OK for product copy / labels / file names.

## Strategic frame (locked 2026-05-30)
- **Importly is the primary product**. I run Importly day-to-day. Yochay holds 4Elements.
- **Importly is a lifestyle SaaS** — realistic 3-year ARR ceiling $150–300K (verified by 4-stream research). Not venture-scale. Don't pitch VC.
- **Positioning (locked 2026-05-30):** Importly is a **decision-support tool** for the importer, NOT a replacement for the customs broker (עמיל מכס) or accountant (רואה חשבון). It helps the importer understand warehouse cost BEFORE engaging those professionals. Every feature must increase the importer's convenience without making the broker/accountant's life harder.
- Three-pillar evaluation for any new feature: (1) more paying SMB customers, (2) Rivhit/Hashavshevet integration moat, (3) AliBuy / Amazon FBA Israel marketing surface.

## Working mode
- **Brutal honest advisor.** No flattery, no "great idea." Attack proposals from 3 angles. Surface hidden costs (Israeli customs / standards / SII). Tell me directly when something is uneconomical.
- **Auto-speak on.** Every reply you write is read aloud via edge-tts (Andrew Multilingual for English, Avri Neural for Hebrew). Cap your normal replies under ~1500 chars; if going long, warn me "this is for screen reading."
- **Daily scheduled agent active** — trigger ID `trig_01Kk9n9pjGmn1ng2Uxe9LZkL` runs 08:00 Asia/Jerusalem, focuses on UI polish + Rivhit scaffolding, never modifies calculations.js / containerSelection.js / RLS / Anthropic proxy.

## Tech stack
- **Repo:** https://github.com/nir9750a-spec/landed-cost on `C:\Users\Admin\landed-cost`. Working tree is in `.claude/worktrees/funny-bouman-0def2d`.
- **Frontend:** React 19 (CRA) + Hebrew RTL dark theme. Production at https://nir-sigma-liard.vercel.app/.
- **Backend:** Supabase project `eginihtpqahpejnkqznn`. Publishable key client-side, permissive RLS (no auth yet).
- **AI:** Anthropic via Supabase Edge Function `anthropic-proxy` (key in Secrets, never client-side).
- **3rd party APIs:** ShipsGo for container + AWB tracking (key in Supabase Secrets).

## What's been built (chronological highlights)
1. **Bug fixes** — calcCtx useMemo stability, classifyAllBatch partial-failure recovery, mountedRef guards, step="any" on all numeric inputs, Excel comma-safe number parser, port-name normalization (English/Chinese/Hebrew → canonical Hebrew).
2. **Brand fix** — renamed "עלות ממונפת" (mistranslation) → "עלות נחיתה" everywhere. Real PWA metadata, theme color, OG tags.
3. **Shipments module** — container + AWB tracking table, ShipsGo refresh button (sea + air endpoints), 7-row timeline.
4. **Documents tab** — Supabase Storage bucket `project-files`, 8 categories (invoice, packing_list, BL, air_waybill, receipt, logistics_agent, customs_agent, screenshot, other), auto-archive of original when uploaded through ProductsPage's FileUpload.
5. **AI extraction (per-file)** — invoice → products, BL/AWB/tracking → shipment, packing list → CBM/weight match-back, receipt → payee/totals/shipping with currency conversion to USD, DHL waybill recognition.
6. **Bundle extraction** — one-button "חלץ הכול" runs all extractors in parallel and shows one consolidated preview. Works for new projects (ProjectsPage button "מקבצים AI") AND existing projects (DocumentsPage header button).
7. **Improved Excel parser** — handles Chinese commercial invoices with 16-row preamble before headers; scan-detects the real header row by keyword (works with 货名 / 单价 / 数量); also scrapes shipment metadata (FOB / NINGBO / supplier) from cells above the table.
8. **Compliance** — HS code sorting + visual grouping + "×N duplicate" badge.
9. **Document verification panel** — Dashboard cross-checks invoice vs packing vs BL (pieces / cartons / CBM / weight / declared value / supplier / origin port) with red highlight on mismatches > tolerance.
10. **First-impression polish** — demo project seeding (8 realistic Yongkang camping SKUs), styled `<ConfirmDialog>` replacing all 7 `alert()`/`confirm()`, zero-value KPI hiding, working lead capture on landing page.
11. **Accountant PDF export** — Dashboard "לרו״ח / עמיל" button opens a printable A4 with methodology footer; user saves as PDF via browser.
12. **Guest portal** — `/share/<token>` public route. URL + 6-digit code (sent separately) gives a freight forwarder or customs broker read-only access. Role-filtered: NEVER exposes margin / sell price / profit / landed cost. Managed via Dashboard "שתף" button.
13. **Voice setup** — `/speak` skill at `~/.claude/skills/speak/` with edge-tts. Auto-speak hook in `~/.claude/settings.json`. 1500-char audio cap.

## Pending DB migrations (run in Supabase SQL editor)
Files in `supabase/migrations/`. Most recent that may not be applied yet:
- `20260528_waitlist.sql` — landing-page lead capture
- `20260531_shipment_declared_totals.sql` — declared_pieces / packages / cbm / weight_kg / value_usd on shipments
- `20260531_project_shares.sql` — guest portal table

## Customer-discovery deliverables ready (in `customer-discovery/`)
- `call-script.md` — Hebrew script for the 20-call validation campaign
- `call-tracker.csv` — fillable template
- `landing-page.html` — Hebrew landing page with working Supabase waitlist insert
- `90-day-plan.md` — integrated execution plan synthesizing all research

## Next moves (open)
- **Bundle extraction polish:** test on real Chinese invoices, tune merge priorities.
- **Air vs Sea comparison view** on Dashboard (~3h).
- **Google OAuth via Supabase Auth** — gate for paid tier (~half day).
- **Rivhit integration** — 5-week build, gated on hitting 10+ paying customers in 30-day customer-validation window. Public API exists at `https://api.rivhit.co.il/online/RivhitOnlineAPI.svc/help`; killer feature is "push landed cost to Rivhit chart of accounts."
- **Customer calls** — Nir hasn't started yet. The 20-call script is ready. Hard refusal to code new features until ~20 calls done.

## Critical do-not-touch
- `src/lib/calculations.js` — money math, Israel Customs CIF method
- `src/lib/containerSelection.js` — pricing logic + port normalization
- `supabase/functions/anthropic-proxy/index.ts` — security model
- Schema migrations once applied
- Never add client-side `fetch('https://api.anthropic.com')`

---

When you start the new chat, paste this whole document then say what you want to work on next.
