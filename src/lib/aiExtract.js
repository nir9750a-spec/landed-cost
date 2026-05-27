import * as XLSX from 'xlsx';
import { invokeAnthropic } from './anthropicProxy';

const MAX_AI_FILE_BYTES = 20 * 1024 * 1024; // 20 MB — Anthropic limit is 32 MB raw / ~24 MB after base64 inflation

// ── Helpers ────────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });
}

// Case-insensitive, partial-match column lookup.
// First tries exact match, then "header contains keyword", then "keyword contains header".
function getCI(row, ...keywords) {
  const entries = Object.entries(row);

  // Pass 1 — exact case-insensitive
  for (const kw of keywords) {
    const kl = kw.toLowerCase().trim();
    for (const [col, val] of entries) {
      if (col.toLowerCase().trim() === kl && val !== null && val !== undefined && val !== '') return val;
    }
  }

  // Pass 2 — header contains keyword
  for (const kw of keywords) {
    const kl = kw.toLowerCase().trim();
    for (const [col, val] of entries) {
      if (col.toLowerCase().includes(kl) && val !== null && val !== undefined && val !== '') return val;
    }
  }

  return '';
}

// Sanitise a product row so every required field is present and typed correctly.
function sanitise(raw) {
  return {
    name:      String(raw.name      || '').trim(),
    item_no:   String(raw.item_no   || '').trim(),
    qty:       Math.max(0, Number(raw.qty)       || 0),
    fob_price: Math.max(0, Number(raw.fob_price) || 0),
    cbm:       Math.max(0, Number(raw.cbm)       || 0),
    supplier:  String(raw.supplier  || '').trim(),
    notes:     String(raw.notes     || '').trim(),
  };
}

// ── Excel / CSV ────────────────────────────────────────────────────────────

function extractFromExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const products = data
          .map(row => {
            // ── Name / description ──
            const name = getCI(row,
              'שם מוצר', 'שם', 'מוצר', 'פריט', 'תיאור', 'תאור',
              'name', 'product', 'product name', 'description', 'item', 'item description',
              'goods', 'commodity', 'style', 'model',
            );

            // ── Item number ──
            const item_no = getCI(row,
              'מקט', "מק\"ט", 'מספר פריט', 'קוד', 'קוד מוצר',
              'item no', 'item_no', 'item number', 'sku', 'model no', 'model number',
              'part no', 'part number', 'code', 'ref', 'style no', 'art no',
            );

            // ── Quantity ──
            const qty = getCI(row,
              'כמות', 'יחידות', 'כמ',
              'qty', 'quantity', 'pcs', 'pieces', 'units', 'nos', 'ctns',
              'total qty', 'order qty', 'shipped qty',
            );

            // ── FOB unit price ──
            const fob_price = getCI(row,
              'מחיר', 'מחיר יחידה', 'מחיר FOB', 'מחיר ליח',
              'unit price', 'fob price', 'fob unit price', 'price', 'rate',
              'unit cost', 'price/unit', 'usd', 'amount/pcs',
            );

            // ── CBM per unit ──
            // Invoices often give total CBM for the line; we'll divide by qty later.
            const cbmRaw = getCI(row,
              'cbm', 'נפח', 'נפח ליח',
              'cbm/unit', 'volume', 'm3', 'cubic', 'measurement',
              'cbm per unit', 'unit cbm',
            );
            const cbmTotal = getCI(row,
              'total cbm', 'cbm total', 'total volume', 'total m3',
            );

            // ── Supplier ──
            const supplier = getCI(row,
              'ספק', 'יצרן', 'מוכר',
              'supplier', 'vendor', 'manufacturer', 'factory', 'seller',
            );

            // ── Notes ──
            const notes = getCI(row,
              'הערות', 'הערה',
              'notes', 'remarks', 'comment', 'remark',
            );

            const qtyNum = Number(qty)       || 0;
            let   cbm    = Number(cbmRaw)    || 0;
            const cbmTot = Number(cbmTotal)  || 0;

            // If unit CBM is 0 but total CBM is available, derive unit CBM
            if (cbm === 0 && cbmTot > 0 && qtyNum > 0) cbm = cbmTot / qtyNum;

            return {
              name:      String(name      || ''),
              item_no:   String(item_no   || ''),
              qty:       qtyNum,
              fob_price: Number(fob_price) || 0,
              cbm,
              supplier:  String(supplier  || ''),
              notes:     String(notes     || ''),
            };
          })
          .filter(p => p.name || p.item_no);  // discard empty rows

        if (!products.length) throw new Error('לא נמצאו שורות מוצר בקובץ. ודא שהקובץ מכיל כותרות עמודות בשורה הראשונה.');
        resolve(products.map(sanitise));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('שגיאה בקריאת קובץ Excel: ' + String(err)));
      }
    };
    reader.onerror = () => reject(new Error('שגיאה בפתיחת הקובץ'));
    reader.readAsArrayBuffer(file);
  });
}

