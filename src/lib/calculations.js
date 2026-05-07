// ─── Setting key groups ────────────────────────────────────────────────────
export const GLOBAL_SETTINGS_KEYS  = ['vat', 'customs', 'agent_fee', 'api_key', 'port_fees', 'local_transport'];
export const PROJECT_SETTINGS_KEYS = ['usd_rate', 'freight', 'insurance', 'margin', 'margin_type'];
// margin_type: 'markup' → sell = cost × (1 + m)   |  'margin' → sell = cost / (1 − m)  (gross margin)

export const DEFAULT_SETTINGS = {
  usd_rate:        3.7,
  freight:         5000,
  customs:         5,
  vat:             18,
  agent_fee:       4000,
  insurance:       0.5,
  margin:          25,
  margin_type:     'markup',   // string — special-cased in App.js parseRow / mergeSettings
  port_fees:       0,
  local_transport: 0,
  api_key:         '',
};

// ─── Format helpers ────────────────────────────────────────────────────────
const HE = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
const HE2 = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export const fmt = {
  ils:  n => '₪' + Number(n || 0).toLocaleString('he-IL', HE),
  ils2: n => '₪' + Number(n || 0).toLocaleString('he-IL', HE2),
  usd:  n => '$' + Number(n || 0).toLocaleString('he-IL', HE2),
  pct:  n => Number(n || 0).toFixed(1) + '%',
  num:  n => Number(n || 0).toLocaleString('he-IL', HE),
  cbm:  n => Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
};

// ─── Core calculation ──────────────────────────────────────────────────────
//
//  Step 1  total_ils = (fob×rate) + (freight×rate) + (insurance×rate)
//                    + (customs×rate) + agent_fee + port_fees + local_transport
//          (agent_fee / port_fees / local_transport already in ILS)
//
//  Step 2  cost_per_cbm = total_ils / total_cbm
//          Fallback (cbm=0): cost = (total_ils / total_fob_usd) × fob_price
//
//  Step 3  warehouse_cost_unit = cost_per_cbm × cbm_unit
//
//  Step 4  sell_price
//          markup:  sell = cost × (1 + margin%)
//          margin:  sell = cost / (1 − margin%)   ← gross-margin correct
//
//  Step 5  profit = sell − cost
//          roi     = profit / cost × 100
//
//  Insurance uses ICC formula: premium = value × r / (1 − r)
//  so the policy covers the premium itself.
// ──────────────────────────────────────────────────────────────────────────

