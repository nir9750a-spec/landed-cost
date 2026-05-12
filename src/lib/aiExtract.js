import * as XLSX from 'xlsx';

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

async function extractFromAI(file, ext, apiKey) {
  const base64 = await fileToBase64(file);
  const isPdf    = ext === 'pdf';
  const isImage  = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);

  if (!isPdf && !isImage) {
    throw new Error('פורמט קובץ לא נתמך. השתמש ב-PDF, תמונה (JPG/PNG/WEBP), או Excel.');
  }

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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: contentType, source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `שגיאת API (${response.status})`;
    throw new Error(msg.includes('overloaded') ? 'שרת ה-AI עמוס כרגע — נסה שוב בעוד מספר שניות' : msg);
  }

  const result = await response.json();
  const text   = result.content?.[0]?.text?.trim() || '';

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
export async function extractProductsFromFile(file, apiKey) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    const products = await extractFromExcel(file);
    return { products, shipment: null };
  }

  if (!apiKey) {
    throw new Error(
      'נדרש מפתח Anthropic API לחילוץ מ-PDF ותמונות.\n' +
      'הגדר אותו בעמוד ההגדרות → הגדרות כלליות → מפתח Anthropic API.'
    );
  }

  if (!['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    throw new Error(`סוג קובץ ".${ext}" אינו נתמך. השתמש ב-Excel, PDF, או תמונה (JPG/PNG/WEBP).`);
  }

  return extractFromAI(file, ext, apiKey);
}
