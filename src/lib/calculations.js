// ─── Incoterms & port constants ────────────────────────────────────────────
export const INCOTERMS_LIST = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'];
export const ORIGIN_PORTS   = ['שנגחאי','שנזן','גואנגג׳ו','נינגבו','טיאנג׳ין','קינגדאו','יונגקאנג'];

export const INCOTERMS_DESC = {
  EXW: 'קבלת הסחורה מהמפעל — הקונה אחראי לכל העלויות',
  FCA: 'המוכר מעביר למוביל — הקונה אחראי ממסירה למוביל',
  FAS: 'המוכר מאחסן ליד האוניה — הקונה מטעין ומעלה',
  FOB: 'המוכר מעמיס — הקונה אחראי מהאוניה (הנפוץ ביותר)',
  CFR: 'המוכר משלם הובלה לנמל יעד — הקונה אחראי לביטוח',
  CIF: 'המוכר משלם הובלה + ביטוח לנמל יעד',
  CPT: 'המוכר משלם הובלה למוביל בנקודת יעד — הקונה אחראי לביטוח',
  CIP: 'המוכר משלם הובלה + ביטוח עד נקודת יעד',
  DAP: 'המוכר אחראי עד נקודת יעד — לא כולל פריקה ומכס',
  DPU: 'המוכר אחראי עד הפריקה בנמל יעד — לא כולל מכס',
  DDP: 'המוכר אחראי לכל העלויות כולל מכס ומע"מ',
};

// ─── Buyer-pays matrix per Incoterm ────────────────────────────────────────
//   china = local Chinese transport (factory → port)
//   fr    = international freight
//   ins   = marine insurance
//   cust  = customs duty
//   vat   = import VAT
//   port  = Israeli port fees
//   local = Israeli local transport
const BP = {
  EXW: { china:true,  fr:true,  ins:true,  cust:true,  vat:true,  port:true,  local:true  },
  FCA: { china:true,  fr:true,  ins:true,  cust:true,  vat:true,  port:true,  local:true  },
  FAS: { china:true,  fr:true,  ins:true,  cust:true,  vat:true,  port:true,  local:true  },
  FOB: { china:false, fr:true,  ins:true,  cust:true,  vat:true,  port:true,  local:true  },
  CFR: { china:false, fr:false, ins:true,  cust:true,  vat:true,  port:true,  local:true  },
  CIF: { china:false, fr:false, ins:false, cust:true,  vat:true,  port:true,  local:true  },
  CPT: { china:false, fr:false, ins:true,  cust:true,  vat:true,  port:true,  local:true  },
  CIP: { china:false, fr:false, ins:false, cust:true,  vat:true,  port:true,  local:true  },
  DAP: { china:false, fr:false, ins:false, cust:true,  vat:true,  port:false, local:false },
  DPU: { china:false, fr:false, ins:false, cust:true,  vat:true,  port:false, local:false },
  DDP: { china:false, fr:false, ins:false, cust:false, vat:false, port:false, local:false },
};

// ─── Setting key groups ─────────────────────────────────────────────────────
export const GLOBAL_SETTINGS_KEYS = [
  'vat', 'customs', 'agent_fee', 'api_key', 'port_fees', 'local_transport', 'purchase_tax_rate',
];
export const PROJECT_SETTINGS_KEYS = [
  'usd_rate', 'freight', 'insurance', 'margin', 'margin_type',
  'incoterms', 'shipping_method', 'sea_type', 'lcl_price_per_cbm',
  'air_price_per_kg', 'origin_port', 'china_local_transport',
];

export const DEFAULT_SETTINGS = {
  usd_rate:             3.7,
  freight:              5000,    // FCL container price $
  customs:              5,       // default customs %
  vat:                  18,      // Israel VAT %
  agent_fee:            4000,    // customs agent fee ₪
  insurance:            0.5,     // insurance %
  margin:               25,
  margin_type:          'markup',
  port_fees:            0,
  local_transport:      0,
  api_key:              '',
  purchase_tax_rate:    0,       // מס קניה %
  incoterms:            'FOB',
  shipping_method:      'sea',   // 'sea' | 'air'
  sea_type:             'fcl',   // 'fcl' | 'lcl'
  lcl_price_per_cbm:   0,
  air_price_per_kg:    0,
  origin_port:          'שנגחאי',
  china_local_transport: 0,
};

// ─── Format helpers ─────────────────────────────────────────────────────────
const HE  = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
const HE2 = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export const fmt = {
  ils:  n => '₪' + Number(n || 0).toLocaleString('he-IL', HE),
  ils2: n => '₪' + Number(n || 0).toLocaleString('he-IL', HE2),
  usd:  n => '$' + Number(n || 0).toLocaleString('he-IL', HE2),
  pct:  n => Number(n || 0).toFixed(1) + '%',
  num:  n => Number(n || 0).toLocaleString('he-IL', HE),
  cbm:  n => Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
  kg:   n => Number(n || 0).toLocaleString('he-IL', HE2) + ' ק"ג',
};

