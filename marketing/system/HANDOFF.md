# 🤝 HANDOFF — מערכת סוכני שיווק 4Elements
מסמך העברה ל-Claude Cowork / כל סוכן שממשיך. עודכן: 2026-08-09.

**מטרה:** מערכת שמפיקה ומפרסמת תוכן שיווקי אוטומטית 3×/יום ל-Instagram + Facebook, עם אישור בטלפון, לומדת מה עובד, ומכוונת ל-3+ מכירות/יום.

**Repo:** `nir9750a-spec/landed-cost` · branch `claude/daily-conversation-connection-n8ezyf`
**קבצי מפתח:** `marketing/system/` → `RUNBOOK.md` (צעדי הריצה היומית), `product-profiles.json` (42 מוצרים), `rotation-state.json` (סבב), `AGENT-SYSTEM.md` (ארכיטקטורה).

---

## ✅ מה עובד (מוכח בפועל)

### 1. Publisher — פרסום אוטומטי IG + FB  ⭐ הליבה
- **Make Data Store (תור):** id **159437** (structure 522307) · שדות: `image_url`, `caption`, `product_id`. פלט בסריקה נמצא תחת `{{1.data.image_url}}` והמפתח `{{1.key}}`.
- **Make Scenario:** id **6869166** ("4Elements — Publisher (Queue → IG + FB)"), פעיל, scheduling `on-demand`. זרימה: `datastore:SearchRecord(159437, limit 1, filter image_url exist)` → `instagram-business:CreatePostPhoto` → `facebook-pages:CreatePostWithPhotos` → `datastore:DeleteRecord({{1.key}})`.
- **חשבונות Meta:** connection **9617477** (Facebook OAuth, פג תוקף **2026-10-07** → צריך חידוש אז). IG **@4elements.il** account id **17841477773982301**. FB Page **"4Elements (פתח תקווה)"** id **1355675404284855**.
- **איך מפרסמים (מכל סוכן עם Make MCP):**
  1. `data-store-records_create(dataStoreId:159437, data:{image_url, caption, product_id})`
  2. `scenarios_run(6869166, responsive:true)`
  3. אימות: `executions_get` → `status:1` ו-`operations >= 4`.

### 2. Scheduler — מתזמן
- **CCR Routine** id **`trig_012pigP8BQD8shSoCmeigjXe`** · cron **`0 4,9,15 * * *`** (=07:00/12:00/18:00 שעון ישראל, IDT). Self-bind לסשן **`session_01WGvVd4J1PBM5ikFaGUzTzA`** (environment `env_015MwPM1Wj2rjn7UDqubPm9e`). כל ירייה: מכין פרסומת → שולח push → מבקש אישור.

### 3. Notification — התראה לטלפון
- כלי **`PushNotification`** (status: proactive) → צפצוף לטלפון. משמש בכל סלוט כשהפרסומת מוכנה + אחרי פרסום.

### 4. Content — יצירת פרסומות
- **Mode A (חינם):** קומפוזיט מקומי — HTML 1080×1350 (תמונת מוצר מ-`marketing/ad-sources/` + לוגו 4Elements + כותרת עברית + תג מחיר כתום + פוטר) → רינדור Chromium (`/opt/pw-browsers/chromium-*/chrome-linux/chrome --headless=new --no-sandbox --screenshot ... --window-size=1080,1350`) → **קרוא ה-PNG לאימות** → JPEG.
- **פרסומות גמורות מוכנות בריפו:** `marketing/ad-sources/ad-06A.png`, `ad-06B.png` (מיטות), `ad-cart*.png`, `fan-ad.png`. שיטת ה-crop לניקוי HISPEED: לחתוך את המוצר בלי אזור הלוגו + PIL להפוך רקע-לבן לשקוף.
- **Mode B (מה-18 לחודש, קרדיטים):** Higgsfield `nano_banana_pro` (2 קרדיט, תמונת מוצר+לוגו) / וידאו `marketing_studio_video` mode `product_showcase` generate_audio (75 קרדיט) או `kling3_0` (25 קרדיט).

