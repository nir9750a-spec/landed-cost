# CLAUDE.md — Importly

מדריך התמצאות ל-Claude Code. קרא אותי לפני עבודה על הפרויקט.

## מה זה
Importly — מערכת ניהול ליבואן לישראל (עברית, RTL). React (CRA) + Supabase.
ליבה: מחשבון **עלות נחיתה** (landed cost). נוספו: סוכן AI, כספים, מלאי, חיבור פינבוט.

**להקמה מחדש / הפעלה:** קרא קודם `SETUP/START_HERE.md`.
**סטטוס עדכני:** `SETUP/STATUS.md`. **תוכנית מלאה:** `docs/AGENT_BUSINESS_PLAN.md`.

## פקודות
```bash
npm install        # התקנה
npm start          # הרצה מקומית → localhost:3000
CI=true npm run build   # בנייה (warnings = errors — הרץ לפני commit)
```

## מבנה
- `src/App.js` — שורש: ניתוב עמודים (state `page`), טעינת נתונים, הגדרות.
- `src/components/` — עמוד לכל מסך. חדשים: `AdvisorPage`, `FinancePage`, `InventoryPage`.
- `src/lib/` — לוגיקה טהורה:
  - `calculations.js` — **מנוע עלות הנחיתה** (מע"מ 18%, CIF, מכס, מס קנייה). לב המערכת.
  - `advisor.js` — פרומפט הסוכן + הקשר פרויקט.
  - `finance.js` / `inventory.js` — כספים / מלאי.
  - `finbot.js` — חיבור פינבוט (סקפולד).
  - `supabase.js` — client. `anthropicProxy.js` — קריאות AI דרך Edge Function.
- `supabase/migrations/` — סכימת DB (שמות ממויינים = סדר הרצה).
- `supabase/functions/` — Edge Functions (Deno). AI עובר תמיד דרך `anthropic-proxy` (המפתח בצד שרת).

## קונבנציות (חשוב לשמור על אחידות)
- **עברית RTL** בכל טקסט משתמש. עסקי אך ידידותי.
- עיצוב: משתני CSS (`var(--bg)`, `var(--text)`, `var(--blue)`, `var(--gold)`...),
  מחלקות `.btn`, `.btn-primary`, `.card`, `.page-header`, `.page-title`, `.page-body`, `.spinner`.
- אייקונים: `lucide-react` (גרסה ישנה — ודא שהאייקון קיים).
- הוספת עמוד = 3 מקומות: `NAV` ב-`Layout.js`, import + route ב-`App.js`.
- כל עמוד מקבל דרך `shared`: `products, settings, calcCtx, showToast, activeProject`.
- מפתחות/סודות **לעולם לא** בקוד — רק Supabase Secrets (ראה `SETUP/SECRETS.md`).
- מיגרציה חדשה: RLS `enable` + policy מתירני (`anon, authenticated`) + `owner_id` nullable
  (מוכן ל-Auth Phase B). אל תיגע ב-`20260606_rls_isolation.sql` (הרסני).

## Git
- ענף עבודה: `claude/israeli-import-agent-3feuk2`. מקור האמת = GitHub.
- אם העותק המקומי מיושן:
  `git fetch origin claude/israeli-import-agent-3feuk2 && git reset --hard origin/claude/israeli-import-agent-3feuk2`
- אל תפתח PR אלא אם המשתמש ביקש.

## הידע הדומייני (מוטמע בסוכן וב-calculations.js)
מע"מ 18% (מ-1.1.2025) · בסיס מע"מ = ערך מכס (CIF) + מכס + מס קנייה · שער יציג +0.5% ·
סיווג HS לפי צו תעריף המכס · אינקוטרמס (FOB נפוץ) · עמיל מכס · תעודת מקור להעדפות מכס.
