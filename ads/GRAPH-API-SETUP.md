# פרסום אוטומטי חינמי לאינסטגרם — הקמה (Graph API)
*ללא שדרוג, ללא העלאת קובץ ידנית · 19.7.2026*

## איך זה עובד (הרעיון)
Instagram Graph API מפרסם **מכתובת URL ציבורית** של הסרטון/תמונה — לא מקובץ מקומי. לכן זה עוקף לגמרי את החסימה שנתקלנו בה. הזרימה:
`אני מייצר ריל → מעלה אותו לכתובת ציבורית (אתר WP) → קורא ל-API → מתפרסם.` הכל בקוד, בלי אף צעד ידני.

הסקריפט כבר מוכן: `ads/instagram_publish.py`. חסר רק **טוקן** ו-**מזהה חשבון IG** — הקמה חד-פעמית.

---

## חלק א' — למנהל האתר (חד-פעמי · חופף לעבודת הפיקסל)
1. **developers.facebook.com** ← **Create App** ← סוג **Business** ← לשייך לעסק **4elements** (2233408447177133).
2. להוסיף מוצרים: **Instagram** + **Facebook Login for Business**.
3. **הרשאות (scopes):** `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`.
4. **טוקן שלא פג (מומלץ):** Business Settings ← **System Users** ← צור משתמש מערכת ← **Generate token** עם ההרשאות למעלה ← הקצה לו את **עמוד 4Elements** ואת **חשבון האינסטגרם**. (חלופה: טוקן ארוך-טווח ~60 יום, צריך רענון.)
5. **App Review:** לפרסום לחשבון שלך (בבעלותך) עם System User — לרוב מספיק Advanced Access ל-`instagram_content_publish`; אם Meta מבקשת Review, זה תהליך קצר לחשבון עצמי.
6. לשלוח לניר: **הטוקן** + לוודא שהאינסטגרם עסקי ומקושר לעמוד.

## חלק ב' — אצלנו (ניר/Claude)
1. להריץ `python instagram_publish.py whoami` → שולף את **ig_user_id**.
2. למלא `ads/ig_config.json`:
   ```json
   { "ig_user_id": "1784...", "access_token": "EAAG..." }
   ```
3. פרסום: `python instagram_publish.py reel "https://4elements.co.il/wp-content/uploads/2026/07/smoker_reel_beach.mp4" "כיתוב..."`

---

## אירוח קבצים בחינם (לכתובת הציבורית)
המדיה צריכה כתובת ציבורית שממנה Meta מושכת. **הכי פשוט וחינם:**
- **ספריית המדיה של וורדפרס** — מעלים את ה-mp4/jpg ל-Media Library → מקבלים כתובת `4elements.co.il/wp-content/uploads/.../file.mp4`. (זה בשליטתך, חינם, אמין.)
- חלופות חינם: GitHub (raw), Cloudflare R2.

## מגבלות (טוב לדעת)
- Reel עד 90 שניות, MP4/H.264. עד 25 פרסומים/24ש'.
- **מוזיקה:** ה-API לא מאפשר מוזיקת ספרייה של אינסטגרם → **אני מטמיע מוזיקה רויאלטי-פרי בריל** (ffmpeg). נשמע מצוין, בלי בעיות.

## התוצאה
אחרי ההקמה החד-פעמית: **אתה אומר מוצר → אני מייצר, מעלה, ומפרסם לאינסטגרם לבד. חינם. אין צעד ידני.** 🎯
(אותו טוקן/שיטה עובד גם לפייסבוק, וניתן להרחיב לתזמון אוטומטי.)
