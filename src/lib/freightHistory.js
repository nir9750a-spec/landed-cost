export async function getActiveFreight(supabase, projectId, date = new Date()) {
  const dateStr = date.toISOString().split('T')[0];

  try {
    let query = supabase
      .from('freight_history')
      .select('*')
      .lte('valid_from', dateStr)
      .order('valid_from', { ascending: false });

    if (projectId) {
      query = query
        .or(`project_id.eq.${projectId},project_id.is.null`)
        .order('project_id', { ascending: false });
    } else {
      query = query.is('project_id', null);
    }

    const { data } = await query.limit(1).maybeSingle();
    return data?.freight_usd || null;
  } catch {
    return null;
  }
}
