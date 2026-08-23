# 🔬 אבחון: למה הפרסום נעצר ב‑19.8

> ## ⛔ מסמך זה כבר לא מעודכן — נבדק מחדש 23.8.2026
>
> **3 ה‑Secrets כבר הוגדרו.** ההרצה של 23.8 עברה אותם, עברה את ה‑selftest,
> **יצרה את הפרסומת ושלחה כרטיס אישור לטלגרם** — ואז נפלה בשלב האחרון:
>
> ```
> remote: Permission to nir9750a-spec/landed-cost.git denied to github-actions[bot] (403)
> ```
>
> הסיבה: ל‑`GITHUB_TOKEN` היה `Contents: read` בלבד, אז `git push` של שמירת ה‑state נכשל.
> **הפרסומת נוצרה בכל 5 הימים** — רק ה‑state לא נשמר, ולכן `rotation-state.json` קפא ב‑16.8.
>
> התיקון (הוחל): `permissions: contents: write` ב‑`ads-daily.yml`.
> הניתוח המלא והמעודכן: **`MARKETING-ORGANIC-PLAN.md`** סעיף 1.
>
> מה שנשאר נכון כאן: מפת 4 הערוצים, תוקף חיבור Meta (07.10.2026), ולקח שלוש השכבות.

## התשובה בשורה אחת (כפי שנכתבה ב‑22.8 — ראה תיקון למעלה)
**המנוע ההדלס נבנה ב‑19.8 להחליף את המחשב — ומעולם לא רץ פעם אחת,
כי שלושת ה‑Secrets לא הוגדרו ב‑GitHub. כל 4 ההרצות מתו אחרי 5 שניות.**

---

## ציר הזמן

| תאריך | מה קרה |
|---|---|
| עד 18.8 | פרסום תמונות דרך Make scenario `6869166` |
| **18.8 03:06** | פרסום תמונה אחרון · מיד אחריו **`stop`** — התרחיש כובה |
| 18.8–19.8 | פרסום ממשיך ב**רילסים** דרך scenario `6903724` |
| **19.8 21:01** | **הפרסום האחרון בפועל** (רילס) |
| 19.8 | נבנה `ads-daily.yml` — המנוע ההדלס ("רץ עם המחשב סגור") |
| 20.8 21:53 | קומיט שמתעד את פרסומי 18‑19.8 |
| 19,20,21,22.8 | **4 הרצות מתוזמנות — כולן נכשלו** |

---

## הכשל המדויק

הרצה אחרונה: [`32556550201`](https://github.com/nir9750a-spec/landed-cost/actions/runs/32556550201) · 22.8 06:16 UTC

| # | שלב | תוצאה |
|---|---|---|
| 1‑4 | checkout · python · pip | ✅ |
| **5** | **`Are the repo secrets configured?`** | ❌ **נכשל** |
| 6 | Health check | ⏭ דולג |
| 7 | **Daily ad** | ⏭ **דולג — כאן הפרסומת הייתה אמורה להיווצר** |

**משך ההרצה: 5 שניות.** היא מתה לפני שנגעה במשהו.

חסרים ב‑`Settings → Secrets and variables → Actions`:
- `SUPABASE_SERVICE_KEY` — service_role legacy (מתחיל `eyJ`)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID` — **הערך ידוע: `1669582702`**

---

## מצב ארבעת הערוצים (נבדק 22.8)

| ערוץ | חיבור | מצב |
|---|---|---|
| Instagram `@4elements.il` | Make conn `9617477` | ✅ מחובר · ⚠️ פג **7.10.2026** |
| Facebook Page (פתח תקווה) | Make conn `9617477` | ✅ מחובר · ⚠️ פג **7.10.2026** |
| TikTok `@4elements` | Higgsfield `a8e869f3…` | ✅ **active** |
| Telegram `@elements4_approve_bot` | `TELEGRAM_BOT_TOKEN` | ✅ הבוט חי · ❌ הטוקן חסר ב‑GitHub |

**אף חיבור לא נשבר.** כל הארבעה חיים. נקודת הכשל היחידה = 3 ה‑Secrets.

בנוסף: Make scenario `6869166` (תמונות) עדיין **כבוי** (`isActive: false`).

---

## התיקון (10 דקות)

1. **GitHub** → `Settings → Secrets and variables → Actions → New repository secret` ×3
   - `TELEGRAM_CHAT_ID` = `1669582702`
   - `TELEGRAM_BOT_TOKEN` = מ‑BotFather
   - `SUPABASE_SERVICE_KEY` = Supabase → Project Settings → API → `service_role`
2. **Make** → scenario `6869166` → Scheduling **ON**
3. **אימות:** Actions → ads-daily → `Run workflow` → `dry_run: true`.
   ירוק = עובד. אז להריץ בלי dry-run.

---

## הלקח למערכת הבדיקה

פספסתי את זה בסבב הראשון כי בדקתי רק שתי שכבות: Routines ו‑Make.
**שכבה שלישית — GitHub Actions — היא זו שנפלה.**

מעכשיו הבדיקה חייבת לכסות את שלוש השכבות:
1. **Routine** יורה? → סרגל Routines
2. **GitHub Actions** מסיים בירוק? → `/actions`  ← **השכבה שנפלה**
3. **Make execution** עם `operations >= 4`? → make.com History

וכלל־על: **פרסום אמיתי משאיר קומיט.** אין קומיט = לא פורסם.
