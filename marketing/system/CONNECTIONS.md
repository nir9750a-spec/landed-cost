# 🔌 CONNECTIONS — כל החיבורים של הרשתות החברתיות (4Elements)

> מסמך העברה (handoff) לסשן Code אחר. כאן כל מה שצריך כדי לסדר/לנהל את החיבורים ולפרסם.
> עודכן: 2026-08-13. חשבון: nir9750a@gmail.com · מותג: 4Elements (@4elements.il · 4elements.co.il · 052-891-3135)

---

## 📦 GitHub (מקור אמת + אחסון מדיה לפרסום)
- **Repo:** `nir9750a-spec/landed-cost`
- **ענף עבודה:** `claude/daily-conversation-connection-n8ezyf`
- קבצי המערכת: `marketing/system/` · מקורות מודעות: `marketing/ad-sources/`
- **טריק אחסון מדיה (חשוב!):**
  - **Meta (IG/FB)** מקבל רק **GitHub raw**: `https://raw.githubusercontent.com/nir9750a-spec/landed-cost/<SHA>/<path>.mp4`
  - **TikTok/Higgsfield** דוחים raw (octet-stream) → צריך **jsDelivr**: `https://cdn.jsdelivr.net/gh/nir9750a-spec/landed-cost@<SHA>/<path>.mp4`

---

## 🟦 Make (Integromat) — מנוע הפרסום ל-Instagram + Facebook
- **Team ID:** `1499942` · **Org ID:** `7334275` · Author: ניר ולנסיה (`7613647`)

### חיבור Meta (פעיל)
- **Connection ID:** `9617477` — Facebook OAuth (11 scopes) · uid `10243432065914351`
- **תוקף:** `2026-10-07` ⚠️ (לחדש לפני התאריך אחרת הפרסום ייפול)
- מחובר לשני התרחישים למטה.
- (חיבורי Facebook כפולים ישנים: `9616936`, `9616951` — לא בשימוש, אפשר להתעלם/למחוק)
- **חשבון אינסטגרם:** `17841477773982301` (@4elements.il)
- **עמוד פייסבוק:** `1355675404284855`

### תרחישים (Scenarios)
| Scenario ID | תפקיד | מודולים |
|---|---|---|
| **6903724** | **Reel Publisher** (וידאו) | Queue `video_url` → IG CreateAReelPost + FB uploadAReel |
| **6869166** | **Photo Publisher** (תמונה) | Queue `image_url` → IG CreatePostPhoto + FB CreatePostWithPhotos |
| 5375904 | Gemini Image Generator (עזר) | משתמש בחיבור Gemini `6935505` |

### 🗄️ תור פרסום (Data Store)
- **Data Store ID:** `159437`
- שדות: `image_url`, `video_url`, `caption`, `product_id`
- זרימה: יוצרים רשומה → מריצים את התרחיש המתאים → התרחיש קורא מהתור, מפרסם, ומוחק את הרשומה.

