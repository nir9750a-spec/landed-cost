import React, { useMemo } from 'react';
import { FolderOpen, Plus, TrendingUp, TrendingDown, DollarSign, Package } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { calcProducts, calcTotals, fmt } from '../lib/calculations';
import { STATUS_LABEL, STATUS_CLASS } from './ProjectsPage';

const CHART_COLORS = {
  cost:     '#00d4aa',
  sell:     '#7c3aed',
  profit:   '#10b981',
};

const PIE_COLORS = ['#00d4aa', '#7c3aed', '#f59e0b', '#f97316', '#3b82f6'];

function n(v, d = 0) {
  return Number(v || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Custom tooltip for bar chart ───────────────────────────────────────────
function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
      padding: '10px 14px', fontSize: 12, minWidth: 160,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#f1f5f9', fontSize: 13 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: p.color, marginBottom: 3 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>₪{n(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Custom tooltip for pie chart ───────────────────────────────────────────
function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
      padding: '8px 12px', fontSize: 12,
    }}>
      <span style={{ color: p.payload.fill, fontWeight: 700 }}>{p.name}</span>
      <span style={{ color: '#f1f5f9', marginRight: 8 }}> ${n(p.value, 0)} ({(p.percent * 100).toFixed(1)}%)</span>
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, icon: Icon }) {
  return (
    <div className="kpi-card" style={{ '--kpi-accent': accent }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="kpi-label">{label}</div>
        {Icon && <Icon size={16} style={{ color: accent, opacity: 0.6 }} />}
      </div>
      <div className="kpi-value" style={{ color: accent }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
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

  const activeProject  = projects.find(p => p.id === activeProjectId);
  const marginLabel    = settings.margin_type === 'margin' ? 'Gross Margin' : 'Markup';
  const vatEstimate    = totals.vatTotal * Number(settings.usd_rate || 3.7);

  function openProject(proj) { setActiveProjectId(proj.id); setPage('products'); }

  // ── Bar chart data ─────────────────────────────────────────────────────
  const barData = calced.slice(0, 12).map(p => ({
    name: p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name,
    'עלות מחסן':   Math.round(p._costPerUnit),
    'מחיר מכירה': Math.round(p._sellPerUnit),
    'רווח':        Math.round(p._profitPerUnit),
  }));

  // ── Pie chart data ─────────────────────────────────────────────────────
  const pieData = [
    { name: 'FOB סחורה',   value: Math.round(totals.fobTotal) },
    { name: 'הובלה',       value: Math.round(totals.freightTotal) },
    { name: 'ביטוח',       value: Math.round(totals.insuranceTotal) },
    { name: 'מכס',         value: Math.round(totals.customsTotal) },
    { name: 'עמלת סוכן',  value: Math.round(totals.agentTotal) },
  ].filter(d => d.value > 0);

  // ── No project selected ────────────────────────────────────────────────
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
              <div className="dashboard-section-title">בחר פרויקט לפתיחה</div>
              <div className="projects-grid">
                {projectStats.map(proj => (
                  <div
                    key={proj.id}
                    className={`project-card project-card-clickable${proj.status === 'closed' ? ' project-card-closed' : ''}`}
                    onClick={() => openProject(proj)}
                  >
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

  // ── Project selected ───────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{activeProject?.name || 'לוח בקרה'}</h1>
          {activeProject?.supplier && (
            <div className="text-sm text-muted" style={{ marginTop: 2 }}>ספק: {activeProject.supplier}</div>
          )}
          {activeProject?.shipment_date && (
            <div className="text-sm text-muted" style={{ marginTop: 1 }}>
              🚢 {new Date(activeProject.shipment_date).toLocaleDateString('he-IL')}
            </div>
          )}
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
        {/* ── KPI cards ── */}
        <div className="kpi-grid">
          <KpiCard
            label="עלות ייבוא כוללת"
            value={fmt.ils(totals.landedIlsTotal)}
            sub={`${fmt.usd(totals.landedUsdTotal)} · ${n(totals.totalCbm, 2)} m³`}
            accent="#3b82f6"
            icon={Package}
          />
          <KpiCard
            label="מחיר מכירה כולל"
            value={fmt.ils(totals.sellTotal)}
            sub={`${marginLabel} · ${settings.margin}%`}
            accent="#00d4aa"
            icon={TrendingUp}
          />
          <KpiCard
            label="רווח צפוי"
            value={fmt.ils(totals.profitTotal)}
            sub={`ROI ${n(totals.roiTotal, 1)}% · מרווח ${n(totals.marginPctTotal, 1)}%`}
            accent={totals.profitTotal >= 0 ? '#f59e0b' : '#ef4444'}
            icon={totals.profitTotal >= 0 ? TrendingUp : TrendingDown}
          />
          <KpiCard
            label="FOB סה״כ"
            value={fmt.usd(totals.fobTotal)}
            sub={`${n(totals.qtyTotal)} יחידות · ${products.length} פריטים`}
            accent="#7c3aed"
            icon={DollarSign}
          />
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
          <>
            {/* ── Charts ── */}
            {!products?.length ? null : (
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 }}>

              {/* Bar chart — direction:ltr required for recharts in RTL apps */}
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 20px 10px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16, color: 'var(--text)' }}>
                  עלות vs. מכירה לפי מוצר
                </div>
                <div style={{ direction: 'ltr' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => '₪' + (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v)}
                      width={52}
                    />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }}
                      formatter={v => <span style={{ color: '#94a3b8' }}>{v}</span>}
                    />
                    <Bar dataKey="עלות מחסן"   fill={CHART_COLORS.cost}   radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="מחיר מכירה"  fill={CHART_COLORS.sell}   radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="רווח"        fill={CHART_COLORS.profit} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>

              {/* Pie chart — direction:ltr required for recharts */}
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>
                  מבנה עלות המשלוח ($)
                </div>
                {pieData.length > 0 ? (
                  <>
                    <div style={{ direction: 'ltr' }}>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%" cy="50%"
                          innerRadius={48} outerRadius={76}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                      {pieData.map((d, i) => {
                        const total = pieData.reduce((a, x) => a + x.value, 0);
                        return (
                          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i], flexShrink: 0 }} />
                            <span style={{ color: 'var(--text2)', flex: 1 }}>{d.name}</span>
                            <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                              {total > 0 ? (d.value / total * 100).toFixed(0) : 0}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text3)', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>
                    אין נתונים להצגה
                  </div>
                )}
              </div>
            </div>
            )}

            {/* ── ROI banner ── */}
            <div className="roi-banner">
              <div className="roi-stat">
                <div className="roi-label">ROI</div>
                <div className="roi-value" style={{ color: totals.roiTotal >= 0 ? 'var(--blue)' : 'var(--red)' }}>
                  {n(totals.roiTotal, 1)}%
                </div>
              </div>
              <div className="roi-stat">
                <div className="roi-label">{marginLabel}</div>
                <div className="roi-value">{n(totals.marginPctTotal, 1)}%</div>
              </div>
              <div className="roi-stat">
                <div className="roi-label">רווח כולל</div>
                <div className="roi-value" style={{ color: 'var(--gold)' }}>{fmt.ils(totals.profitTotal)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="roi-note">
                  💡 מע״מ ({settings.vat}%) לא כלול בחישוב — כעוסק מורשה תקבל החזר {fmt.ils(vatEstimate)} (הערכה)
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
