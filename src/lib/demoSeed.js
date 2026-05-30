import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
//  Demo project seed — gives a brand-new visitor a fully populated project
//  with 8 realistic camping/4x4 SKUs from a typical Yongkang supplier, an
//  FCL 40HC container, and Israel Customs defaults. They land on the
//  dashboard and immediately see what the product produces, no typing.
//
//  Idempotent: skips the seed if a project with the same name already exists
//  for this Supabase instance. Returns the seeded project's id.
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_PROJECT_NAME = 'דמו · מיטות קמפינג שנגחאי';

const DEMO_PRODUCTS = [
  {
    name: 'מיטת שדה מתקפלת אלומיניום XL',
    item_no: 'CB-XL-AL',
    qty: 60,
    fob_price: 28.50,
    cbm: 0.085,
    gross_weight_kg: 4.2,
    box_l: 80, box_w: 18, box_h: 18,
    hs_code: '94017900',
    customs_rate_override: 12,
    supplier: 'Yongkang Hispeed Outdoor Co., Ltd',
    notes: 'מיטת קמפינג עמידה עד 150 ק"ג, אלומיניום + בד 600D',
  },
  {
    name: 'אוהל 4 אנשים דאבל-לייר',
    item_no: 'TENT-4P-DL',
    qty: 40,
    fob_price: 52.00,
    cbm: 0.045,
    gross_weight_kg: 5.8,
    box_l: 55, box_w: 22, box_h: 22,
    hs_code: '63062200',
    customs_rate_override: 12,
    supplier: 'Yongkang Hispeed Outdoor Co., Ltd',
    notes: 'אטום למים 3000mm, מסגרת פייברגלאס',
  },
  {
    name: 'שק שינה -5°C סינטטי',
    item_no: 'SB-MINUS5',
    qty: 80,
    fob_price: 18.20,
    cbm: 0.020,
    gross_weight_kg: 2.4,
    box_l: 38, box_w: 25, box_h: 22,
    hs_code: '94042100',
    customs_rate_override: 12,
    supplier: 'Yongkang Hispeed Outdoor Co., Ltd',
    notes: 'מילוי הוליפייבר 400 גרם/מ"ר',
  },
  {
    name: 'כיסא מתקפל קמפינג עם מתלה כוס',
    item_no: 'CHAIR-CMP-C',
    qty: 100,
    fob_price: 9.80,
    cbm: 0.015,
    gross_weight_kg: 2.1,
    box_l: 25, box_w: 18, box_h: 80,
    hs_code: '94017900',
    customs_rate_override: 12,
    supplier: 'Yongkang Hispeed Outdoor Co., Ltd',
    notes: 'נושא עד 120 ק"ג',
  },
  {
    name: 'פנס לד 3W נטען USB',
    item_no: 'LAMP-LED-3W',
    qty: 200,
    fob_price: 4.50,
    cbm: 0.002,
    gross_weight_kg: 0.18,
    box_l: 14, box_w: 8, box_h: 8,
    hs_code: '94052000',
    customs_rate_override: 0,
    supplier: 'Yongkang Hispeed Outdoor Co., Ltd',
    notes: 'סוללת ליתיום 1200mAh, IPX4',
  },
  {
    name: 'תרמוס נירוסטה 1 ליטר',
    item_no: 'THERM-1L-SS',
    qty: 120,
    fob_price: 6.80,
    cbm: 0.004,
    gross_weight_kg: 0.5,
    box_l: 30, box_w: 10, box_h: 10,
    hs_code: '96170000',
    customs_rate_override: 0,
    supplier: 'Yongkang Hispeed Outdoor Co., Ltd',
    notes: 'דופן כפולה, 12h חם / 24h קר',
  },
  {
    name: 'סט סירים אנודייז 3 חלקים',
    item_no: 'COOK-3PC-AN',
    qty: 50,
    fob_price: 14.20,
    cbm: 0.010,
    gross_weight_kg: 0.95,
    box_l: 22, box_w: 22, box_h: 20,
    hs_code: '76151000',
    customs_rate_override: 5,
    supplier: 'Yongkang Hispeed Outdoor Co., Ltd',
    notes: 'אלומיניום אנודייז, ידיות מתקפלות',
  },
  {
    name: 'אדפטר 12V→USB עם מד וולט',
    item_no: 'ADP-12V-USB',
    qty: 150,
    fob_price: 3.20,
    cbm: 0.001,
    gross_weight_kg: 0.08,
    box_l: 10, box_w: 6, box_h: 4,
    hs_code: '85044090',
    customs_rate_override: 0,
    supplier: 'Yongkang Hispeed Outdoor Co., Ltd',
    notes: '2× USB-A, מקסימום 3.1A',
  },
];

const DEMO_SETTINGS_OVERRIDES = {
  incoterms: 'FOB',
  origin_port: 'שנגחאי',
  shipping_method: 'sea',
  insurance: 0.5,
  margin: 30,
  margin_type: 'markup',
  agent_fee: 3500,
  port_fees: 1200,
  local_transport: 1800,
  china_local_transport: 0,
  manual_container_code: '40hc',
  force_lcl: false,
  // actual_freight_usd left null so the user sees the LCL/FCL estimate logic
};

export async function findExistingDemo() {
  const { data, error } = await supabase
    .from('projects').select('id, name').eq('name', DEMO_PROJECT_NAME).maybeSingle();
  if (error) return null;
  return data;
}

export async function seedDemoProject() {
  // Skip if a demo project already exists — idempotent
  const existing = await findExistingDemo();
  if (existing) return existing.id;

  // 1. Create project
  const { data: project, error: projErr } = await supabase.from('projects').insert({
    name:     DEMO_PROJECT_NAME,
    supplier: 'Yongkang Hispeed Outdoor Co., Ltd',
    status:   'active',
    notes:    'פרויקט דמו — נתונים אמיתיים מספק טיפוסי, סכומים מבוססי שוק. ערוך, שכפל, או מחק בכל עת.',
    shipment_date: null,
  }).select().single();
  if (projErr) throw new Error('יצירת פרויקט דמו נכשלה: ' + projErr.message);

  // 2. Project settings
  const { error: setErr } = await supabase.from('settings').insert({
    project_id: project.id,
    ...DEMO_SETTINGS_OVERRIDES,
  });
  if (setErr) {
    // Roll back the project so we don't leave a dangling demo with no settings
    await supabase.from('projects').delete().eq('id', project.id);
    throw new Error('הגדרות דמו נכשלו: ' + setErr.message);
  }

  // 3. Products
  const productRows = DEMO_PRODUCTS.map(p => ({ ...p, project_id: project.id }));
  const { error: prodErr } = await supabase.from('products').insert(productRows);
  if (prodErr) {
    await supabase.from('projects').delete().eq('id', project.id);
    throw new Error('מוצרי דמו נכשלו: ' + prodErr.message);
  }

  return project.id;
}
