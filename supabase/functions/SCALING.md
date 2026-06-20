# הרצת הסוכן בעומס — ~10,000 משתמשים בו-זמנית

מסמך זה מסכם מה נבנה כדי לעמוד בעומס, ומה צריך להקצות לפני יום ההשקה.

## צווארי הבקבוק האמיתיים
1. **קריאת Anthropic + web_search** — איטית (20–40ש') ויקרה (חיפוש אינטרנט מתומחר + טוקנים). זה הגורם הדומיננטי.
2. **כפילות עצומה** — אלפי משתמשים מחפשים אותו שוק/עונה → אותה תוצאה בדיוק.
3. **abuse / בקשות זדוניות** — פונקציה פתוחה ללא הגנה = פצצת עלות.
4. **Hunter.io** — מכסה נמוכה ב-tier חינמי.

## מה כבר נבנה (בקוד)
### 1. Caching ב-DB (המנוף הכי גדול)
- טבלה `seasonal_cache` ממופתחת לפי `(market, category, audience, count, date)` מנורמל.
- בקשה זהה בתוך **36 שעות** מוחזרת מהמטמון ב-~מילישניות, **בלי קריאת Anthropic**.
- ביום השקה עם 10k משתמשים, אם רובם מחפשים שילובים דומים — **>95% מהבקשות הופכות ל-cache hits**. עלות ה-AI נחתכת בהתאם.
- `contact_cache` עושה את אותו דבר לפי דומיין (TTL 30 יום — מיילים יציבים).
- כל ה-helpers **fail open**: אם ה-DB לא זמין, המשתמש עדיין מקבל תשובה.

### 2. Rate limiting אטומי
- פונקציית SQL `check_rate_limit()` (חלון קבוע, אטומי דרך `on conflict ... do update`).
- מוחל רק על ה**מסלול היקר** (cache miss): `seasonal-agent` → 8 חיפושים / IP / 10 דק'; `contact-enrich` → 30 / IP / 10 דק'. cache hits לא נספרים.
- מחזיר `429` עם הודעה ידידותית ו-`Retry-After`.

### 3. עמידות בעומס Anthropic
- retry עם backoff על 502/503/529 (כבר קיים). בעומס-יתר מוחזר 503 "השירות עמוס" במקום קריסה.

### 4. סטטי ב-CDN
- `public/seasonal-agent.html` הוא קובץ סטטי — Vercel/CDN מגיש אותו ללא הגבלת קונקרנטיות.

## מה צריך להקצות לפני ההשקה (אצלך)
| רכיב | פעולה |
|---|---|
| **Anthropic tier** | ודא tier גבוה מספיק (RPM/TPM/concurrent + web search). פתח [Console → Limits], ובקש העלאה אם צריך. ה-cache מצמצם דרסטית, אבל ה-misses עדיין צריכים headroom. |
| **Supabase plan** | Pro+ — Edge Functions, חיבורי DB, ו-Postgres שמחזיק את ה-cache/rate-limit. הרץ את ה-migration. |
| **Hunter.io plan** | tier חינמי לא יספיק. שדרג לפי נפח אימותי המייל הצפוי (ה-cache מצמצם, אבל דומיינים ייחודיים עולים). |
| **Cron prune** | תזמן `select prune_agent_tables();` יומי (pg_cron) לניקוי שורות ישנות. |

## פריסה
```bash
supabase db push                          # מריץ migrations (כולל 20260620_agent_scaling.sql)
supabase secrets set ANTHROPIC_API_KEY=...
supabase secrets set HUNTER_API_KEY=...
supabase functions deploy seasonal-agent
supabase functions deploy contact-enrich
```

## כיווני סקייל נוספים (אם העומס גדל מעבר)
- **CDN edge cache** על תגובת הפונקציה (Cache-Control) לשכבת מטמון נוספת לפני ה-DB.
- **תור אסינכרוני** (Supabase Queues / pg-boss): cache miss → job → polling, במקום להחזיק חיבור פתוח 40ש'.
- **מכסות פר-משתמש** (קושר למודל התשלום: פר-חיפוש / מנוי) — מפתח API למשתמש במקום rate-limit per-IP גולמי.
- **Pre-warming**: cron שמריץ מראש את החיפושים הפופולריים (שווקים/עונות נפוצים) כדי שהמשתמש הראשון כבר יקבל cache hit.

## כפתורי כוונון (ב-`seasonal-agent/index.ts`)
- `CACHE_TTL_SECONDS` (ברירת מחדל 36ש') — העלה לחסכון, הורד לרעננות.
- `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` — הדק/הרפה לפי סובלנות העלות.
