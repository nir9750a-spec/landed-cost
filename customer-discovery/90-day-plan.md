# Importly — תוכנית 90 ימים משולבת

**מבוסס על:** 4 שלבי מחקר שהושלמו ב-28/05/2026 (מודל עלות AI, אסטרטגיה, שוק ישראלי, תעשיית 4x4) + Rivhit API scope + פוליש audit.

**הנחת יסוד:** Importly הוא lifestyle SaaS שמסבסד את 4Elements ובונה לניר פלטפורמה ציבורית בקהילת היבואנים. **ARR ceiling realistic ב-3 שנים: $150-300K.** לא venture-scale, ולא צריך להיות.

---

## חודש 1 — אימות לקוחות + פוליש לסגירת עסקה ראשונה

### שבוע 1 (29/05–04/06): TALK, DON'T BUILD

**ניר עושה:**
- [ ] 20 שיחות טלפון עם יבואנים. סקריפט ב-`call-script.md`. תיעוד ב-`call-tracker.csv`.
- [ ] 3 סרטוני YouTube ירוקי-עץ בעברית (60 דקות הקלטה לכל אחד):
  1. "איך הפסדתי 40,000 ₪ על המכולה הראשונה"
  2. "ככה אני בודק ספק סיני ב-5 דקות (2026)"
  3. "בניתי מחשבון עלות נחיתה לעצמי — ועכשיו אני נותן אותו"
- [ ] רישום ל-Rivhit test account + בקשת dev credentials מ-`sales@rivhit.co.il`
- [ ] להזמין Yochay לקפה ולסכם את העברת הסמכות ב-4Elements

**אני עושה ברקע:**
- [x] Audit פוליש מקיף (אקדים את הממצאים)
- [x] תיקוני brand + lead form (committed: 4be2b4b)
- [ ] Demo project seeding למבקרים אנונימיים
- [ ] החלפת alert/window.confirm במודאל מעוצב (~3h)
- [ ] תיקון Mobile dashboard (~3h)
- [ ] Daily scheduled agent — עדכון prompt לפוליש + Rivhit prep

**מדד הצלחה לשבוע 1:**
- 20 שיחות מתועדות
- 3 סרטונים הוקלטו (לא בהכרח פורסמו)
- בקשה ל-Rivhit dev access נשלחה

### שבוע 2 (05/06–11/06): VALIDATE WITH MONEY

**ניר עושה:**
- [ ] הוסף ל-`landing-page.html` 4 צילומי מסך אמיתיים מהאפליקציה
- [ ] עלה landing-page.html ל-Vercel תחת `importly.co.il` (או `landing.nir-sigma-liard.vercel.app`)
- [ ] שלח את הלינק ל-20 המרואיינים מהשבוע הקודם
- [ ] חיוב שנתי upfront עם 50% הנחה — אם אפס לוחצים על "קבל גישה" → המוצר לא מוצר
- [ ] פרסם סרטון YouTube ראשון, פוסט קצר בקבוצת `עמילות מכס - יבוא ויצוא`

**אני עושה ברקע:**
- [ ] Schema/אבטחה ל-`waitlist` (rate-limiting, email validation)
- [ ] Onboarding flow ראשוני: signup → demo project → first calculation
- [ ] Plausible Analytics setup: 1 קוד גם ל-landing וגם לאפליקציה הראשית
- [ ] תחקיר ראשוני ל-Hashavshevet WizCloud API

**מדד הצלחה לשבוע 2:**
- 3+ leads ב-`waitlist` table
- 1+ "פרסום ראשי" (כסף ביד או חתימה)
- 100+ צפיות בסרטון הראשון

### שבוע 3 (12/06–18/06): PICK THE PATH

**Decision tree (קצרה אכזרית):**
- **פחות מ-5 משלמים:** סגור מסך פרסום ציבורי. Importly הופך לכלי פנימי ל-4Elements + 2-3 חברים. חזור ל-4Elements.
- **5-15 משלמים:** המשך אבל **הקפא פיצ'רים חדשים**. מקד את כל הזמן ב-retention + Rivhit integration spike (שבוע אחד).
- **15+ משלמים:** אות יוצא דופן. בחן את **ערוץ רואי החשבון** — חבר Rivhit לפני כל דבר אחר. ייתכן שהקונה האמיתי הוא רואה החשבון.

**ניר עושה:**
- [ ] קבע פגישה עם 2 רואי חשבון של יבואנים — לא להציע מוצר, לשמוע על השוק שלהם
- [ ] תחקיר Rivhit POC: לפי תוצאות שבוע 2 — להחליט אם להתחיל ל-build את Rivhit integration

**אני עושה:**
- [ ] **Rivhit spike** (אם החליט שזה הכיוון): Document.NewExtended endpoint, prototype נגד test env, מאמץ של 5 ימים ל-MVP

### שבוע 4 (19/06–25/06): KILL OR COMMIT

**מדדי החלטה סופית:**

