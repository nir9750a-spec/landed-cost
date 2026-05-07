import React, { useMemo } from 'react';
import { FolderOpen, Plus, TrendingUp } from 'lucide-react';
import { calcProducts, calcTotals, fmt } from '../lib/calculations';
import { STATUS_LABEL, STATUS_CLASS } from './ProjectsPage';

function fmtN(n, d = 0) {
  return Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Pure CSS bar chart ──────────────────────────────────────────────────────
function BarChart({ calced }) {
  if (!calced.length) return null;
  const maxVal = Math.max(...calced.map(p => p._sellPerUnit || 0));
  if (maxVal === 0) return null;

  return (
    <div>
      <div className="bar-legend">
        <div className="bar-legend-item">
          <div className="bar-legend-dot" style={{ background: 'rgba(0,212,170,0.7)' }} />
          עלות מחסן/יח׳
        </div>
        <div className="bar-legend-item">
          <div className="bar-legend-dot" style={{ background: 'rgba(124,58,237,0.6)' }} />
          מחיר מכירה/יח׳
        </div>
        <div className="bar-legend-item">
          <div className="bar-legend-dot" style={{ background: 'rgba(16,185,129,0.8)' }} />
          רווח/יח׳
        </div>
      </div>
      <div className="bar-chart" style={{ marginTop: 14 }}>
        {calced.slice(0, 10).map((p, i) => {
          const costW   = ((p._costPerUnit   || 0) / maxVal * 100).toFixed(1);
          const sellW   = ((p._sellPerUnit   || 0) / maxVal * 100).toFixed(1);
          const profitW = ((p._profitPerUnit || 0) / maxVal * 100).toFixed(1);
          return (
            <div key={p.id || i} className="bar-chart-row">
              <div className="bar-chart-label" title={p.name}>{p.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div className="bar-track" style={{ height: 8 }}>
                  <div className="bar-segment bar-cost"   style={{ width: `${costW}%`   }} />
                </div>
                <div className="bar-track" style={{ height: 8 }}>
                  <div className="bar-segment bar-sell"   style={{ width: `${sellW}%`   }} />
                </div>
                <div className="bar-track" style={{ height: 8 }}>
                  <div className="bar-segment bar-profit" style={{ width: `${profitW}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CSS donut chart ─────────────────────────────────────────────────────────
function DonutChart({ totals }) {
  const total = (totals.fobTotal    || 0)
              + (totals.freightTotal || 0)
              + (totals.insuranceTotal || 0)
              + (totals.customsTotal   || 0)
              + (totals.agentTotal     || 0);
  if (total === 0) return null;

  const segments = [
    { label: 'FOB',        value: totals.fobTotal,       color: '#00d4aa' },
    { label: 'הובלה',      value: totals.freightTotal,   color: '#7c3aed' },
    { label: 'ביטוח',      value: totals.insuranceTotal, color: '#f59e0b' },
    { label: 'מכס',        value: totals.customsTotal,   color: '#f97316' },
    { label: 'עמלת סוכן', value: totals.agentTotal,     color: '#10b981' },
  ].filter(s => s.value > 0);

  let start = 0;
  const gradient = segments.map(s => {
    const pct = s.value / total * 100;
    const seg = `${s.color} ${start.toFixed(1)}% ${(start + pct).toFixed(1)}%`;
    start += pct;
    return seg;
  }).join(', ');

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="donut-hole" />
      </div>
      <div className="donut-legend">
        {segments.map(s => (
          <div key={s.label} className="donut-legend-item">
            <div className="donut-legend-dot" style={{ background: s.color }} />
            <span className="donut-legend-label">{s.label}</span>
            <span className="donut-legend-pct">{(s.value / total * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────
export default function Dashboard({
  products, settings,
  allProducts, projects, activeProjectId, setActiveProjectId, setPage,
}) {
  const calced = useMemo(() => calcProducts(products, settings), [products, settings]);
  const totals = useMemo(() => calcTotals(calced), [calced]);

  const projectStats = useMemo(() => projects.map(proj => {
    const pp = allProducts.filter(p => p.project_id === proj.id);
    const t  = calcTotals(calcProducts(pp, settings));
    return { ...proj, count: pp.length, ...t };
  }), [projects, allProducts, settings]);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const marginLabel   = settings.margin_type === 'margin' ? 'Gross Margin' : 'Markup';

  function openProject(proj) { setActiveProjectId(proj.id); setPage('products'); }

  // ── No project selected ──────────────────────────────────────────────────
  if (!activeProjectId) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">לוח בקרה</h1>
          <span className="badge badge-blue">{projects.length} פרויקטים</span>
        </div>
        <div className="page-body">
          {projects.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📁</div>
              <div className="empty-text">אין פרויקטים עדיין</div>
              <div className="empty-hint">צור פרויקט חדש כדי להתחיל</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPage('projects')}>
                <Plus size={15} /> פרויקט חדש
              </button>
            </div>
          ) : (
            <>
              <div className="dashboard-section-title">לחץ על פרויקט לפתיחה</div>
              <div className="projects-grid">
                {projectStats.map(proj => (
                  <div key={proj.id}
                    className={`project-card project-card-clickable${proj.status === 'closed' ? ' project-card-closed' : ''}`}
                    onClick={() => openProject(proj)}>
                    <div className="project-card-top">
                      <div>
                        <div className="project-card-name">{proj.name}</div>
                        {proj.supplier && <div className="project-card-supplier">ספק: {proj.supplier}</div>}
                      </div>
                      <span className={`badge ${STATUS_CLASS[proj.status] || 'badge-blue'}`}>
                        {STATUS_LABEL[proj.status] || proj.status}
                      </span>
                    </div>
                    <div className="project-card-stats">
                      <div className="pc-stat">
                        <span className="pc-stat-label">מוצרים</span>
                        <span className="pc-stat-val">{proj.count}</span>
                      </div>
                      <div className="pc-stat">
                        <span className="pc-stat-label">FOB $</span>
                        <span className="pc-stat-val" style={{ color: 'var(--gold)' }}>{fmt.usd(proj.fobTotal)}</span>
                      </div>
                      <div className="pc-stat">
                        <span className="pc-stat-label">רווח ₪</span>
                        <span className="pc-stat-val" style={{ color: 'var(--green)' }}>{fmt.ils(proj.profitTotal)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Project selected ─────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{activeProject?.name || 'לוח בקרה'}</h1>
          {activeProject?.supplier && <div className="text-sm text-muted" style={{ marginTop: 2 }}>ספק: {activeProject.supplier}</div>}
          {activeProject?.shipment_date && <div className="text-sm text-muted" style={{ marginTop: 1 }}>🚢 {new Date(activeProject.shipment_date).toLocaleDateString('he-IL')}</div>}
        </div>
        <div className="flex gap-2 items-center">
          {activeProject && (
            <span className={`badge ${STATUS_CLASS[activeProject.status] || 'badge-blue'}`}>
              {STATUS_LABEL[activeProject.status] || activeProject.status}
            </span>
          )}
          <button className="btn btn-sm" onClick={() => setPage('projects')}>
            <FolderOpen size={13} /> כל הפרויקטים
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* KPI cards */}
        <div className="kpi-grid">
          <div className="kpi-card kpi-teal">
            <div className="kpi-label">עלות יבוא כוללת</div>
            <div className="kpi-value" style={{ color: 'var(--blue)' }}>{fmt.ils(totals.landedIlsTotal)}</div>
            <div className="kpi-sub">{fmt.usd(totals.landedUsdTotal)} · {fmtN(totals.totalCbm, 2)} m³</div>
          </div>
          <div className="kpi-card kpi-purple">
            <div className="kpi-label">מחיר מכירה כולל</div>
            <div className="kpi-value" style={{ color: 'var(--purple)' }}>{fmt.ils(totals.sellTotal)}</div>
            <div className="kpi-sub">{marginLabel} · {settings.margin}%</div>
          </div>
          <div className="kpi-card kpi-green">
            <div className="kpi-label">רווח גולמי</div>
            <div className="kpi-value" style={{ color: 'var(--green)' }}>{fmt.ils(totals.profitTotal)}</div>
            <div className="kpi-sub">ROI {fmtN(totals.roiTotal, 1)}% · מרווח {fmtN(totals.marginPctTotal, 1)}%</div>
          </div>
          <div className="kpi-card kpi-gold">
            <div className="kpi-label">FOB סה״כ</div>
            <div className="kpi-value" style={{ color: 'var(--gold)' }}>{fmt.usd(totals.fobTotal)}</div>
            <div className="kpi-sub">{fmtN(totals.qtyTotal)} יחידות · {products.length} פריטים</div>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-text">אין מוצרים בפרויקט</div>
            <div className="empty-hint">עבור לעמוד המוצרים להוסיף מוצרים</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPage('products')}>
              <Plus size={15} /> הוסף מוצרים
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Bar chart */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>עלות vs. מכירה לפי מוצר</div>
              <BarChart calced={calced} />
            </div>

            {/* Donut chart */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>מבנה עלות המשלוח ($)</div>
              <DonutChart totals={totals} />
            </div>
          </div>
        )}

        {/* ROI banner */}
        {products.length > 0 && (
          <div className="roi-banner">
            <div className="roi-stat">
              <div className="roi-label">ROI</div>
              <div className="roi-value">{fmtN(totals.roiTotal, 1)}%</div>
            </div>
            <div className="roi-stat">
              <div className="roi-label">{marginLabel}</div>
              <div className="roi-value">{fmtN(totals.marginPctTotal, 1)}%</div>
            </div>
            <div className="roi-stat">
              <div className="roi-label">רווח כולל</div>
              <div className="roi-value">{fmt.ils(totals.profitTotal)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="roi-note">
                <TrendingUp size={13} style={{ display: 'inline', marginLeft: 4 }} />
                מע״מ ({settings.vat}%) מוצג לעיון בדף הפירוט המלא — לא נכלל בחישוב עלות המחסן.
                זכות חזרת מע״מ: כ-{fmt.ils(totals.vatTotal * Number(settings.usd_rate || 3.7))} (הערכה).
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
