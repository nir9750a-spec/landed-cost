# 🧭 4Elements — מנוע פרסום־AI · תמצית שיחה והמשך (Handoff)

תאריך: 2026-08-15 · לפתיחת שיחה חדשה: תן ל־Claude לקרוא את הקובץ הזה. (הזיכרון האוטומטי — `MEMORY.md` + קבצי `marketing_*.md` — נטען גם לבד בכל שיחה.)

---

## מה בנינו (בקצרה)
**מנוע פרסום־AI אוטונומי** ל־4Elements (ניר ויוחאי · ציוד קמפינג/4x4 סין→ישראל). כל בוקר הוא מייצר מודעת מוצר עם **הפנים של ניר (אווטאר NIR)** על **תמונות מוצר אמיתיות** (דרך Higgsfield), בעברית לשוק הישראלי; שולח לניר **כרטיס אישור בטלגרם**; ובלחיצה אחת מפרסם ל**אינסטגרם + פייסבוק + טיקטוק** ומכין נכס ל**וואטסאפ**. עלות: **~2 קרדיט (≈2 סנט) למודעה** — מה שסוכנויות גובות עליו אלפי דולרים.

## סטטוס חי (2026-08-15)
- ✅ טבלת `ad_jobs` חיה ב־Supabase (פרויקט `eginihtpqahpejnkqznn`) — הותקנה דרך ה־SQL Editor.
- ✅ בוט טלגרם **@elements4_approve_bot** פעיל (שער אישור: ✅ אשר · 🔄 נסה שוב · ❌ דחה).
- ✅ ערוץ WhatsApp **@4ELEMENTS.11** נוצר.
- ✅ **פרסום רב־ערוצי ראשון בוצע:** combo2 (שולחן שחור + 4 כיסאות, ₪345) חי ב־IG @4elements.il, בפייסבוק, ובטיקטוק @4elements (עם סאונד טרנדי).
- ✅ **שתי משימות מתוזמנות פעילות** (רצות בתוך אפליקציית Claude כשהיא פתוחה):
  - `4elements-daily-ad` — כל יום **09:00**: מייצר מוצר → כרטיס אישור בטלגרם.
  - `4elements-daily-publish` — כל יום **20:00**: מפרסם מאושרים לכל הערוצים.
  - ⚠️ ללחוץ **"Run now"** פעם אחת על כל משימה (סרגל "Scheduled") כדי לאשר מראש את הכלים.

## הקוד (הכל ב־`ads/`)
| קובץ | תפקיד |
|---|---|
| `make_ad.py` | מרכיב מודעה (רקע → לוגו+כותרת+מחיר+CTA בעברית RTL) |
| `make_ad_master.py` | **תבנית־אם**: `render_from_sku(sku, scene)` → פיד 4:5 + רילס 9:16 + קופי; `render_and_enqueue`; `build_caption`. קורא `product-profiles.json` |
| `variants.py` | מטריצת 3×3×3 (הוק×סצנה×פורמט = 27 ממוצר) + UTM |
| `utm.py` | קישורים מתויגים (`utm_content={angle}_{format}_{variant}`) |
| `ad_queue.py` | לקוח REST ל־`ad_jobs`. צריך `SUPABASE_SERVICE_KEY` = **service_role legacy (מתחיל `eyJ`)** — לא sb_secret/sb_publishable (הם נחסמים ב־RLS 42501) |
| `publish.py` | מתכנן פרסום רב־ערוצי (Make ig/fb · Higgsfield TikTok · WhatsApp handoff) |
| `telegram_gate.py` | שער אישור: `send_for_approval`, `handle_updates`, `send_whatsapp_handoff` |
| `supervisor.py` | הסוכן־על: `pick_today` (רוטציה), `build_spec`, `run` |
| `_env.py` | טוען סודות מ־`ads/.env` (gitignored) |
| `PUBLISH-RUNBOOK.md` · `BUILD-NEXT.md` | נהלים ודרישות |
| `../supabase/migrations/20260815_ad_jobs.sql` | המיגרציה (הורצה) |
| `../catalog/heroes/<SKU>.jpg` | תמונות מוצר |

## סודות (ב־`ads/.env` — gitignored, לעולם לא לגיט)
`SUPABASE_SERVICE_KEY` (service_role, eyJ…) · `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` (מזוהה אוטומטית). הסודות נטענים ע"י `_env.py`; העוזר לא רואה אותם.

## חיבורים ומזהים
- **Supabase:** פרויקט `eginihtpqahpejnkqznn` · טבלה `ad_jobs`. (תוכנית חינמית → משהה אחרי ~שבוע; להעיר ב־Resume.)
- **Make** (team `1499942`): Data Store `159437`; תרחיש תמונה `6869166`; תרחיש רילס `6903724`; חיבור Meta `9617477` (תוקף 2026-10-07). IG `17841477773982301` (@4elements.il) · עמוד FB `1355675404284855`. חינמי → רק תרחיש אחד פעיל בו־זמנית.
- **TikTok:** connector של Higgsfield `a8e869f3-5860-4267-9389-b1fdc60bdcbc` (@4elements).
- **Higgsfield:** MCP · אווטאר NIR (רפרנס תמונה): `https://d2ol7oe51mr4n9.cloudfront.net/user_3GfsjjjORLwMK160OnBIVevQLMI/74798df6-4c44-496e-a4ea-7b406a1dec72.jpg`.
- **WhatsApp Channel** @4ELEMENTS.11 — פרסום ידני (אין API).
- מותג: לוגו+צבעים ב־`product-profiles.json`; אתר WordPress+WooCommerce (`4elements.co.il`) — **בלי Pixel/מדידה מותקנים**.

