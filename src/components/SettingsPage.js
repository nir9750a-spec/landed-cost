import React, { useState, useEffect } from 'react';
import { Save, Globe, FolderOpen } from 'lucide-react';
import { PROJECT_SETTINGS_KEYS } from '../lib/calculations';

// ── Field definitions ──────────────────────────────────────────

const GLOBAL_FIELDS = [
  { key: 'vat',            label: 'מע"מ (%)',              type: 'number', step: '0.5',   min: '0', max: '100' },
  { key: 'customs',        label: 'מכס (%)',               type: 'number', step: '0.5',   min: '0', max: '100' },
  { key: 'agent_fee',      label: 'עמלת סוכן (₪)',        type: 'number', step: '100',   min: '0' },
  { key: 'port_fees',      label: 'אגרות נמל (₪)',        type: 'number', step: '100',   min: '0' },
  { key: 'local_transport',label: 'הובלה מקומית (₪)',     type: 'number', step: '100',   min: '0' },
];

const PROJECT_FIELDS = [
  { key: 'usd_rate',  label: 'שער דולר (₪/$)',   type: 'number', step: '0.001', min: '0' },
  { key: 'freight',   label: 'הובלה FCL ($)',     type: 'number', step: '100',   min: '0' },
  { key: 'insurance', label: 'ביטוח (%)',          type: 'number', step: '0.1',   min: '0', max: '10' },
  { key: 'margin',    label: 'מרווח רווח (%)',    type: 'number', step: '1',     min: '0', max: '500' },
];

const FORMULA = [
  ['FOB סה"כ',         'כמות × מחיר FOB'],
  ['סה"כ משלוח ₪',    '(FOB+הובלה+ביטוח+מכס)×שער + עמלת סוכן + אגרות נמל + הובלה מקומית'],
  ['עלות ל-CBM',       'סה"כ ₪ ÷ CBM כולל'],
  ['עלות מחסן/יח׳',   'עלות ל-CBM × CBM ליחידה  (fallback: יחס FOB אם CBM=0)'],
  ['מחיר מכירה ₪',    'עלות מחסן/יח׳ × (1 + % מרווח)'],
  ['רווח/יח׳',         'מחיר מכירה − עלות מחסן'],
  ['מכס',              'CIF × % מכס (ניתן לעקוף לפי מוצר / קוד HS)'],
  ['מע"מ',             '(CIF + מכס) × % מע"מ  (מוצג בטבלה, לא בעלות מחסן)'],
];

// ── Component ──────────────────────────────────────────────────

