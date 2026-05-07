import React, { useMemo } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { calcProducts, calcTotals } from '../lib/calculations';
import { STATUS_LABEL, STATUS_CLASS } from './ProjectsPage';

function fmt(n, d = 0) {
  return Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function Dashboard({
  products, settings,
  allProducts, projects, activeProjectId, setActiveProjectId, setPage,
}) {
  const calced = useMemo(() => calcProducts(products, settings), [products, settings]);
  const totals  = useMemo(() => calcTotals(calced), [calced]);

  // Per-project stats for the all-projects overview
  const projectStats = useMemo(() => projects.map(proj => {
    const pp = allProducts.filter(p => p.project_id === proj.id);
    const t  = calcTotals(calcProducts(pp, settings));
    return { ...proj, count: pp.length, ...t };
  }), [projects, allProducts, settings]);

  const profitPct = totals.landedIlsTotal > 0
    ? ((totals.profitTotal / totals.landedIlsTotal) * 100).toFixed(1)
    : '0.0';

  const activeProject = projects.find(p => p.id === activeProjectId);

  function openProject(proj) { setActiveProjectId(proj.id); setPage('products'); }

  // ── No project selected ──
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
              <div className="empty-hint">צור פרויקט חדש כדי להתחיל לנהל יבואים</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPage('projects')}>
                <Plus size={15} /> פרויקט חדש
              </button>
            </div>
          ) : (
            <>
              <div className="dashboard-section-title">סקירת פרויקטים — לחץ לפתיחה</div>
              <div className="projects-grid">
                {projectStats.map(proj => (
                  <div
                    key={proj.id}
                    className={`project-card project-card-clickable${proj.status === 'closed' ? ' project-card-closed' : ''}`}
                    onClick={() => openProject(proj)}
                  >
                    <div className="project-card-top">
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                        <span className="pc-stat-label">Landed ₪</span>
                        <span className="pc-stat-val td-ils">₪{fmt(proj.landedIlsTotal)}</span>
                      </div>
                      <div className="pc-stat">
                        <span className="pc-stat-label">רווח ₪</span>
                        <span className="pc-stat-val td-profit">₪{fmt(proj.profitTotal)}</span>
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

  // ── Project selected ──
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
        <div className="cards-grid">
          <div className="card">
            <div className="card-label">סה"כ FOB</div>
            <div className="card-value orange">${fmt(totals.fobTotal, 2)}</div>
          </div>
          <div className="card">
            <div className="card-label">סה"כ CBM</div>
            <div className="card-value">{fmt(totals.totalCbm, 3)} m³</div>
          </div>
          <div className="card">
            <div className="card-label">הובלה + ביטוח</div>
            <div className="card-value">${fmt(totals.freightTotal + totals.insuranceTotal, 2)}</div>
          </div>
          <div className="card">
            <div className="card-label">סה"כ CIF</div>
            <div className="card-value orange">${fmt(totals.cifTotal, 2)}</div>
          </div>
          <div className="card">
            <div className="card-label">מכס + מע"מ</div>
            <div className="card-value">${fmt(totals.customsTotal + totals.vatTotal, 2)}</div>
          </div>
          <div className="card">
            <div className="card-label">עלות ממונפת $</div>
            <div className="card-value orange">${fmt(totals.landedUsdTotal, 2)}</div>
          </div>
          <div className="card">
            <div className="card-label">עלות ממונפת ₪</div>
            <div className="card-value blue">₪{fmt(totals.landedIlsTotal)}</div>
          </div>
          <div className="card">
            <div className="card-label">מחיר מכירה ₪</div>
            <div className="card-value green">₪{fmt(totals.sellTotal)}</div>
          </div>
          <div className="card">
            <div className="card-label">רווח צפוי ₪</div>
            <div className="card-value green">₪{fmt(totals.profitTotal)}</div>
          </div>
          <div className="card">
            <div className="card-label">מרווח רווח</div>
            <div className="card-value green">{profitPct}%</div>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-text">אין מוצרים בפרויקט זה</div>
            <div className="empty-hint">עבור לעמוד המוצרים כדי להוסיף מוצרים</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPage('products')}>
              <Plus size={15} /> הוסף מוצרים
            </button>
          </div>
        ) : (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
            <div style={{ marginBottom: 14, fontWeight: 600, fontSize: 15 }}>פירוט לפי מוצר</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>שם מוצר</th>
                    <th>ספק</th>
                    <th>כמות</th>
                    <th>FOB סה"כ $</th>
                    <th>עלות ממונפת $</th>
                    <th>עלות ממונפת ₪</th>
                    <th>מחיר מכירה ₪</th>
                    <th>רווח ₪</th>
                  </tr>
                </thead>
                <tbody>
                  {calced.map(p => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="text-muted">{p.supplier || '—'}</td>
                      <td className="td-num">{fmt(p.qty)}</td>
                      <td className="td-usd">${fmt(p._fobTotal, 2)}</td>
                      <td className="td-usd">${fmt(p._landedCostUsd, 2)}</td>
                      <td className="td-ils">₪{fmt(p._landedCostIls)}</td>
                      <td className="td-sell">₪{fmt(p._sellPrice)}</td>
                      <td className="td-profit">₪{fmt(p._profit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>סה"כ</td>
                    <td className="td-usd">${fmt(totals.fobTotal, 2)}</td>
                    <td className="td-usd">${fmt(totals.landedUsdTotal, 2)}</td>
                    <td className="td-ils">₪{fmt(totals.landedIlsTotal)}</td>
                    <td className="td-sell">₪{fmt(totals.sellTotal)}</td>
                    <td className="td-profit">₪{fmt(totals.profitTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
