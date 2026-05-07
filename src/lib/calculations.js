// Keys stored only in the global settings row (rarely change, apply to all projects)
export const GLOBAL_SETTINGS_KEYS  = ['vat', 'customs', 'agent_fee', 'api_key', 'port_fees', 'local_transport'];
// Keys that can be overridden per-project (change each shipment)
export const PROJECT_SETTINGS_KEYS = ['usd_rate', 'freight', 'insurance', 'margin'];

export const DEFAULT_SETTINGS = {
  usd_rate:        3.7,
  freight:         5000,
  customs:         5,
  vat:             18,
  agent_fee:       4000,
  insurance:       0.5,
  margin:          25,
  port_fees:       0,
  local_transport: 0,
  api_key:         '',
};

// ─────────────────────────────────────────────────────────────────────────────
//  New CBM-based shipment cost formula
//
//  Step 1 — Total shipment cost in ILS:
//    total_ils = (fob_total×rate) + (freight×rate) + (insurance×rate)
//              + (customs×rate) + agent_fee + port_fees + local_transport
//    (agent_fee, port_fees, local_transport are already in ILS)
//
//  Step 2 — Cost per CBM:
//    cost_per_cbm = total_ils / total_cbm
//
//  Step 3 — Warehouse cost per unit (CBM method):
//    warehouse_cost = cost_per_cbm × cbm_per_unit
//    Fallback when cbm = 0: use FOB-ratio → warehouse_cost = (total_ils / total_fob) × fob_price
//
//  Step 4 — Sell price:
//    sell_price = warehouse_cost × (1 + margin)
//
//  Step 5 — Profit:
//    profit_per_unit = sell_price − warehouse_cost
//    profit_total    = profit_per_unit × qty
//
//  All intermediate USD columns (_freightShare, _insuranceAmount, _cif,
//  _customsAmount, _beforeVat, _vatAmount, _agentShare) are kept for
//  UI compatibility and computed proportionally by CBM/FOB share.
// ─────────────────────────────────────────────────────────────────────────────

