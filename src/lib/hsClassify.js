export async function classifyHsCode(productName, notes, apiKey) {
  if (!apiKey) throw new Error('נדרש מפתח Anthropic API. הגדר אותו בעמוד ההגדרות.');

  const prompt = `אתה מומחה לסיווג מכס ישראלי (תעריף המכס הישראלי).
בהתבסס על שם המוצר והתיאור הבאים, קבע:
1. קוד HS מדויק של 8 ספרות לפי תעריף המכס הישראלי
2. שיעור המכס המלא (%) החל בישראל על מוצר זה (כולל מכס רגיל, ללא VAT)

שם המוצר: ${productName}
תיאור / הערות: ${notes || 'אין'}

החזר JSON בלבד (ללא markdown, ללא הסברים מחוץ ל-JSON):
{"hs_code": "XXXXXXXX", "customs_rate": 12, "explanation": "הסבר קצר על הסיווג בעברית"}

כללים:
- קוד HS: בדיוק 8 ספרות (ללא נקודות או מקפים)
- customs_rate: מספר אחוז (לדוגמה: 0, 5, 12, 18)
- אם המוצר פטור ממכס: customs_rate = 0`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `שגיאת API: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI לא החזיר תשובה בפורמט JSON תקין');

  const result = JSON.parse(match[0]);
  if (!result.hs_code || !/^\d{8}$/.test(result.hs_code)) {
    throw new Error('AI החזיר קוד HS לא תקין (נדרשות 8 ספרות)');
  }
  return result;
}