## הושלם / נשאר
**הושלם:** מנוע יצירה · תור · שער אישור טלגרם · גשר פרסום רב־ערוצי · וריאציות 3×3×3+UTM · סוכן־על · אוטומציה יומית · פרסום חי ראשון.
**נשאר / כשתרצה:**
- **Pixel + CAPI** (בתשלום) — רק כשעוברים לפרסום ממומן (פלאגין Facebook-for-WooCommerce, צריך גישת wp-admin).
- **סוכן אנליטיקה** (לנקד איזה הוק/סצנה/פורמט מוכר) — דורש גישת Insights.
- **זריעת יוצרים** — לשלוח ציוד ל־20-30 יוצרים קטנים (המנוף החינמי הבא).
- **מדידה חינמית** כבר עובדת: UTM בכל קישור + "איך שמעת עלינו?" בהזמנות וואטסאפ.

## אסטרטגיה (העיקר)
- 🇮🇱 ישראל = **וואטסאפ־פירסט** (99%), אינסטגרם חזק (82%), **טיקטוק בירידה** — כל פוסט מפנה לערוץ הוואטסאפ.
- 💸 **בלי תקציב עכשiv → 100% אורגני.** המנופים החינמיים: עקביות + נפח, סאונד טרנדי, ערוץ וואטסאפ, זריעת יוצרים.
- ⚖️ שער אישור אנושי לפני כל פרסום (הלחיצה בטלגרם = ההסכמה). וואטסאפ־קר אסור (חוק הספאם ₪1,000/הודעה).
- 📊 בלואופרינטים: [ארכיטקטורת סוכנים](https://claude.ai/code/artifact/07c8a12c-a579-40d9-a826-f6f9a2aeb068) · [בלואופרינט פיתוח](https://claude.ai/code/artifact/be5bb790-c15c-475b-9a1c-501b6df468a9).

## איך ממשיכים (שיחה חדשה)
- הזיכרון נטען לבד. לקרוא גם את הקובץ הזה.
- **הרצה ידנית של יום:** `cd ads && python -c "import supervisor; print([p['id'] for p in supervisor.pick_today(1)])"` → לייצר סצנה ב־Higgsfield (NIR + `catalog/heroes/<SKU>.jpg`) → `supervisor.run({'<SKU>':'workspace/scenes/<SKU>_scene.png'})`.
- **לפרסם מאושר:** ראה `PUBLISH-RUNBOOK.md`.
- משימות מתוזמנות: סרגל "Scheduled".

---

## 🔄 עדכון אחרון (2026-08-16, 21:50)
- ✅ **תוקן קבוע:** `TELEGRAM_CHAT_ID=1669582702` ב־`ads/.env` (קודם היה placeholder → שליחת הטלגרם נכשלה, וזה גם הפיל את משימת הבוקר).
- ⚠️ **מגבלה מרכזית שהתגלתה:** המשימות המתוזמנות רצות **רק כשאפליקציית Claude פתוחה** בשעה שנקבעה. ב־16.8 הן לא רצו (האפליקציה הייתה סגורה ב־09:00/20:00). 3 אפשרויות: (1) להשאיר אפליקציה פתוחה סביב 09:00+20:00; (2) קצב חצי־אוטומטי — ניר אומר "יאללה יומי" ו־Claude מריץ הכל; (3) בנייה headless בעתיד (Higgsfield CLI + Make webhook) שתרוץ בלי האפליקציה.
- **תור נוכחי:** `YF-YZ-13` (₪220) + `YF-YZ-04` (₪199) = `pending_approval` · `combo2` = `published`. רוטציה served: YF-YZ-04 (15.8), YF-YZ-13 (16.8).
- **באג ידוע:** לפעמים לחיצת כפתור בטלגרם לא נקלטת ע"י `handle_updates` (תזמון getUpdates). אם עבודה נשארת `pending_approval` אחרי שניר אישר — לאשר ידנית: `python -c "import ad_queue as q; q.approve('<job_id>')"`.

## ▶️ קצב יומי ידני (הכי אמין כרגע)
בשיחה חדשה תגיד "יאללה יומי" ו־Claude יריץ:
1. `cd ads && python -c "import supervisor as s,json; p=s.pick_today(1)[0]; print(json.dumps(p,ensure_ascii=False))"` → מוצר היום.
2. Higgsfield: media_import_url של אווטאר NIR + media_upload של `catalog/heroes/<SKU>.jpg` → `generate_image` nano_banana_pro (2 רפרנסים, סצנת המוצר, שעת זהב) → הורדה ל־`ads/workspace/scenes/<SKU>_scene.png`.
3. `python -c "import supervisor; supervisor.run({'<SKU>':'workspace/scenes/<SKU>_scene.png'}, slot='07:00')"` → מרנדר + תור + כרטיס טלגרם.
4. ניר לוחץ ✅ בטלגרם.
5. פרסום: `python -c "import telegram_gate as T; T.handle_updates(once=True)"` (לקלוט אישור) → publish לפי `PUBLISH-RUNBOOK.md` (host → Make photo 6869166 → TikTok Higgsfield → WhatsApp handoff) → `ad_queue.update_job(id, status='published')`.

**היסטוריית פרסום:** combo2 פורסם חי (16.8) ל־IG @4elements.il + FB + TikTok @4elements (סאונד טרנדי) + נכס לוואטסאפ.