// ── PDF / Image via Claude AI ──────────────────────────────────────────────

async function extractFromAI(file, ext) {
  const isPdf    = ext === 'pdf';
  const isImage  = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);

  if (!isPdf && !isImage) {
    throw new Error('פורמט קובץ לא נתמך. השתמש ב-PDF, תמונה (JPG/PNG/WEBP), או Excel.');
  }
  if (file.size > MAX_AI_FILE_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new Error(`הקובץ גדול מדי (${mb}MB). המקסימום הוא 20MB — דחוס או חתוך את ה-PDF.`);
  }
  const base64 = await fileToBase64(file);

  const mediaType   = isPdf ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const contentType = isPdf ? 'document' : 'image';

  const prompt = `אתה מומחה לחילוץ נתונים מחשבוניות ספקים וניירות אריזה (Packing List / Commercial Invoice).

המסמך המצורף הוא מסמך יבוא. חלץ שני דברים:

## 1. פרטי המשלוח (ברמת המסמך כולו)
- incoterms: תנאי המסירה — חפש: FOB, CIF, EXW, FCA, CFR, DAP וכו' (החזר קוד באותיות גדולות בלבד, למשל "FOB")
- origin_port: נמל המוצא — חפש: Port of Loading, Shipment Port, Port, נמל טעינה (החזר שם באנגלית, למשל "NINGBO")
- supplier: שם הספק / מוכר — חפש: Seller, Vendor, Supplier, Manufacturer, From (בכותרת המסמך)
- invoice_date: תאריך החשבונית בפורמט YYYY-MM-DD
- payment_terms: תנאי תשלום — חפש: Payment Terms, T/T, L/C, D/P

## 2. שורות המוצרים
עבור כל מוצר חלץ:
- name: שם המוצר / תיאור (חפש: Product Description, Item, Goods)
- item_no: קוד מוצר / SKU (חפש: Item No., Part No., Model No., SKU)
- qty: כמות יחידות (חפש: Quantity, Qty, PCS, Units)
- fob_price: מחיר ליחידה בדולר (חפש: Unit Price, FOB Price, Price/Unit)
- cbm: נפח ליחידה במ"ק — אם CBM הוא סה"כ לשורה, חלק ב-qty
- supplier: שם הספק (לרוב מכותרת המסמך)
- notes: מידע נוסף

כללים:
1. שדה מספרי שאינו קיים → 0
2. שדה טקסטואלי שאינו קיים → ""
3. אל תכלול שורות סיכום, כותרות, שורות ריקות
4. מחיר תמיד ליחידה בודדת

החזר JSON object בלבד, ללא markdown, ללא טקסט לפני/אחרי:
{"products":[{"name":"","item_no":"","qty":0,"fob_price":0,"cbm":0,"supplier":"","notes":""}],"shipment":{"incoterms":"FOB","origin_port":"","supplier":"","invoice_date":"","payment_terms":""}}`;

  const result = await invokeAnthropic({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: contentType, source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });

  const text = result.content?.[0]?.text?.trim() || '';

  // Try object format first: { products: [...], shipment: {...} }
  // Fall back to bare array for backward compat
  const objMatch = text.match(/\{[\s\S]*\}/);
  const arrMatch = text.match(/\[[\s\S]*\]/);

  let products = [];
  let shipment = null;

  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]);
      if (Array.isArray(obj.products) && obj.products.length > 0) {
        products = obj.products;
        shipment = obj.shipment || null;
      } else if (Array.isArray(obj) && obj.length > 0) {
        products = obj;
      }
    } catch { /* fall through */ }
  }

  if (products.length === 0 && arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr)) products = arr;
    } catch { /* fall through */ }
  }

  if (products.length === 0) {
    throw new Error('ה-AI לא החזיר רשימת מוצרים תקינה. ודא שהמסמך מכיל חשבונית עם שורות מוצר ברורות.');
  }

  // Normalise shipment fields
  if (shipment) {
    const INCOTERMS = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'];
    const raw = String(shipment.incoterms || '').toUpperCase().replace(/[^A-Z]/g, '');
    shipment.incoterms   = INCOTERMS.includes(raw) ? raw : '';
    shipment.origin_port = String(shipment.origin_port || '').trim();
    shipment.supplier    = String(shipment.supplier    || '').trim();
    shipment.invoice_date= String(shipment.invoice_date|| '').trim();
    shipment.payment_terms = String(shipment.payment_terms || '').trim();
    // Only keep shipment if it has at least one useful field
    const hasData = shipment.incoterms || shipment.origin_port || shipment.supplier;
    if (!hasData) shipment = null;
  }

  return { products: products.map(sanitise), shipment };
}

