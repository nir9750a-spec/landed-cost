import React, { useState, useEffect, useMemo } from 'react';
import { Save, Globe, FolderOpen, RefreshCw } from 'lucide-react';
import { PROJECT_SETTINGS_KEYS } from '../lib/calculations';
import { fetchUsdRate } from '../lib/exchangeRate';
import FreightHistoryPanel from './FreightHistoryPanel';

// ── Field definitions ──────────────────────────────────────────────────────

const GLOBAL_FIELDS = [
  { key: 'vat',             label: 'מע"מ (%)',          type: 'number', step: '0.5',  min: '0', max: '100' },
  { key: 'customs',         label: 'מכס (%)',            type: 'number', step: '0.5',  min: '0', max: '100',
    hint: 'שיעור מכס כללי — נדרס אוטומטית אם למוצר יש קוד HS מסווג' },
  { key: 'agent_fee',       label: 'עמלת סוכן (₪)',     type: 'number', step: '100',  min: '0' },
  { key: 'port_fees',       label: 'אגרות נמל (₪)',     type: 'number', step: '100',  min: '0' },
  { key: 'local_transport', label: 'הובלה מקומית (₪)',  type: 'number', step: '100',  min: '0' },
];

// Numeric project fields (margin_type is handled separately)
const PROJECT_NUM_FIELDS = [
  { key: 'usd_rate',  label: 'שער דולר (₪/$)',   type: 'number', step: '0.001', min: '0' },
  { key: 'freight',   label: 'הובלה FCL ($)',     type: 'number', step: '100',   min: '0' },
  { key: 'insurance', label: 'ביטוח (%)',          type: 'number', step: '0.1',   min: '0', max: '10' },
  { key: 'margin',    label: 'מרווח (%)',          type: 'number', step: '1',     min: '0', max: '500',
    hint: 'מומלץ: 25-35% לרוב המוצרים' },
];

const FORMULA = [
  ['FOB סה"כ',        'כמות × מחיר FOB'],
  ['סה"כ משלוח ₪',   '(FOB+הובלה+ביטוח+מכס)×שער + עמלת סוכן + אגרות נמל + הובלה מקומית'],
  ['עלות ל-CBM',      'סה"כ ₪ ÷ CBM כולל'],
  ['עלות מחסן/יח׳',  'עלות ל-CBM × CBM ליחידה  (fallback: יחס FOB אם CBM=0)'],
  ['Gross Margin',    'מחיר מכירה = עלות / (1 − מרווח%)'],
  ['Markup',          'מחיר מכירה = עלות × (1 + מרווח%)'],
  ['רווח/יח׳',        'מחיר מכירה − עלות מחסן'],
  ['ROI',             'רווח ÷ עלות מחסן × 100'],
];

// ── Component ──────────────────────────────────────────────────────────────

