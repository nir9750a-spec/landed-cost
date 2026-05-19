import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────
// CBM anomaly detection
//
// Per-unit CBM is suspicious if it exceeds REASONABLE_MAX_CBM_PER_UNIT.
// Camping / 4x4 gear: a large rooftop tent boxed is ~0.3 m³; a kayak is
// ~0.5 m³; a folded inflatable boat is ~0.2 m³. Anything > 2 m³ for a
// single unit is almost certainly a unit error.
//
// Common mistakes we can auto-suggest a fix for:
//   1. cm³ stored as m³ (off by 1,000,000)
//   2. dm³ / liters stored as m³ (off by 1,000)
//   3. total carton volume stored as per-unit when qty > 1 (off by qty)
//
// We rank candidate fixes by how plausible the resulting per-unit CBM is.
// ─────────────────────────────────────────────────────────────────────────

const REASONABLE_MAX_CBM_PER_UNIT = 2;     // m³ — anything above is suspicious
const PLAUSIBLE_MIN_CBM_PER_UNIT  = 0.0001; // m³ — below this is also suspicious
const PLAUSIBLE_MAX_CBM_PER_UNIT  = 1;     // m³ — what a "fixed" value should land near

function plausibility(cbmPerUnit) {
  if (cbmPerUnit >= PLAUSIBLE_MIN_CBM_PER_UNIT && cbmPerUnit <= PLAUSIBLE_MAX_CBM_PER_UNIT) return 1;
  if (cbmPerUnit > 0 && cbmPerUnit <= REASONABLE_MAX_CBM_PER_UNIT) return 0.5;
  return 0;
}