// ── Public API ─────────────────────────────────────────────────────────────

// Always returns { products: [...], shipment: null | {...} }
export async function extractProductsFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    const products = await extractFromExcel(file);
    return { products, shipment: null };
  }

  if (!['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    throw new Error(`סוג קובץ ".${ext}" אינו נתמך. השתמש ב-Excel, PDF, או תמונה (JPG/PNG/WEBP).`);
  }

  return extractFromAI(file, ext);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shipment-tracking extraction (logistics agent / carrier screenshots)
// ─────────────────────────────────────────────────────────────────────────────

const SHIPMENT_PROMPT = `אתה מומחה לחילוץ נתוני מעקב מכולות ממסכי tracking של חברות ספנות וסוכני לוגיסטיקה.
המסמך המצורף הוא מסך מעקב או מסמך מחברת ספנות (MSC, COSCO, Maersk, ZIM וכו'). חלץ את הנתונים הבאים:

## פרטי המכולה
- container_number: מספר המכולה (4 אותיות גדולות + 7 ספרות, למשל TGBU7941499)
- container_type: סוג מכולה — אחד מ: 20GP, 40GP, 40HC, 45HC, LCL (אם כתוב "40' HIGH CUBE" החזר 40HC)
- carrier: שם חברת הספנות (MSC, COSCO, Maersk, ZIM, Hapag-Lloyd, CMA CGM, Evergreen, ONE, Yang Ming)
- vessel_name: שם האונייה הנוכחית/הראשית (למשל "MSC OSCAR")
- voyage: קוד מסע (למשל "GT619W")
- origin_port: נמל מוצא — שם + מדינה (למשל "Ningbo, CN")
- pod_port: נמל יעד (Port Of Discharge) — לרוב "Ashdod, IL"
- terminal: שם הטרמינל ביעד (למשל "Hadarom Container Terminal")
- departure_date: תאריך טעינה על האונייה (Loaded on Vessel / Export Loaded) בפורמט YYYY-MM-DD
- eta_date: ETA לנמל היעד בפורמט YYYY-MM-DD
- actual_arrival_date: תאריך הגעה בפועל (Actual Time of Arrival) — אם עוד לא הגיע החזר ריק

## טיים-ליין אירועים
מערך events לפי סדר כרונולוגי (חדש ראשון). לכל אירוע:
- date: YYYY-MM-DD
- location: עיר + מדינה (למשל "Ningbo, CN")
- description: תיאור האירוע באנגלית (למשל "Export Loaded on Vessel", "Empty to Shipper", "Export received at CY")
- vessel_voyage: שילוב שם אונייה + קוד מסע אם רלוונטי (למשל "MSC OSCAR GT619W")
- terminal: שם הטרמינל אם מצוין

כללים:
1. תאריכים: אם בפורמט DD/MM/YYYY המר ל-YYYY-MM-DD
2. שדה ריק → ""
3. אל תמציא נתונים שלא רואים במסמך
4. אם אין מספר מכולה כלל — החזר container_number: "" ושאר הנתונים אם קיימים

החזר JSON object בלבד:
{"container_number":"","container_type":"","carrier":"","vessel_name":"","voyage":"","origin_port":"","pod_port":"","terminal":"","departure_date":"","eta_date":"","actual_arrival_date":"","events":[{"date":"","location":"","description":"","vessel_voyage":"","terminal":""}]}`;

export async function extractShipmentFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const isPdf   = ext === 'pdf';
  const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
  if (!isPdf && !isImage) {
    throw new Error('חילוץ מכולה נתמך רק על PDF או תמונה. ל-Excel השתמש בעמוד המוצרים.');
  }
  if (file.size > MAX_AI_FILE_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new Error(`הקובץ גדול מדי (${mb}MB). מקסימום 20MB.`);
  }
  const base64 = await fileToBase64(file);
  const mediaType   = isPdf ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const contentType = isPdf ? 'document' : 'image';

  const result = await invokeAnthropic({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: contentType, source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: SHIPMENT_PROMPT },
      ],
    }],
  });

  const text = result.content?.[0]?.text?.trim() || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('ה-AI לא החזיר JSON. ייתכן שהמסמך אינו מסך מעקב מכולה.');

  let parsed;
  try { parsed = JSON.parse(m[0]); }
  catch { throw new Error('ה-AI החזיר JSON לא תקין.'); }

  // Light normalization
  const out = {
    container_number:    String(parsed.container_number || '').trim().toUpperCase(),
    container_type:      String(parsed.container_type   || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
    carrier:             String(parsed.carrier          || '').trim() || null,
    vessel_name:         String(parsed.vessel_name      || '').trim() || null,
    voyage:              String(parsed.voyage           || '').trim() || null,
    origin_port:         String(parsed.origin_port      || '').trim() || null,
    pod_port:            String(parsed.pod_port         || '').trim() || null,
    terminal:            String(parsed.terminal         || '').trim() || null,
    departure_date:      normalizeDate(parsed.departure_date),
    eta_date:            normalizeDate(parsed.eta_date),
    actual_arrival_date: normalizeDate(parsed.actual_arrival_date),
    events:              Array.isArray(parsed.events) ? parsed.events.map(normalizeEvent).filter(Boolean) : [],
  };

  if (!out.container_number && out.events.length === 0) {
    throw new Error('לא נמצא מספר מכולה או אירועים במסמך.');
  }
  return out;
}