| מדד | פעולה |
|---|---|
| 0-4 משלמים פעילים | **Kill** — Importly הופך לכלי פנימי |
| 5-9 משלמים, churn אפס | **Hold** — freeze features, focus on retention 90 ימים |
| 10-19 משלמים, churn אפס | **Commit Light** — Rivhit MVP + 1 hire (VA לתמיכת לקוחות) |
| 20+ משלמים | **Commit Hard** — דרך השקעה ראשונית בסביבות 30-50K ₪ ל-Rivhit + תוכן |

---

## חודשים 2-3 — Rivhit Moat או Lifestyle Mode

### תרחיש A: Commit ל-Rivhit (אם 10+ משלמים בסוף חודש 1)

**יוני (חודש 2):**
- Rivhit integration MVP — 5 שבועות לפי scope research
  - שבוע 1: prototype Document.NewExtended + Accounting.AddJournal
  - שבוע 2: `rivhit_connections` table + Vercel functions לauth/refresh
  - שבוע 3: React "Connect Rivhit" modal + sort-code mapping UI
  - שבוע 4: mapping shipment→journal + Push to Rivhit button
  - שבוע 5: Pilot עם 3 לקוחות אמיתיים
- 1 חודש של תוכן (12 פוסטים מתוכננים מראש)

**יולי (חודש 3):**
- Launch Pro tier (199 ₪) — חיבור Rivhit
- מעבר מ-Sonnet ל-Haiku-first על free tier (לחיסכון של ~67% בעלויות AI)
- Plausible review ראשון — איזה פוסט הביא 80% מההרשמות?
- Hashavshevet WizCloud spike (week 11) — Phase 2 prep

### תרחיש B: Lifestyle Mode (אם 5-9 משלמים)

**יוני-יולי:**
- אפס פיצ'רים חדשים
- 3 פוסטים בשבוע (לפי 90-day content calendar במחקר #4)
- Office hours שבועיים ב-Zoom ל-paying users (45 דקות, יום שלישי 9:00)
- 4Elements pivot upmarket — מתחיל למפות SKUs להפסקה (כל מה שמתחת ל-$200)

### תרחיש C: Kill (אם 0-4 משלמים)

- Importly נשאר online ככלי פנימי ל-4Elements
- ניר חוזר ב-100% ל-4Elements pivot upmarket
- האפליקציה ממשיכה להתפתח דרך הסוכן היומי בלבד, אך אין יותר זמן אישי
- חזרה לבדיקה אחרי 6 חודשים — לראות אם השוק התעורר

---

## עמודי תווך תפעוליים (כל התרחישים)

### עלויות AI ניהול

| תקופה | התקציב המקסימלי | טריגר אזעקה |
|---|---|---|
| חודש 1 (10 free users avg) | $50/חודש | $80 |
| חודש 2 (50 free + 10 paid) | $150/חודש | $250 |
| חודש 3 (100 free + 30 paid) | $400/חודש | $700 |

**Hard limits ב-code:**
- Free tier: 2 shipments/חודש, Haiku-only, 10MB max per file
- Paid tier: 50 shipments/חודש, Sonnet default, 50MB max
- Pro tier: ללא הגבלה, Opus fallback למסמכים אמביגויים

### תפוצה (כל התרחישים)

- **3 פוסטים בשבוע** באחת מ-3 קבוצות הפייסבוק (rotate)
- **1 פוסט בשבוע** לינקדאין (Nir's profile)
- **1 סרטון YouTube** כל שבועיים
- **0 פוסטים ב-AliBuy top-level** — רק תגובות עם 20:1 give-to-take ratio
- **DM outreach:** 5 רואי חשבון של יבואנים בחודש

### תחזוקה (אני אחראי)

- **Daily routine** (08:00 IST): polish audit + Rivhit prep + מעקב error logs
- **Weekly digest** (יום ראשון): summary של מה נעשה השבוע, מה ההמלצות לבא
- **Monthly research refresh** (1 בחודש): re-check Rivhit API stability, AI costs, competitor moves

---

## אנטי-תבניות — מה לא לעשות

1. **לא לתרגם UI לאנגלית עד שיש 50+ משתמשים בעברית** — Hebrew-first או quit. חצי-מידה מפסידה בשני השווקים.
2. **לא לחפש מימון VC** — זה lifestyle business, pitch בזבוז 3 חודשים.
3. **לא להציע אינטגרציה ל-Cin7/Zoho/NetSuite** — הלקוח שלך לא משתמש שם.
4. **לא להוסיף inventory management ב-Q3** — מוצר אחר, קונה אחר. נקודה.
5. **לא להאמין ל-"אני אקנה" עד שראית כרטיס אשראי**.

---

## מקורות

- Strategic attack research (28/05/2026)
- AI cost economics research (28/05/2026)
- Israeli market & competitive research (28/05/2026)
- Israeli auto accessories research (28/05/2026)
- Rivhit API integration scope (28/05/2026)
- App polish & UX audit (28/05/2026)
- Content & community strategy (28/05/2026)