export function calcProducts(products, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };

  const rate           = Number(s.usd_rate);
  const freightUsd     = Number(s.freight);
  const insurancePct   = Number(s.insurance)       / 100;
  const customsPct     = Number(s.customs)          / 100;
  const vatPct         = Number(s.vat)              / 100;
  const agentFeeIls    = Number(s.agent_fee);       // ILS
  const portFeesIls    = Number(s.port_fees)    || 0; // ILS
  const localTransIls  = Number(s.local_transport) || 0; // ILS
  const marginPct      = Number(s.margin)           / 100;

  // ── Shipment totals ─────────────────────────────────────────────────────
  const totalCbm = products.reduce((sum, p) => sum + (Number(p.qty) * Number(p.cbm)),        0);
  const totalFob = products.reduce((sum, p) => sum + (Number(p.qty) * Number(p.fob_price)),  0);

  // ── Per-product USD intermediate values (pass 1, for display + customs sum) ──
  const inter = products.map(p => {
    const qty      = Number(p.qty)       || 0;
    const fobPrice = Number(p.fob_price) || 0;
    const cbmUnit  = Number(p.cbm)       || 0;

    const fobTotal   = qty * fobPrice;
    const productCbm = qty * cbmUnit;

    // CBM ratio when cbm > 0, FOB ratio as fallback
    const useCbmRatio = cbmUnit > 0 && totalCbm > 0;
    const share = useCbmRatio
      ? productCbm / totalCbm
      : (totalFob > 0 ? fobTotal / totalFob : 0);

    const freightShare   = freightUsd * share;
    const insuranceAmt   = (fobTotal + freightShare) * insurancePct;
    const cif            = fobTotal + freightShare + insuranceAmt;

    // Per-product customs rate (respects hs-code override)
    const customsRate  = (p.customs_rate_override != null && p.customs_rate_override !== '')
                           ? Number(p.customs_rate_override) / 100
                           : customsPct;
    const customsAmt   = cif * customsRate;
    const beforeVat    = cif + customsAmt;
    const vatAmt       = beforeVat * vatPct;          // display only — not in warehouse cost
    const agentShareIls = agentFeeIls * share;        // ILS

    return {
      qty, fobPrice, cbmUnit, fobTotal, productCbm, useCbmRatio,
      freightShare, insuranceAmt, cif, customsAmt, beforeVat, vatAmt, agentShareIls,
    };
  });

  // ── Step 1: Total shipment cost in ILS ──────────────────────────────────
  const totalInsuranceUsd = inter.reduce((s, p) => s + p.insuranceAmt,  0);
  const totalCustomsUsd   = inter.reduce((s, p) => s + p.customsAmt,    0);

  const totalIls = (totalFob          * rate)
                 + (freightUsd        * rate)
                 + (totalInsuranceUsd * rate)
                 + (totalCustomsUsd   * rate)
                 + agentFeeIls
                 + portFeesIls
                 + localTransIls;

  // ── Step 2: Cost per CBM (ILS/m³) ───────────────────────────────────────
  const costPerCbm = totalCbm > 0 ? totalIls / totalCbm : 0;

  // Fallback rate for zero-CBM products: ILS per USD of FOB value
  const costPerFobDollar = totalFob > 0 ? totalIls / totalFob : 0;

  // ── Steps 3-5: Per-product warehouse cost, sell price, profit ───────────
  return products.map((p, i) => {
    const pp = inter[i];
    const { qty, fobPrice, cbmUnit, fobTotal, productCbm, useCbmRatio } = pp;

    // Step 3 — warehouse cost per unit (ILS)
    const warehouseCostUnit = useCbmRatio
      ? costPerCbm * cbmUnit                   // CBM method
      : costPerFobDollar * fobPrice;           // FOB fallback

    // Step 4 — sell price per unit
    const sellPerUnit   = warehouseCostUnit * (1 + marginPct);

    // Step 5 — profit
    const profitPerUnit = sellPerUnit - warehouseCostUnit;

    // Line totals
    const landedCostIls = warehouseCostUnit * qty;
    const sellPrice     = sellPerUnit       * qty;
    const profit        = profitPerUnit     * qty;

    // USD equivalent of warehouse cost (for the "$" column in the table)
    const landedCostUsd = rate > 0 ? landedCostIls / rate : 0;

    // Agent share USD equivalent (for display in the existing agent column)
    const agentShareUsd = rate > 0 ? pp.agentShareIls / rate : 0;

    return {
      ...p,
      _fobTotal:        fobTotal,
      _productCbm:      productCbm,
      _freightShare:    pp.freightShare,    // USD, display
      _insuranceAmount: pp.insuranceAmt,    // USD, display
      _cif:             pp.cif,             // USD, display
      _customsAmount:   pp.customsAmt,      // USD, display
      _beforeVat:       pp.beforeVat,       // USD, display
      _vatAmount:       pp.vatAmt,          // USD, display (not in warehouse cost)
      _agentShare:      agentShareUsd,      // USD equivalent, display
      _landedCostUsd:   landedCostUsd,      // USD equivalent of warehouse cost
      _landedCostIls:   landedCostIls,      // ILS warehouse cost (line total)
      _costPerUnit:     warehouseCostUnit,  // ILS per unit
      _sellPrice:       sellPrice,          // ILS (line total)
      _sellPerUnit:     sellPerUnit,        // ILS per unit
      _profit:          profit,             // ILS (line total)
      _profitPerUnit:   profitPerUnit,      // ILS per unit
    };
  });
}

export function calcTotals(calced) {
  return {
    qtyTotal:       calced.reduce((s, p) => s + (Number(p.qty) || 0), 0),
    fobTotal:       calced.reduce((s, p) => s + p._fobTotal,         0),
    totalCbm:       calced.reduce((s, p) => s + p._productCbm,       0),
    freightTotal:   calced.reduce((s, p) => s + p._freightShare,     0),
    insuranceTotal: calced.reduce((s, p) => s + p._insuranceAmount,  0),
    cifTotal:       calced.reduce((s, p) => s + p._cif,              0),
    customsTotal:   calced.reduce((s, p) => s + p._customsAmount,    0),
    beforeVatTotal: calced.reduce((s, p) => s + p._beforeVat,        0),
    vatTotal:       calced.reduce((s, p) => s + p._vatAmount,        0),
    agentTotal:     calced.reduce((s, p) => s + p._agentShare,       0),
    landedUsdTotal: calced.reduce((s, p) => s + p._landedCostUsd,    0),
    landedIlsTotal: calced.reduce((s, p) => s + p._landedCostIls,    0),
    sellTotal:      calced.reduce((s, p) => s + p._sellPrice,        0),
    profitTotal:    calced.reduce((s, p) => s + p._profit,           0),
  };
}