export function calcProducts(products, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };

  const rate           = Number(s.usd_rate);
  const freightUsd     = Number(s.freight);
  const insurancePct   = Number(s.insurance)       / 100;
  const customsPct     = Number(s.customs)          / 100;
  const vatPct         = Number(s.vat)              / 100;
  const agentFeeIls    = Number(s.agent_fee);
  const portFeesIls    = Number(s.port_fees)        || 0;
  const localTransIls  = Number(s.local_transport)  || 0;
  const marginPct      = Number(s.margin)            / 100;
  const marginType     = s.margin_type || 'markup';

  const totalCbm = products.reduce((a, p) => a + (Number(p.qty) * Number(p.cbm)),        0);
  const totalFob = products.reduce((a, p) => a + (Number(p.qty) * Number(p.fob_price)),  0);

  // Pass 1 — per-product USD intermediates (display + customs sum)
  const inter = products.map(p => {
    const qty      = Number(p.qty)       || 0;
    const fobPrice = Number(p.fob_price) || 0;
    const cbmUnit  = Number(p.cbm)       || 0;
    const fobTotal   = qty * fobPrice;
    const productCbm = qty * cbmUnit;

    const useCbm = cbmUnit > 0 && totalCbm > 0;
    const share  = useCbm
      ? productCbm / totalCbm
      : (totalFob > 0 ? fobTotal / totalFob : 0);

    const freightShare = freightUsd * share;
    // ICC marine insurance: premium = value × r / (1 − r)
    const insBase       = fobTotal + freightShare;
    const insuranceAmt  = insurancePct < 1
      ? insBase * insurancePct / (1 - insurancePct)
      : insBase * insurancePct;

    const cif         = fobTotal + freightShare + insuranceAmt;
    const customsRate = (p.customs_rate_override != null && p.customs_rate_override !== '')
                          ? Number(p.customs_rate_override) / 100
                          : customsPct;
    const customsAmt   = cif * customsRate;
    const beforeVat    = cif + customsAmt;
    const vatAmt       = beforeVat * vatPct;       // display only
    const agentShareIls = agentFeeIls * share;

    return { qty, fobPrice, cbmUnit, fobTotal, productCbm, useCbm,
             freightShare, insuranceAmt, cif, customsAmt, beforeVat, vatAmt, agentShareIls };
  });

  // Step 1 — total shipment cost in ILS
  const totalInsUsd  = inter.reduce((a, p) => a + p.insuranceAmt, 0);
  const totalCustUsd = inter.reduce((a, p) => a + p.customsAmt,   0);

  const totalIls = (totalFob    * rate)
                 + (freightUsd  * rate)
                 + (totalInsUsd * rate)
                 + (totalCustUsd * rate)
                 + agentFeeIls + portFeesIls + localTransIls;

  // Step 2 — cost distribution rates
  const costPerCbm      = totalCbm > 0 ? totalIls / totalCbm : 0;
  const costPerFobDollar = totalFob > 0 ? totalIls / totalFob : 0;

  // Steps 3-5 — per product
  return products.map((p, i) => {
    const pp = inter[i];
    const { qty, fobPrice, cbmUnit, fobTotal, productCbm, useCbm } = pp;

    const warehouseCostUnit = useCbm
      ? costPerCbm * cbmUnit
      : costPerFobDollar * fobPrice;

    // Step 4 — sell price
    let sellPerUnit;
    if (marginType === 'margin') {
      // Gross margin: margin% = profit / sell  →  sell = cost / (1 - m)
      sellPerUnit = marginPct < 1 ? warehouseCostUnit / (1 - marginPct) : warehouseCostUnit * 2;
    } else {
      // Markup on cost: sell = cost × (1 + m)
      sellPerUnit = warehouseCostUnit * (1 + marginPct);
    }

    const profitPerUnit  = sellPerUnit - warehouseCostUnit;
    const landedCostIls  = warehouseCostUnit * qty;
    const sellPrice      = sellPerUnit * qty;
    const profit         = profitPerUnit * qty;
    const landedCostUsd  = rate > 0 ? landedCostIls / rate : 0;
    const agentShareUsd  = rate > 0 ? pp.agentShareIls / rate : 0;

    // Step 5 — analytics
    const _roi          = warehouseCostUnit > 0 ? (profitPerUnit / warehouseCostUnit) * 100 : 0;
    const _breakevenUnit = warehouseCostUnit;
    const _marginPct    = sellPerUnit > 0 ? (profitPerUnit / sellPerUnit) * 100 : 0;

    return {
      ...p,
      _fobTotal:        fobTotal,
      _productCbm:      productCbm,
      _freightShare:    pp.freightShare,
      _insuranceAmount: pp.insuranceAmt,
      _cif:             pp.cif,
      _customsAmount:   pp.customsAmt,
      _beforeVat:       pp.beforeVat,
      _vatAmount:       pp.vatAmt,
      _agentShare:      agentShareUsd,
      _landedCostUsd:   landedCostUsd,
      _landedCostIls:   landedCostIls,
      _costPerUnit:     warehouseCostUnit,
      _sellPrice:       sellPrice,
      _sellPerUnit:     sellPerUnit,
      _profit:          profit,
      _profitPerUnit:   profitPerUnit,
      _roi,
      _breakevenUnit,
      _marginPct,
    };
  });
}

export function calcTotals(calced) {
  const t = {
    qtyTotal:       calced.reduce((a, p) => a + (Number(p.qty) || 0), 0),
    fobTotal:       calced.reduce((a, p) => a + p._fobTotal,          0),
    totalCbm:       calced.reduce((a, p) => a + p._productCbm,        0),
    freightTotal:   calced.reduce((a, p) => a + p._freightShare,      0),
    insuranceTotal: calced.reduce((a, p) => a + p._insuranceAmount,   0),
    cifTotal:       calced.reduce((a, p) => a + p._cif,               0),
    customsTotal:   calced.reduce((a, p) => a + p._customsAmount,     0),
    beforeVatTotal: calced.reduce((a, p) => a + p._beforeVat,         0),
    vatTotal:       calced.reduce((a, p) => a + p._vatAmount,         0),
    agentTotal:     calced.reduce((a, p) => a + p._agentShare,        0),
    landedUsdTotal: calced.reduce((a, p) => a + p._landedCostUsd,     0),
    landedIlsTotal: calced.reduce((a, p) => a + p._landedCostIls,     0),
    sellTotal:      calced.reduce((a, p) => a + p._sellPrice,         0),
    profitTotal:    calced.reduce((a, p) => a + p._profit,            0),
  };
  t.roiTotal = t.landedIlsTotal > 0 ? (t.profitTotal / t.landedIlsTotal) * 100 : 0;
  t.marginPctTotal = t.sellTotal > 0 ? (t.profitTotal / t.sellTotal) * 100 : 0;
  return t;
}
