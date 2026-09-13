# 📊 STATUS — סטטוס נדבכים ומה נשאר

עדכני ל-2026-09. הפירוט המלא: `docs/AGENT_BUSINESS_PLAN.md`.

## 4 הנדבכים

| נדבך | מצב | קבצים עיקריים | הפעלה |
|------|-----|----------------|-------|
| 1. **סוכן היבוא** (צ'אט AI) | 🟢 עובד | `src/lib/advisor.js`, `src/components/AdvisorPage.js` | דורש `ANTHROPIC_API_KEY` |
| 2. **כספים** (הוצאות מול הערכה) | 🟢 עובד | `src/lib/finance.js`, `src/components/FinancePage.js` | הרץ `20260711_finance.sql` |
| 3. **מלאי** (עלות נחיתה) | 🟢 עובד | `src/lib/inventory.js`, `src/components/InventoryPage.js` | הרץ `20260712_inventory.sql` |
| 4. **פינבוט** (הפקת חשבוניות) | 🟡 סקפולד | `src/lib/finbot.js`, `supabase/functions/finbot-issue-income/` | חסר endpoint (למטה) |

## מה נשאר לסגור את נדבך 4 (פינבוט)

חסרים 2 פרטים מדף התיעוד של פינבוט (פתח בדפדפן):
**https://finbot.helpjuice.com/he_IL/api-docs-create-income**

1. **כתובת ה-endpoint** של הפקת מסמך (POST URL).
2. **דוגמת בקשה (JSON)** — כדי לוודא שמות שדות וקודי סוגי מסמכים.

ואז: להתאים את `buildFinbotPayload()` ב-`src/lib/finbot.js`, להגדיר סודות
(SECRETS.md), ולהוסיף כפתור "הפק חשבונית" במסך הכספים.

## שיפורים עתידיים מתוכננים (לא חוסמים)

- קליטת מלאי אוטומטית ממשלוח שסומן "שוחרר".
- ירידת מלאי אוטומטית מחשבונית מכירה.
- הזנת הוצאות אוטומטית מחילוץ ה-AI של מסמכים.
- כלים לסוכן (tool use) — שיפעל בעצמו, לא רק ייעץ.
- מיזוג התחברות משתמשים (`AUTH_PLAN.md`).