function buildSuggestions(p) {
  const cbm = Number(p.cbm) || 0;
  const qty = Number(p.qty) || 1;
  const suggestions = [];

  if (cbm <= 0) return suggestions;

  // 1. cm³ → m³ (÷ 1,000,000)
  const cm3 = cbm / 1_000_000;
  if (plausibility(cm3) > 0) {
    suggestions.push({
      label: 'מ-cm³ למ"ק (÷ 1,000,000)',
      divisor: 1_000_000,
      newCbm: cm3,
      score: plausibility(cm3),
    });
  }

  // 2. liters / dm³ → m³ (÷ 1,000)
  const liters = cbm / 1_000;
  if (plausibility(liters) > 0) {
    suggestions.push({
      label: 'מליטר/dm³ למ"ק (÷ 1,000)',
      divisor: 1_000,
      newCbm: liters,
      score: plausibility(liters),
    });
  }

  // 3. Total CBM divided by qty
  if (qty > 1) {
    const perUnit = cbm / qty;
    if (plausibility(perUnit) > 0) {
      suggestions.push({
        label: `סה"כ CBM חולק לכמות (÷ ${qty})`,
        divisor: qty,
        newCbm: perUnit,
        score: plausibility(perUnit) * 0.9, // slightly lower confidence
      });
    }
  }

  // 4. Box dimensions cross-check (if all three present)
  const l = Number(p.box_l) || 0;
  const w = Number(p.box_w) || 0;
  const h = Number(p.box_h) || 0;
  if (l > 0 && w > 0 && h > 0) {
    const fromBox = (l * w * h) / 1_000_000; // cm × cm × cm → m³
    if (plausibility(fromBox) > 0) {
      suggestions.push({
        label: `מחושב ממידות הארגז (${l}×${w}×${h} ס"מ)`,
        divisor: null,
        newCbm: fromBox,
        score: plausibility(fromBox),
      });
    }
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

export function detectCbmAnomalies(products) {
  return products
    .filter(p => {
      const cbm = Number(p.cbm) || 0;
      return cbm > REASONABLE_MAX_CBM_PER_UNIT;
    })
    .map(p => ({
      id: p.id,
      name: p.name,
      item_no: p.item_no,
      project_id: p.project_id,
      qty: Number(p.qty) || 0,
      currentCbm: Number(p.cbm) || 0,
      suggestions: buildSuggestions(p),
    }));
}

export function detectMissingWeights(products) {
  return products
    .filter(p => {
      const w = Number(p.gross_weight_kg) || 0;
      return w <= 0;
    })
    .map(p => ({
      id: p.id,
      name: p.name,
      item_no: p.item_no,
      project_id: p.project_id,
      qty: Number(p.qty) || 0,
      cbm: Number(p.cbm) || 0,
      box_l: Number(p.box_l) || 0,
      box_w: Number(p.box_w) || 0,
      box_h: Number(p.box_h) || 0,
      notes: p.notes || '',
    }));
}

// ─────────────────────────────────────────────────────────────────────────
// AI gross-weight estimation
// ─────────────────────────────────────────────────────────────────────────

export async function estimateWeights(items) {
  // items: [{ id, name, cbm, box_l, box_w, box_h, notes }, ...]
  // Returns: [{ id, estimated_kg, reasoning }] in same order.
  // Strategy: batch up to 20 items per request to stay under max_tokens cap.
  const BATCH = 20;
  const out = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    const result = await estimateBatch(slice);
    out.push(...result);
  }
  return out;
}

async function estimateBatch(items) {
  const list = items.map((it, idx) => {
    const parts = [`${idx + 1}. שם: ${it.name}`];
    if (it.cbm > 0) parts.push(`CBM/יח׳: ${it.cbm} מ"ק`);
    if (it.box_l && it.box_w && it.box_h) {
      parts.push(`מידות ארגז: ${it.box_l}×${it.box_w}×${it.box_h} ס"מ`);
    }
    if (it.notes) parts.push(`הערות: ${it.notes.slice(0, 100)}`);
    return parts.join(' · ');
  }).join('\n');

  const prompt = `אתה מומחה ליבוא ציוד קמפינג ו-4x4 מסין לישראל.
לכל מוצר ברשימה, העריך משקל ברוטו ממוצע ליחידה אחת בק"ג (כולל אריזה).
התבסס על שם המוצר, גודל הארגז וה-CBM. אל תפתיע — תן הערכה סבירה עם רוחב סטייה הגיוני.

הרשימה:
${list}

החזר JSON בלבד (ללא markdown, ללא הסברים מחוץ ל-JSON), בפורמט:
{"estimates": [
  {"index": 1, "kg": 12.5, "confidence": "high|medium|low", "reasoning": "הסבר קצר"},
  ...
]}

כללים:
- kg: מספר חיובי (יכול להיות עשרוני, למשל 0.3, 1.8, 24)
- confidence: high אם יש CBM+מידות+שם ברור, medium אם חלקי, low אם רק שם
- reasoning: עד 60 תווים בעברית
- אם המוצר לא מזוהה: kg = null, confidence = "low"`;

  const { data, error } = await supabase.functions.invoke('anthropic-proxy', {
    body: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    },
  });

  if (error) throw new Error(error.message || 'שגיאת AI');
  if (data?.error) {
    const msg = data.error?.message || data.error;
    throw new Error(typeof msg === 'string' ? msg : 'שגיאת AI');
  }

  const text = data.content?.[0]?.text?.trim() || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI לא החזיר JSON תקין');

  const parsed = JSON.parse(match[0]);
  const estimates = parsed.estimates || [];

  return items.map((it, idx) => {
    const est = estimates.find(e => e.index === idx + 1);
    return {
      id: it.id,
      estimated_kg: est?.kg ?? null,
      confidence: est?.confidence || 'low',
      reasoning: est?.reasoning || '',
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Bulk apply: CBM fix
// ─────────────────────────────────────────────────────────────────────────

export async function applyCbmFix(productId, newCbm) {
  const { error } = await supabase.from('products').update({ cbm: newCbm }).eq('id', productId);
  if (error) throw new Error(error.message);
  return true;
}

export async function applyWeightFix(productId, kg) {
  const { error } = await supabase.from('products').update({ gross_weight_kg: kg }).eq('id', productId);
  if (error) throw new Error(error.message);
  return true;
}
