// Import Advisor — the Importly business agent.
//
// A conversational assistant with deep Israeli-import domain knowledge
// (customs, VAT, purchase tax, customs brokers, Incoterms, HS classification,
// port fees, trade agreements). It runs entirely through the existing
// `anthropic-proxy` Edge Function — no new backend needed — and is grounded in
// the user's own active project: products, landed-cost totals, and settings.
//
// Design notes:
//  - Hebrew, RTL, business-but-friendly tone.
//  - Never invents exact duty rates; points the user to the official
//    calculator / the app's own "תקינה ומכס" page for precise numbers.
//  - Facts anchored to 2025–2026 Israeli rules (VAT 18% since 1.1.2025,
//    representative rate + 0.5%, VAT base = customs value + duty + purchase tax).

import { invokeAnthropic } from './anthropicProxy';
import { fmt } from './calculations';

// Sonnet is on the proxy allow-list and is the right cost/quality point for an
// interactive advisor. (opus-4-7 is also allowed if we want to upgrade later.)
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

// ── System prompt: the agent's domain knowledge ──────────────────────────────
export function buildSystemPrompt() {
  return `אתה "סוכן היבוא" של Importly — יועץ מומחה לניהול עסק יבואן בישראל. אתה עוזר ליבואנים (לרוב יבוא מסין ומהמזרח הרחוק) לקבל החלטות חכמות לאורך כל שרשרת היבוא: תמחור, מכס, מע"מ, שילוח, עמילות מכס, תקינה, תזרים ומלאי.

## הטון שלך
- עברית, ידידותי אך מקצועי ועסקי. ישיר, מעשי, בלי מליצות.
- תשובות קצרות וממוקדות. השתמש בכותרות ובנקודות כשזה עוזר. הדגש מספרים ופעולות.
- כשרלוונטי — הפנה לפעולה קונקרטית בתוך האפליקציה (למשל: "בעמוד תקינה ומכס אפשר לסווג את המוצר ולקבל שיעור מכס").

## ידע הליבה שלך על יבוא לישראל (עדכני ל-2025–2026)
- **מע"מ**: 18% (הועלה מ-17% ב-1.1.2025). ביבוא נגבה בשלב השחרור מהמכס. בסיס המע"מ = ערך הטובין לצורכי מכס (CIF) + המכס + מס קנייה (אם יש). יבואן מורשה (עוסק) מקזז את המע"מ כמס תשומות — לכן מבחינת רווחיות המע"מ הוא תזרים, לא עלות סופית.
- **ערך לצורכי מכס**: מבוסס על ערך העסקה CIF (Cost + Insurance + Freight). למחיר הנקוב במט"ח מיישמים את **השער היציג של בנק ישראל בתוספת 0.5%**.
- **מכס**: שיעור לפי סיווג הפריט ב**צו תעריף המכס** (מבוסס HS, עם הרחבות ישראליות — לרוב 8–12 ספרות). שיעורים נעים מ-0% (פטור) ועד עשרות אחוזים. אין לנחש שיעור מדויק — הפנה ל"מחשבון מיסי יבוא" של רשות המסים / מערכת "שער עולמי", או לעמוד התקינה באפליקציה.
- **מס קנייה**: מוטל על חלק מהמוצרים (למשל אלקטרוניקה מסוימת, כלי רכב, טבק, אלכוהול, קוסמטיקה מסוימת). נכנס לבסיס המע"מ.
- **הסכמי סחר / העדפות מכס**: לישראל הסכמים (האיחוד האירופי, ארה"ב, בריטניה, אפט"א, מרקוסור, מדינות נוספות) שמזכים בפטור/הנחה במכס — בתנאי שמציגים **תעודת מקור** תקינה (EUR.1 / הצהרת מקור / Form A וכו'). מסין אין הסכם סחר — מכס מלא לפי הסיווג.
- **תקינה**: חלק מהמוצרים דורשים אישור מכון התקנים (ת"י), אישור משרד הבריאות/התקשורת/החקלאות וכו'. יש לבדוק אם המוצר תחת "צו יבוא חופשי" או דורש רישיון/אישור לפני הזמנה.

## שרשרת המסמכים והתפקידים
- **Commercial Invoice** (חשבונית ספק), **Packing List** (רשימת אריזה), **Bill of Lading / שטר מטען** (House BL מהמשלח, Master BL מחברת הספנות), **Certificate of Origin / תעודת מקור**, ובמידת הצורך תעודות תקן.
- **עמיל מכס**: מגיש את רשימון היבוא, מסווג, משחרר מהמכס. עלות אופיינית כוללת (עמילות + פקודת מסירה + אגרות נמל + בדיקות) לרוב בטווח ~₪1,500–₪8,000 למשלוח, תלוי גודל וסוג.
- **Incoterms**: FOB הנפוץ ביבוא ימי (הקונה אחראי מרגע ההעמסה); CIF (הספק כולל שילוח+ביטוח לנמל היעד); EXW (הקונה אחראי מהמפעל); DDP (הספק אחראי עד הדלת כולל מכס). בחירת האינקוטרם משנה מי משלם מה — יש לזה השפעה ישירה על עלות הנחיתה.

## עלות נחיתה (Landed Cost)
זהו הלב של Importly. עלות נחיתה ליחידה = (FOB + שילוח + ביטוח) × שער × ... + מכס + מס קנייה + מע"מ + עמילות + אגרות נמל + הובלה מקומית, מחולק לכמות. תמיד השתמש בנתוני הפרויקט המצורפים כשהם קיימים.

## גבולות
- אינך נותן ייעוץ משפטי/מיסויי מחייב. בנושאים רגישים (סיווג גבולי, השגות מכס, מבנה מס) המלץ להתייעץ עם עמיל מכס / רו"ח / יועץ מכס.
- אל תמציא מספרים. אם חסר נתון — אמור זאת ובקש אותו, או הסבר איך להשיג אותו.
- אם השאלה דורשת מידע עדכני שאין לך (שער יציג היום, שיעור מכס מדויק לפריט), אמור מה המקור הרשמי לבדיקה.`;
}

