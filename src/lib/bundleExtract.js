import {
  extractProductsFromFile,
  extractShipmentFromFile,
  extractPackingFromFile,
  extractReceiptFromFile,
} from './aiExtract';

// ─────────────────────────────────────────────────────────────────────────────
//  Bundle extraction — runs the right extractor for each uploaded file in
//  parallel, then merges everything into ONE consolidated payload the user
//  reviews once and confirms once. Designed for "new project from documents"
//  flow where the importer drops 3-7 files (invoice, packing list, BL,
//  receipt, tracking screenshot) and gets the whole project pre-populated.
// ─────────────────────────────────────────────────────────────────────────────

const SHIPMENT_CATS = ['bill_of_lading', 'air_waybill', 'logistics_agent', 'customs_agent', 'screenshot'];

export function pickExtractor(category) {
  if (category === 'invoice') return 'products';
  if (category === 'packing_list') return 'packing';
  if (category === 'receipt') return 'receipt';
  if (SHIPMENT_CATS.includes(category)) return 'shipment';
  return null;
}

// Run all the file extractions in parallel.
// onProgress(idx, status) — called for UI loading state. status: 'running' | 'done' | 'error'
export async function extractBundle(filesWithCategories, onProgress = () => {}) {
  const tasks = filesWithCategories.map(async (fc, idx) => {
    const kind = pickExtractor(fc.category);
    if (!kind) {
      onProgress(idx, 'skipped');
      return { idx, kind: null, file: fc.file, category: fc.category };
    }
    onProgress(idx, 'running');
    try {
      let payload = {};
      if (kind === 'products') {
        const { products, shipment } = await extractProductsFromFile(fc.file);
        payload = { products, invoice_shipment: shipment };
      } else if (kind === 'packing') {
        const { items } = await extractPackingFromFile(fc.file);
        payload = { packing_items: items };
      } else if (kind === 'shipment') {
        const data = await extractShipmentFromFile(fc.file);
        payload = { shipment: data };
      } else if (kind === 'receipt') {
        const data = await extractReceiptFromFile(fc.file);
        payload = { receipt: data };
      }
      onProgress(idx, 'done');
      return { idx, kind, file: fc.file, category: fc.category, ...payload };
    } catch (err) {
      onProgress(idx, 'error', err.message);
      return { idx, kind, file: fc.file, category: fc.category, error: err.message };
    }
  });

  const results = await Promise.all(tasks);
  return mergeResults(results);
}

// Merge the per-file extraction results into a single consolidated payload.
// Conflict resolution: more-specific source wins.
//   - Incoterm: prefer commercial invoice over tracking screenshot
//   - origin_port: prefer BL > tracking > invoice
//   - container_number: BL > tracking > AWB
function mergeResults(results) {
  const merged = {
    products: [],
    packing_items: [],
    shipment: null,             // container / AWB tracking
    payment: null,              // receipt
    shipment_settings: {},      // incoterms, origin_port, supplier
    files: results.map(r => ({
      file: r.file,
      category: r.category,
      kind: r.kind,
      error: r.error || null,
      hasData: !!(r.products || r.shipment || r.packing_items || r.receipt),
    })),
    errors: results.filter(r => r.error).map(r => ({ file: r.file.name, message: r.error })),
  };

  // Pass 1 — collect everything
  for (const r of results) {
    if (r.products?.length) merged.products.push(...r.products);
    if (r.packing_items?.length) merged.packing_items.push(...r.packing_items);
    if (r.receipt) merged.payment = r.receipt;

    if (r.invoice_shipment) {
      const s = r.invoice_shipment;
      if (s.incoterms) merged.shipment_settings.incoterms = s.incoterms;
      if (s.origin_port && !merged.shipment_settings.origin_port) {
        merged.shipment_settings.origin_port = s.origin_port;
      }
      if (s.supplier) merged.shipment_settings.supplier = s.supplier;
    }

    if (r.shipment) {
      // Tracking / BL / AWB extraction → contains container_number, vessel, etc.
      const s = r.shipment;
      if (!merged.shipment) merged.shipment = {};
      const priorityFor = (cat) => {
        if (cat === 'bill_of_lading') return 3;
        if (cat === 'air_waybill') return 3;
        if (cat === 'logistics_agent') return 2;
        if (cat === 'screenshot') return 2;
        if (cat === 'customs_agent') return 1;
        return 0;
      };
      const fields = [
        'container_number', 'container_type', 'carrier', 'vessel_name', 'voyage',
        'origin_port', 'pod_port', 'terminal',
        'departure_date', 'eta_date', 'actual_arrival_date',
        'declared_pieces', 'declared_packages', 'declared_cbm',
        'declared_weight_kg', 'declared_value_usd',
      ];
      for (const k of fields) {
        if (!s[k]) continue;
        // Use this value if we don't have one OR this source has higher priority
        if (!merged.shipment[k] || priorityFor(r.category) > priorityFor(merged.shipment._source_category)) {
          merged.shipment[k] = s[k];
          merged.shipment._source_category = r.category;
        }
      }
      if (Array.isArray(s.events) && s.events.length) {
        merged.shipment.events = (merged.shipment.events || []).concat(s.events);
      }
      // If shipment doc has origin_port and invoice didn't, take it
      if (s.origin_port && !merged.shipment_settings.origin_port) {
        merged.shipment_settings.origin_port = s.origin_port;
      }
    }
  }

  // Pass 2 — sort and dedupe events
  if (merged.shipment?.events?.length) {
    const seen = new Set();
    merged.shipment.events = merged.shipment.events
      .filter(e => {
        const key = `${e.date || ''}|${e.location || ''}|${e.description || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  // Pass 3 — match packing data to products by item_no / name
  if (merged.packing_items.length && merged.products.length) {
    for (const product of merged.products) {
      const match = findPackingMatch(product, merged.packing_items);
      if (!match) continue;
      // Pull missing dimensions from packing list — never overwrite invoice values
      if (!product.gross_weight_kg && match.gross_weight_kg) product.gross_weight_kg = match.gross_weight_kg;
      if (!product.box_l && match.box_l) product.box_l = match.box_l;
      if (!product.box_w && match.box_w) product.box_w = match.box_w;
      if (!product.box_h && match.box_h) product.box_h = match.box_h;
      // Trust packing list CBM if invoice CBM is missing or zero
      if (!product.cbm && match.cbm) product.cbm = match.cbm;
    }
  }

  return merged;
}

function findPackingMatch(product, packingItems) {
  if (product.item_no) {
    const byItem = packingItems.find(pi =>
      pi.item_no && pi.item_no.trim().toLowerCase() === product.item_no.trim().toLowerCase()
    );
    if (byItem) return byItem;
  }
  if (product.name) {
    const needle = product.name.trim().toLowerCase();
    const byName = packingItems.find(pi => {
      const n = (pi.name || '').trim().toLowerCase();
      return n === needle || (n.length > 4 && needle.includes(n)) || (needle.length > 4 && n.includes(needle));
    });
    if (byName) return byName;
  }
  return null;
}
