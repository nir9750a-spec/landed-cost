import { mergeResults } from './bundleExtract';

// Simulates the real "shipment already on the way" case: the same goods appear
// in BOTH a proforma and a commercial invoice, and the packing list carries the
// weights/dimensions. We must end up with ONE row per product, enriched.

test('no duplicate products across two invoices; packing fills weights/sizes', () => {
  const proforma = {
    file: { name: 'proforma.pdf' }, category: 'invoice', kind: 'products',
    products: [
      { name: 'Parking air conditioner', item_no: 'AC-12V', qty: 10, fob_price: 188, cbm: 0, gross_weight_kg: 0 },
      { name: 'Folding table', item_no: 'FT-90', qty: 20, fob_price: 15, cbm: 0, gross_weight_kg: 0 },
    ],
    invoice_shipment: { incoterms: 'FCA', supplier: 'Dezhou Chuangtao', origin_port: 'NINGBO' },
  };
  const commercial = {
    file: { name: 'commercial.pdf' }, category: 'invoice', kind: 'products',
    products: [
      // Same two items again (same shipment) — must NOT duplicate.
      { name: 'Parking air conditioner', item_no: 'AC-12V', qty: 10, fob_price: 188, cbm: 0.35 },
      { name: 'Folding table', item_no: 'FT-90', qty: 20, fob_price: 15, cbm: 0.08 },
    ],
  };
  const packing = {
    file: { name: 'packing.pdf' }, category: 'packing_list', kind: 'packing',
    packing_items: [
      { name: 'Parking air conditioner', item_no: 'AC-12V', gross_weight_kg: 14, box_l: 80, box_w: 40, box_h: 35, cbm: 0.35 },
      { name: 'Folding table', item_no: 'FT-90', gross_weight_kg: 6, box_l: 90, box_w: 60, box_h: 12, cbm: 0.08 },
    ],
  };

  const merged = mergeResults([proforma, commercial, packing]);

  // 1) No duplicates — exactly two products, not four.
  expect(merged.products).toHaveLength(2);

  const ac = merged.products.find(p => p.item_no === 'AC-12V');
  const ft = merged.products.find(p => p.item_no === 'FT-90');

  // 2) qty not double-counted (same physical shipment).
  expect(ac.qty).toBe(10);
  expect(ft.qty).toBe(20);

  // 3) CBM filled from the commercial invoice (proforma had 0).
  expect(ac.cbm).toBeCloseTo(0.35);
  expect(ft.cbm).toBeCloseTo(0.08);

  // 4) Weights + dimensions merged from the packing list.
  expect(ac.gross_weight_kg).toBe(14);
  expect(ac.box_l).toBe(80);
  expect(ft.gross_weight_kg).toBe(6);
  expect(ft.box_h).toBe(12);

  // 5) Incoterm/supplier carried through.
  expect(merged.shipment_settings.incoterms).toBe('FCA');
  expect(merged.shipment_settings.supplier).toBe('Dezhou Chuangtao');
});

test('merges Excel row (name+weight, no code) with PDF invoice row (code+price, no weight)', () => {
  // Real case: the customs Excel packing tab has the weight but no item_no;
  // the PDF invoice has the item_no + price but no weight. One product, unified.
  const excel = { file: { name: 'x.xlsx' }, category: 'invoice', kind: 'products',
    products: [{ name: 'Folding oven', item_no: '', qty: 50, fob_price: 7.1, cbm: 1.17, gross_weight_kg: 149.5 }] };
  const pdf = { file: { name: 'inv.pdf' }, category: 'invoice', kind: 'products',
    products: [{ name: 'Folding oven', item_no: 'YF-CHL-14', qty: 50, fob_price: 7.1, cbm: 0, gross_weight_kg: 0 }] };
  const merged = mergeResults([excel, pdf]);
  expect(merged.products).toHaveLength(1);
  const o = merged.products[0];
  expect(o.item_no).toBe('YF-CHL-14');
  expect(o.gross_weight_kg).toBe(149.5);
  expect(o.cbm).toBeCloseTo(1.17);
});

test('products without item_no dedupe by exact name only', () => {
  const a = { file: { name: 'a.pdf' }, category: 'invoice', kind: 'products',
    products: [{ name: 'Camping lamp', item_no: '', qty: 5, fob_price: 4 }] };
  const b = { file: { name: 'b.pdf' }, category: 'invoice', kind: 'products',
    products: [{ name: 'Camping lamp', item_no: '', qty: 5, fob_price: 4, cbm: 0.01 }] };
  const merged = mergeResults([a, b]);
  expect(merged.products).toHaveLength(1);
  expect(merged.products[0].cbm).toBeCloseTo(0.01);
});