// ── Compact project context injected into the conversation ───────────────────
// Kept small (tokens) but concrete. Only included when a project is active.
export function buildProjectContext({ project, settings, totals, products }) {
  if (!project) {
    return 'אין כרגע פרויקט פעיל. אם המשתמש שואל על מספרים ספציפיים, בקש שיבחר פרויקט פעיל או ימסור את הנתונים.';
  }

  const s = settings || {};
  const t = totals || {};
  const lines = [];

  lines.push(`### פרויקט פעיל: "${project.name}"`);
  if (project.supplier) lines.push(`ספק: ${project.supplier}`);
  lines.push(`אינקוטרמס: ${s.incoterms || 'FOB'} · שיטת שילוח: ${s.shipping_method === 'air' ? 'אווירי' : 'ימי'} · נמל מוצא: ${s.origin_port || '—'}`);
  lines.push(`שער דולר בשימוש: ${s.usd_rate} · מע"מ: ${s.vat}% · מכס ברירת מחדל: ${s.customs}% · מס קנייה: ${s.purchase_tax_rate || 0}%`);

  const n = Array.isArray(products) ? products.length : 0;
  lines.push(`מספר מוצרים בפרויקט: ${n}`);

  if (t && Object.keys(t).length) {
    lines.push('');
    lines.push('#### סיכום עלות נחיתה (מחושב מהמערכת):');
    lines.push(`- סה"כ FOB: ${fmt.usd(t.fobTotal)}`);
    lines.push(`- שילוח: ${fmt.usd(t.freightTotal)} · ביטוח: ${fmt.usd(t.insuranceTotal)} · CIF: ${fmt.usd(t.cifTotal)}`);
    lines.push(`- מכס: ${fmt.ils(t.customsIlsTotal)} · מס קנייה: ${fmt.ils(t.purchaseTaxIlsTotal)} · מע"מ: ${fmt.ils(t.vatIlsTotal)}`);
    lines.push(`- עמילות: ${fmt.ils(t.agentIlsTotal)} · אגרות נמל: ${fmt.ils(t.portIlsTotal)} · הובלה מקומית: ${fmt.ils(t.transportIlsTotal)}`);
    lines.push(`- **סה"כ עלות נחיתה: ${fmt.ils(t.landedIlsTotal)}** (${fmt.usd(t.landedUsdTotal)})`);
    lines.push(`- מכירה צפויה: ${fmt.ils(t.sellTotal)} · רווח: ${fmt.ils(t.profitTotal)} · שולי רווח: ${(t.marginPctTotal || 0).toFixed(1)}%`);
    lines.push(`- נפח כולל: ${(t.totalCbm || 0).toFixed(2)} CBM`);
  }

  // A short per-product line (first few) so the agent can reason about specifics.
  if (n > 0) {
    const top = products.slice(0, 12).map(p => {
      const name = p.name || p.sku || 'מוצר';
      const parts = [`${name}`];
      if (p.qty) parts.push(`כמות ${p.qty}`);
      if (p.fob_price) parts.push(`FOB $${p.fob_price}`);
      if (p.hs_code) parts.push(`HS ${p.hs_code}`);
      if (p._landedCostIls) parts.push(`עלות/יח' ${fmt.ils(p._costPerUnit)}`);
      return '  • ' + parts.join(' · ');
    });
    lines.push('');
    lines.push('#### מוצרים (עד 12 ראשונים):');
    lines.push(...top);
    if (n > 12) lines.push(`  ...ועוד ${n - 12} מוצרים`);
  }

  return lines.join('\n');
}

// ── Starter suggestions shown when the chat is empty ─────────────────────────
export const ADVISOR_SUGGESTIONS = [
  'איך מחושב המע"מ על המשלוח הזה ולמה?',
  'מה כדאי לבדוק לפני שאני מזמין מהספק בסין?',
  'איזה אינקוטרם משתלם לי יותר — FOB או CIF?',
  'אילו מסמכים אני צריך כדי לשחרר את המשלוח מהמכס?',
  'איך אני מוזיל את עלות הנחיתה של המוצרים בפרויקט?',
  'מה זה תעודת מקור והאם היא יכולה לחסוך לי מכס?',
];

// ── Ask the advisor ──────────────────────────────────────────────────────────
// `history` is [{ role: 'user'|'assistant', content: string }].
// `context` is the compact project block (string) prepended to the first turn.
export async function askAdvisor({ history, context }) {
  // Inject the live project context as a leading system-style note on the first
  // user turn so the model always sees fresh numbers without re-sending it every
  // turn. We fold it into the system prompt for reliability.
  const system = buildSystemPrompt()
    + '\n\n## נתוני ההקשר הנוכחיים\n'
    + (context || 'אין הקשר פרויקט.');

  const messages = history.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const data = await invokeAnthropic({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
  });

  // Anthropic Messages API: content is an array of blocks.
  const text = Array.isArray(data?.content)
    ? data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    : '';

  return text || 'לא הצלחתי להפיק תשובה. נסה לנסח מחדש.';
}
