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

  const prompt = `You are an expert at extracting line items from supplier invoices and packing lists from any country (Chinese, English, Hebrew). The attached document is an import document.

Extract two things:

## 1. Shipment details (document-wide)
- incoterms: delivery terms — FOB, CIF, EXW, FCA, CFR, CIP, DAP, DDP, etc. Return only the uppercase code.
- origin_port: port of loading. Look for: Port of Loading, Shipment Port, POL, 装运港, 港口, נמל טעינה. Return in English (e.g. "NINGBO").
- supplier: seller / vendor / manufacturer name from the document header.
- invoice_date: in YYYY-MM-DD format.
- payment_terms: T/T, L/C, D/P, etc.

## 2. Product rows
For EACH product line in the goods table, extract:
- name: product description (may be in Chinese, English, or mixed)
- item_no: SKU / Part No / Model No / Article No
- qty: quantity (PCS / Units / Sets / Pairs / 个 / 件)
- fob_price: UNIT price in USD. If the document shows total only, divide by qty.
- cbm: cubic meters per unit. If total CBM given for the line, divide by qty.
- supplier: usually from document header
- notes: anything relevant (color, size, material)

Important rules:
1. Numeric field missing → 0
2. Text field missing → ""
3. SKIP summary/total/shipping/tax rows — only real product lines
4. SKIP empty rows and column headers
5. Price is ALWAYS per single unit, never total
6. If the document is a Chinese invoice (报关资料, 装箱单, 形式发票), the product columns are usually labeled: 品名 (name), 货号/型号 (item_no), 数量 (qty), 单价 (unit price), 总价 (total), 体积 (CBM)
7. If the document doesn't look like a goods invoice at all (e.g. it's a bank statement or a contract), return empty products array

Return ONLY a JSON object, no markdown fences, no prose:
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
  let parseErr = null;

  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]);
      if (Array.isArray(obj.products) && obj.products.length > 0) {
        products = obj.products;
        shipment = obj.shipment || null;
      } else if (Array.isArray(obj) && obj.length > 0) {
        products = obj;
      } else if (obj.products && obj.products.length === 0) {
        parseErr = 'AI החזיר products: [] — לא זיהה שורות מוצר במסמך';
      }
    } catch (err) { parseErr = 'JSON.parse נכשל: ' + err.message; }
  }

  if (products.length === 0 && arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr)) products = arr;
    } catch (err) { parseErr = parseErr || ('JSON.parse נכשל: ' + err.message); }
  }

  if (products.length === 0) {
    // Log raw response so we can debug what the AI actually saw.
    // eslint-disable-next-line no-console
    console.warn('[extractFromAI] AI raw response:', text);
    const preview = text.slice(0, 200).replace(/\s+/g, ' ');
    const detail = parseErr ? ` (${parseErr})` : '';
    throw new Error(
      `ה-AI לא החזיר רשימת מוצרים תקינה${detail}. תגובת AI (תחילית): "${preview}". ` +
      `פתח את ה-Console (F12) לראות את התגובה המלאה.`
    );
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

const SHIPMENT_PROMPT = `You are an expert at extracting shipment-tracking data from any kind of freight document: sea-container tracking pages, ocean bills of lading, AND air courier waybills (DHL, FedEx, UPS, TNT, ARAMEX), and air-freight house/master AWBs.

Detect the document type first, then map fields onto the SAME schema:

## SEA CONTAINER (MSC, COSCO, Maersk, ZIM, Hapag, CMA CGM, Evergreen, ONE, Yang Ming)
- container_number: 4 uppercase letters + 7 digits (e.g. TGBU7941499)
- container_type: one of 20GP / 40GP / 40HC / 45HC / LCL. "40' HIGH CUBE" → "40HC".
- carrier: shipping line name
- vessel_name: ocean vessel (e.g. "MSC OSCAR")
- voyage: voyage code (e.g. "GT619W")
- origin_port: load port + country (e.g. "Ningbo, CN")
- pod_port: discharge port + country (usually "Ashdod, IL" or "Haifa, IL")
- terminal: discharge terminal

## AIR COURIER WAYBILL (DHL Express, FedEx, UPS, TNT, ARAMEX, SF Express)
For courier documents, REUSE the same fields:
- container_number: the tracking/waybill number. For DHL use the WAYBILL number (e.g. "5726803283"); for FedEx the tracking number; for UPS the 1Z tracking. Strip spaces.
- container_type: "AIR" (one keyword — the UI knows this means air courier).
- carrier: DHL / FedEx / UPS / TNT / ARAMEX (whatever brand the waybill shows).
- vessel_name: service name shown on the waybill — DHL: "WPX" or "EXPRESS WORLDWIDE", FedEx: "IP" / "IE", UPS: "EXPRESS SAVER", etc. If unclear, use the carrier name.
- voyage: flight number if printed, else leave "".
- origin_port: origin airport code + country (e.g. "HKG, HK" for Hong Kong, "PVG, CN" for Shanghai Pudong). If only city name shown, use the city.
- pod_port: destination airport + country (e.g. "TLV, IL" for Tel Aviv).
- terminal: leave "" — courier doesn't have terminals.

