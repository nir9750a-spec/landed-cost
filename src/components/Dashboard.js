import React, { useMemo, useState, useEffect, useRef } from 'react';
import { FolderOpen, Plus, TrendingUp, TrendingDown, DollarSign, Package,
         RefreshCw, Trash2, FileDown, Receipt, Ship, X as XIcon, Check, Share2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { calcProducts, calcTotals, fmt } from '../lib/calculations';
import { STATUS_LABEL, STATUS_CLASS } from './ProjectsPage';
import ShipmentsPanel from './ShipmentsPanel';
import { seedDemoProject } from '../lib/demoSeed';
import { confirmAsync } from './ConfirmDialog';
import AccountantExport from './AccountantExport';
import DocVerificationPanel from './DocVerificationPanel';
import ShareManagerModal from './ShareManagerModal';
import BrokerExport from './BrokerExport';

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

// ── Count-up animation hook ────────────────────────────────────────────────
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (typeof target !== 'number' || !isFinite(target)) { setVal(target); return; }
    const from = startedRef.current ? val : 0;
    startedRef.current = true;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return val;
}

// ── Sparkline SVG ──────────────────────────────────────────────────────────
function Sparkline({ data, accent }) {
  if (!data || data.length < 2) return null;
  const w = 100, h = 28;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return [x, y];
  });
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg className="kpi-sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ '--kpi-accent': accent }}>
      <path d={areaPath} className="kpi-sparkline-fill" />
      <path d={path} />
    </svg>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, icon: Icon, featured, loss, badge, sparklineData, rawValue, formatter }) {
  const animated = useCountUp(typeof rawValue === 'number' ? rawValue : 0);
  const displayValue = (typeof rawValue === 'number' && formatter) ? formatter(animated) : value;
  const cls = ['kpi-card'];
  if (featured) cls.push('kpi-featured');
  if (loss)     cls.push('kpi-loss');
  return (
    <div className={cls.join(' ')} style={{ '--kpi-accent': accent }}>
      {badge && <span className={`kpi-badge ${loss ? 'loss' : 'profit'}`}>{badge}</span>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="kpi-label">{label}</div>
        {Icon && <Icon size={16} style={{ color: accent, opacity: 0.75 }} />}
      </div>
      <div className="kpi-value" style={{ color: accent }}>{displayValue}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {sparklineData && <Sparkline data={sparklineData} accent={accent} />}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Dashboard({
  products, settings, showToast,
  allProducts, projects, activeProjectId, setActiveProjectId, setPage, calcCtx,
  saveActualFreightQuote, onRefresh,
}) {
  const [showAccountantExport, setShowAccountantExport] = useState(false);
  const [showShareManager, setShowShareManager]         = useState(false);
  const [showBrokerExport, setShowBrokerExport]         = useState(false);
  const calced = useMemo(() => calcProducts(products, settings, calcCtx), [products, settings, calcCtx]);
  const totals = useMemo(() => calcTotals(calced), [calced]);

  const projectStats = useMemo(() => projects.map(proj => {
    const pp = allProducts.filter(p => p.project_id === proj.id);
    const t  = calcTotals(calcProducts(pp, settings, { ...calcCtx, projectId: proj.id }));
    return { ...proj, count: pp.length, ...t };
  }), [projects, allProducts, settings, calcCtx]);

  const activeProject  = projects.find(p => p.id === activeProjectId);
  const marginLabel    = settings.margin_type === 'margin' ? 'Gross Margin' : 'Markup';
  const vatEstimate    = totals.vatTotal * Number(settings.usd_rate || 3.7);

  // ── Sparkline data — per-product running totals to visualize composition ──
  const kpiSparklines = useMemo(() => {
    if (!calced || calced.length === 0) return {};
    const landed = [], sell = [], profit = [], fob = [];
    let aL = 0, aS = 0, aP = 0, aF = 0;
    for (const p of calced) {
      aL += Number(p._landedCostIls) || 0;
      aS += Number(p._sellPrice)     || 0;
      aP += Number(p._profit)        || 0;
      aF += Number(p._fobTotal)      || 0;
      landed.push(aL); sell.push(aS); profit.push(aP); fob.push(aF);
    }
    return { landed, sell, profit, fob };
  }, [calced]);

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
            <EmptyStateWithDemo
              setActiveProjectId={setActiveProjectId}
              setPage={setPage}
            />
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
        <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setPage('projects')} title="כל הפרויקטים">
            <FolderOpen size={13} /> פרויקטים
          </button>
          <span style={{ color: 'var(--text3)' }}>›</span>
          <h1 className="page-title" style={{ fontSize: 18 }}>{activeProject?.name || 'לוח בקרה'}</h1>
          {activeProject && (
            <span className={`badge ${STATUS_CLASS[activeProject.status] || 'badge-blue'}`}>
              {STATUS_LABEL[activeProject.status] || activeProject.status}
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {products.length > 0 && (
            <button
              className="btn btn-sm"
              onClick={() => setShowAccountantExport(true)}
              title="ייצא PDF לרואה חשבון או עמיל מכס"
              style={{ background: 'var(--bg3)', borderColor: 'var(--green)' }}
            >
              <FileDown size={13} /> לרו״ח / עמיל
            </button>
          )}
          {activeProject && (
            <button
              className="btn btn-sm"
              onClick={() => setShowShareManager(true)}
              title="צור גישת אורח לפורווארדר / עמיל מכס"
              style={{ background: 'var(--bg3)', borderColor: 'var(--violet)' }}
            >
              <Share2 size={13} /> שתף
            </button>
          )}
          {products.length > 0 && (
            <button
              className="btn btn-sm"
              onClick={() => setShowBrokerExport(true)}
              title="דף ריכוז משלוח למוביל / משלח בינלאומי"
              style={{ background: 'var(--bg3)', borderColor: 'var(--blue)' }}
            >
              <Ship size={13} /> למוביל / משלח
            </button>
          )}
          <button className="btn btn-sm" onClick={onRefresh} title="רענן נתונים">
            <RefreshCw size={13} />
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => setPage('projects')} title="מחיקת פרויקט">
            <Trash2 size={13} /> מחק
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => window.print()} title="ייצוא PDF">
            <FileDown size={13} /> ייצוא PDF
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* ── KPI cards ── */}
        <div className="kpi-grid">
          <KpiCard
            label="עלות ייבוא כוללת"
            rawValue={totals.landedIlsTotal}
            formatter={fmt.ils}
            value={fmt.ils(totals.landedIlsTotal)}
            sub={totals.landedUsdTotal > 0 ? `${fmt.usd(totals.landedUsdTotal)} · ${n(totals.totalCbm, 2)} m³` : 'הוסף מוצרים כדי לראות סיכום'}
            accent="#22d3ee"
            icon={Package}
            sparklineData={kpiSparklines.landed}
          />
          <KpiCard
            label="מחיר מכירה כולל"
            rawValue={totals.sellTotal}
            formatter={fmt.ils}
            value={fmt.ils(totals.sellTotal)}
            sub={`${marginLabel} · ${settings.margin}%`}
            accent="#00d4aa"
            icon={TrendingUp}
            sparklineData={kpiSparklines.sell}
          />
          <KpiCard
            label="רווח צפוי"
            rawValue={totals.profitTotal}
            formatter={fmt.ils}
            value={fmt.ils(totals.profitTotal)}
            sub={totals.profitTotal !== 0 ? `ROI ${n(totals.roiTotal, 1)}% · מרווח ${n(totals.marginPctTotal, 1)}%` : 'יחושב לאחר הוספת מוצרים'}
            accent={totals.profitTotal >= 0 ? '#10b981' : '#ef4444'}
            icon={totals.profitTotal >= 0 ? TrendingUp : TrendingDown}
            featured={totals.profitTotal > 0}
            loss={totals.profitTotal < 0}
            badge={totals.profitTotal < 0 ? 'הפסד!' : (totals.profitTotal > 0 ? 'צפי' : null)}
            sparklineData={kpiSparklines.profit}
          />
          <KpiCard
            label="FOB סה״כ"
            rawValue={totals.fobTotal}
            formatter={fmt.usd}
            value={fmt.usd(totals.fobTotal)}
            sub={`${n(totals.qtyTotal)} יחידות · ${products.length} פריטים`}
            accent="#7c3aed"
            icon={DollarSign}
            sparklineData={kpiSparklines.fob}
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

                <ActualQuotePanel
                  currentActual={Number(settings.actual_freight_usd) || 0}
                  estimatedFreightUsd={Math.round(totals.freightTotal || 0)}
                  onSave={saveActualFreightQuote}
                />

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

            {/* ── ROI banner — only when products have real cost data ── */}
            {totals.fobTotal > 0 && <div className="roi-banner">
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
              {vatEstimate > 0 && (
                <div style={{ flex: 1 }}>
                  <div className="roi-note">
                    💡 מע״מ ({settings.vat}%) לא כלול בחישוב — כעוסק מורשה תקבל החזר {fmt.ils(vatEstimate)} (הערכה)
                  </div>
                </div>
              )}
            </div>}

            {/* ── Document verification (invoice vs packing vs BL) ── */}
            <DocVerificationPanel
              activeProjectId={activeProjectId}
              products={products}
              settings={settings}
            />

            {/* ── Container tracking ── */}
            <ShipmentsPanel activeProjectId={activeProjectId} showToast={showToast} />
          </>
        )}
      </div>

      {showAccountantExport && (
        <AccountantExport
          project={activeProject}
          products={products}
          settings={settings}
          calcCtx={calcCtx}
          onClose={() => setShowAccountantExport(false)}
        />
      )}

      {showShareManager && activeProject && (
        <ShareManagerModal
          projectId={activeProject.id}
          projectName={activeProject.name}
          showToast={showToast}
          onClose={() => setShowShareManager(false)}
        />
      )}

      {showBrokerExport && (
        <BrokerExport
          project={activeProject}
          products={products}
          settings={settings}
          calcCtx={calcCtx}
          onClose={() => setShowBrokerExport(false)}
        />
      )}
    </div>
  );
}

