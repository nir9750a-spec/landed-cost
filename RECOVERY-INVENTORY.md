# 🗂️ מפת שחזור — כל מה שבנינו ביחד

נוצר: 22.8.2026 · סריקה מלאה של המחשב (הריפו), GitHub, ו‑Google Drive.

---

## ✅ מה קיים ובטוח (לא נמחק)

### 1. Importly / Landed Cost — אפליקציית עלות נחיתה
**מיקום:** GitHub `nir9750a-spec/landed-cost` (public) · ענף `main`
**מצב:** 54 קומיטים שלמים, 24.5.2026 → 20.8.2026. **אין ולו קומיט אחד של מחיקה בהיסטוריה.**

| חלק | קבצים |
|---|---|
| Frontend (React 19, RTL) | `src/components/` — 27 קומפוננטות: Dashboard, ProjectsPage, DocumentsPage, ProductsPage, BreakdownPage, CompliancePage, ShipmentsPanel, ShareView, AuthGate, LoginPage, BrokerExport, AccountantExport, PricingMatrix, DataQualityPanel, DocVerificationPanel |
| לוגיקה | `src/lib/` — `calculations.js` (מתמטיקת CIF של מכס ישראל), `containerSelection.js`, `bundleExtract.js`, `aiExtract.js`, `hsClassify.js`, `siiClassify.js`, `shipments.js`, `shares.js`, `freightHistory.js`, `exchangeRate.js`, `marketRates.js`, `pricingSync.js`, `demoSeed.js` |
| Supabase | 14 מיגרציות (`20260517`→`20260620`) + 7 Edge Functions: `anthropic-proxy`, `boi-usd-rate`, `freight-rates-fetch`, `shipsgo-track`, `contact-enrich`, `telegram-webhook`, `seasonal-agent` |
| CI | `.github/workflows/` — deploy‑supabase‑functions, ads‑daily, ads‑selftest |
| מסמכים | `AUTH_PLAN.md`, `BROKER_PROFORMA_NOTES.md`, `README.md` |

### 2. מנוע פרסום‑AI של 4Elements
**מיקום:** `ads/` בתוך אותו ריפו · **מצב:** שלם.
`supervisor.py` · `make_ad.py` · `make_ad_master.py` · `variants.py` (מטריצת 3×3×3) · `ad_queue.py` · `publish.py` · `telegram_gate.py` · `instagram_publish.py` · `headless_daily.py` · `avatars.py` · `cutouts.py` · `scene_bank.py` · `utm.py` · `runlog.py` · `selftest.py`
מסמכים: `SESSION-HANDOFF.md`, `PUBLISH-RUNBOOK.md`, `AUTOMATION-ARCHITECTURE.md`, `HEADLESS.md`, `GRAPH-API-SETUP.md`, `CHIBURIM-SETUP.md`, `TOCHNIT-SHIVUK-4ELEMENTS.md`, `FORMATS-ALL-PRODUCTS.md`, `BUILD-NEXT.md`
מצב חי: `rotation-state.json`, `avatars/registry.json`, `product-profiles.json`, `workspace/runs.jsonl`

### 3. Customer Discovery
`customer-discovery/` — `HANDOFF.md` (בריף מלא), `90-day-plan.md`, `call-script.md`, `call-tracker.csv`, `landing-page.html`

### 4. קטלוג 4Elements (התוצרים)
**Google Drive** — `עריכה לקטלוג / קטלוג 4Elements - חבילת עריכה/`
- `קטלוג 4Elements 2026 - מתוקן.pdf` (9.9MB, עודכן 20.8.2026)
- `קטלוג - טבלת עריכה.xlsx` (מקור האמת, 42 מוצרים)
- `סיכום פרויקט - להמשך.md` · `קרא-אותי.txt` · תיקיית `תמונות/`

### 5. תיק העסק ב‑Drive
`00 — סדר עסקים (מאורגן ע״י Claude)` — מסמך אב, ניתוח סיכונים, מפת קבצים, מעקב הזמנות, תיקיות ניר ולנסיה / 4Elements / יבוא ולוגיסטיקה
`שיווק ופרסום 4Elements` — מודעות לפי מוצר, מפת חיבורים, הוראות Meta

### 6. שיחות Claude קודמות (עדיין קיימות)
- `session_01Q55UNtKJ6fzvjdyHcosnoJ` — "Israeli import business agent" (8.7→17.7) — **idle, מחכה לתשובה שלך על נדבך 4**
- `session_01XfNovTsXxSmWYHRuCp7WDT` — Shared conversation (5.8, archived)
- `session_01DPcmQfcVoyLycoB2Uc4Xox` — Dispatch (6.6)

### 7. אוטומציות חיות
Make team `1499942` — תרחיש תמונה `6869166`, תרחיש רילס `6903724`, Data Store `159437`, חיבור Meta `9617477` · Supabase `eginihtpqahpejnkqznn` · בוט טלגרם `@elements4_approve_bot` · TikTok connector `a8e869f3…`

---

## ⚠️ מה באמת בסיכון — קיים **רק** על המחשב ב‑`C:\Users\Admin\landed-cost\`

אלה הדברים שאם המחשב נוקה — הם באמת הלכו:

| מה | למה זה לא בענן | איך משחזרים |
|---|---|---|
| **`catalog/`** — `build_real_catalog.py`, `add_marketing.py`, `_fix_logos.py`, `manual_heroes/`, `heroes/<SKU>.jpg`, `pkg/` | מעולם לא נכנס לגיט (אין זכר בהיסטוריה) | ה‑PDF וה‑XLSX ב‑Drive שלמים → אפשר לבנות מחדש את הסקריפטים; התמונות ב‑`תמונות/` ב‑Drive |
| **`ads/.env`** — `SUPABASE_SERVICE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID=1669582702` | gitignored בכוונה (הריפו ציבורי) | להנפיק מחדש מ‑Supabase / BotFather |
| **`ads/assets/*.jpg`** — תמונות אישיות של ניר לאווטארים | gitignored (ריפו ציבורי) | ה‑`media_id`/`url` ב‑Higgsfield שמורים ב‑`avatars/registry.json` ✅ |
| **`ads/workspace/scenes/`** — סצנות מרונדרות | scratch | נוצר מחדש ב‑Higgsfield |
| **`~/.claude/`** — `MEMORY.md`, `marketing_*.md`, skill `speak/`, `settings.json` | מחוץ לריפו | לבנות מחדש |

---

## 🔍 בדיקות שביצעתי

- `git fsck` — 2 קומיטים תלושים (`c3491de` tracking משלוחים, `18ed26f` טאב מסמכים) — **שניהם כבר במיזוג ב‑main**, התוכן שלהם קיים. לא אבד כלום.
- `git log --diff-filter=D` — **אפס** קבצים שנמחקו אי‑פעם.
- `git stash` — ריק. `reflog` — נקי.
- GitHub: 2 ריפואים בחשבון — `landed-cost` (push אחרון 20.8.2026) ו‑`desktop-tutorial`.

---

## ❓ מה שנשאר לברר

אם מה שנעלם לך הוא **הפרויקטים בתוך האפליקציה עצמה** (טבלת `projects` ב‑Supabase) — זה נתונים, לא קוד, ולא נגעתי בהם. תגיד ואבדוק מול ה‑DB.