// ─── Core calculation engine ─────────────────────────────────────────────────
//
//  Based on Israel Customs Authority official CIF method:
//  customs_duty = CIF_USD × rate × customs%
//  vat_base     = (CIF_USD × rate) + customs_duty_ils + purchase_tax_ils
//  vat          = vat_base × 18%
//
//  Warehouse cost = CIF×rate + customs + purchase_tax + VAT
//                 + agent + port + local_transport + china_transport
//
//  Note: VAT is included in warehouse cost (cash-flow basis).
//        Registered importers can reclaim VAT.
// ────────────────────────────────────────────────────────────────────────────

export function calcProducts(products, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };

  const rate           = Number(s.usd_rate)          || 3.7;
  const incoterms      = (s.incoterms || 'FOB').toUpperCase();
  const pays           = BP[incoterms] || BP.FOB;
  const shippingMethod = (s.shipping_method || 'sea').toLowerCase();
  const seaType        = (s.sea_type        || 'fcl').toLowerCase();
  const fclPrice       = Number(s.freight)                  || 0;
  const lclPerCbm      = Number(s.lcl_price_per_cbm)        || 0;
  const airPerKg       = Number(s.air_price_per_kg)         || 0;
  const insurancePct   = Number(s.insurance)                / 100;
  const globalCustomsPct     = Number(s.customs)            / 100;
  const globalPurchaseTaxPct = Number(s.purchase_tax_rate)  / 100 || 0;
  const vatPct         = Number(s.vat)                      / 100;
  const agentFeeIls    = Number(s.agent_fee);
  const portFeesIls    = pays.port  ? (Number(s.port_fees)        || 0) : 0;
  const localTransIls  = pays.local ? (Number(s.local_transport)  || 0) : 0;
  const chinaTransUsd  = pays.china ? (Number(s.china_local_transport) || 0) : 0;
  const marginPct      = Number(s.margin) / 100;
  const marginType     = s.margin_type || 'markup';

  const totalCbm = products.reduce((a, p) => a + (Number(p.qty) * Number(p.cbm)), 0);
  const totalFob = products.reduce((a, p) => a + (Number(p.qty) * Number(p.fob_price)), 0);

  return products.map(p => {
    const qty      = Number(p.qty)       || 0;
    const fobPrice = Number(p.fob_price) || 0;
    const cbmUnit  = Number(p.cbm)       || 0;
    const grossKg  = Number(p.gross_weight_kg) || 0;
    const boxL     = Number(p.box_l) || 0;
    const boxW     = Number(p.box_w) || 0;
    const boxH     = Number(p.box_h) || 0;

    const fobTotal   = qty * fobPrice;
    const productCbm = qty * cbmUnit;
    const cbmShare   = totalCbm > 0 ? productCbm / totalCbm
                     : totalFob > 0 ? fobTotal   / totalFob : 0;
    const fobShare   = totalFob > 0 ? fobTotal / totalFob : 0;

    // ── Step 2: Freight share ──────────────────────────────────────────────
    let freightShare     = 0;
    let chargeableWeight = 0;

    if (pays.fr) {
      if (shippingMethod === 'air') {
        const volWeight = (boxL * boxW * boxH) / 6000;
        chargeableWeight = Math.max(grossKg * qty, volWeight * qty);
        freightShare = chargeableWeight * airPerKg;
      } else if (seaType === 'lcl') {
        freightShare = productCbm * lclPerCbm;
      } else {
        freightShare = fclPrice * cbmShare;           // FCL by CBM ratio
      }
    }

    // ── Step 3: Insurance ─────────────────────────────────────────────────
    const insuranceShare = pays.ins
      ? (fobTotal + freightShare) * insurancePct
      : 0;

    // ── Step 4: CIF ───────────────────────────────────────────────────────
    const cifUsd = fobTotal + freightShare + insuranceShare;

    // ── Step 5: Customs duty in ILS (CIF-based — official Israel method) ──
    const customsRate = pays.cust
      ? ((p.customs_rate_override != null && p.customs_rate_override !== '')
          ? Number(p.customs_rate_override) / 100
          : globalCustomsPct)
      : 0;
    const customsDutyIls = cifUsd * rate * customsRate;

    // ── Step 6: Purchase tax in ILS ───────────────────────────────────────
    const purchaseTaxRate = pays.cust
      ? ((p.purchase_tax_rate_override != null && p.purchase_tax_rate_override !== '')
          ? Number(p.purchase_tax_rate_override) / 100
          : globalPurchaseTaxPct)
      : 0;
    const purchaseTaxIls = cifUsd * rate * purchaseTaxRate;

    // ── Step 7: VAT 18% on CIF + customs + purchase_tax ──────────────────
    const vatIls = pays.vat
      ? (cifUsd * rate + customsDutyIls + purchaseTaxIls) * vatPct
      : 0;

    // ── Step 8: Agent fee (by FOB share) ─────────────────────────────────
    const agentShareIls = agentFeeIls * fobShare;

    // ── Step 9: Port fees (by CBM share) ─────────────────────────────────
    const portShareIls = portFeesIls * cbmShare;

    // ── Step 10: Local Israeli transport (by CBM share) ───────────────────
    const transportShareIls = localTransIls * cbmShare;

    // ── Step 11: China local transport, EXW/FCA/FAS only (by CBM share) ──
    const chinaShareIls = chinaTransUsd * rate * cbmShare;

    // ── Step 12: Total warehouse cost ─────────────────────────────────────
    const warehouseCostIls =
      (cifUsd * rate)
      + customsDutyIls
      + purchaseTaxIls
      + vatIls
      + agentShareIls
      + portShareIls
      + transportShareIls
      + chinaShareIls;

    // ── Step 13: Cost per unit ────────────────────────────────────────────
    const costPerUnit = qty > 0 ? warehouseCostIls / qty : 0;

    // ── Step 14: Sell price ───────────────────────────────────────────────
    let sellPerUnit;
    if (marginType === 'margin') {
      sellPerUnit = marginPct < 1 ? costPerUnit / (1 - marginPct) : costPerUnit * 2;
    } else {
      sellPerUnit = costPerUnit * (1 + marginPct);
    }

    // ── Step 15: Profit ───────────────────────────────────────────────────
    const profitPerUnit = sellPerUnit - costPerUnit;
    const profitTotal   = profitPerUnit * qty;
    const sellPrice     = sellPerUnit * qty;
    const landedCostUsd = rate > 0 ? warehouseCostIls / rate : 0;
    const agentShareUsd = rate > 0 ? agentShareIls / rate : 0;

    const _roi      = costPerUnit > 0 ? (profitPerUnit / costPerUnit) * 100 : 0;
    const _marginPct = sellPerUnit > 0 ? (profitPerUnit / sellPerUnit) * 100 : 0;

    return {
      ...p,
      // ── Raw ──────────────────────────────────────────────────────────────
      _fobTotal:          fobTotal,
      _productCbm:        productCbm,
      _chargeableWeight:  chargeableWeight,
      // ── USD components ──────────────────────────────────────────────────
      _freightShare:      freightShare,
      _insuranceAmount:   insuranceShare,
      _cif:               cifUsd,
      // ── ILS components ──────────────────────────────────────────────────
      _customsDutyIls:    customsDutyIls,
      _purchaseTaxIls:    purchaseTaxIls,
      _vatIls:            vatIls,
      _agentShareIls:     agentShareIls,
      _portShareIls:      portShareIls,
      _transportShareIls: transportShareIls,
      _chinaShareIls:     chinaShareIls,
      // ── Totals ───────────────────────────────────────────────────────────
      _landedCostIls:     warehouseCostIls,
      _landedCostUsd:     landedCostUsd,
      _costPerUnit:       costPerUnit,
      _sellPrice:         sellPrice,
      _sellPerUnit:       sellPerUnit,
      _profit:            profitTotal,
      _profitPerUnit:     profitPerUnit,
      _roi,
      _breakevenUnit:     costPerUnit,
      _marginPct,
      // ── Legacy aliases (for backward compat with existing display) ───────
      _agentShare:        agentShareUsd,
      _customsAmount:     rate > 0 ? customsDutyIls / rate : 0,
      _vatAmount:         rate > 0 ? vatIls / rate : 0,
      _beforeVat:         cifUsd + (rate > 0 ? customsDutyIls / rate : 0),
    };
  });
}

