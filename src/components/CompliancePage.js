import React, { useState, useMemo } from 'react';
import { ShieldCheck, Sparkles, Check, AlertTriangle, FolderOpen, ExternalLink } from 'lucide-react';
import { classifyImportGroupBatch, saveSiiClassification } from '../lib/siiClassify';

// ─────────────────────────────────────────────────────────────────────────────
//  Compliance & SII import classification view.
//  Read-only product list with per-row import-group + customs info,
//  plus AI bulk-classification.
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_INFO = {
  1: { label: 'קבוצה 1', color: 'var(--green)',  desc: 'יבוא חופשי' },
  2: { label: 'קבוצה 2', color: '#3b82f6',       desc: 'הצהרת יבואן' },
  3: { label: 'קבוצה 3', color: 'var(--orange)', desc: 'בדיקת מטען' },
  4: { label: 'קבוצה 4', color: 'var(--red)',    desc: 'רישוי + פיקוח' },
};

function GroupBadge({ group, size = 'md' }) {
  if (!group || !GROUP_INFO[group]) {
    return <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>;
  }
  const info = GROUP_INFO[group];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'sm' ? '1px 6px' : '3px 10px',
      borderRadius: 6,
      background: info.color,
      color: '#000',
      fontWeight: 700,
      fontSize: size === 'sm' ? 11 : 12,
    }}>
      {info.label}
    </span>
  );
}

