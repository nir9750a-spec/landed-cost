# 🔐 SECRETS — סודות Edge Functions (Supabase)

כל ה-Edge Functions רצות על Supabase ומושכות סודות מ-**Supabase Secrets** (לא
מהקוד). כך מגדירים אותם.

> **בטיחות:** אף אחד מהמפתחות האלה לא נשמר ב-Git. אם מפתח נחשף (צ'אט/צילום/מייל) —
> ייצר אותו מחדש והחלף את ה-secret.

## איך מגדירים (פעם אחת, דרך Supabase CLI)

```powershell
# התקנה + חיבור (פעם אחת)
npm install -g supabase          # או: scoop install supabase
supabase login
supabase link --project-ref eginihtpqahpejnkqznn

# הגדרת סוד:
supabase secrets set NAME=value

# צפייה ברשימה (בלי ערכים):
supabase secrets list
```

## רשימת הסודות הנדרשים

| Secret | משמש ל | נדרש? | מאיפה משיגים |
|--------|--------|-------|--------------|
| `ANTHROPIC_API_KEY` | סוכן היבוא, חילוץ מסמכים, seasonal-agent | ✅ ליבה | console.anthropic.com/settings/keys |
| `SHIPSGO_API_KEY` | מעקב מכולות (shipsgo-track) | ⭕ אופציונלי | shipsgo.com API |
| `HUNTER_API_KEY` | העשרת אנשי קשר (contact-enrich) | ⭕ אופציונלי | hunter.io |
| `FINBOT_API_KEY` | הפקת חשבוניות לפינבוט | 🟡 לנדבך 4 | פינבוט → הגדרות העסק → מפתח API |
| `FINBOT_API_URL` | endpoint הפקת הכנסה בפינבוט | 🟡 לנדבך 4 | דף התיעוד של פינבוט |
| `FINBOT_KEY_MODE` | אופן שליחת המפתח (`body:apiKey` / `header:...`) | 🟡 לנדבך 4 | דף התיעוד של פינבוט |

> `SUPABASE_URL` ו-`SUPABASE_SERVICE_ROLE_KEY` מסופקים אוטומטית ע"י Supabase —
> **אין צורך להגדיר** אותם.

## פריסת הפונקציות (אחרי הגדרת הסודות)

```powershell
supabase functions deploy anthropic-proxy    --no-verify-jwt
supabase functions deploy finbot-issue-income --no-verify-jwt
# (שאר הפונקציות כבר פרוסות; פרוס מחדש רק אם שינית אותן)
```

## מינימום להפעלה מלאה

רק **`ANTHROPIC_API_KEY`** חובה כדי שהסוכן וחילוץ המסמכים יעבדו. כל השאר אופציונלי
או לנדבך פינבוט.
