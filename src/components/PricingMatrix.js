import React, { useState, useMemo, useEffect } from 'react';
import { Save, RefreshCw, DollarSign, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ORIGIN_PORTS } from '../lib/calculations';

// ─────────────────────────────────────────────────────────────────────────────
//  Container pricing matrix editor.
//  - Lists active price per (origin_port × container_code) for global rows
//    (project_id IS NULL).
//  - Inline edit base + war risk; save persists with updated_at = now.
//  - "Sync from market" pulls fcl_40ft_china_med and lcl_per_cbm from the
//    market_rates banner and applies industry-standard ratios.
// ─────────────────────────────────────────────────────────────────────────────

const CONTAINER_ORDER = ['lcl', '20ft', '40ft', '40hc', '45hc'];

// Industry ratios from FCL 40ft baseline (China → Med routes)
const SYNC_RATIOS = {
  '20ft': 0.60,  // ~60% of a 40ft
  '40ft': 1.00,
  '40hc': 1.00,  // 40HC priced same as 40ft in this market
  '45hc': 1.30,  // ~30% premium for 45HC
};

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return '—'; }
}

export default function PricingMatrix({ containerTypes = [], containerPricing = [], marketRates = [], showToast }) {
  const [selectedPort, setSelectedPort] = useState('שנגחאי');
  const [edits, setEdits]   = useState({}); // { code: { base?, war? } }
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Reset local edits when switching port
  useEffect(() => { setEdits({}); }, [selectedPort]);

  const fcl40ftRate = marketRates.find(r => r.parameter === 'fcl_40ft_china_med')?.value;
  const lclRate     = marketRates.find(r => r.parameter === 'lcl_per_cbm')?.value;

  // Build display rows: one per container code, with current DB value + any pending edits
  const rows = useMemo(() => {
    const byCode = {};
    containerPricing
      .filter(p => p.origin_port === selectedPort && !p.project_id)
      .forEach(p => { byCode[p.container_code] = p; });

    return CONTAINER_ORDER.map(code => {
      const row  = byCode[code];
      const type = containerTypes.find(t => t.code === code);
      const edit = edits[code] || {};
      return {
        code,
        display:    type?.display_name_he || code,
        base:       edit.base !== undefined ? edit.base : (row?.base_price_usd ?? 0),
        war:        edit.war  !== undefined ? edit.war  : (row?.war_risk_usd  ?? 0),
        updatedAt:  row?.updated_at || null,
        source:     row?.source || 'auto',
        isLcl:      code === 'lcl',
        existing:   !!row,
        id:         row?.id,
        edited:     Object.keys(edit).length > 0,
      };
    });
  }, [selectedPort, containerPricing, containerTypes, edits]);

  const hasUnsavedChanges = rows.some(r => r.edited);

  function setRowField(code, field, value) {
    setEdits(prev => ({
      ...prev,
      [code]: { ...(prev[code] || {}), [field]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const toUpsert = rows.filter(r => r.edited).map(r => ({
        ...(r.id ? { id: r.id } : {}),
        origin_port:     selectedPort,
        container_code:  r.code,
        base_price_usd:  Number(r.base) || 0,
        war_risk_usd:    Number(r.war) || 0,
        valid_from:      new Date().toISOString().slice(0, 10),
        project_id:      null,
        source:          'manual', // user edit → protect from future auto-sync
        updated_at:      new Date().toISOString(),
      }));
      if (toUpsert.length === 0) {
        showToast('אין שינויים לשמור');
        setSaving(false);
        return;
      }

      // Upsert one-by-one to be explicit about INSERT vs UPDATE
      for (const row of toUpsert) {
        if (row.id) {
          const { error } = await supabase.from('container_pricing').update(row).eq('id', row.id);
          if (error) throw error;
        } else {
          const { id, ...insert } = row;
          const { error } = await supabase.from('container_pricing').insert(insert);
          if (error) throw error;
        }
      }
      setEdits({});
      showToast(`${toUpsert.length} שורות נשמרו`);
    } catch (err) {
      showToast('שגיאה בשמירה: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleSyncFromMarket() {
    if (!fcl40ftRate && !lclRate) {
      showToast('אין מחירי שוק בבאנר. עדכן קודם שם.', 'error');
      return;
    }
    if (!window.confirm(
      `לסנכרן מחירים ממדד השוק עבור "${selectedPort}"?\n\n` +
      `FCL 40ft: $${fcl40ftRate || '—'} → 40ft, 40hc, 20ft (60%), 45hc (130%)\n` +
      `LCL: $${lclRate || '—'}/CBM\n\n` +
      `מחירי War Risk לא ישתנו. תוכל לערוך ידנית אחרי הסנכרון.`,
    )) return;

    setSyncing(true);
    const newEdits = { ...edits };
    if (fcl40ftRate) {
      for (const code of ['20ft', '40ft', '40hc', '45hc']) {
        const ratio = SYNC_RATIOS[code];
        newEdits[code] = { ...(newEdits[code] || {}), base: Math.round(fcl40ftRate * ratio) };
      }
    }
    if (lclRate) {
      newEdits['lcl'] = { ...(newEdits['lcl'] || {}), base: Number(lclRate) };
    }
    setEdits(newEdits);
    setSyncing(false);
    showToast('המחירים סונכרנו — לחץ "שמור" כדי לאשר');
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      marginTop: 28, background: 'var(--bg2)',
      border: '1px solid var(--border)', borderRadius: 12, padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DollarSign size={18} style={{ color: 'var(--violet)' }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>מחירי קונטיינרים</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            מטריצה דורסת את ערכי הבאנר
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={selectedPort}
            onChange={e => setSelectedPort(e.target.value)}
            className="sfield-input"
            style={{ minWidth: 130 }}
          >
            {ORIGIN_PORTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <button
            className="btn btn-sm"
            onClick={handleSyncFromMarket}
            disabled={syncing || (!fcl40ftRate && !lclRate)}
            title={
              !fcl40ftRate && !lclRate
                ? 'עדכן קודם מחירי שוק בבאנר העליון'
                : `FCL 40ft: $${fcl40ftRate || '—'}, LCL: $${lclRate || '—'}`
            }
          >
            <RefreshCw size={13} />
            סנכרן ממדד שוק
          </button>
        </div>
      </div>

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th>קונטיינר</th>
              <th>בסיס ($)</th>
              <th>War Risk ($)</th>
              <th>סה"כ ($)</th>
              <th>עודכן</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const total = (Number(r.base) || 0) + (Number(r.war) || 0);
              return (
                <tr key={r.code} style={r.edited ? { background: 'rgba(168,85,247,0.06)' } : undefined}>
                  <td style={{ fontWeight: 600 }}>
                    {r.display}
                    {r.isLcl && <span style={{ fontSize: 10, color: 'var(--text3)', marginRight: 6 }}>(לכל m³)</span>}
                  </td>
                  <td>
                    <input
                      type="number" min="0" step="any"
                      value={r.base}
                      onChange={e => setRowField(r.code, 'base', e.target.value)}
                      style={{ width: 100, direction: 'ltr', textAlign: 'right' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number" min="0" step="any"
                      value={r.war}
                      onChange={e => setRowField(r.code, 'war', e.target.value)}
                      style={{ width: 100, direction: 'ltr', textAlign: 'right' }}
                    />
                  </td>
                  <td className="td-usd" style={{ fontWeight: 700 }}>
                    ${total.toLocaleString()}
                    {r.isLcl && <span style={{ fontSize: 10, color: 'var(--text3)' }}> /m³</span>}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {fmtDate(r.updatedAt)}
                    {!r.existing && <span style={{ color: 'var(--orange)' }}> · חדש</span>}
                    {r.existing && (
                      <span style={{
                        marginRight: 6, padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                        background: r.source === 'manual' ? 'var(--violet)' : 'var(--bg3)',
                        color: r.source === 'manual' ? '#fff' : 'var(--text2)',
                      }} title={r.source === 'manual' ? 'נערך ידנית — לא יידרס בסנכרון' : 'מסונכרן אוטומטית מ-FBX13'}>
                        {r.source === 'manual' ? 'ידני' : 'אוטו'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Status row */}
      <div style={{
        marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 12, color: 'var(--text3)',
      }}>
        <span>
          {hasUnsavedChanges
            ? <><AlertTriangle size={12} style={{ verticalAlign: 'middle', color: 'var(--orange)' }} /> שינויים לא שמורים</>
            : 'הטבלה מסונכרנת'}
        </span>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleSave}
          disabled={saving || !hasUnsavedChanges}
        >
          {saving ? <span className="spinner" /> : <Save size={13} />}
          {saving ? 'שומר...' : 'שמור שינויים'}
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
        💡 שורות "אוטו" (אפור) מתעדכנות אוטומטית בכל פתיחה של האפליקציה מ-FBX13.
        כשתערוך ידנית — השורה מסומנת "ידני" (סגול) ולא תידרס יותר בסנכרונים הבאים.
        <br />
        יחסי סנכרון: 20ft = 60% מ-40ft, 40hc זהה ל-40ft, 45hc = 130% מ-40ft, LCL ישיר.
      </div>
    </div>
  );
}
