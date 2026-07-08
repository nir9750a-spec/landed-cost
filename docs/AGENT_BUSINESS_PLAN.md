# Importly — מערך עבודה: סוכן לניהול עסק יבואן לישראל

מסמך זה הוא תוכנית העבודה השוטפת להפיכת Importly ממחשבון עלות נחיתה
למערכת ניהול מלאה ליבואן, מונחית סוכן חכם. הוא מכסה את ארבעת הנדבכים שנבחרו:

1. **סוכן יועץ יבוא** (בנוי — שלב 1) 🟢
2. **ניהול כספים + חשבוניות**
3. **ניהול מלאי**
4. **חיבור לרו"ח / הנהלת חשבונות (פינבוט)**

> עקרון מנחה: כל נדבך נבנה כ-MVP עובד ומשוחרר בנפרד, מעל התשתית הקיימת
> (React + Supabase + Anthropic proxy), בעברית RTL, "עסקי אך ידידותי".

---

## מצב קיים (מה כבר יש)

| תחום | קיים באפליקציה |
|------|----------------|
| פרויקטים ומוצרים | ✅ `projects`, `products`, שכפול, ריבוי מוצרים |
| עלות נחיתה מלאה | ✅ מנוע `calculations.js` — CIF, מכס, מס קנייה, מע"מ 18%, עמילות, נמל, הובלה |
| מכס ותקינה | ✅ סיווג HS + צו יבוא (`hsClassify`, `siiClassify`), עמוד "תקינה ומכס" |
| מסמכים | ✅ חילוץ AI מחשבוניות/שטרי מטען (`aiExtract`, `bundleExtract`) |
| שילוח | ✅ מעקב מכולות (`shipsgo-track`), שערי שילוח אוטומטיים (Freightos FBX13) |
| מטבע | ✅ שער יציג בנק ישראל (`boi-usd-rate`) + 0.5% |
| ייצוא | ✅ ייצוא לעמיל מכס (`BrokerExport`) ולרו"ח (`AccountantExport`) |
| שיתוף | ✅ פורטל שיתוף מוגן קוד (`/share`) |
| Auth | 🟡 מתוכנן (`AUTH_PLAN.md`), לא מוזג עדיין |
| **סוכן יועץ** | 🟢 **נבנה בשלב זה** (`AdvisorPage`, `advisor.js`) |

---

## נדבך 1 — סוכן יועץ יבוא 🟢 (נבנה)

### מה נבנה
- **`src/lib/advisor.js`** — פרומפט מערכת עם ידע יבוא ישראלי מדויק (מע"מ 18%,
  שער יציג +0.5%, בסיס מע"מ = ערך מכס + מכס + מס קנייה, אינקוטרמס, עמיל מכס,
  תעודות מקור והעדפות מכס, תקינה). בונה הקשר חי מנתוני הפרויקט הפעיל (עלות
  נחיתה, מוצרים, הגדרות) ושולח דרך `anthropic-proxy` הקיים (Sonnet).
- **`src/components/AdvisorPage.js`** — צ'אט RTL, הצעות פתיחה, רינדור Markdown קל,
  מקושר לנתוני הפרויקט הפעיל.
- שולב ב-`Layout` (ניווט "סוכן היבוא") וב-`App` (עמוד `advisor`).

### הרחבות עתידיות לסוכן (שלב 1.1)
- **כלים (tool use)** לסוכן: `get_project`, `list_shipments`, `classify_hs`,
  `estimate_duty`, `create_task` — כדי שיפעל ולא רק ייעץ.
- **חיפוש חי** (web_search דרך ה-proxy) לשער יציג היום / חדשות רגולציה.
- **התראות יזומות** ("המשלוח מגיע בעוד 5 ימים — הכן פקודת מסירה").
- הגבלת קצב per-user (כמו שמצוין ב-`AUTH_PLAN.md`, סעיף AI cost guardrail).

---

## נדבך 2 — ניהול כספים + חשבוניות

### מטרה
לראות לכל פרויקט/משלוח: כמה הוצאתי בפועל, למי אני חייב, כמה הכנסתי, ומה הרווח
האמיתי — מול ההערכה של מנוע עלות הנחיתה.