// ── EmptyStateWithDemo ───────────────────────────────────────────────────────
// First-time visitor sees this. Big proactive "try with demo data" CTA so
// they aren't staring at an empty wasteland.
function EmptyStateWithDemo({ setActiveProjectId, setPage }) {
  const [seeding, setSeeding] = useState(false);
  const [error, setError]     = useState('');

  async function handleSeed() {
    setSeeding(true);
    setError('');
    try {
      const projectId = await seedDemoProject();
      setActiveProjectId(projectId);
      setPage('dashboard');
    } catch (err) {
      setError(err.message);
      setSeeding(false);
    }
  }

  return (
    <div className="empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div className="empty-icon" style={{ fontSize: 48, marginBottom: 8 }}>📦</div>
      <div className="empty-text" style={{ fontSize: 22, fontWeight: 700 }}>ברוך הבא ל-Importly</div>
      <div className="empty-hint" style={{ maxWidth: 460, margin: '12px auto 28px', color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 }}>
        Importly מחשב עלות נחיתה אמיתית לכל מוצר ביבוא לישראל — מע"מ, מכס, ביטוח, הובלה, אגרות — בלי אקסל ובלי שאלות לעמיל. נסה עכשיו עם פרויקט דמו או צור פרויקט אמיתי.
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleSeed} disabled={seeding} style={{ fontSize: 14, padding: '10px 18px' }}>
          {seeding ? '⏳ מכין דמו...' : '✨ נסה עם פרויקט דמו'}
        </button>
        <button className="btn" onClick={() => setPage('projects')} style={{ fontSize: 14, padding: '10px 18px' }}>
          <Plus size={14} /> פרויקט חדש
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 14, color: 'var(--red)', fontSize: 12 }}>
          {error}
        </div>
      )}
      <div style={{ marginTop: 28, fontSize: 11, color: 'var(--text3)', maxWidth: 460, margin: '28px auto 0', lineHeight: 1.6 }}>
        הדמו כולל 8 מוצרי קמפינג טיפוסיים מספק ב-Yongkang, מכולה 40HC משנגחאי, והגדרות מכס ישראליות מעודכנות. תוכל לערוך, לשכפל, או למחוק בכל עת.
      </div>
    </div>
  );
}

