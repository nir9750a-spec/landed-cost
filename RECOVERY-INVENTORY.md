# 🗂️ מפת שחזור — כל מה שבנינו ביחד

עודכן: 22.8.2026 · סריקה מלאה: הריפו (כל הענפים), GitHub, Google Drive, Routines, Sessions.

## ⚡ התשובה הקצרה: **לא צריך להתחיל מחדש. כלום לא אבד.**

ארבע השיחות המסודרות שהיו לך — פרסום · אפליקציה · ניהול העסק · ניהול מחשב —
כל אחת מהן **הותירה ענף מלא ב‑GitHub** עם כל הקוד, המסמכים והמצב.
מה שנעלם הוא רשימת השיחות בממשק. **התוכן עצמו שלם.**
שתי האוטומציות היומיות **עדיין רצות** — שתיהן ירו הבוקר (22.8).

---

## 🗺️ מיפוי: שיחה → איפה החומר שלה

### 1️⃣ פרסום → ענף `claude/daily-conversation-connection-n8ezyf`
**138 קבצים · עדכון אחרון 18.8.2026 · לא ממוזג ל‑main**

`marketing/system/` — 14 מסמכי מערכת:
`RUNBOOK.md` (צעדי הריצה היומית) · `HANDOFF.md` (מסמך העברה מלא עם כל ה‑ID‑ים) ·
`AGENT-SYSTEM.md` · `CONNECTIONS.md` · `CONTENT-PLAN.md` · `GROWTH-PLAN.md` ·
`GROWTH-PLAN-INTL.html` · `SCOUT.md` · `LEARNER.md` · `LEARNINGS.md` · `SEEDING.md` ·
`COMPETITORS.md` · `performance-log.md` · `product-profiles.json` (42 מוצרים) · `rotation-state.json`

`marketing/auto-posts/` — 9 פרסומות שפורסמו בפועל (8–17.8) · `marketing/ad-sources/` — מקורות נקיים

**חמשת הסוכנים:** Scout ⏳ · Creator ✅ · Reviewer ✅ · Publisher ✅ חי ומוכח · Learner ⏳

**🟢 האוטומציה חיה:** Routine `trig_012pigP8BQD8shSoCmeigjXe` · cron `0 4,9,17 * * *`
(07:00/12:00/18:00 שעון ישראל) · **ירתה הבוקר 22.8 ב‑04:06** · קשורה לסשן `session_01WGvVd4J1PBM5ikFaGUzTzA`

**חיבורים:** Make Data Store `159437` · Scenario `6869166` · Meta connection `9617477`
(⚠️ **פג תוקף 7.10.2026 — צריך חידוש**) · IG `@4elements.il` (`17841477773982301`) · FB Page `1355675404284855`

**ענף נלווה `media`** (19.8) — 3 רילסים: `YF-CHL-12`, `YF-QDC-05B`, `YF-YZ-06B`

---

### 2️⃣ אפליקציה → `main` (54 קומיטים, 24.5→20.8)
27 קומפוננטות React · `src/lib/` (calculations, containerSelection, bundleExtract, aiExtract,
hsClassify, siiClassify, shipments, shares, freightHistory, exchangeRate, marketRates, pricingSync) ·
14 מיגרציות Supabase · 7 Edge Functions · `ads/` — מנוע הפרסום ההדלס · `customer-discovery/`

**🟢 האוטומציה חיה:** Routine `trig_01Kk9n9pjGmn1ng2Uxe9LZkL` · cron `0 5 * * *` ·
**ירתה הבוקר 22.8 ב‑05:02** · פותחת ענפי `bot/auto-fixes-YYYY-MM-DD`
(קיימים: 2026‑07‑20, 2026‑07‑27)

---

### 3️⃣ ניהול העסק → ענף `claude/israeli-import-agent-3feuk2`
**2,071 שורות · 17.7.2026 · ⚠️ לא ממוזג ל‑main — העבודה הזו לא באפליקציה החיה!**