### סכימת נתונים (Supabase — הצעה)
```sql
-- ספקים ונותני שירות (ספק סיני, משלח, עמיל מכס, מבטח)
create table parties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,                 -- ריבוי־דיירים (Phase B ב-AUTH_PLAN)
  name text not null,
  kind text not null,            -- 'supplier' | 'forwarder' | 'broker' | 'insurer' | 'customer'
  tax_id text, email text, phone text, address text,
  created_at timestamptz default now()
);

-- עלויות בפועל לכל פרויקט/משלוח (מול ההערכה במנוע)
create table expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  project_id uuid references projects(id) on delete cascade,
  party_id uuid references parties(id),
  category text not null,        -- 'goods'|'freight'|'insurance'|'customs'|'purchase_tax'|'vat'|'broker'|'port'|'local_transport'|'other'
  amount numeric not null,
  currency text default 'ILS',
  usd_rate numeric,              -- שער בפועל אם שולם במט"ח
  doc_url text,                  -- קישור למסמך המקור ב-storage
  due_date date, paid_at date,   -- מעקב תשלום / תזרים
  status text default 'open',    -- 'open'|'paid'|'partial'
  created_at timestamptz default now()
);

-- חשבוניות מכירה (הכנסות ללקוחות)
create table sales_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  project_id uuid references projects(id),
  customer_id uuid references parties(id),
  number text,                   -- מספר חשבונית (מהמערכת המנפיקה)
  issued_at date, due_date date,
  subtotal numeric, vat numeric, total numeric,
  currency text default 'ILS',
  external_id text,              -- מזהה ב-Green Invoice / iCount
  status text default 'draft',   -- 'draft'|'issued'|'paid'
  pdf_url text,
  created_at timestamptz default now()
);
create table sales_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references sales_invoices(id) on delete cascade,
  product_id uuid references products(id),
  description text, qty numeric, unit_price numeric, vat_rate numeric default 18
);
```

### UI (עמוד "כספים")
- **Cash-flow לכל פרויקט**: הערכה (ממנוע עלות הנחיתה) מול בפועל (`expenses`),
  כולל דגל חריגה כשההפרש > X%.
- **מה לשלם / למי אני חייב**: לוח `expenses` פתוחים לפי `due_date`.
- **הפקת חשבונית מכירה**: מתוך המוצרים בפרויקט → יוצר `sales_invoices` +
  מנפיק דרך API (ראה נדבך 4).
- הסוכן (נדבך 1) יקבל גישה: "מה הרווח בפועל בפרויקט X?", "אילו תשלומים פתוחים
  השבוע?".

### דגשים
- מע"מ תשומות מקוזז → ברווחיות מציגים "עלות ללא מע"מ" בנוסף ל"תזרים כולל מע"מ".
- חילוץ AI קיים (`aiExtract`) יזין `expenses` אוטומטית מחשבונית ספק/עמיל.

---

## נדבך 3 — ניהול מלאי

### מטרה
לדעת מה יש במלאי, מה בדרך, מה נגמר — ומה **עלות המלאי לפי עלות נחיתה** (לא לפי
FOB), כדי לתמחר ולחשב רווח נכון.

### סכימת נתונים (הצעה)
```sql
-- פריט־על (SKU) שחוצה פרויקטים; מוצר בפרויקט מקושר אליו
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  sku text, name text, barcode text,
  reorder_point numeric default 0,
  created_at timestamptz default now()
);

-- תנועות מלאי (כניסה ממשלוח, מכירה, התאמה)
create table stock_moves (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  item_id uuid references inventory_items(id) on delete cascade,
  project_id uuid references projects(id),
  kind text not null,            -- 'inbound'|'sale'|'adjustment'|'return'
  qty numeric not null,          -- חיובי לכניסה, שלילי ליציאה
  unit_landed_cost numeric,      -- עלות נחיתה ליחידה בזמן הכניסה (ILS)
  moved_at timestamptz default now(),
  ref text                       -- מס' משלוח / חשבונית / הערה
);
-- מלאי נוכחי ועלות ממוצעת = view מצטבר על stock_moves
```

### UI (עמוד "מלאי")
- טבלת מלאי: כמות נוכחית, כמות בדרך (ממשלוחים פתוחים), **עלות נחיתה ממוצעת**,
  נקודת הזמנה מחדש + התראה.
- כניסה אוטומטית: כשמשלוח מסומן "נחת/שוחרר" → יצירת `stock_moves` מסוג `inbound`
  עם `unit_landed_cost` מהמנוע.
- ירידה אוטומטית: חשבונית מכירה (נדבך 2) → `stock_moves` מסוג `sale`.
- הסוכן: "אילו מוצרים מתחת לנקודת הזמנה?", "כמה מלאי שווה לי היום בעלות נחיתה?".

---

## נדבך 4 — חיבור לרו"ח / הנהלת חשבונות (פינבוט)

