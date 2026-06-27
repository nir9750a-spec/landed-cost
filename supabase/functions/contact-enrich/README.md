# contact-enrich — העשרת קשר מאומת (פאזה 3)

הופך **דומיין של יצרן** (מאתר החברה) ל**כתובות מייל אמיתיות**, כדי לשלוח RFQ ישירות
למפעל. גלובלי מטבעו — עובד לכל דומיין בכל מדינה, לא קשור לפלטפורמה סינית.

ספק: **Hunter.io** (Domain Search). מיילים גנריים (info@ / sales@) מוקפצים ראשונים —
הכי מתאימים לפנייה קרה — ואז לפי רמת ביטחון (confidence).

## קלט (POST JSON)
```json
{ "domain": "haers.com" }   // אפשר גם website מלא או email — הפונקציה מחלצת דומיין
```

## פלט
```json
{
  "configured": true,
  "domain": "haers.com",
  "organization": "Zhejiang Haers",
  "emails": [ { "value": "export@haers.com", "type": "generic", "confidence": 92, "position": "" } ]
}
```
אם המפתח לא מוגדר עדיין — מחזיר `200 { "configured": false }`, וה-UI מציג רמז ידידותי
במקום שגיאה.

## הפעלה (אצלך)
```bash
# 1) צור מפתח חינמי ב-https://hunter.io  (יש tier חינמי ~25–50 חיפושים/חודש)
supabase secrets set HUNTER_API_KEY=...
# 2) פרוס
supabase functions deploy contact-enrich
```

## שימוש בדף
בבלוק "יצרנים מועמדים", ליצרן שיש לו אתר אך אין מייל מופיע כפתור **"🔎 אמת מייל"**.
לחיצה קוראת לפונקציה ומציגה את המיילים שנמצאו — כל אחד פותח **הודעת RFQ מוכנה** (mailto).

## הרחבה עתידית — טלפון/אתר מאומתים
להוספת **טלפון** מאומת אפשר להוסיף ספק שני (Google Places — Place Details:
`phone`, `website`, גלובלי). אותו דפוס: secret `GOOGLE_PLACES_API_KEY` + ענף נוסף
בפונקציה. לא מומש כאן כדי לשמור על scope ממוקד.