---

## ⛔ אילוצים קריטיים (חובה לדעת!)
1. **תמונה לפרסום = JPEG ציבורי ב-GitHub raw בלבד.** Meta **לא** מצליח למשוך מ-cloudfront (Higgsfield), weserv, או Google Drive — הפוסט "מצליח" ב-API אבל **לא מופיע**. תמיד: commit ה-JPEG לריפו → `https://raw.githubusercontent.com/nir9750a-spec/landed-cost/<SHA>/<path>.jpg`.
2. **פרוקסי הסביבה חוסם egress** ל-cloudfront ול-hook.eu1.make.com (curl → 403). לכן **אי אפשר להוריד פלטי Higgsfield** ולא לקרוא ל-Make webhook ישירות. הפתרון: תור Data Store + `scenarios_run` (דרך Make MCP, שעובד).
3. **פרופורציה ל-IG:** בין 4:5 ל-1.91:1. 1080×1350 = 4:5 ✅.
4. **Make Free:** מקס' 2 תרחישים, 1,000 פעולות/חודש (פרסום ≈ 4 פעולות → 3/יום ≈ 360/חודש, בסדר). מינימום אינטרוול 15 דק'.
5. **תוכן:** עברית מאומתת פעמיים · בלי ביקורות/כוכבים/כמות-רוכשים מזויפים · לוגו 4Elements אמיתי · להסיר HISPEED · מחירים רק מהקטלוג.

---

## 🧭 5 הסוכנים — סטטוס
| # | סוכן | תפקיד | סטטוס |
|---|------|-------|-------|
| 1 | 🔍 Scout | טרנדים+Insights → מוצר/זווית ליום | ⏳ לבנות (קריאת `instagram-business:GetUserInsights2`/`GetMediaInsights` דרך conn 9617477) |
| 2 | 🎨 Creator | בונה פרסומת (Mode A/B) | ✅ עובד |
| 3 | 🕵️ Reviewer | מאמת עברית/מחיר/לוגו/בלי HISPEED (קורא ה-PNG) | ✅ עובד |
| 4 | 📤 Publisher | מפרסם IG+FB דרך התור | ✅ **חי ומוכח** |
| 5 | 📈 Learner | שבועי: Insights → מטה את הסבב למנצחים | ⏳ לבנות |

---

## 💳 קרדיטים / חשבונות
- **Higgsfield:** מסלול Plus, ~4.5 קרדיט כרגע. חידוש חודשי **+1,000 ב-18 לחודש** (Subscription Credits grant). לשקול Ultra ($99/שנה, 3,000/חודש) להרחבת Mode B/וידאו.
- **Meta:** מחובר ל-Make (IG+FB). **חידוש OAuth נדרש ~2026-10-07.**

---

## 📌 פתוח / הצעדים הבאים
1. **חיבור אתר הקניות** (4elements.co.il) ל-Make למעקב המרות — צריך לדעת פלטפורמה (Shopify/WooCommerce/אחר).
2. **בניית Scout + Learner** (קריאת Insights → החלטות אוטומטיות).
3. **ספריית תמונות נקייה** — רוב תמונות הספק עם HISPEED; לבנות מאגר JPEG נקי ב-GitHub (דרך Higgsfield כשיש קרדיטים, או צילומים אמיתיים של הלקוח — שיצאו הכי טוב, למשל עגלה/כיסא חוף).
4. **תקציב ממומן קטן** (₪30–50/יום Meta) — המכפיל האמיתי למכירות; המערכת אורגנית בלבד מוגבלת ב-300–410 עוקבים.

---
*כל ה-IDs לעיל אמיתיים ופעילים נכון ל-2026-08-09. RUNBOOK.md מכיל את צעדי הריצה היומית המדויקים.*
