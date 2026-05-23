import { supabase } from './supabase';
import { invokeAnthropic } from './anthropicProxy';

// ─────────────────────────────────────────────────────────────────────────────
//  Israeli SII (מכון התקנים) import classification via Claude.
//  Returns import_group (1..4) + sii_required flag + reasoning.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  Combined HS + customs + SII classifier — single Claude call per batch.
//  Used by the Compliance page to fill everything that's missing in one shot.
// ─────────────────────────────────────────────────────────────────────────────

const COMBINED_RULES = `אתה מומחה לסיווג מכס ישראלי ולקבוצות יבוא של מכון התקנים הישראלי (SII).

עבור כל מוצר, ספק:
א. hs_code — קוד 8 ספרות בדיוק לפי תעריף המכס הישראלי (ללא נקודות/מקפים)
ב. customs_rate — שיעור המכס החל בישראל (0-100, מספר אחוז, ללא סימן %)
ג. import_group — קבוצת יבוא של מכון התקנים (1/2/3/4)
ד. sii_required — האם נדרשת בדיקה כלשהי (true/false). false רק לקבוצה 1.

קבוצות מכון התקנים:
- קבוצה 1: יבוא חופשי — אין דרישת בדיקת תקן. אוהלים בסיסיים, שקי שינה, ביגוד, רהיטים מתקפלים.
- קבוצה 2: הצהרת יבואן — לעיתים בדיקת מעבדה ראשונית. מטעני USB פשוטים, פלסטיק במגע עם מזון.
- קבוצה 3: בדיקת מטען — סוללות ליתיום, צעצועי ילדים, חלקי חילוף לרכב.
- קבוצה 4: רישוי + פיקוח שוטף — כירי גז, חשמל ביתי 230V, ציוד רפואי.

כללי החלטה:
- סוללת ליתיום > 100Wh: קבוצה 3 לפחות.
- מוצר חשמלי 230V (חיבור לרשת): קבוצה 4.
- גז דליק לקמפינג: קבוצה 3-4.
- צעצועי ילדים: קבוצה 3.
- בגדים/טקסטיל: קבוצה 1.
- אם מקרה ספק: בחר קבוצה גבוהה יותר.`;

function buildCombinedPrompt(items) {
  const list = items.map((it, idx) => {
    const parts = [`${idx + 1}. שם: ${it.name}`];
    if (it.notes) parts.push(`הערות: ${it.notes.slice(0, 200)}`);
    return parts.join(' · ');
  }).join('\n');

  return `${COMBINED_RULES}

הרשימה:
${list}

לכל פריט החזר JSON תקין בלבד (ללא markdown, ללא הסברים מחוץ ל-JSON, בלי גרשיים בתוך מחרוזות):
{"classifications": [
  {"index": 1, "hs_code": "94017900", "customs_rate": 12, "import_group": 1, "sii_required": false, "reasoning": "כסא מתקפל מאלומיניום, יבוא חופשי"},
  {"index": 2, "hs_code": "85045090", "customs_rate": 0, "import_group": 3, "sii_required": true, "reasoning": "מטען עם סוללה דורש בדיקה"}
]}`;
}

export async function classifyAllBatch(items) {
  const BATCH = 12; // smaller batch — combined output is longer per item
  const out = [];
  const failed = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    try {
      const result = await callCombined(slice);
      out.push(...result);
    } catch (err) {
      // Don't drop already-classified batches — keep going and report at end.
      failed.push({ from: i, to: i + slice.length, message: err?.message || String(err) });
    }
  }
  if (failed.length && out.length === 0) {
    throw new Error(failed[0].message);
  }
  return out;
}

async function callCombined(items) {
  const data = await invokeAnthropic({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildCombinedPrompt(items) }],
  });

  const text = data.content?.[0]?.text?.trim() || '';
  const list = parseCombined(text);

  return items.map((it, idx) => {
    const c = list.find(x => x.index === idx + 1) || {};
    const group = Number(c.import_group);
    const customsRate = Number(c.customs_rate);
    const hsValid = typeof c.hs_code === 'string' && /^\d{8}$/.test(c.hs_code);
    return {
      id: it.id,
      hs_code:      hsValid ? c.hs_code : null,
      customs_rate: Number.isFinite(customsRate) && customsRate >= 0 ? customsRate : null,
      import_group: group >= 1 && group <= 4 ? group : null,
      sii_required: !!c.sii_required,
      reasoning:    c.reasoning || '',
    };
  });
}

function parseCombined(text) {
  const block = text.match(/\{[\s\S]*\}/);
  if (block) {
    try {
      const parsed = JSON.parse(block[0]);
      if (Array.isArray(parsed.classifications)) return parsed.classifications;
    } catch {}
  }
  // Fallback: scrape individual objects.
  const results = [];
  const objRegex = /\{[^{}]*"index"\s*:\s*(\d+)[\s\S]*?\}/g;
  let m;
  while ((m = objRegex.exec(text)) !== null) {
    const obj = m[0];
    const get = (key, isNum) => {
      const r = isNum
        ? new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`)
        : new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`);
      const mm = obj.match(r);
      return mm ? (isNum ? Number(mm[1]) : mm[1]) : undefined;
    };
    results.push({
      index:        Number(m[1]),
      hs_code:      get('hs_code', false),
      customs_rate: get('customs_rate', true),
      import_group: get('import_group', true),
      sii_required: /"sii_required"\s*:\s*true/.test(obj),
      reasoning:    get('reasoning', false) || '',
    });
  }
  if (results.length === 0) throw new Error('AI לא החזיר JSON תקין');
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Legacy SII-only classifier (kept for compatibility — no longer used by
//  the Compliance page, but exported in case other code wants just SII).
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
  const failed = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    try {
      const result = await classifyOneBatch(slice);
      out.push(...result);
    } catch (err) {
      failed.push({ from: i, to: i + slice.length, message: err?.message || String(err) });
    }
  }
  if (failed.length && out.length === 0) {
    throw new Error(failed[0].message);
  }
  return out;
}

async function classifyOneBatch(items) {
  const data = await invokeAnthropic({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildPrompt(items) }],
  });

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