export default function SettingsPage({
  globalSettings, projectOverrides,
  saveGlobalSettings, saveProjectSettings,
  showToast, activeProject, updateProject,
  freightHistory = [], addFreightRecord,
  activeProjectId, projects = [],
  lastRateFetchAt,
}) {
  // Global section
  const [globalForm, setGlobalForm]     = useState({
    vat: '', customs: '', agent_fee: '', port_fees: '', local_transport: '', api_key: '',
  });
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Project section
  const [projValues, setProjValues]     = useState({});
  const [overrideSet, setOverrideSet]   = useState(new Set());
  const [marginType, setMarginType]     = useState('markup'); // local UI state for the big buttons
  const [projMeta, setProjMeta]           = useState({ supplier: '', shipment_date: '' });
  const [savingProject, setSavingProject] = useState(false);
  const [rateUpdating, setRateUpdating]   = useState(false);
  const [rateUpdatedAt, setRateUpdatedAt] = useState(null);

  // ── Sync from props ──────────────────────────────────────────────────────

  useEffect(() => {
    setGlobalForm({
      vat:             globalSettings.vat             ?? '',
      customs:         globalSettings.customs         ?? '',
      agent_fee:       globalSettings.agent_fee       ?? '',
      port_fees:       globalSettings.port_fees       ?? '',
      local_transport: globalSettings.local_transport ?? '',
      api_key:         globalSettings.api_key         || '',
    });
  }, [globalSettings]);

  useEffect(() => {
    // Populate numeric project fields (show override if exists, else global default)
    const vals = {};
    PROJECT_NUM_FIELDS.forEach(({ key }) => {
      vals[key] = projectOverrides[key] ?? globalSettings[key] ?? '';
    });
    setProjValues(vals);

    // margin_type: use project override if set, else global, else 'markup'
    const mt = projectOverrides.margin_type ?? globalSettings.margin_type ?? 'markup';
    setMarginType(String(mt));

    // Build override set (numeric keys only — margin_type tracked separately)
    const overrides = new Set(Object.keys(projectOverrides).filter(k => k !== 'margin_type'));
    // If margin_type override exists, include it logically
    if (projectOverrides.margin_type !== undefined) overrides.add('margin_type');
    setOverrideSet(overrides);
  }, [globalSettings, projectOverrides]);

  useEffect(() => {
    setProjMeta({
      supplier:      activeProject?.supplier      || '',
      shipment_date: activeProject?.shipment_date || '',
    });
  }, [activeProject]);

  // ── Global handlers ──────────────────────────────────────────────────────

  async function submitGlobal(e) {
    e.preventDefault();
    setSavingGlobal(true);
    await saveGlobalSettings({
      vat:             Number(globalForm.vat),
      customs:         Number(globalForm.customs),
      agent_fee:       Number(globalForm.agent_fee),
      port_fees:       Number(globalForm.port_fees)       || 0,
      local_transport: Number(globalForm.local_transport) || 0,
      api_key:         String(globalForm.api_key || ''),
    });
    setSavingGlobal(false);
  }

  // ── Project field handlers ────────────────────────────────────────────────

  function handleProjChange(key, value) {
    setProjValues(v => ({ ...v, [key]: value }));
    setOverrideSet(s => new Set([...s, key]));
  }

  function resetProjectField(key) {
    setProjValues(v => ({ ...v, [key]: globalSettings[key] ?? '' }));
    setOverrideSet(s => { const ns = new Set(s); ns.delete(key); return ns; });
  }

  function resetAllProjectFields() {
    const vals = {};
    PROJECT_NUM_FIELDS.forEach(({ key }) => { vals[key] = globalSettings[key] ?? ''; });
    setProjValues(vals);
    const globalMt = globalSettings.margin_type ?? 'markup';
    setMarginType(String(globalMt));
    setOverrideSet(new Set());
  }

  function handleMarginTypeChange(val) {
    setMarginType(val);
    setOverrideSet(s => new Set([...s, 'margin_type']));
  }

  async function resetMarginToDefault() {
    handleProjChange('margin', 25);
    const overrides = {};
    PROJECT_NUM_FIELDS.forEach(({ key }) => {
      const val = key === 'margin' ? 25 : (overrideSet.has(key) ? Number(projValues[key]) : undefined);
      if (val !== undefined) overrides[key] = val;
    });
    overrides.margin = 25;
    if (overrideSet.has('margin_type')) overrides.margin_type = marginType;
    await saveProjectSettings(overrides);
    showToast('מרווח אופס ל-25%');
  }

  async function submitProject(e) {
    e.preventDefault();
    setSavingProject(true);

    const overrides = {};
    PROJECT_NUM_FIELDS.forEach(({ key }) => {
      if (overrideSet.has(key)) overrides[key] = Number(projValues[key]);
    });
    // margin_type (string key)
    if (overrideSet.has('margin_type')) overrides.margin_type = marginType;

    const ok = await saveProjectSettings(overrides);
    if (ok && activeProject) {
      await updateProject(activeProject.id, {
        supplier:      projMeta.supplier      || null,
        shipment_date: projMeta.shipment_date || null,
      });
    }
    setSavingProject(false);
  }

  // ── Rate auto-fetch ───────────────────────────────────────────────────────

  async function handleFetchRate() {
    setRateUpdating(true);
    const rate = await fetchUsdRate();
    if (rate) {
      handleProjChange('usd_rate', rate);
      setRateUpdatedAt(new Date());
      showToast(`שער דולר עודכן: ₪${rate}`);
    } else {
      showToast('לא ניתן לאמת שע״ח', 'error');
    }
    setRateUpdating(false);
  }

  // ── Active freight record (from history) ──────────────────────────────────

  const activeFreightRecord = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const eligible = freightHistory.filter(r => r.valid_from <= today);
    const specific = eligible.filter(r => r.project_id === activeProjectId && activeProjectId);
    const source = specific.length > 0 ? specific : eligible.filter(r => !r.project_id);
    return source.sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0] || null;
  }, [freightHistory, activeProjectId]);

  // ── Live preview ──────────────────────────────────────────────────────────

  const previewMarginPct = Number(projValues.margin || globalSettings.margin || 25) / 100;
  const previewType      = marginType;
  const previewSell      = previewType === 'margin'
    ? (previewMarginPct < 1 ? 100 / (1 - previewMarginPct) : 200)
    : 100 * (1 + previewMarginPct);
  const previewProfit    = previewSell - 100;

  // ── Inline renderer for numeric project fields (avoids React key-stripping) ──

  function renderProjectField({ key, label, type, step, min, max, hint }) {
    const isOverridden = overrideSet.has(key);
    return (
      <div className="form-group" key={key}>
        <div className="sfield-header">
          <label>{label}</label>
          <span className={`sfield-badge ${isOverridden ? 'sfield-project' : 'sfield-global'}`}>
            {isOverridden ? 'פרויקט' : 'גלובלי'}
          </span>
          {isOverridden && (
            <button type="button" className="sfield-reset" onClick={() => resetProjectField(key)} title="אפס לגלובלי">
              ↺
            </button>
          )}
          {key === 'usd_rate' && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleFetchRate}
              disabled={rateUpdating}
              title="עדכן שער מבנק ישראל"
              style={{ marginRight: 'auto' }}
            >
              {rateUpdating
                ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
                : '🔄'}
              עדכן שער
            </button>
          )}
        </div>
        <input
          type={type}
          value={projValues[key] ?? ''}
          onChange={e => handleProjChange(key, e.target.value)}
          className={`sfield-input${isOverridden ? ' sfield-overridden' : ' sfield-inherited'}`}
          step={step} min={min} max={max}
        />
        {key === 'usd_rate' && (
          <span className="text-sm text-muted" style={{ display: 'block', marginTop: 4 }}>
            {(() => {
              const cur = Number(globalSettings.usd_rate || 0);
              if (!cur) return null;
              const dateStr = lastRateFetchAt
                ? (lastRateFetchAt.toDateString() === new Date().toDateString()
                    ? 'היום'
                    : lastRateFetchAt.toLocaleDateString('he-IL'))
                : null;
              return `שע"ח נוכחי: ₪${cur.toFixed(3)}${dateStr ? ` — עודכן ${dateStr} מבנק ישראל` : ' — שער בנק ישראל'}`;
            })()}
          </span>
        )}
        {key === 'freight' && activeFreightRecord && (
          <span className="text-sm text-muted" style={{ display: 'block', marginTop: 3 }}>
            פעיל מ: {new Date(activeFreightRecord.valid_from + 'T00:00:00').toLocaleDateString('he-IL')}
          </span>
        )}
        {hint && (
          <span className="text-sm text-muted" style={{ display: 'block', marginTop: 4 }}>
            {hint}
          </span>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const marginTypeOverridden = overrideSet.has('margin_type');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">הגדרות</h1>
      </div>

      <div className="page-body">

        {/* ════ SECTION 1 — Global ════ */}
        <form onSubmit={submitGlobal}>
          <div className="settings-section settings-section-global">
            <div className="settings-section-head">
              <Globe size={15} />
              <span className="settings-section-title-text">הגדרות כלליות</span>
              <span className="settings-section-sub">מכס · מע"מ · עמלות — חלים על כל הפרויקטים</span>
            </div>

            <div className="settings-grid">
              {GLOBAL_FIELDS.map(({ key, label, type, step, min, max, hint }) => (
                <div className="form-group" key={key}>
                  <label>{label}</label>
                  <input
                    type={type}
                    value={globalForm[key] ?? ''}
                    onChange={e => setGlobalForm(f => ({ ...f, [key]: e.target.value }))}
                    step={step} min={min} max={max}
                  />
                  {hint && (
                    <span className="text-sm text-muted" style={{ display: 'block', marginTop: 4 }}>
                      {hint}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="settings-section-body-api">
              <div className="settings-section-title-inner">הגדרות AI</div>
              <div className="form-group" style={{ maxWidth: 460 }}>
                <label>מפתח Anthropic API</label>
                <input
                  type="password"
                  value={globalForm.api_key || ''}
                  onChange={e => setGlobalForm(f => ({ ...f, api_key: e.target.value }))}
                  placeholder="sk-ant-api03-..."
                  dir="ltr" autoComplete="off"
                />
                <span className="text-sm text-muted" style={{ marginTop: 4 }}>
                  נדרש לחילוץ PDF/תמונות וסיווג HS. קבצי Excel עובדים ללא מפתח.
                </span>
              </div>
            </div>
          </div>

          <div className="settings-save-row">
            <button type="submit" className="btn btn-primary" disabled={savingGlobal}>
              {savingGlobal ? <span className="spinner" /> : <Save size={14} />}
              {savingGlobal ? 'שומר...' : 'שמור הגדרות כלליות'}
            </button>
          </div>
        </form>

        {/* ════ SECTION 2 — Project ════ */}
        {activeProject ? (
          <form onSubmit={submitProject} style={{ marginTop: 28 }}>
            <div className="settings-section settings-section-project">
              <div className="settings-section-head">
                <FolderOpen size={15} />
                <span className="settings-section-title-text">הגדרות פרויקט</span>
                <span className="settings-section-sub project-name-badge">{activeProject.name}</span>
                <span className="settings-section-sub">ספציפיות למשלוח — עוקפות את הגלובלי</span>
              </div>

              {/* Numeric overrides */}
              <div className="settings-grid">
                {PROJECT_NUM_FIELDS.map(f => renderProjectField(f))}
              </div>

              {/* Margin type selector */}
              <div className="settings-section-divider">שיטת מרווח</div>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <div className="sfield-header" style={{ marginBottom: 8 }}>
                  <label>שיטת חישוב מחיר מכירה</label>
                  <span className={`sfield-badge ${marginTypeOverridden ? 'sfield-project' : 'sfield-global'}`}>
                    {marginTypeOverridden ? 'פרויקט' : 'גלובלי'}
                  </span>
                  {marginTypeOverridden && (
                    <button type="button" className="sfield-reset"
                      onClick={() => { setMarginType(globalSettings.margin_type || 'markup'); setOverrideSet(s => { const ns = new Set(s); ns.delete('margin_type'); return ns; }); }}>
                      ↺
                    </button>
                  )}
                </div>
                <div className="margin-type-btns">
                  <button
                    type="button"
                    className={`margin-type-btn${marginType === 'markup' ? ' selected' : ''}`}
                    onClick={() => handleMarginTypeChange('markup')}
                  >
                    <div className="margin-type-btn-title">Markup</div>
                    <div className="margin-type-btn-sub">מחיר = עלות × (1 + מרווח%)</div>
                    <div className="margin-type-btn-sub" style={{ marginTop: 4, color: 'var(--text3)' }}>
                      עלות ₪100 + {projValues.margin || globalSettings.margin || 25}% ↦ ₪{(100 * (1 + (Number(projValues.margin || globalSettings.margin || 25) / 100))).toFixed(0)}
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`margin-type-btn${marginType === 'margin' ? ' selected' : ''}`}
                    onClick={() => handleMarginTypeChange('margin')}
                  >
                    <div className="margin-type-btn-title">Gross Margin</div>
                    <div className="margin-type-btn-sub">מחיר = עלות / (1 − מרווח%)</div>
                    <div className="margin-type-btn-sub" style={{ marginTop: 4, color: 'var(--text3)' }}>
                      עלות ₪100 + {projValues.margin || globalSettings.margin || 25}% ↦ ₪{(Number(projValues.margin || globalSettings.margin || 25) < 100 ? (100 / (1 - Number(projValues.margin || globalSettings.margin || 25) / 100)).toFixed(0) : '∞')}
                    </div>
                    <div className="margin-type-badge">מומלץ</div>
                  </button>
                </div>
              </div>

              {/* Live preview */}
              <div className="settings-preview">
                <span>תצוגה מקדימה:</span>
                <span className="settings-preview-cost">עלות ₪100</span>
                <span className="settings-preview-arrow">→</span>
                <span className="settings-preview-sell">מחיר ₪{previewSell.toFixed(0)}</span>
                <span className="settings-preview-arrow">·</span>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>רווח ₪{previewProfit.toFixed(0)}</span>
                <span style={{ color: 'var(--text3)', marginRight: 'auto', fontSize: 11 }}>
                  ({previewType === 'margin' ? 'Gross Margin' : 'Markup'} · {projValues.margin || globalSettings.margin || 25}%)
                </span>
              </div>

              {/* Shipment metadata */}
              <div className="settings-section-divider">פרטי משלוח</div>
              <div className="settings-grid">
                <div className="form-group">
                  <div className="sfield-header">
                    <label>ספק ראשי</label>
                    <span className="sfield-badge sfield-project">פרויקט</span>
                  </div>
                  <input
                    type="text" value={projMeta.supplier} placeholder="שם הספק"
                    onChange={e => setProjMeta(m => ({ ...m, supplier: e.target.value }))}
                    className="sfield-input sfield-overridden"
                  />
                </div>
                <div className="form-group">
                  <div className="sfield-header">
                    <label>תאריך משלוח</label>
                    <span className="sfield-badge sfield-project">פרויקט</span>
                  </div>
                  <input
                    type="date" value={projMeta.shipment_date}
                    onChange={e => setProjMeta(m => ({ ...m, shipment_date: e.target.value }))}
                    className="sfield-input sfield-overridden"
                  />
                </div>
              </div>

              {/* Override summary */}
              {overrideSet.size > 0 && (
                <div className="sfield-override-summary">
                  <span>{overrideSet.size} הגדרות עוקפות את הגלובלי</span>
                  <button type="button" className="btn btn-sm" onClick={resetAllProjectFields}>
                    ↺ אפס הכל
                  </button>
                </div>
              )}
            </div>

            <div className="settings-save-row">
              <button type="submit" className="btn btn-primary" disabled={savingProject}>
                {savingProject ? <span className="spinner" /> : <Save size={14} />}
                {savingProject ? 'שומר...' : 'שמור הגדרות פרויקט'}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={resetMarginToDefault}
                title="שנה מרווח ל-25% ושמור"
                style={{ color: 'var(--gold)', borderColor: 'var(--gold)' }}
              >
                ↺ אפס מרווח לברירת מחדל (25%)
              </button>
              <span className="text-sm text-muted">
                {overrideSet.size === 0
                  ? 'משתמש בכל ערכי הגלובלי'
                  : `עוקף: ${[...overrideSet].map(k => {
                      if (k === 'margin_type') return 'שיטת מרווח';
                      return PROJECT_NUM_FIELDS.find(f => f.key === k)?.label || k;
                    }).join(', ')}`}
              </span>
            </div>
          </form>
        ) : (
          <div className="settings-no-project" style={{ marginTop: 28 }}>
            <FolderOpen size={18} />
            <span>בחר פרויקט פעיל כדי לערוך הגדרות משלוח ספציפיות</span>
          </div>
        )}

        {/* ════ SECTION 3 — Freight History ════ */}
        <div style={{ marginTop: 28, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>📦 היסטוריית Freight</div>
          <FreightHistoryPanel
            freightHistory={freightHistory}
            addFreightRecord={addFreightRecord}
            activeProjectId={activeProjectId}
            projects={projects}
          />
        </div>

        {/* ── Formula reference ── */}
        <div style={{ marginTop: 28, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>📐 נוסחת החישוב</div>
          <div className="formula-grid">
            {FORMULA.map(([name, formula]) => (
              <div key={name} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--blue)', fontWeight: 700, whiteSpace: 'nowrap', minWidth: 130 }}>{name}</span>
                <span style={{ color: 'var(--text2)', fontSize: 13 }}>{formula}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
