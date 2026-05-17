# הוראות פריסה — תיקון אבטחת API Key

קוד צד-לקוח כבר עודכן. צריך לפרוס את ה-Edge Function ולהריץ את ה-SQL migration.

## דרישות מוקדמות

1. **המפתח הישן בוטל ב-Anthropic Console** — אם עדיין לא, עצור עכשיו ועשה את זה: https://console.anthropic.com/settings/keys
2. **יש לך מפתח Anthropic חדש** — לא לשמור אותו בשום מקום, ניצור אותו בסעיף 3
3. Node.js מותקן (יש לך)
4. גישת הרשאות בעלים לפרויקט Supabase שלך

## שלב 1 — התקנת Supabase CLI

```powershell
# Windows (PowerShell):
scoop install supabase

# או דרך npm (פחות מומלץ אך עובד):
npm install -g supabase
```

ודא שעובד:
```powershell
supabase --version
```

## שלב 2 — חיבור לפרויקט שלך

```powershell
cd C:\Users\Admin\landed-cost
supabase login
# ייפתח דפדפן — תאשר התחברות

supabase link --project-ref eginihtpqahpejnkqznn
# יבקש את database password של הפרויקט (מהקונסול של Supabase → Project Settings → Database)
```

## שלב 3 — הגדרת מפתח Anthropic כסוד

```powershell
# החלף sk-ant-api03-XXXX במפתח החדש שיצרת
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-XXXX
```

לאימות:
```powershell
supabase secrets list
# צריך לראות ANTHROPIC_API_KEY ברשימה (הערך לא יוצג)
```

## שלב 4 — פריסת ה-Edge Function

```powershell
supabase functions deploy anthropic-proxy
```

אם הצלחת תראה:
```
Deployed Functions on project eginihtpqahpejnkqznn: anthropic-proxy
You can inspect your deployment in the Dashboard: https://supabase.com/dashboard/project/eginihtpqahpejnkqznn/functions
```

## שלב 5 — הרצת ה-SQL migration

**אפשרות א — דרך CLI:**
```powershell
supabase db push
```

**אפשרות ב — דרך הקונסול (מומלץ אם זה הראשון):**
1. כנס ל-https://supabase.com/dashboard/project/eginihtpqahpejnkqznn/sql/new
2. העתק את התוכן של `supabase/migrations/20260517_remove_api_key_and_secure_settings.sql`
3. הדבק והרץ
4. ודא שאין שגיאות

## שלב 6 — בדיקה מקומית

```powershell
cd C:\Users\Admin\landed-cost
npm start
```

נסה:
1. **העלאת קובץ Excel** — צריך לעבוד מיידית (לא משתמש ב-AI)
2. **העלאת PDF/תמונה** — צריך לעבוד דרך ה-proxy. אם נכשל, ראה Troubleshooting למטה.
3. **סיווג HS** — לחץ על כפתור הסיווג ליד מוצר. אמור לעבוד.

## שלב 7 — פריסה ל-Vercel

```powershell
git add -A
git commit -m "security: move Anthropic API key to Supabase Edge Function proxy"
git push
```

Vercel תפרוס אוטומטית. ודא שהאפליקציה ב-https://nir-sigma-liard.vercel.app/ עדיין עובדת.

---

## Troubleshooting

### "ANTHROPIC_API_KEY not set" בקריאה
- ודא ש-`supabase secrets list` מראה את המפתח
- אם הוספת אותו אחרי הפריסה, פרוס שוב: `supabase functions deploy anthropic-proxy`

### CORS error
- ודא שהדומיין שלך כלול ב-`ALLOWED_ORIGINS` בתחילת `supabase/functions/anthropic-proxy/index.ts`
- אם פרסת מ-preview URL חדש של Vercel — הוסף אותו לרשימה ופרוס מחדש

### "Model not allowed"
- אם תוסיף בעתיד מודל חדש לקוד, הוסף אותו גם ל-`ALLOWED_MODELS` ב-`index.ts`

### לבדוק שהדליפה נסגרה
לאחר ההרצה, מהדפדפן (DevTools → Console):
```javascript
fetch('https://eginihtpqahpejnkqznn.supabase.co/rest/v1/settings?select=*', {
  headers: { apikey: 'sb_publishable_dxvkjrqH1c0SULImna9L2A_qe9AkGTL' }
}).then(r => r.json()).then(console.log);
```
לא אמור להופיע שדה `api_key` באף שורה.