// ── ActualQuotePanel ─────────────────────────────────────────────────────────
// Prominent button + inline editor for the per-project actual_freight_usd
// override. When set, replaces the FBX13-derived estimate everywhere in the
// calculation engine.
function ActualQuotePanel({ currentActual, estimatedFreightUsd, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState('');
  const [saving, setSaving]   = useState(false);

  function startEdit() {
    setValue(currentActual > 0 ? String(currentActual) : '');
    setEditing(true);
  }

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    const ok = await onSave(value);
    setSaving(false);
    if (ok) setEditing(false);
  }

  async function handleRemove() {
    if (!onSave) return;
    const ok = await confirmAsync({
      title:        'הסר ציטוט אמיתי',
      message:      'הציטוט האמיתי יוסר והמערכת תחזור להערכה מ-FBX13. להמשיך?',
      confirmLabel: 'הסר',
      danger:       true,
    });
    if (!ok) return;
    setSaving(true);
    await onSave(null);
    setSaving(false);
    setEditing(false);
  }

  // ── State 1: no quote entered + not editing — show prominent CTA ─────────
  if (!editing && !(currentActual > 0)) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(168,85,247,0.10), rgba(168,85,247,0.04))',
        border: '1px solid rgba(168,85,247,0.30)',
        borderRadius: 8, padding: 12, marginBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Receipt size={18} style={{ color: 'var(--violet)' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>קיבלת ציטוט מהפורווארדר?</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              הערכה נוכחית מ-FBX13: <strong>${estimatedFreightUsd.toLocaleString()}</strong>
            </div>
          </div>
        </div>
        <button className="btn btn-sm btn-primary" onClick={startEdit}>
          <Receipt size={13} /> הזן ציטוט אמיתי
        </button>
      </div>
    );
  }

  // ── State 2: quote saved, not editing — show + edit/remove ───────────────
  if (!editing && currentActual > 0) {
    return (
      <div style={{
        background: 'rgba(0,212,170,0.06)',
        border: '1px solid rgba(0,212,170,0.30)',
        borderRadius: 8, padding: 12, marginBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Receipt size={18} style={{ color: 'var(--green)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              🧾 ציטוט אמיתי פעיל: <span style={{ color: 'var(--green)' }}>${currentActual.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              דורס את הערכת FBX13 (${estimatedFreightUsd.toLocaleString()}) בחישוב
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={startEdit}>ערוך</button>
          <button className="btn btn-sm" onClick={handleRemove} disabled={saving} style={{ color: 'var(--red)' }}>
            הסר
          </button>
        </div>
      </div>
    );
  }

  // ── State 3: editing — inline input ──────────────────────────────────────
  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 12, marginBottom: 14,
    }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
        הזן ציטוט אמיתי מהפורווארדר ($). זה ידרוס את הערכת FBX13 לפרויקט הזה בלבד.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number" min="0" step="any" autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={`לדוגמה: ${estimatedFreightUsd}`}
          style={{ flex: 1, padding: '6px 10px', borderRadius: 4, direction: 'ltr', textAlign: 'right' }}
        />
        <button className="btn btn-sm btn-success" onClick={handleSave} disabled={saving || !value}>
          {saving ? <span className="spinner" /> : <Check size={13} />} שמור
        </button>
        <button className="btn btn-sm" onClick={() => setEditing(false)} disabled={saving}>
          <XIcon size={13} /> ביטול
        </button>
      </div>
    </div>
  );
}
