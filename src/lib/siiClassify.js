import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
//  Israeli SII (מכון התקנים) import classification via Claude.
//  Returns import_group (1..4) + sii_required flag + reasoning.
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_RULES = `אתה מומחה לתקינה ישראלית ולקבוצות יבוא של מכון התקנים הישראלי (SII).

קבוצות היבוא:
- קבוצה 1: יבוא חופשי — אין דרישת בדיקת תקן. דוגמאות: אוהלי קמפינג בסיסיים, שקי שינה, ביגוד, רהיטים מתקפלים.
- קבוצה 2: הצהרת יבואן/יצרן — היבואן מצהיר על התאמה לתקן ישראלי, לעיתים נדרשת בדיקת מעבדה ראשונית. דוגמאות: מטעני USB פשוטים, מוצרי פלסטיק במגע עם מזון.
- קבוצה 3: בדיקת מטען — מכון התקנים בודק כל משלוח לפני שחרור מהמכס. דוגמאות: סוללות ליתיום, צעצועי ילדים, רהיטי גן, חלקי חילוף לרכב.
- קבוצה 4: רישוי + פיקוח שוטף — הקבוצה הקפדנית, דורשת תיק רישוי לכל דגם. דוגמאות: כירי גז, פנסי לד מחוברי רשת, מוצרי חשמל ביתיים, ציוד רפואי.

כללי החלטה:
- כל מוצר עם סוללת ליתיום > 100Wh: קבוצה 3 לפחות.
- כל מוצר חשמלי חי (חיבור לרשת 230V): קבוצה 4.
- כל מוצר עם גז דליק (קמפינג): קבוצה 3-4.
- צעצועים לילדים: קבוצה 3.
- בגדים/טקסטיל פשוט: קבוצה 1.
- חלקי 4x4 (וינצ'ים, מתלים): קבוצה 2-3 לרוב.
- מקרה ספק: בחר את הקבוצה הגבוהה יותר (זהיר יותר).`;

function buildPrompt(items) {
  const list = items.map((it, idx) => {
    const parts = [`${idx + 1}. שם: ${it.name}`];
    if (it.hs_code)  parts.push(`HS: ${it.hs_code}`);
    if (it.notes)    parts.push(`הערות: ${it.notes.slice(0, 200)}`);
    return parts.join(' · ');
  }).join('\n');

  return `${SYSTEM_RULES}

קבע לכל מוצר ברשימה:
1. import_group: 1, 2, 3, או 4
2. sii_required: true אם נדרשת בדיקה כלשהי (קבוצות 2-4), false אם יבוא חופשי (קבוצה 1)
3. reasoning: שורה אחת בעברית עד 80 תווים — חובה ללא גרשיים בתוך הטקסט (אל תשתמש בקיצורים כמו ת״י)

הרשימה:
${list}

החזר JSON תקין בלבד (ללא markdown, ללא הסברים מחוץ ל-JSON):
{"classifications": [
  {"index": 1, "import_group": 3, "sii_required": true, "reasoning": "מוצר חשמלי דורש בדיקת בטיחות"},
  {"index": 2, "import_group": 1, "sii_required": false, "reasoning": "מוצר טקסטיל פטור"}
]}`;
}

export async function classifyImportGroupBatch(items) {
  // items: [{ id, name, hs_code, notes }]
  // Returns array of { id, import_group, sii_required, reasoning, tests }
  const BATCH = 15; // smaller than HS batch — reasoning per item is longer
  const out = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    const result = await classifyOneBatch(slice);
    out.push(...result);
  }
  return out;
}

async function classifyOneBatch(items) {
  const { data, error } = await supabase.functions.invoke('anthropic-proxy', {
    body: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(items) }],
    },
  });

  if (error) throw new Error(error.message || 'שגיאת AI');
  if (data?.error) {
    const msg = data.error?.message || data.error;
    throw new Error(typeof msg === 'string' ? msg : 'שגיאת AI');
  }

  const text = data.content?.[0]?.text?.trim() || '';
  const list = parseClassifications(text);

  return items.map((it, idx) => {
    const c = list.find(x => x.index === idx + 1) || {};
    const group = Number(c.import_group);
    return {
      id: it.id,
      import_group: group >= 1 && group <= 4 ? group : null,
      sii_required: !!c.sii_required,
      reasoning:    c.reasoning || '',
    };
  });
}

// Robust parser: try clean JSON first, then fall back to per-object regex if
// the AI returned a slightly malformed batch (e.g. an unescaped quote in
// "reasoning"). One bad row should not drop the entire batch.
function parseClassifications(text) {
  const block = text.match(/\{[\s\S]*\}/);
  if (block) {
    try {
      const parsed = JSON.parse(block[0]);
      if (Array.isArray(parsed.classifications)) return parsed.classifications;
    } catch {}
  }

  // Fallback: scrape individual classification objects.
  const results = [];
  const objRegex = /\{[^{}]*"index"\s*:\s*(\d+)[^{}]*"import_group"\s*:\s*(\d+)[^{}]*"sii_required"\s*:\s*(true|false)[^{}]*\}/g;
  let m;
  while ((m = objRegex.exec(text)) !== null) {
    const reasoningMatch = m[0].match(/"reasoning"\s*:\s*"([^"]*)"/);
    results.push({
      index:        Number(m[1]),
      import_group: Number(m[2]),
      sii_required: m[3] === 'true',
      reasoning:    reasoningMatch ? reasoningMatch[1] : '',
    });
  }
  if (results.length === 0) {
    throw new Error('AI לא החזיר JSON תקין');
  }
  return results;
}

export async function classifyImportGroup(name, hsCode, notes) {
  const [result] = await classifyOneBatch([{ id: '_single', name, hs_code: hsCode, notes }]);
  return result;
}

// ─── DB writes ────────────────────────────────────────────────────────────────

export async function saveSiiClassification(productId, { import_group, sii_required, reasoning, source = 'ai' }) {
  const { error } = await supabase.from('products').update({
    import_group,
    sii_required,
    sii_notes:  reasoning || null,
    sii_source: source,
  }).eq('id', productId);
  if (error) throw new Error(error.message);
  return true;
}