// ─── Aggregation ────────────────────────────────────────────────────────────
export function calcTotals(calced) {
  const sum = key => calced.reduce((a, p) => a + (Number(p[key]) || 0), 0);
  const t = {
    qtyTotal:             sum('qty'),
    fobTotal:             sum('_fobTotal'),
    totalCbm:             sum('_productCbm'),
    freightTotal:         sum('_freightShare'),
    insuranceTotal:       sum('_insuranceAmount'),
    cifTotal:             sum('_cif'),
    customsIlsTotal:      sum('_customsDutyIls'),
    purchaseTaxIlsTotal:  sum('_purchaseTaxIls'),
    vatIlsTotal:          sum('_vatIls'),
    agentIlsTotal:        sum('_agentShareIls'),
    portIlsTotal:         sum('_portShareIls'),
    transportIlsTotal:    sum('_transportShareIls'),
    chinaIlsTotal:        sum('_chinaShareIls'),
    landedIlsTotal:       sum('_landedCostIls'),
    landedUsdTotal:       sum('_landedCostUsd'),
    sellTotal:            sum('_sellPrice'),
    profitTotal:          sum('_profit'),
    // Legacy
    customsTotal:         sum('_customsAmount'),
    vatTotal:             sum('_vatAmount'),
    agentTotal:           sum('_agentShare'),
    beforeVatTotal:       sum('_beforeVat'),
  };
  t.roiTotal       = t.landedIlsTotal > 0 ? (t.profitTotal / t.landedIlsTotal) * 100 : 0;
  t.marginPctTotal = t.sellTotal > 0      ? (t.profitTotal / t.sellTotal)       * 100 : 0;
  return t;
}
