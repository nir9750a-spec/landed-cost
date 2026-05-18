import { supabase } from './supabase';

// ─── Hard-coded fallback (used if DB unavailable) ──────────────────────────
//   These thresholds must mirror public.container_types.min_cbm_to_select.
//   Source of truth = the DB row; this is only a safety net.
const FALLBACK_TYPES = [
  { code: 'lcl',  display_name_he: 'LCL — חלק מקונטיינר', nominal_cbm: 0,  practical_cbm: 0,  min_cbm_to_select: 0,  sort_order: 0 },
  { code: '20ft', display_name_he: '20ft קונטיינר רגיל',   nominal_cbm: 33, practical_cbm: 28, min_cbm_to_select: 18, sort_order: 1 },
  { code: '40ft', display_name_he: '40ft קונטיינר רגיל',   nominal_cbm: 67, practical_cbm: 58, min_cbm_to_select: 25, sort_order: 2 },
  { code: '40hc', display_name_he: '40ft HC — High Cube',  nominal_cbm: 76, practical_cbm: 68, min_cbm_to_select: 55, sort_order: 3 },
  { code: '45hc', display_name_he: '45ft HC — High Cube',  nominal_cbm: 86, practical_cbm: 76, min_cbm_to_select: 70, sort_order: 4 },
];

// ─── Data loaders ────────────────────────────────────────────────────────────

export async function loadContainerTypes() {
  const { data, error } = await supabase
    .from('container_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error || !data?.length) return FALLBACK_TYPES;
  return data.map(t => ({
    ...t,
    nominal_cbm:       Number(t.nominal_cbm)       || 0,
    practical_cbm:     Number(t.practical_cbm)     || 0,
    min_cbm_to_select: Number(t.min_cbm_to_select) || 0,
    sort_order:        Number(t.sort_order)        || 0,
  }));
}

export async function loadContainerPricing() {
  const { data, error } = await supabase
    .from('container_pricing')
    .select('*')
    .order('valid_from', { ascending: false });
  if (error) return [];
  return (data || []).map(r => ({
    ...r,
    base_price_usd: Number(r.base_price_usd) || 0,
    war_risk_usd:   Number(r.war_risk_usd)   || 0,
  }));
}

// Find the active price for (port, container, projectId). Project-specific
// override beats global; latest valid_from wins.
export function findActivePrice(pricing, originPort, containerCode, projectId) {
  const today = new Date().toISOString().slice(0, 10);
  const eligible = pricing.filter(p =>
    p.origin_port === originPort &&
    p.container_code === containerCode &&
    p.valid_from <= today
  );
  // Project-specific first
  const specific = eligible.filter(p => p.project_id === projectId && projectId);
  const pool = specific.length > 0 ? specific : eligible.filter(p => !p.project_id);
  return pool.sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0] || null;
}

// ─── Selection logic ─────────────────────────────────────────────────────────

/**
 * Decide which container to use for a given total CBM.
 *   - force_lcl=true              → 'lcl'
 *   - manual_container_code set   → that code
 *   - totalCbm < 18               → 'lcl'
 *   - else pick the largest type whose min_cbm_to_select ≤ totalCbm
 *   - totalCbm > 76               → '45hc' with warning='exceeds_capacity'
 *
 * Returns an info object that the UI can render.
 */
export function selectContainer(totalCbm, settings, types = FALLBACK_TYPES) {
  const cbm = Math.max(0, Number(totalCbm) || 0);
  const forced     = !!settings?.force_lcl;
  const manualCode = settings?.manual_container_code || null;

  if (forced) {
    return {
      code: 'lcl',
      source: 'forced',
      type: types.find(t => t.code === 'lcl') || FALLBACK_TYPES[0],
      warning: null,
      fillPct: 0,
    };
  }

  if (manualCode) {
    const type = types.find(t => t.code === manualCode);
    if (type) {
      const fillPct = type.practical_cbm > 0 ? (cbm / type.practical_cbm) * 100 : 0;
      return {
        code: manualCode,
        source: 'manual',
        type,
        warning: fillPct > 100 ? 'manual_too_small' : null,
        fillPct,
      };
    }
  }

  // Auto-select: pick container with HIGHEST sort_order whose threshold ≤ cbm.
  const sortedDesc = [...types].sort((a, b) => b.sort_order - a.sort_order);
  let chosen = types.find(t => t.code === 'lcl') || FALLBACK_TYPES[0];
  for (const t of sortedDesc) {
    if (cbm >= t.min_cbm_to_select) { chosen = t; break; }
  }
  const fillPct = chosen.practical_cbm > 0 ? (cbm / chosen.practical_cbm) * 100 : 0;
  let warning = null;
  if (chosen.code === '45hc' && cbm > chosen.practical_cbm) warning = 'exceeds_capacity';
  else if (fillPct > 95) warning = 'tight_fit';

  return { code: chosen.code, source: 'auto', type: chosen, warning, fillPct };
}

// ─── Price resolution ────────────────────────────────────────────────────────

/**
 * Resolve the freight cost for a project.
 *
 *   1. If settings.actual_freight_usd > 0 → return it as { mode: 'actual' }
 *      (overrides everything — this is the real quote from the forwarder)
 *   2. Else look up container_pricing for (origin_port, container, project_id)
 *      → { mode: 'estimate', base, warRisk, total }
 *   3. If nothing found → legacy fallback to settings.freight
 *
 * Notes:
 *   - LCL: base is per-CBM, so total = base * totalCbm + warRisk (warRisk
 *     usually 0 for LCL but we keep it general).
 *   - FCL: base is per container, total = base + warRisk.
 */
export function resolveFreightPrice({ containerCode, originPort, totalCbm, pricing, projectId, settings }) {
  const actual = Number(settings?.actual_freight_usd) || 0;
  if (actual > 0) {
    return {
      mode: 'actual',
      total: actual,
      base: actual,
      warRisk: 0,
      source: 'user_quote',
    };
  }

  const price = findActivePrice(pricing, originPort, containerCode, projectId);
  if (price) {
    const isLcl = containerCode === 'lcl';
    const base    = isLcl ? price.base_price_usd * (Number(totalCbm) || 0) : price.base_price_usd;
    const warRisk = isLcl ? price.war_risk_usd   * (Number(totalCbm) || 0) : price.war_risk_usd;
    return {
      mode: 'estimate',
      total: base + warRisk,
      base,
      warRisk,
      source: 'pricing_table',
      pricingRow: price,
    };
  }

  // Legacy fallback: old `freight` field
  const legacy = Number(settings?.freight) || 0;
  if (legacy > 0) {
    return {
      mode: 'estimate',
      total: legacy,
      base: legacy,
      warRisk: 0,
      source: 'legacy_freight_field',
    };
  }

  return { mode: 'estimate', total: 0, base: 0, warRisk: 0, source: 'no_price' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isLcl(containerCode) {
  return containerCode === 'lcl';
}

export function fillPctColor(pct) {
  if (pct >= 95) return 'red';
  if (pct >= 85) return 'orange';
  if (pct >= 50) return 'green';
  return 'gray';
}