function n(v, d = 0) {
  return Number(v || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function CompliancePage({ products, activeProject, settings, showToast, setPage, updateProduct }) {
  const [classifyingIds, setClassifyingIds] = useState(new Set());
  const [bulkRunning, setBulkRunning]       = useState(false);
  const [manualEdit, setManualEdit]         = useState({}); // { productId: { group, sii_required } }

  // Summary stats
  const summary = useMemo(() => {
    const total = products.length;
    const classified = products.filter(p => p.import_group != null).length;
    const requiresTest = products.filter(p => p.sii_required === true).length;
    const byGroup = { 1: 0, 2: 0, 3: 0, 4: 0, '?': 0 };
    products.forEach(p => {
      const g = p.import_group;
      if (g && byGroup[g] !== undefined) byGroup[g]++;
      else byGroup['?']++;
    });
    return { total, classified, requiresTest, byGroup };
  }, [products]);

  async function classifyOne(p) {
    setClassifyingIds(prev => new Set(prev).add(p.id));
    try {
      const results = await classifyImportGroupBatch([{
        id: p.id, name: p.name, hs_code: p.hs_code || '', notes: p.notes || '',
      }]);
      const r = results[0];
      if (!r || r.import_group == null) throw new Error('AI לא הצליח לקבוע קבוצה');
      await saveSiiClassification(p.id, {
        import_group: r.import_group,
        sii_required: r.sii_required,
        reasoning:    r.reasoning,
        source:       'ai',
      });
      updateProduct(p.id, { import_group: r.import_group, sii_required: r.sii_required, sii_notes: r.reasoning, sii_source: 'ai' });
      showToast(`"${p.name}": ${GROUP_INFO[r.import_group]?.label}`);
    } catch (err) {
      showToast('שגיאה: ' + err.message, 'error');
    } finally {
      setClassifyingIds(prev => { const s = new Set(prev); s.delete(p.id); return s; });
    }
  }

  async function classifyAll() {
    const unclassified = products.filter(p => p.import_group == null);
    if (unclassified.length === 0) { showToast('הכול כבר מסווג'); return; }
    if (!window.confirm(`לסווג ${unclassified.length} מוצרים באמצעות AI?`)) return;

    setBulkRunning(true);
    try {
      const results = await classifyImportGroupBatch(unclassified.map(p => ({
        id: p.id, name: p.name, hs_code: p.hs_code || '', notes: p.notes || '',
      })));
      let success = 0;
      for (const r of results) {
        if (r.import_group == null) continue;
        try {
          await saveSiiClassification(r.id, {
            import_group: r.import_group,
            sii_required: r.sii_required,
            reasoning:    r.reasoning,
            source:       'ai',
          });
          updateProduct(r.id, { import_group: r.import_group, sii_required: r.sii_required, sii_notes: r.reasoning, sii_source: 'ai' });
          success++;
        } catch {}
      }
      showToast(`סווגו ${success}/${unclassified.length} מוצרים`);
    } catch (err) {
      showToast('שגיאה בסיווג: ' + err.message, 'error');
    } finally {
      setBulkRunning(false);
    }
  }

  async function applyManualEdit(p) {
    const edit = manualEdit[p.id];
    if (!edit || !edit.group) return;
    try {
      await saveSiiClassification(p.id, {
        import_group: edit.group,
        sii_required: edit.sii_required ?? edit.group > 1,
        reasoning:    p.sii_notes || '',
        source:       'manual',
      });
      updateProduct(p.id, {
        import_group: edit.group,
        sii_required: edit.sii_required ?? edit.group > 1,
        sii_source:   'manual',
      });
      setManualEdit(prev => { const c = { ...prev }; delete c[p.id]; return c; });
      showToast(`עודכן ידנית: ${p.name}`);
    } catch (err) {
      showToast('שגיאה: ' + err.message, 'error');
    }
  }

  if (!activeProject) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">תקינה ומכס</h1>
        </div>
        <div className="page-body">
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-text">לא נבחר פרויקט</div>
            <div className="empty-hint">בחר פרויקט כדי לראות סיווג תקינה ומכס</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPage('projects')}>
              <FolderOpen size={15} /> לפרויקטים
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">תקינה ומכס — {activeProject.name}</h1>
        </div>
        <div className="page-body">
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-text">אין מוצרים בפרויקט</div>
            <div className="empty-hint">העלה חשבון בעמוד "מוצרים" כדי לראות כאן את הסיווג</div>
          </div>
        </div>
      </div>
    );
  }

  const groupRows = [1, 2, 3, 4].map(g => ({
    g, count: summary.byGroup[g] || 0, info: GROUP_INFO[g],
  }));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <ShieldCheck size={20} style={{ verticalAlign: 'middle', marginLeft: 8, color: 'var(--violet)' }} />
          תקינה ומכס — {activeProject.name}
        </h1>
        <div className="flex gap-2">
          <button
            className="btn btn-primary"
            onClick={classifyAll}
            disabled={bulkRunning || summary.total === summary.classified}
          >
            {bulkRunning ? <span className="spinner" /> : <Sparkles size={15} />}
            {bulkRunning ? 'מסווג הכול...' : `סווג ${summary.total - summary.classified} נותרים`}
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* ── Summary cards ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12, marginBottom: 20,
        }}>
          <SummaryCard
            label="סה״כ מוצרים"
            value={summary.total}
            sub={`${summary.classified} מסווגים`}
            color="var(--text)"
          />
          <SummaryCard
            label="דורשים בדיקה"
            value={summary.requiresTest}
            sub="קבוצות 2-4"
            color="var(--orange)"
          />
          {groupRows.map(({ g, count, info }) => (
            <SummaryCard
              key={g}
              label={info.label}
              value={count}
              sub={info.desc}
              color={info.color}
            />
          ))}
          {summary.byGroup['?'] > 0 && (
            <SummaryCard
              label="לא מסווג"
              value={summary.byGroup['?']}
              sub="לחץ 'סווג'"
              color="var(--text3)"
            />
          )}
        </div>

        {/* ── Critical warning if any group 3-4 ── */}
        {(summary.byGroup[3] + summary.byGroup[4]) > 0 && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <AlertTriangle size={16} />
            <span>
              <strong>{summary.byGroup[3] + summary.byGroup[4]} מוצרים בקבוצות 3-4</strong> —
              דורשים בדיקת מטען או רישוי לפני שחרור מהמכס. ודא עם עמיל המכס לפני שילוח.
            </span>
          </div>
        )}

        {/* ── Compliance table ── */}
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>שם מוצר</th>
                <th>מק"ט</th>
                <th>כמות</th>
                <th>קוד HS</th>
                <th>מכס %</th>
                <th>קבוצת יבוא</th>
                <th>בדיקת תקן</th>
                <th>הערה</th>
                <th>פעולה</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, idx) => {
                const busy = classifyingIds.has(p.id);
                const customsRate = p.customs_rate_override ?? p.customs_rate ?? settings?.customs ?? 0;
                const edit = manualEdit[p.id];
                return (
                  <tr key={p.id}>
                    <td className="td-muted" style={{ textAlign: 'center', fontSize: 11 }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td className="td-muted font-mono">{p.item_no || '—'}</td>
                    <td className="td-num">{n(p.qty)}</td>
                    <td className="font-mono">
                      {p.hs_code ? (
                        <a
                          href={`https://nfx.co.il/tariff/import/${p.hs_code}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--blue)', textDecoration: 'none' }}
                          title="פתח בתעריף המכס"
                        >
                          {p.hs_code} <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
                        </a>
                      ) : (
                        <span className="td-muted">— לא סווג</span>
                      )}
                    </td>
                    <td className="td-num">{customsRate}%</td>
                    <td>
                      {edit ? (
                        <select
                          value={edit.group || ''}
                          onChange={e => setManualEdit(prev => ({
                            ...prev,
                            [p.id]: { ...prev[p.id], group: Number(e.target.value) },
                          }))}
                          style={{ padding: '4px 6px', borderRadius: 4 }}
                        >
                          <option value="">בחר</option>
                          <option value="1">קבוצה 1</option>
                          <option value="2">קבוצה 2</option>
                          <option value="3">קבוצה 3</option>
                          <option value="4">קבוצה 4</option>
                        </select>
                      ) : (
                        <GroupBadge group={p.import_group} />
                      )}
                      {p.sii_source === 'manual' && p.import_group && (
                        <span style={{ fontSize: 9, color: 'var(--text3)', marginRight: 4 }}>ידני</span>
                      )}
                    </td>
                    <td>
                      {p.import_group == null ? (
                        <span className="td-muted">—</span>
                      ) : p.sii_required ? (
                        <span style={{ color: 'var(--orange)', fontWeight: 700 }}>נדרשת</span>
                      ) : (
                        <span style={{ color: 'var(--green)', fontWeight: 700 }}>לא נדרשת</span>
                      )}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text2)', maxWidth: 240 }}>
                      {p.sii_notes || '—'}
                    </td>
                    <td>
                      {edit ? (
                        <div className="flex gap-1">
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => applyManualEdit(p)}
                            disabled={!edit.group}
                            title="שמור ידני"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => setManualEdit(prev => { const c = { ...prev }; delete c[p.id]; return c; })}
                          >
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            className="btn btn-sm"
                            onClick={() => classifyOne(p)}
                            disabled={busy || bulkRunning}
                            title="סווג עם AI"
                          >
                            {busy ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Sparkles size={12} />}
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => setManualEdit(prev => ({
                              ...prev,
                              [p.id]: { group: p.import_group || '', sii_required: p.sii_required },
                            }))}
                            title="ערוך ידנית"
                          >
                            ידני
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{
          marginTop: 16, padding: 14, background: 'var(--bg2)',
          borderRadius: 8, border: '1px solid var(--border)', fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>מקרא — קבוצות יבוא של מכון התקנים</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 6 }}>
            {Object.entries(GROUP_INFO).map(([g, info]) => (
              <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GroupBadge group={Number(g)} size="sm" />
                <span style={{ color: 'var(--text2)' }}>{info.desc}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, color: 'var(--text3)', fontSize: 11 }}>
            המקור הרשמי:{' '}
            <a href="https://www.sii.org.il/" target="_blank" rel="noopener noreferrer"
               style={{ color: 'var(--blue)' }}>
              מכון התקנים הישראלי
            </a>
            {' '} · הסיווג של ה-AI מהווה הצעה בלבד — אמת מול עמיל המכס שלך.
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
