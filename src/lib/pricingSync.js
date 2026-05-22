import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
//  Auto-sync container_pricing from market_rates.
//
//  Called after the freight rate auto-fetch updates market_rates. For each
//  origin port that has any pricing row, recompute the base price for FCL
//  containers from fcl_40ft_china_med × industry ratio, and LCL from
//  lcl_per_cbm. Rows marked source='manual' are NEVER overwritten — those
//  represent explicit user/agent overrides.
//
//  Returns the number of rows updated.
// ─────────────────────────────────────────────────────────────────────────────

const RATIOS = {
  '20ft': 0.60,  // 60% of a 40ft
  '40ft': 1.00,
  '40hc': 1.00,  // typically priced same as 40ft
  '45hc': 1.30,
};

export async function syncContainerPricingFromMarket(marketRates, containerPricing) {
  const fcl = Number(marketRates.find(r => r.parameter === 'fcl_40ft_china_med')?.value) || 0;
  const lcl = Number(marketRates.find(r => r.parameter === 'lcl_per_cbm')?.value) || 0;
  if (fcl <= 0 && lcl <= 0) return 0;

  // Find which ports have pricing rows already (global, project_id IS NULL).
  // If none exist, default to seeding Shanghai.
  const globalRows = containerPricing.filter(p => !p.project_id);
  const ports = [...new Set(globalRows.map(p => p.origin_port))];
  if (ports.length === 0) ports.push('שנגחאי');

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  let changes = 0;

  for (const port of ports) {
    // FCL containers
    if (fcl > 0) {
      for (const [code, ratio] of Object.entries(RATIOS)) {
        const target = Math.round(fcl * ratio);
        const existing = globalRows.find(p => p.origin_port === port && p.container_code === code);
        if (existing?.source === 'manual') continue;
        if (existing && Math.abs(Number(existing.base_price_usd) - target) < 0.5) continue;

        if (existing) {
          const { error } = await supabase.from('container_pricing')
            .update({
              base_price_usd: target,
              source: 'auto',
              valid_from: today,
              updated_at: nowIso,
            })
            .eq('id', existing.id);
          if (!error) changes++;
        } else {
          const { error } = await supabase.from('container_pricing').insert({
            origin_port: port,
            container_code: code,
            base_price_usd: target,
            war_risk_usd: 0,
            valid_from: today,
            project_id: null,
            source: 'auto',
            notes: 'Auto-synced from FBX13',
          });
          if (!error) changes++;
        }
      }
    }

    // LCL
    if (lcl > 0) {
      const existing = globalRows.find(p => p.origin_port === port && p.container_code === 'lcl');
      if (existing?.source === 'manual') continue;
      if (existing && Math.abs(Number(existing.base_price_usd) - lcl) < 0.5) continue;

      if (existing) {
        const { error } = await supabase.from('container_pricing')
          .update({
            base_price_usd: lcl,
            source: 'auto',
            valid_from: today,
            updated_at: nowIso,
          })
          .eq('id', existing.id);
        if (!error) changes++;
      } else {
        const { error } = await supabase.from('container_pricing').insert({
          origin_port: port,
          container_code: 'lcl',
          base_price_usd: lcl,
          war_risk_usd: 0,
          valid_from: today,
          project_id: null,
          source: 'auto',
          notes: 'Auto-synced from market lcl_per_cbm',
        });
        if (!error) changes++;
      }
    }
  }

  return changes;
}
