import React, { useState, useMemo } from 'react';
import { Plus, X, Check } from 'lucide-react';

function fmtDate(dateStr) {
  return dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('he-IL') : '';
}

function FreightLineChart({ records }) {
  const sorted = [...records]
    .filter(r => Number(r.freight_usd) > 0)
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from));

  if (sorted.length < 2) return null;

  const values = sorted.map(r => Number(r.freight_usd));
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const W = 500, H = 80, PX = 10, PY = 14;
  const innerW = W - PX * 2;
  const innerH = H - PY * 2;

  const pts = sorted.map((r, i) => ({
    x: PX + (sorted.length === 1 ? innerW / 2 : (i / (sorted.length - 1)) * innerW),
    y: PY + (1 - (Number(r.freight_usd) - minV) / range) * innerH,
    value: Number(r.freight_usd),
    label: r.valid_from.slice(5),
  }));

  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div style={{ marginTop: 14, background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>שינויי Freight לאורך זמן ($)</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 80, display: 'block' }}>
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--blue, #3b82f6)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="var(--blue, #3b82f6)" />
            <text x={p.x} y={H - 1} textAnchor="middle" fontSize="8" fill="var(--text3, #888)">
              {p.label}
            </text>
          </g>
        ))}
        <text x={PX} y={PY + 6} fontSize="9" fill="var(--text3, #888)" textAnchor="start">
          ${maxV.toLocaleString()}
        </text>
        {minV !== maxV && (
          <text x={PX} y={H - PY + 4} fontSize="9" fill="var(--text3, #888)" textAnchor="start">
            ${minV.toLocaleString()}
          </text>
        )}
      </svg>
    </div>
  );
}

export default function FreightHistoryPanel({ freightHistory = [], addFreightRecord, activeProjectId, projects = [] }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    freight_usd: '',
    valid_from: new Date().toISOString().split('T')[0],
    is_project: false,
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const activeRecord = useMemo(() => {
    const eligible = freightHistory.filter(r => r.valid_from <= today);
    const projectSpecific = eligible.filter(r => r.project_id === activeProjectId && activeProjectId);
    if (projectSpecific.length > 0) {
      return projectSpecific.sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
    }
    const global = eligible.filter(r => !r.project_id);
    if (global.length > 0) {
      return global.sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
    }
    return null;
  }, [freightHistory, activeProjectId, today]);

  function getProjectName(projectId) {
    if (!projectId) return 'גלובלי';
    return projects.find(p => p.id === projectId)?.name || 'פרויקט';
  }

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.freight_usd || !form.valid_from) return;
    setSaving(true);
    const ok = await addFreightRecord({
      freight_usd: Number(form.freight_usd),
      valid_from:  form.valid_from,
      project_id:  form.is_project && activeProjectId ? activeProjectId : null,
      notes:       form.notes || null,
    });
    if (ok) {
      setShowForm(false);
      setForm({ freight_usd: '', valid_from: new Date().toISOString().split('T')[0], is_project: false, notes: '' });
    }
    setSaving(false);
  }

  const sorted = [...freightHistory].sort((a, b) => b.valid_from.localeCompare(a.valid_from));

  return (
    <div>
      {/* Active freight banner */}
      {activeRecord && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--bg2)', border: '1px solid var(--blue, #3b82f6)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 12,
        }}>
          <span style={{ color: 'var(--blue, #3b82f6)', fontWeight: 700, fontSize: 13 }}>Freight פעיל:</span>
          <span style={{ fontWeight: 700 }}>${Number(activeRecord.freight_usd).toLocaleString()}</span>
          <span style={{ color: 'var(--text3)', fontSize: 12 }}>
            מ-{fmtDate(activeRecord.valid_from)} · {getProjectName(activeRecord.project_id)}
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
          רשומות Freight ({freightHistory.length})
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'ביטול' : 'הוסף Freight חדש'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div className="settings-grid">
            <div className="form-group">
              <label>Freight ($)</label>
              <input
                type="number" min="0" step="100"
                value={form.freight_usd}
                onChange={e => setField('freight_usd', e.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="form-group">
              <label>בתוקף מ</label>
              <input
                type="date"
                value={form.valid_from}
                onChange={e => setField('valid_from', e.target.value)}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 8 }}>
            <label>הערות (אופציונלי)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="לדוגמה: LCL מסין, עונת שיא"
            />
          </div>
          {activeProjectId && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox" id="fh_is_project"
                checked={form.is_project}
                onChange={e => setField('is_project', e.target.checked)}
              />
              <label htmlFor="fh_is_project" style={{ cursor: 'pointer', fontSize: 13 }}>
                ספציפי לפרויקט הנוכחי
              </label>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleSave}
              disabled={saving || !form.freight_usd}
            >
              {saving
                ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                : <Check size={13} />}
              שמור
            </button>
          </div>
        </div>
      )}

      {/* Line chart */}
      {freightHistory.length >= 2 && <FreightLineChart records={freightHistory} />}

      {/* Table */}
      {freightHistory.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          אין רשומות Freight עדיין
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>בתוקף מ</th>
                <th>Freight $</th>
                <th>היקף</th>
                <th>הערות</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const isActive = r.id === activeRecord?.id;
                return (
                  <tr key={r.id} style={isActive ? { background: 'rgba(59,130,246,0.08)', fontWeight: 600 } : {}}>
                    <td>
                      {fmtDate(r.valid_from)}
                      {isActive && (
                        <span style={{ marginRight: 6, color: 'var(--green)', fontSize: 11 }}>● פעיל</span>
                      )}
                    </td>
                    <td className="td-usd">${Number(r.freight_usd).toLocaleString()}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{getProjectName(r.project_id)}</td>
                    <td className="td-muted">{r.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
