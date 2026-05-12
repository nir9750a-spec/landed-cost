export async function loadMarketRates(supabase) {
  try {
    const { data } = await supabase
      .from('market_rates')
      .select('*')
      .order('parameter');
    return data || [];
  } catch {
    return [];
  }
}

export async function saveMarketRate(supabase, parameter, value, notes) {
  try {
    const { error } = await supabase
      .from('market_rates')
      .upsert(
        { parameter, value: Number(value), notes, updated_at: new Date().toISOString() },
        { onConflict: 'parameter' }
      );
    return !error;
  } catch {
    return false;
  }
}