### עובדה חשובה על פינבוט (FinBot)
פינבוט היא תוכנת הנה"ח לרואי חשבון/יועצי מס. ה-API שלה **מייבא נתונים** ממערכות
הנפקה חיצוניות — ונכון להיום התיעוד מציין תמיכה ב**חשבונית ירוקה (Green Invoice)
וב-iCount**. כלומר פינבוט *מושכת* מסמכים; היא אינה נקודת ה*הזנה* הישירה שלנו.

**המשמעות לארכיטקטורה:** Importly לא "דוחפת" ישירות לפינבוט. במקום זה:

```
Importly  ──הפקה──►  Green Invoice / iCount  ──API pull──►  פינבוט (הרו"ח)
   │
   └──ייצוא קובץ (מבנה אחיד / פקודות יומן / Excel)  ──►  ייבוא ידני ע"י הרו"ח
```

### נתיב A — הנפקה דרך Green Invoice / iCount (מומלץ)
- הוסף מודול הנפקה: כשמפיקים `sales_invoices` (נדבך 2), קורא ל-API של
  **Green Invoice** (`/api/v1/documents`) או **iCount** ליצירת חשבונית/קבלה
  אמיתית, שומר `external_id` + `pdf_url`.
- הרו"ח בפינבוט מגדיר "ייבוא מסמכים באמצעות API" מאותה מערכת → הכול זורם אליו
  אוטומטית, בלי הקלדה.
- מימוש: Edge Function `issue-invoice` (שומר את מפתחות ה-API בצד שרת, כמו
  `anthropic-proxy`), עם allow-list של ספקי הנפקה.

### נתיב B — ייצוא קובץ לרו"ח (גיבוי / למי שלא על API)
- הרחב את `AccountantExport` הקיים לייצוא **פקודות יומן** ו/או **מבנה אחיד**
  (קובץ INI/BKMVDATA לפי דרישות רשות המסים) ו/או Excel לפי תבנית הרו"ח.
- שימושי כשהרו"ח עובד עם חשבשבת/ריווחית/Priority (ייבוא קבצים, לא API).

### מה צריך מהמשתמש כדי לממש
1. באיזו מערכת הנפקה תשתמש בפועל — **Green Invoice** או **iCount**? (זו נקודת
   החיבור לפינבוט).
2. מפתחות API של אותה מערכת (יישמרו כ-Supabase secret).
3. אישור מהרו"ח שפינבוט מוגדרת למשוך מאותה מערכת.

---

## מפת דרכים מוצעת (סדר ביצוע)

| שלב | תוצר | תלות |
|-----|------|------|
| **0** | 🟢 סוכן יועץ יבוא (בסיסי) | הושלם |
| **1** | Auth + ריבוי דיירים (מיזוג `AUTH_PLAN` Phase A) | קדימות — לפני נתונים כספיים אמיתיים |
| **2** | כספים: `parties`, `expenses` + עמוד "כספים" (בפועל מול הערכה) | Auth |
| **3** | הנפקת חשבוניות + חיבור Green Invoice/iCount (→ פינבוט) | כספים |
| **4** | מלאי: `inventory_items`, `stock_moves` + עמוד "מלאי" | כספים |
| **5** | הפעלת כלים לסוכן (tool use) על כספים/מלאי/משלוחים | 2–4 |
| **6** | התראות יזומות + לוח משימות יבואן שוטף | 5 |

---

## מקורות מידע (למשוך אינפורמציה)

- **שערי מטבע**: בנק ישראל (`boi-usd-rate`) — קיים.
- **שערי שילוח**: Freightos FBX13 (`freight-rates-fetch`) — קיים; להוסיף LCL/Air אוטומטי.
- **מעקב מכולות**: ShipsGo (`shipsgo-track`) — קיים.
- **מכס וסיווג**: מחשבון מיסי יבוא רשות המסים + "שער עולמי" (סיווג/שיעור מדויק).
- **תקינה**: מכון התקנים / צו יבוא חופשי — קיים חלקית (`siiClassify`).
- **הנפקה + הנה"ח**: Green Invoice API / iCount API → פינבוט.
- **מודיעין מוצרים**: `seasonal-agent` (Claude + web_search) — קיים.

---

### קבצים שנוספו בשלב זה
- `src/lib/advisor.js` — לוגיקת הסוכן + פרומפט הידע.
- `src/components/AdvisorPage.js` — ממשק הצ'אט.
- שינויים: `src/App.js`, `src/components/Layout.js`, `src/index.css`.
