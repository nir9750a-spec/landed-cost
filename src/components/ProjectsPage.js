import React, { useState, useMemo } from 'react';
import { Plus, Copy, Archive, FolderOpen, RotateCcw } from 'lucide-react';
import { calcProducts, calcTotals } from '../lib/calculations';
import ProjectForm from './ProjectForm';

function fmt(n, d = 0) {
  return Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtDate(ts) {
  return ts ? new Date(ts).toLocaleDateString('he-IL') : '';
}

export const STATUS_LABEL = { draft: 'טיוטה', active: 'פעיל', closed: 'סגור' };
export const STATUS_CLASS  = { draft: 'badge-orange', active: 'badge-green', closed: 'badge-gray' };

export default function ProjectsPage({
  projects, products, settings,
  addProject, updateProject, duplicateProject,
  setActiveProjectId, setPage,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editProj, setEditProj] = useState(null);
  const [filter, setFilter]     = useState('all');

  const projectStats = useMemo(() => {
    const map = {};
    projects.forEach(proj => {
      const pp = products.filter(p => p.project_id === proj.id);
      const t  = calcTotals(calcProducts(pp, settings));
      map[proj.id] = { count: pp.length, landedIls: t.landedIlsTotal, profitTotal: t.profitTotal };
    });
    return map;
  }, [projects, products, settings]);

  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter);

  function openProject(proj) { setActiveProjectId(proj.id); setPage('products'); }
  function openAdd()          { setEditProj(null); setShowForm(true); }
  function openEdit(proj)     { setEditProj(proj); setShowForm(true); }
  function closeForm()        { setShowForm(false); setEditProj(null); }

  async function handleSave(data) {
    const ok = editProj ? await updateProject(editProj.id, data) : await addProject(data);
    if (ok) closeForm();
  }

  async function toggleArchive(proj) {
    await updateProject(proj.id, { status: proj.status === 'closed' ? 'active' : 'closed' });
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">פרויקטים</h1>
        <div className="flex gap-2 items-center">
          <div className="filter-tabs">
            {['all', 'active', 'draft', 'closed'].map(f => (
              <button
                key={f}
                className={`filter-tab${filter === f ? ' active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'הכל' : STATUS_LABEL[f]}
                <span className="filter-tab-count">
                  {f === 'all' ? projects.length : projects.filter(p => p.status === f).length}
                </span>
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={15} /> פרויקט חדש
          </button>
        </div>
      </div>

      <div className="page-body">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <div className="empty-text">
              {filter === 'all' ? 'אין פרויקטים עדיין' : `אין פרויקטים בסטטוס "${STATUS_LABEL[filter]}"`}
            </div>
            {filter === 'all' && (
              <>
                <div className="empty-hint">צור פרויקט חדש כדי להתחיל לנהל יבואים</div>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>
                  <Plus size={15} /> פרויקט חדש
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="projects-grid">
            {filtered.map(proj => {
              const s = projectStats[proj.id] || {};
              return (
                <div key={proj.id} className={`project-card${proj.status === 'closed' ? ' project-card-closed' : ''}`}>
                  <div className="project-card-top">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="project-card-name">{proj.name}</div>
                      {proj.supplier && <div className="project-card-supplier">ספק: {proj.supplier}</div>}
                      <div className="project-card-date">
                        {proj.shipment_date
                          ? `🚢 ${fmtDate(proj.shipment_date)}`
                          : fmtDate(proj.created_at)}
                      </div>
                    </div>
                    <span className={`badge ${STATUS_CLASS[proj.status] || 'badge-blue'}`}>
                      {STATUS_LABEL[proj.status] || proj.status}
                    </span>
                  </div>

                  <div className="project-card-stats">
                    <div className="pc-stat">
                      <span className="pc-stat-label">מוצרים</span>
                      <span className="pc-stat-val">{s.count || 0}</span>
                    </div>
                    <div className="pc-stat">
                      <span className="pc-stat-label">Landed ₪</span>
                      <span className="pc-stat-val td-ils">₪{fmt(s.landedIls)}</span>
                    </div>
                    <div className="pc-stat">
                      <span className="pc-stat-label">רווח ₪</span>
                      <span className="pc-stat-val td-profit">₪{fmt(s.profitTotal)}</span>
                    </div>
                  </div>

                  {proj.notes && <div className="project-card-notes">{proj.notes}</div>}

                  <div className="project-card-footer">
                    <button className="btn btn-sm btn-primary" onClick={() => openProject(proj)}>
                      <FolderOpen size={13} /> פתח
                    </button>
                    <button className="btn btn-sm" onClick={() => openEdit(proj)}>עריכה</button>
                    <button className="btn btn-sm" onClick={() => duplicateProject(proj)} title="שכפל פרויקט">
                      <Copy size={13} />
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => toggleArchive(proj)}
                      title={proj.status === 'closed' ? 'שחזר פרויקט' : 'העבר לארכיון'}
                    >
                      {proj.status === 'closed' ? <RotateCcw size={13} /> : <Archive size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && <ProjectForm project={editProj} onSave={handleSave} onClose={closeForm} />}
    </div>
  );
}