### ⚠️ אילוץ קריטי — תרחיש פעיל אחד בלבד (תוכנית חינם)
רק **תרחיש אחד** יכול להיות פעיל בו-זמנית. לפני הרצה:
- **רילס:** `scenarios_deactivate(6869166)` → `scenarios_activate(6903724)` → run.
- **תמונה:** `scenarios_deactivate(6903724)` → `scenarios_activate(6869166)` → run.
- ⏱️ רילס מעלה לאט (~70ש') — ריצה responsive עלולה להחזיר 502. **אל תריץ שוב!** בדוק ב-`executions_list(status:1)` שיש END עם `operations:4`, או ש-`data-store-records_list(159437)` ריק (הרשומה נצרכה = הצלחה).

---

## 🎵 TikTok — דרך Higgsfield (לא דרך Make!)
- **Connector ID:** `a8e869f3-5860-4267-9389-b1fdc60bdcbc` — @4elements · status **active** · חובר 2026-08-12
- ניהול: `tiktok_accounts` (רשימה) · `tiktok_reconnect` (אם status=error) · `tiktok_connect` (חדש)
- **זרימת פרסום (DIRECT_POST):**
  1. `media_import_url(<jsDelivr URL>)` → מחזיר `media_id`. ה-URL המתארח: `https://d2ol7oe51mr4n9.cloudfront.net/user_3GfsjjjORLwMK160OnBIVevQLMI/<media_id>.mp4`
  2. `tiktok_music_trending(connector_id, country_code:"IL", genre:"POP"/"CHILL_BEATS"...)` → בחר `song_clip_id`
  3. `tiktok_prepare_publish(video_url=<cloudfront URL>, mode:DIRECT_POST, media_type:VIDEO, title)` → `publish_session_id`
  4. `tiktok_publish(publish_session_id, music_sound_id, music_sound_volume:100, video_original_sound_volume:0, privacy_level:PUBLIC_TO_EVERYONE, commercial_content_disclosure{enabled:true,your_brand:true,branded_content:false}, כל ה-required_confirmations=true)` → `publish_id`
  5. `tiktok_publish_status(publish_id)` עד `PUBLISH_COMPLETE`
- מגבלות TikTok: וידאו MP4, 3–600ש', ≥360px, 23–60fps. מכסה: 5/דקה, 13/24ש'.

---

## 🎬 Higgsfield — יצירת מדיה + חיבור TikTok
- מנוי מחודש (~3000 קרדיטים). Workspace user prefix: `user_3GfsjjjORLwMK160OnBIVevQLMI`
- CDN: `d2ol7oe51mr4n9.cloudfront.net`
- כלים: `generate_image` (nano_banana_pro), `generate_video` (kling), `virality_predictor` (חינם), `tiktok_*`.
- ⚠️ **פלט Higgsfield/cloudfront לא ניתן להורדה לסביבה שלנו** (proxy חוסם). לכן לקומפוזיט טקסט עברי: המשתמש מוריד מהאפליקציה ומעלה לצ׳אט, או משתמשים בצילום אמיתי + קומפוזיט מקומי (ffmpeg).
- ⚠️ Higgsfield **לא מרנדר עברית** אמין (מְשַׁבֵּשׁ) ו**לא מייצר מוזיקה עצמאית** (רק דיבור). מוזיקה = פס-קול מקומי או טרנד TikTok.

---

## 🎨 Canva (גרפיקה)
- Brand Kit: `kAG1m59wd2o` ("ניר"). כלים: `generate-design`, `export-design`, `upload-asset-from-url`.

---

## ✅ סיכום סטטוס חיבורים
| רשת | מחובר דרך | סטטוס | חשבון/ID |
|---|---|---|---|
| Instagram | Make (Meta conn 9617477) | ✅ פעיל | 17841477773982301 (@4elements.il) |
| Facebook | Make (Meta conn 9617477) | ✅ פעיל (תוקף 2026-10-07) | Page 1355675404284855 |
| TikTok | Higgsfield connector | ✅ פעיל | a8e869f3-...-b1fdc60bdcbc (@4elements) |
| (יצירה) Gemini | Make conn 6935505 | ✅ | scenario 5375904 |
| (יצירה) Higgsfield | MCP | ✅ | credits ~3000 |
| (גרפיקה) Canva | MCP | ✅ | brand kit kAG1m59wd2o |

**לא מחובר / לאין להוסיף בעתיד:** YouTube Shorts, Pinterest, Google Business — עדיין לא. TikTok אינו דרך Make אלא רק דרך Higgsfield.

---

## 📄 קבצים קשורים
- `RUNBOOK.md` — נהלי פרסום יומיים (MODE A/R/T)
- `LEARNINGS.md` — כללי קריאייטיב + אזור-בטוח + מה שאסור
- `rotation-state.json` — רוטציית מוצרים · `product-profiles.json` — הוקים/מחירים
- `performance-log.md` — מה פורסם ומתי