## SHARED FIELDS (both types)
- departure_date: pickup or "Loaded on Vessel" date in YYYY-MM-DD
- eta_date: expected delivery / arrival in YYYY-MM-DD. For courier, if not printed, leave "".
- actual_arrival_date: actual delivery date if shown.

## EVENT TIMELINE
Array of events newest first. For courier docs there may be no timeline on the waybill itself — return an empty array in that case.
Each event:
- date: YYYY-MM-DD
- location: city + country
- description: short English description ("Export Loaded on Vessel", "Picked up", "In transit", "Arrived at destination facility")
- vessel_voyage: vessel + voyage for sea, flight number for air, "" if N/A
- terminal: optional

## RULES
1. Convert DD/MM/YYYY → YYYY-MM-DD.
2. Missing field → "".
3. Don't invent data not shown in the document.
4. If container_number/tracking_number is missing AND no events present, return container_number: "" and let the user fill it.
5. Strip spaces/dashes from tracking numbers (DHL often prints "57 2680 3283" — return "5726803283").

Return ONLY this JSON object, no markdown:
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
//  Payment-receipt extraction — bank transfer receipts, supplier paid invoices,
//  PayPal / credit-card confirmations. Separates goods total from shipping fee
//  so the user can route each amount to the right project field.
// ─────────────────────────────────────────────────────────────────────────────

const RECEIPT_PROMPT = `You are an expert at reading payment receipts and proof-of-payment documents for international trade. The attached file is a receipt for payment to a supplier or forwarder (bank transfer confirmation, credit card receipt, PayPal/Wise/wire receipt, paid commercial invoice).

Extract the following fields. Documents may be in English, Hebrew, or Chinese.

- payee: the company that received the money (the supplier/forwarder name)
- payer: the company that paid (Nir's company, usually Israeli)
- payment_date: in YYYY-MM-DD format
- payment_method: one of "wire_transfer" (T/T, SWIFT, bank wire), "credit_card", "paypal", "wise", "cash", "other"
- reference_number: transaction ID, SWIFT reference, or receipt number
- currency: ISO code — "USD", "ILS", "CNY", "EUR" — whatever the totals are in
- subtotal_goods: amount paid for the goods themselves (before shipping/tax)
- shipping_fee: shipping/freight charged on this receipt as a SEPARATE line, if shown
- other_fees: any other charges (handling, insurance, tax) as a single number
- total_paid: the grand total amount paid
- invoice_reference: invoice number this payment relates to, if shown
- notes: anything important (partial payment, deposit, etc.)

Rules:
1. Numeric field missing → 0
2. Text field missing → ""
3. If the receipt only shows a single total and doesn't split shipping out, put everything in subtotal_goods and leave shipping_fee = 0
4. Currency: just the three-letter code. If a symbol like $ is shown alone, assume USD.
5. If the document is NOT a payment receipt (it's an invoice that hasn't been paid yet), still extract what you can but set payment_date to "" and total_paid to 0.

Return ONLY this JSON, no markdown:
{"payee":"","payer":"","payment_date":"","payment_method":"","reference_number":"","currency":"USD","subtotal_goods":0,"shipping_fee":0,"other_fees":0,"total_paid":0,"invoice_reference":"","notes":""}`;

export async function extractReceiptFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const isPdf   = ext === 'pdf';
  const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
  if (!isPdf && !isImage) {
    throw new Error(`סוג קובץ ".${ext}" לא נתמך לקבלה — השתמש ב-PDF או תמונה.`);
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
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: contentType, source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: RECEIPT_PROMPT },
      ],
    }],
  });

  const text = result.content?.[0]?.text?.trim() || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {
    // eslint-disable-next-line no-console
    console.warn('[extractReceiptFromFile] raw AI response:', text);
    throw new Error('ה-AI לא החזיר JSON לקבלה.');
  }
  let p;
  try { p = JSON.parse(m[0]); } catch { throw new Error('ה-AI החזיר JSON לא תקין לקבלה.'); }

  return {
    payee:             String(p.payee || '').trim(),
    payer:             String(p.payer || '').trim(),
    payment_date:      normalizeDate(p.payment_date),
    payment_method:    String(p.payment_method || '').trim(),
    reference_number:  String(p.reference_number || '').trim(),
    currency:          (String(p.currency || 'USD').toUpperCase().replace(/[^A-Z]/g, '') || 'USD').slice(0, 3),
    subtotal_goods:    Number(p.subtotal_goods)   || 0,
    shipping_fee:      Number(p.shipping_fee)     || 0,
    other_fees:        Number(p.other_fees)       || 0,
    total_paid:        Number(p.total_paid)       || 0,
    invoice_reference: String(p.invoice_reference || '').trim(),
    notes:             String(p.notes || '').trim(),
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
