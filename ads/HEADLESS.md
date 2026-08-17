# ☁️ HEADLESS — המנוע רץ בלי המחשב שלך

המטרה: המחשב נדרש **פעם בשבוע-שבועיים** (למלא בנק סצנות), לא כל יום.

## מה רץ איפה

| שלב | איפה רץ | צריך מחשב? |
|---|---|---|
| בחירת מוצר · רינדור · תור · כרטיס טלגרם | GitHub Actions (`ads-daily`) | ❌ |
| קליטת הלחיצה ✅/🔄/❌ | Supabase Edge Function `telegram-webhook` | ❌ |
| בדיקת בריאות יומית | GitHub Actions (`ads-selftest`) | ❌ |
| **יצירת סצנות AI** | סשן Claude + Higgsfield MCP | ✅ (מילוי מראש) |
| פרסום IG/FB | Make (ענן) — כרגע מופעל ידנית | ⚠️ שלב הבא |
| וואטסאפ | ידני — אין API | ✅ תמיד |

## הפעלה חד-פעמית (מה שנשאר לך לעשות)

### 1. סודות ב-GitHub
`Settings → Secrets and variables → Actions → New repository secret`, שלושה:

| שם | ערך |
|---|---|
| `SUPABASE_SERVICE_KEY` | ה-service_role **הישן** (מתחיל `eyJ`) — לא `sb_secret` |
| `TELEGRAM_BOT_TOKEN` | הטוקן של @elements4_approve_bot |
| `TELEGRAM_CHAT_ID` | `1669582702` |

הערכים נמצאים אצלך ב-`ads/.env`. **אל תשלח אותם בצ'אט** — תדביק ישירות ב-GitHub.

גם: `Settings → Actions → General → Workflow permissions` → **Read and write**
(ה-workflow מחזיר לגיט את מצב הבנק ויומן הריצה).

### 2. Webhook לטלגרם (מבטל את המאזין המקומי)

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
```

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=<הטוקן> TELEGRAM_WEBHOOK_SECRET=<מחרוזת אקראית שתמציא>
```

ואז לרשום את ה-webhook מול טלגרם (החלף `<TOKEN>`, `<FN_URL>`, `<SECRET>`):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FN_URL>&secret_token=<SECRET>"
```

⚠️ **אחרי שה-webhook פעיל — אסור להריץ `handle_updates` מקומית.** שני צרכנים על אותו
תור עדכונים גונבים לחיצות אחד מהשני. ה-webhook מנצח; המאזין המקומי הופך למיותר.

## איך רואים מה עובד ומה לא

| כלי | מה זה נותן |
|---|---|
| `python selftest.py` | טבלת ✅/❌ על כל תלות: סודות, Supabase (קריאה+כתיבה), טלגרם, פרופילים, רינדור, בנק, אווטארים |
| `python selftest.py --json` | אותו דבר למכונה (CI מעלה כ-artifact) |
| `python headless_daily.py --dry-run` | מריץ את כל המחזור **בלי** לפרסם/לתייק/לשלוח — מרנדר ל-`workspace/dry-run/` |
| `python runlog.py` | 30 השורות האחרונות מיומן הריצות + סטטוס אחרון |
| `python scene_bank.py` | כמה סצנות נשארו וכמה ימי ריצה |
| טלגרם | כל ריצה שולחת סיכום קצר; כישלון צועק |
| GitHub → Actions | היסטוריית ריצות מלאה, stdout, ו-artifact עם המודעות שנוצרו |

**הכלל:** לפני כל שינוי — `selftest.py`. אחרי כל שינוי — `--dry-run`. שניהם רצים גם ב-CI
על כל push, וגם ב-08:30 כל בוקר (חצי שעה לפני הריצה האמיתית) כדי שתקלה תתפס לפני שהיא עולה לך ביום.

## למלא את הבנק (הפעולה היחידה שדורשת אותי)

בשיחה: **"תמלא בנק סצנות"**. אני:
1. `python scene_bank.py` → מי חסר
2. מעלה את תמונת המוצר + אווטאר ל-Higgsfield, מייצר סצנות (nano_banana_pro, ~1 קרדיט לתמונה)
3. `scene_bank.add(sku, scene, path, url=...)` — ה-url הוא מה שמאפשר ל-CI למשוך את התמונה
   בלי לשמור PNG-ים כבדים בגיט

10 מוצרים × 3 סצנות ≈ 30 סנט ≈ חודש ריצה.

## מה עוד לא headless

- **פרסום IG/FB** — Make עדיין מופעל דרך ה-MCP. כדי לסגור: טוקן API של Make ב-secrets,
  או תרחיש ב-Make שמושך `approved` מ-Supabase לבד לפי לו"ז.
- **טיקטוק** — צריך mp4; היום הרילס נשמר כ-JPG.
- **וואטסאפ** — אין API. תמיד ידני.
