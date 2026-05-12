import React, { useState } from 'react';
import { LayoutDashboard, Package, FolderOpen, Settings, Table2, Printer,
         ChevronDown, ChevronUp, Check, X } from 'lucide-react';

const NAV = [
  { id: 'dashboard', label: 'לוח בקרה',   Icon: LayoutDashboard },
  { id: 'products',  label: 'מוצרים',     Icon: Package },
  { id: 'breakdown', label: 'פירוט מלא',  Icon: Table2 },
  { id: 'projects',  label: 'פרויקטים',   Icon: FolderOpen },
  { id: 'settings',  label: 'הגדרות',     Icon: Settings },
];

// ── helpers ─────────────────────────────────────────────────────────────────
function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function freshnessColor(days) {
  if (days === null) return 'var(--text3)';
  if (days > 7) return 'var(--red)';
  if (days > 4) return 'var(--gold)';
  return 'var(--green)';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL');
}

function fmtUsd(n) {
  return '$' + Number(n || 0).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── MarketRatesBanner ────────────────────────────────────────────────────────
function MarketRatesBanner({ rates, onUpdate, onApply, activeProject, settings }) {
  const [editing, setEditing]   = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({});

  if (!rates || rates.length === 0) return null;

  const fcl = rates.find(r => r.parameter === 'fcl_40ft_china_med');
  const lcl = rates.find(r => r.parameter === 'lcl_per_cbm');
  const air = rates.find(r => r.parameter === 'air_per_kg');

  // Staleness is based on the oldest updated_at among the three
  const mainRates = [fcl, lcl, air].filter(Boolean);
  const oldestIso = mainRates.length
    ? mainRates.reduce((old, r) => (!old || r.updated_at < old ? r.updated_at : old), null)
    : null;
  const days   = daysSince(oldestIso);
  const fColor = freshnessColor(days);

  // Which rate is relevant to current project
  const method  = (settings?.shipping_method || 'sea').toLowerCase();
  const seaType = (settings?.sea_type        || 'fcl').toLowerCase();

  function getApplyKey() {
    if (method === 'air') return { key: 'air_per_kg',        rate: air };
    if (seaType === 'lcl') return { key: 'lcl_price_per_cbm', rate: lcl };
    return                        { key: 'freight',            rate: fcl };
  }

  async function handleSave() {
    setSaving(true);
    for (const [param, val] of Object.entries(form)) {
      if (val !== '' && !isNaN(Number(val))) {
        await onUpdate(param, Number(val));
      }
    }
    setSaving(false);
    setEditing(false);
    setForm({});
  }

  function handleCancel() { setEditing(false); setForm({}); }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { key: applyKey, rate: applyRate } = getApplyKey();

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: 'var(--bg2)',
      borderBottom: '1px solid var(--border)',
      fontSize: 12,
    }}>
      {/* Main strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 20px', flexWrap: 'wrap',
      }}>
        {/* Title */}
        <span style={{ color: 'var(--text3)', fontWeight: 600, marginLeft: 4 }}>
          📊 שוק:
        </span>

        {/* FCL */}
        {fcl && (
          <RateChip
            icon="🚢" label="FCL 40ft China→IM"
            value={fmtUsd(fcl.value)} unit="לקונטיינר"
            daysIso={fcl.updated_at}
            active={method === 'sea' && seaType === 'fcl'}
            onApply={activeProject ? () => onApply('freight', fcl.value) : null}
          />
        )}

        <span style={{ color: 'var(--border2)' }}>|</span>

        {/* LCL */}
        {lcl && (
          <RateChip
            icon="📦" label="LCL"
            value={fmtUsd(lcl.value)} unit="/CBM"
            daysIso={lcl.updated_at}
            active={method === 'sea' && seaType === 'lcl'}
            onApply={activeProject ? () => onApply('lcl_price_per_cbm', lcl.value) : null}
          />
        )}

        <span style={{ color: 'var(--border2)' }}>|</span>

        {/* Air */}
        {air && (
          <RateChip
            icon="✈️" label="אוויר"
            value={fmtUsd(air.value)} unit="/ק״ג"
            daysIso={air.updated_at}
            active={method === 'air'}
            onApply={activeProject ? () => onApply('air_per_kg', air.value) : null}
          />
        )}

        {/* Staleness */}
        <span style={{ color: fColor, marginRight: 4, fontWeight: 600 }}>
          {days !== null
            ? days === 0 ? '● עודכן היום'
            : days === 1 ? `● לפני יום`
            : `● לפני ${days} ימים`
            : ''}
        </span>

        {/* Source */}
        <span style={{ color: 'var(--text3)' }}>
          Drewry WCI · {fmtDate(oldestIso)}
        </span>

        <div style={{ marginRight: 'auto', display: 'flex', gap: 6 }}>
          <button
            className="btn btn-sm"
            onClick={() => { setEditing(v => !v); setForm({}); }}
            style={{ fontSize: 11, padding: '3px 8px' }}
          >
            {editing ? <X size={11} /> : '✏️'}
            {editing ? 'ביטול' : 'עדכן ידנית'}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setCollapsed(v => !v)}
            style={{ fontSize: 11, padding: '3px 6px' }}
            title={collapsed ? 'הצג' : 'כווץ'}
          >
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>
      </div>

      {/* Edit form */}
      {!collapsed && editing && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '10px 20px',
          display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
          {fcl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600 }}>FCL 40ft ($)</label>
              <input
                type="number" min="0" step="10"
                defaultValue={fcl.value}
                onChange={e => setF('fcl_40ft_china_med', e.target.value)}
                style={{ width: 100 }}
              />
            </div>
          )}
          {lcl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600 }}>LCL ($/CBM)</label>
              <input
                type="number" min="0" step="1"
                defaultValue={lcl.value}
                onChange={e => setF('lcl_per_cbm', e.target.value)}
                style={{ width: 80 }}
              />
            </div>
          )}
          {air && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600 }}>אוויר ($/ק"ג)</label>
              <input
                type="number" min="0" step="0.1"
                defaultValue={air.value}
                onChange={e => setF('air_per_kg', e.target.value)}
                style={{ width: 80 }}
              />
            </div>
          )}
          <button
            className="btn btn-sm btn-primary"
            onClick={handleSave}
            disabled={saving || Object.keys(form).length === 0}
            style={{ fontSize: 11 }}
          >
            {saving ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Check size={11} />}
            שמור
          </button>
          <button className="btn btn-sm" onClick={handleCancel} style={{ fontSize: 11 }}>
            ביטול
          </button>
          <span style={{ color: 'var(--text3)', fontSize: 11, alignSelf: 'center' }}>
            מקור מומלץ: Drewry WCI · freightos.com
          </span>
        </div>
      )}

      {/* Apply-to-project bar — shown when project is active and rate is relevant */}
      {!collapsed && !editing && activeProject && applyRate && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '5px 20px',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(0,212,170,0.04)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            שיעור שוק ל-{method === 'air' ? 'אוויר' : seaType === 'lcl' ? 'LCL' : 'FCL'}:
            <strong style={{ color: 'var(--blue)', marginRight: 4 }}>{fmtUsd(applyRate.value)}</strong>
            {method === 'air' ? '/ק"ג' : seaType === 'lcl' ? '/CBM' : '/קונטיינר'}
          </span>
          <button
            className="btn btn-sm btn-primary"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => onApply(applyKey, applyRate.value)}
          >
            ← החל על "{activeProject.name}"
          </button>
        </div>
      )}
    </div>
  );
}

