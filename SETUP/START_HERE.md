# 🚀 START HERE — הפעלה מחדש של Importly

> הקובץ הזה הוא **נקודת הכניסה היחידה**. אם מחקת/התקנת מחדש הכול — תפתח את הקובץ
> הזה ותעבוד לפי הסדר. כל מה שצריך נמצא כאן.

**מה זה:** Importly — מערכת ניהול ליבואן לישראל (React + Supabase). מחשבון עלות
נחיתה + סוכן AI + כספים + מלאי + חיבור לפינבוט.

- **GitHub:** `nir9750a-spec/landed-cost`
- **ענף העבודה החדש:** `claude/israeli-import-agent-3feuk2`
- **Supabase project ref:** `eginihtpqahpejnkqznn`
- **פרודקשן (Vercel):** `nir-sigma-liard.vercel.app`

---

## ⚡ הדרך המהירה — סקריפט אוטומטי

אם כבר יש לך את הקוד (או אחרי clone), הסקריפט עושה הכול (סנכרון + התקנה + פתיחת
המדריך + הרצה) בפקודה אחת:

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File .\SETUP\setup.ps1
```

**Mac / Linux:**
```bash
bash SETUP/setup.sh
```

**ממחשב חדש לגמרי** (אין עדיין קוד) — הדבק פקודה אחת:
```powershell
cd $HOME; git clone https://github.com/nir9750a-spec/landed-cost.git; cd landed-cost; git checkout claude/israeli-import-agent-3feuk2; powershell -ExecutionPolicy Bypass -File .\SETUP\setup.ps1
```

> מעדיף ידני / להבין כל שלב? המשך למדריך ה-6 צעדים למטה.

---

## ✅ מפת ההפעלה — 6 צעדים (ידני)

| # | צעד | מתי צריך |
|---|-----|----------|
| 1 | התקנת כלים (Node, Git) | פעם אחת |
| 2 | הורדת הקוד (clone) | פעם אחת |
| 3 | הרצה מקומית (`npm start`) | כדי לפתח |
| 4 | הרצת 2 מיגרציות חדשות (כספים + מלאי) | פעם אחת |
| 5 | פריסה לפרודקשן (Vercel) | כשרוצים לפרסם |
| 6 | הפעלת חיבור פינבוט | כשיהיה ה-endpoint |

---

## שלב 1 — כלים בסיסיים (פעם אחת)

1. **Node.js 18+** — הורד מ-https://nodejs.org (גרסת LTS). בדיקה:
   ```powershell
   node --version
   npm --version
   ```
2. **Git** — https://git-scm.com
3. (מומלץ) **VS Code** — https://code.visualstudio.com

---

## שלב 2 — הורדת הקוד (פעם אחת)

```powershell
cd C:\Users\Admin
git clone https://github.com/nir9750a-spec/landed-cost.git
cd landed-cost
git checkout claude/israeli-import-agent-3feuk2
npm install
```

> `npm install` לוקח דקה-שתיים. אם יש שגיאות peer-deps, הרץ `npm install --legacy-peer-deps`.

---

## שלב 3 — הרצה מקומית

```powershell
npm start
```

נפתח ב-http://localhost:3000. מתחבר אוטומטית ל-Supabase הקיים (הכתובת והמפתח
הציבורי כבר מוטמעים בקוד — בטוח). אין צורך בקובץ `.env` להרצה בסיסית.

**אם בכל זאת תרצה קובץ env מקומי** (לא חובה): צור `.env.local` עם:
```
REACT_APP_SUPABASE_URL=https://eginihtpqahpejnkqznn.supabase.co
REACT_APP_SUPABASE_KEY=sb_publishable_dxvkjrqH1c0SULImna9L2A_qe9AkGTL
```

---

## שלב 4 — 2 מיגרציות חדשות (כספים + מלאי) — **חובה פעם אחת**

מסד הנתונים כבר קיים ורוב הטבלאות מוגדרות. **חסרות רק 2 טבלאות חדשות** שנוספו
(כספים ומלאי). הדרך הכי פשוטה — דרך ה-SQL Editor באתר Supabase:

1. היכנס ל-https://supabase.com/dashboard → פרויקט `eginihtpqahpejnkqznn`
2. תפריט צד → **SQL Editor** → **New query**
3. פתח בקוד את הקובץ `supabase/migrations/20260711_finance.sql`, העתק את כל
   התוכן, הדבק, ולחץ **Run**.
4. חזור על אותו דבר עם `supabase/migrations/20260712_inventory.sql`.

זהו — עכשיו מסכי "כספים" ו"מלאי" שומרים נתונים.

> ⚠️ **אל תריץ** את `20260606_rls_isolation.sql` — הוא הרסני ומיועד רק למעבר
> להתחברות משתמשים (ראה `AUTH_PLAN.md`). כל שאר המיגרציות כבר הורצו בעבר.

---

## שלב 5 — פריסה לפרודקשן (Vercel)

הפרודקשן מחובר אוטומטית ל-GitHub. **כל דחיפה לענף מפרסמת preview אוטומטית:**

```powershell
git add -A
git commit -m "התיאור שלך"
git push origin claude/israeli-import-agent-3feuk2
```

- Preview URL מופיע ב-https://vercel.com בפרויקט שלך.
- למיזוג לפרודקשן הראשי — Merge של הענף ל-`main` (או שנה את הענף המחובר ב-Vercel).

---

## שלב 6 — הפעלת חיבור פינבוט (כשיהיה ה-endpoint)

ראה `SETUP/SECRETS.md` ו-`supabase/functions/finbot-issue-income/README.md`.
בקצרה: צריך את ה-endpoint ודוגמת JSON מדף התיעוד של פינבוט, ואז:
```powershell
supabase secrets set FINBOT_API_KEY=... FINBOT_API_URL=... FINBOT_KEY_MODE=body:apiKey
supabase functions deploy finbot-issue-income --no-verify-jwt
```

---

## 🗺️ מפת המערכת (מה יש איפה)

```
landed-cost/
├── START_HERE.md ............... ← אתה כאן (בתיקיית SETUP/)
├── CLAUDE.md ................... הנחיות ל-Claude Code (סדר בעבודה)
├── SETUP/
│   ├── START_HERE.md ........... המדריך הזה
│   ├── SECRETS.md .............. כל הסודות (Edge Functions)
│   └── STATUS.md .............. סטטוס 4 הנדבכים + מה נשאר
├── docs/AGENT_BUSINESS_PLAN.md . תוכנית העבודה המלאה (4 נדבכים)
├── AUTH_PLAN.md ............... תוכנית התחברות משתמשים (עתידי)
├── src/
│   ├── App.js ................. שורש — ניתוב עמודים + state
│   ├── components/ ............ עמודים: Advisor, Finance, Inventory, ...
│   └── lib/ .................. לוגיקה: calculations, advisor, finance, inventory, finbot
└── supabase/
    ├── migrations/ ........... סכימת DB (הרץ את 2 האחרונות — שלב 4)
    └── functions/ ............ Edge Functions (Deno)
```

---

## 🆘 בעיות נפוצות

- **הקוד "נעלם" / ענף מיושן:** מקור האמת הוא GitHub. תמיד:
  `git fetch origin claude/israeli-import-agent-3feuk2 && git reset --hard origin/claude/israeli-import-agent-3feuk2`
- **`npm start` נכשל:** מחק `node_modules` ו-`package-lock.json`, הרץ `npm install` מחדש.
- **מסך כספים/מלאי לא שומר:** לא הרצת את מיגרציות שלב 4.
- **הסוכן/חילוץ AI לא עובד:** ה-secret `ANTHROPIC_API_KEY` לא מוגדר ב-Supabase (ראה SECRETS.md).