function normalizeDate(d) {
  if (!d) return null;
  const s = String(d).trim();
  // YYYY-MM-DD as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  // YYYY/MM/DD
  const m2 = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`;
  return null;
}

function normalizeEvent(e) {
  if (!e || typeof e !== 'object') return null;
  const date = normalizeDate(e.date);
  const description = String(e.description || '').trim();
  if (!date && !description) return null;
  return {
    date,
    location:      String(e.location      || '').trim(),
    description,
    vessel_voyage: String(e.vessel_voyage || '').trim(),
    terminal:      String(e.terminal      || '').trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Packing-list extraction — line items with refined CBM/weight/dimensions
//  for matching back to existing products
// ─────────────────────────────────────────────────────────────────────────────

const PACKING_PROMPT = `אתה מומחה לחילוץ מידע מ-Packing List לייבוא ימי / אווירי.
המסמך המצורף הוא רשימת אריזה. לכל שורת מוצר חלץ:

- name: שם המוצר / תיאור
- item_no: קוד מוצר / SKU / Part No.
- qty: כמות יחידות
- cbm: נפח ליחידה במ״ק (אם המסמך נותן סה״כ — חלק ב-qty)
- gross_weight_kg: משקל ברוטו ליחידה בק״ג (אם סה״כ — חלק ב-qty)
- box_l, box_w, box_h: מידות אריזה ליחידה בס״מ (אורך, רוחב, גובה)
- cartons: מספר קרטונים (אם מצוין)
- notes: מידע נוסף

כללים:
1. שדה מספרי חסר → 0
2. שדה טקסטואלי חסר → ""
3. דלג על שורות סיכום וכותרות
4. כל מידה תמיד ליחידה בודדת

החזר JSON בלבד:
{"items":[{"name":"","item_no":"","qty":0,"cbm":0,"gross_weight_kg":0,"box_l":0,"box_w":0,"box_h":0,"cartons":0,"notes":""}]}`;

export async function extractPackingFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    // Reuse Excel reader — it already returns rows we can re-shape
    const products = await extractFromExcel(file);
    return { items: products.map(p => ({
      name: p.name, item_no: p.item_no, qty: p.qty, cbm: p.cbm,
      gross_weight_kg: 0, box_l: 0, box_w: 0, box_h: 0, cartons: 0, notes: p.notes || '',
    })) };
  }

  const isPdf   = ext === 'pdf';
  const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
  if (!isPdf && !isImage) {
    throw new Error(`סוג קובץ ".${ext}" לא נתמך לחילוץ Packing List.`);
  }
  if (file.size > MAX_AI_FILE_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new Error(`הקובץ גדול מדי (${mb}MB).`);
  }
  const base64 = await fileToBase64(file);
  const mediaType   = isPdf ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const contentType = isPdf ? 'document' : 'image';

  const result = await invokeAnthropic({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: contentType, source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: PACKING_PROMPT },
      ],
    }],
  });

  const text = result.content?.[0]?.text?.trim() || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('ה-AI לא החזיר JSON. ייתכן שזה לא Packing List.');

  let parsed;
  try { parsed = JSON.parse(m[0]); }
  catch { throw new Error('ה-AI החזיר JSON לא תקין.'); }
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return {
    items: items.map(it => ({
      name:            String(it.name || '').trim(),
      item_no:         String(it.item_no || '').trim(),
      qty:             Number(it.qty) || 0,
      cbm:             Number(it.cbm) || 0,
      gross_weight_kg: Number(it.gross_weight_kg) || 0,
      box_l:           Number(it.box_l) || 0,
      box_w:           Number(it.box_w) || 0,
      box_h:           Number(it.box_h) || 0,
      cartons:         Number(it.cartons) || 0,
      notes:           String(it.notes || '').trim(),
    })).filter(it => it.name || it.item_no),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper — download a file already in Supabase Storage as a browser File
// ─────────────────────────────────────────────────────────────────────────────

export async function fileFromStorageUrl(url, fallbackName = 'document') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('שגיאה בהורדת הקובץ מהאחסון: ' + res.status);
  const blob = await res.blob();
  // Try to keep a reasonable filename + mime
  const name = (url.split('/').pop() || fallbackName).split('?')[0];
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}
