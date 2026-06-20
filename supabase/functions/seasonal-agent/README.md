# seasonal-agent — סוכן מוצרים עונתיים

פונקציית Edge עצמאית שמוצאת את המוצרים החמים/נמכרים ביותר לייבוא לעונה הקרובה,
באמצעות Claude + כלי `web_search` (חיפוש אינטרנט חי).

עצמאית לחלוטין מהאפליקציה הראשית — CORS משלה, מודל משלה, prompt משלה.
משתפת רק את הסוד `ANTHROPIC_API_KEY` שכבר מוגדר ב-Supabase.

## קלט (POST JSON)

```json
{
  "market": "ישראל",
  "category": "מטבח",        // אופציונלי
  "audience": "בעלי כלבים",  // אופציונלי
  "count": 8,                  // 3–15
  "date": "2026-06-20",        // ברירת מחדל: היום
  "language": "Hebrew"
}
```

## פלט

```json
{
  "result": {
    "as_of_date": "...",
    "market": "...",
    "upcoming_season": "...",
    "order_window": "...",
    "ideas": [ { "name": "...", "demand": "high", "competition": "low", "sources": ["..."], ... } ],
    "notes": "..."
  },
  "usage": { ... }
}
```

## פריסה

```bash
supabase functions deploy seasonal-agent
```

הסוד `ANTHROPIC_API_KEY` כבר מוגדר (משותף עם anthropic-proxy). אין צורך להגדיר מחדש.

## ממשק

הדף העצמאי נמצא ב-`public/seasonal-agent.html`. לאחר פריסה הוא זמין ב:
`https://<your-domain>/seasonal-agent.html` (וגם מקומית ב-`localhost:3000/seasonal-agent.html`).

## הערות

- המודל: `claude-sonnet-4-6` (איזון עלות/איכות לחיפוש חוזר). ניתן לשנות ב-`index.ts`.
- `web_search` מבצע עד 6 חיפושים לכל קריאה; הלולאה רצה בצד השרת של Anthropic — קריאה אחת מספיקה.