export default function SettingsPage({
  globalSettings,
  projectOverrides,
  saveGlobalSettings,
  saveProjectSettings,
  showToast,
  activeProject,
  updateProject,
}) {
  // ── Global form state ──
  const [globalForm, setGlobalForm]   = useState({ vat: '', customs: '', agent_fee: '', port_fees: '', local_transport: '', api_key: '' });
  const [savingGlobal, setSavingGlobal] = useState(false);

  // ── Project form state ──
  // projValues: current displayed value for each project field (override OR global default)
  // overrideSet: Set of keys the user has explicitly overridden for this project
  const [projValues, setProjValues]   = useState({});
  const [overrideSet, setOverrideSet] = useState(new Set());
  const [projMeta, setProjMeta]       = useState({ supplier: '', shipment_date: '' });
  const [savingProject, setSavingProject] = useState(false);

  // ── Sync from props ──

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
    // Show effective value: project override if exists, else global default
    const vals = {};
    PROJECT_FIELDS.forEach(({ key }) => {
      vals[key] = projectOverrides[key] ?? globalSettings[key] ?? '';
    });
    setProjValues(vals);
    setOverrideSet(new Set(Object.keys(projectOverrides)));
  }, [globalSettings, projectOverrides]);

  useEffect(() => {
    setProjMeta({
      supplier:      activeProject?.supplier      || '',
      shipment_date: activeProject?.shipment_date || '',
    });
  }, [activeProject]);

  // ── Global handlers ──

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

  // ── Project field handlers ──

  function handleProjChange(key, value) {
    setProjValues(v => ({ ...v, [key]: value }));
    setOverrideSet(s => new Set([...s, key]));
  }

  function resetProjectField(key) {
    // Remove the override — snap back to global value
    setProjValues(v => ({ ...v, [key]: globalSettings[key] ?? '' }));
    setOverrideSet(s => { const ns = new Set(s); ns.delete(key); return ns; });
  }

  function resetAllProjectFields() {
    const vals = {};
    PROJECT_FIELDS.forEach(({ key }) => { vals[key] = globalSettings[key] ?? ''; });
    setProjValues(vals);
    setOverrideSet(new Set());
  }

  async function submitProject(e) {
    e.preventDefault();
    setSavingProject(true);

    // Only persist overrideSet keys; everything else saves as null (= inherit global)
    const overrides = {};
    PROJECT_SETTINGS_KEYS.forEach(k => {
      if (overrideSet.has(k)) overrides[k] = Number(projValues[k]);
    });
    const settingsOk = await saveProjectSettings(overrides);

    // Save supplier + shipment_date on the project row itself
    if (settingsOk && activeProject) {
      await updateProject(activeProject.id, {
        supplier:      projMeta.supplier      || null,
        shipment_date: projMeta.shipment_date || null,
      });
    }
    setSavingProject(false);
  }

  // Inline renderer — NOT a sub-component (avoids React key-stripping the fieldKey)
  function renderProjectField({ key, label, type, step, min, max }) {
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
        </div>
        <input
          type={type}
          value={projValues[key] ?? ''}
          onChange={e => handleProjChange(key, e.target.value)}
          className={`sfield-input${isOverridden ? ' sfield-overridden' : ' sfield-inherited'}`}
          step={step} min={min} max={max}
        />
      </div>
    );
  }

  // ── Render ──

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">הגדרות</h1>
      </div>

      <div className="page-body">

        {/* ═══════════════════════════════════════════════════════
            SECTION 1 — Global settings
        ════════════════════════════════════════════════════════ */}
        <form onSubmit={submitGlobal}>
          <div className="settings-section settings-section-global">
            <div className="settings-section-head">
              <Globe size={15} />
              <span className="settings-section-title-text">הגדרות כלליות</span>
              <span className="settings-section-sub">חלים על כל הפרויקטים — שעורי מכס, מע"מ ועמלת סוכן</span>
            </div>

            <div className="settings-grid">
              {GLOBAL_FIELDS.map(({ key, label, type, step, min, max }) => (
                <div className="form-group" key={key}>
                  <label>{label}</label>
                  <input
                    type={type}
                    value={globalForm[key] ?? ''}
                    onChange={e => setGlobalForm(f => ({ ...f, [key]: e.target.value }))}
                    step={step} min={min} max={max}
                  />
                </div>
              ))}
            </div>

            <div className="settings-section-body-api">
              <div className="settings-section-title-inner">הגדרות AI (חילוץ מ-PDF / תמונה)</div>
              <div className="form-group" style={{ maxWidth: 460 }}>
                <label>מפתח Anthropic API</label>
                <input
                  type="password"
                  value={globalForm.api_key || ''}
                  onChange={e => setGlobalForm(f => ({ ...f, api_key: e.target.value }))}
                  placeholder="sk-ant-api03-..."
                  dir="ltr"
                  autoComplete="off"
                />
                <span className="text-sm text-muted" style={{ marginTop: 4 }}>
                  נדרש לחילוץ אוטומטי מ-PDF ותמונות וסיווג HS. קבצי Excel עובדים ללא מפתח.
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

        {/* ═══════════════════════════════════════════════════════
            SECTION 2 — Project settings (only when project active)
        ════════════════════════════════════════════════════════ */}
        {activeProject ? (
          <form onSubmit={submitProject} style={{ marginTop: 28 }}>
            <div className="settings-section settings-section-project">
              <div className="settings-section-head">
                <FolderOpen size={15} />
                <span className="settings-section-title-text">הגדרות פרויקט</span>
                <span className="settings-section-sub project-name-badge">{activeProject.name}</span>
                <span className="settings-section-sub">ספציפיות למשלוח זה — עוקפות את הגלובלי</span>
              </div>

              {/* Calculation overrides — rendered inline so each field's key is its own closure var */}
              <div className="settings-grid">
                {PROJECT_FIELDS.map(f => renderProjectField(f))}
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
                    type="text"
                    value={projMeta.supplier}
                    onChange={e => setProjMeta(m => ({ ...m, supplier: e.target.value }))}
                    placeholder="שם הספק"
                    className="sfield-input sfield-overridden"
                  />
                </div>
                <div className="form-group">
                  <div className="sfield-header">
                    <label>תאריך משלוח</label>
                    <span className="sfield-badge sfield-project">פרויקט</span>
                  </div>
                  <input
                    type="date"
                    value={projMeta.shipment_date}
                    onChange={e => setProjMeta(m => ({ ...m, shipment_date: e.target.value }))}
                    className="sfield-input sfield-overridden"
                  />
                </div>
              </div>

              {/* Override summary */}
              {overrideSet.size > 0 && (
                <div className="sfield-override-summary">
                  <span>{overrideSet.size} הגדרות עוקפות את הגלובלי עבור פרויקט זה</span>
                  <button type="button" className="btn btn-sm" onClick={resetAllProjectFields}>
                    ↺ אפס הכל לגלובלי
                  </button>
                </div>
              )}
            </div>

            <div className="settings-save-row">
              <button type="submit" className="btn btn-primary" disabled={savingProject}>
                {savingProject ? <span className="spinner" /> : <Save size={14} />}
                {savingProject ? 'שומר...' : `שמור הגדרות פרויקט`}
              </button>
              <span className="text-sm text-muted">
                {overrideSet.size === 0
                  ? 'כרגע משתמש בכל ערכי הגלובלי'
                  : `עוקף: ${[...overrideSet].map(k => PROJECT_FIELDS.find(f => f.key === k)?.label || k).join(', ')}`}
              </span>
            </div>
          </form>
        ) : (
          <div className="settings-no-project" style={{ marginTop: 28 }}>
            <FolderOpen size={18} />
            <span>בחר פרויקט פעיל כדי לראות ולערוך את הגדרות המשלוח הספציפיות</span>
          </div>
        )}

        {/* ── Formula reference ── */}
        <div style={{ marginTop: 32, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14 }}>📐 נוסחת החישוב</div>
          <div className="formula-grid">
            {FORMULA.map(([name, formula]) => (
              <div key={name} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 130 }}>{name}</span>
                <span style={{ color: 'var(--text2)', fontSize: 13 }}>{formula}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