// ── RateChip ─────────────────────────────────────────────────────────────────
function RateChip({ icon, label, value, unit, daysIso, active, onApply }) {
  const days   = daysSince(daysIso);
  const fColor = freshnessColor(days);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span>{icon}</span>
      <span style={{ color: 'var(--text2)' }}>{label}:</span>
      <span style={{
        fontWeight: 700, color: active ? 'var(--blue)' : 'var(--text)',
        fontFamily: 'Space Grotesk, monospace',
      }}>
        {value}
      </span>
      <span style={{ color: 'var(--text3)' }}>{unit}</span>
      <span style={{ fontSize: 9, color: fColor }}>●</span>
      {onApply && (
        <button
          onClick={onApply}
          style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 4,
            border: '1px solid var(--border2)', background: 'var(--bg3)',
            color: 'var(--blue)', cursor: 'pointer', fontFamily: 'inherit',
          }}
          title="החל על הפרויקט הנוכחי"
        >
          החל ↑
        </button>
      )}
    </span>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────
export default function Layout({
  page, setPage, children, activeProject,
  marketRates, onUpdateMarketRate, onApplyMarketRate, settings,
}) {
  return (
    <div className="app-layout">
      <div className="sidebar">
        <div className="sidebar-logo">
          <Package size={20} />
          עלות ממונפת
        </div>

        {activeProject && (
          <div className="sidebar-active-project">
            <FolderOpen size={13} />
            <span title={activeProject.name}>{activeProject.name}</span>
          </div>
        )}

        <nav className="sidebar-nav">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-btn ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => window.print()}>
            <Printer size={14} />
            הדפסה / PDF
          </button>
        </div>
      </div>

      <div className="main-content">
        {marketRates && marketRates.length > 0 && (
          <MarketRatesBanner
            rates={marketRates}
            onUpdate={onUpdateMarketRate}
            onApply={onApplyMarketRate}
            activeProject={activeProject}
            settings={settings}
          />
        )}
        {children}
      </div>
    </div>
  );
}