| קובץ | מה זה |
|---|---|
| `docs/AGENT_BUSINESS_PLAN.md` | תוכנית הסוכן העסקי (262 שורות) |
| `src/components/FinancePage.js` | מודול פיננסי (365) |
| `src/components/InventoryPage.js` | מלאי מוערך בעלות נחיתה (332) |
| `src/components/AdvisorPage.js` | יועץ (236) |
| `src/lib/finance.js` · `inventory.js` · `advisor.js` · `finbot.js` | הלוגיקה |
| `supabase/functions/finbot-issue-income/` | הפקת חשבונית (Edge Function) |
| `supabase/migrations/20260711_finance.sql` · `20260712_inventory.sql` | סכימה |

**איפה זה נעצר:** השיחה מחכה לתשובה שלך — "להמשיך לחיבורים האוטומטיים
(משלוח שוחרר → קליטת מלאי, חשבונית מכירה → ירידת מלאי), או להמתין לפרטי פינבוט?"

**ב‑Drive:** `00 — סדר עסקים (מאורגן ע״י Claude)` — מסמך אב, ניתוח סיכונים,
מפת קבצים, מעקב הזמנות, תיקיות ניר ולנסיה / 4Elements / יבוא ולוגיסטיקה

---

### 4️⃣ ניהול מחשב → ענף `claude/higgsfield-setup-0ot7ac`
**22,640 שורות · 13.8.2026 · לא ממוזג ל‑main**

8 סקילים ב‑`.claude/skills/`: `higgsfield-generate` · `higgsfield-brandkit` ·
`higgsfield-soul-id` · `higgsfield-product-photoshoot` · `higgsfield-marketplace-cards` ·
`higgsfield-video-explainer` · `higgsfield-websites` (11 סקריפטי GLB/rigging) ·
`higgsfield-youtube-thumbnail` · `skills-lock.json`

---

## 📋 כל הענפים ב‑GitHub

| ענף | תאריך | תוכן |
|---|---|---|
| `main` | 20.8 | האפליקציה + ads + customer-discovery |
| `media` | 19.8 | 3 רילסים |
| `claude/daily-conversation-connection-n8ezyf` | 18.8 | **מערכת השיווק המלאה** |
| `claude/higgsfield-setup-0ot7ac` | 13.8 | **8 סקילים** |
| `bot/auto-fixes-2026-07-27` · `-07-20` | 7 | תיקוני לילה אוטומטיים |
| `claude/israeli-import-agent-3feuk2` | 17.7 | **פיננסים + מלאי + יועץ** |
| `claude/seasonal-product-agent-hbbbms` | 27.6 | סוכן מוצרים עונתיים |
| `feat/auth-multitenancy` | 6.6 | אימות ורב‑דיירות |
| `claude/hungry-lumiere-b99980` | 19.5 | ראשוני |
| tag `backup-prod-2026-06-06` | 6.6 | **גיבוי פרודקשן** |

---

## 🔍 בדיקות פורנזיות
- `git log --diff-filter=D` → **אפס** מחיקות בהיסטוריה
- `git fsck` → 2 קומיטים תלושים, **שניהם כבר ממוזגים** — התוכן קיים
- reflog נקי · stash ריק · tag גיבוי קיים

---

## ⚠️ מה באמת בסיכון — רק על `C:\Users\Admin\landed-cost\`
1. **`catalog/`** — סקריפטי בניית הקטלוג. אין בגיט. התוצרים (PDF+XLSX+תמונות) ב‑Drive → ניתן לבנות מחדש.
2. **`ads/.env`** — סודות. gitignored (הריפו ציבורי). להנפיק מחדש.
3. **`ads/assets/*.jpg`** — תמונות אישיות. ה‑`media_id` שמור ב‑`avatars/registry.json` ✅
4. **`~/.claude/`** — `MEMORY.md`, `marketing_*.md`, skill `speak/`

---

## 🎯 מה כדאי לעשות עכשיו
1. **לא למזג בעיוורון** — `israeli-import-agent` ו‑`daily-conversation-connection` הם עבודה גדולה שלא נבדקה מול main העדכני.
2. **לחדש את Meta OAuth לפני 7.10.2026** — אחרת הפרסום האוטומטי ייפול.
3. **לענות לשיחת ניהול העסק** — היא תקועה על שאלה אחת מ‑17.7.
4. **להעלות את `catalog/` לגיט** — זה החור היחיד האמיתי בגיבוי.
