import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ShieldCheck, Sparkles, Check, AlertTriangle, FolderOpen } from 'lucide-react';
import { classifyAllBatch, saveSiiClassification } from '../lib/siiClassify';
import { supabase } from '../lib/supabase';

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
  const [bulkRunning, setBulkRunning]   = useState(false);
  const [autoProgress, setAutoProgress] = useState({ done: 0, total: 0 });
  const [manualEdit, setManualEdit]     = useState({}); // { productId: { group, sii_required } }
  const [sortBy, setSortBy]             = useState('hs_code'); // 'hs_code' | 'name' | 'original'
  const autoRunRef = useRef({}); // per-project flag so we only auto-run once per visit
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Sort + group products by HS code. Same HS lands together so the user
  // can spot duplicates / re-orders at a glance.
  const sortedProducts = useMemo(() => {
    const arr = [...products];
    if (sortBy === 'hs_code') {
      arr.sort((a, b) => {
        const ah = (a.hs_code || '').trim();
        const bh = (b.hs_code || '').trim();
        if (!ah && !bh) return (a.name || '').localeCompare(b.name || '', 'he');
        if (!ah) return 1;  // unclassified at the bottom
        if (!bh) return -1;
        if (ah !== bh) return ah.localeCompare(bh);
        return (a.name || '').localeCompare(b.name || '', 'he');
      });
    } else if (sortBy === 'name') {
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
    }
    return arr;
  }, [products, sortBy]);

  // Group lookup so we can show "X products share this HS" + duplicate flag
  const hsGroupSize = useMemo(() => {
    const counts = {};
    for (const p of products) {
      const h = (p.hs_code || '').trim();
      if (h) counts[h] = (counts[h] || 0) + 1;
    }
    return counts;
  }, [products]);

  // Summary stats — fully classified means BOTH hs_code and import_group are set
  const summary = useMemo(() => {
    const total = products.length;
    const classified = products.filter(p => p.hs_code && p.import_group != null).length;
    const requiresTest = products.filter(p => p.sii_required === true).length;
    const byGroup = { 1: 0, 2: 0, 3: 0, 4: 0, '?': 0 };
    products.forEach(p => {
      const g = p.import_group;
      if (g && byGroup[g] !== undefined) byGroup[g]++;
      else byGroup['?']++;
    });
    return { total, classified, requiresTest, byGroup };
  }, [products]);

  // A product needs classification if HS or import_group is missing.
  function productsNeedingClassification(list) {
    return list.filter(p => !p.hs_code || p.import_group == null);
  }

  async function runBulkClassify({ silent = false } = {}) {
    const needs = productsNeedingClassification(products);
    if (needs.length === 0) {
      if (!silent) showToast('הכול כבר מסווג');
      return;
    }

    setBulkRunning(true);
    setAutoProgress({ done: 0, total: needs.length });
    try {
      const results = await classifyAllBatch(needs.map(p => ({
        id: p.id, name: p.name, notes: p.notes || '',
      })));
      if (!mountedRef.current) return;
      let success = 0;
      for (const r of results) {
        if (!mountedRef.current) return;
        const p = products.find(x => x.id === r.id);
        if (!p) continue;

        const updates = {};
        // Only fill HS/customs if missing — don't overwrite agent overrides.
        if (!p.hs_code && r.hs_code) {
          updates.hs_code = r.hs_code;
        }
        if ((p.customs_rate_override == null || p.customs_rate_override === '') && r.customs_rate != null) {
          updates.customs_rate_override = r.customs_rate;
        }
        if (p.import_group == null && r.import_group != null) {
          updates.import_group = r.import_group;
          updates.sii_required = r.sii_required;
          updates.sii_notes    = r.reasoning;
          updates.sii_source   = 'ai';
        }
        if (Object.keys(updates).length === 0) continue;

        try {
          const { error } = await supabase.from('products').update(updates).eq('id', r.id);
          if (error) throw error;
          if (!mountedRef.current) return;
          updateProduct(r.id, updates);
          success++;
          setAutoProgress({ done: success, total: needs.length });
        } catch {}
      }
      if (!mountedRef.current) return;
      if (!silent || success !== needs.length) {
        showToast(`סווגו ${success}/${needs.length} מוצרים`);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      showToast('שגיאה בסיווג: ' + err.message, 'error');
    } finally {
      if (mountedRef.current) {
        setBulkRunning(false);
        setAutoProgress({ done: 0, total: 0 });
      }
    }
  }

  // Auto-classify on mount when there are unclassified products.
  // Runs once per project visit — agent can re-trigger manually via the button.
  useEffect(() => {
    if (!activeProject) return;
    const key = activeProject.id;
    const needs = productsNeedingClassification(products);
    if (needs.length === 0) return;
    if (autoRunRef.current[key]) return;
    if (bulkRunning) return;
    autoRunRef.current[key] = true;
    runBulkClassify({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, products.length]);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text3)' }}>מיון:</span>
            <button
              className={`btn btn-sm${sortBy === 'hs_code' ? ' btn-primary' : ''}`}
              onClick={() => setSortBy('hs_code')}
              title="קבץ מוצרים עם אותו קוד HS"
            >
              לפי HS
            </button>
            <button
              className={`btn btn-sm${sortBy === 'name' ? ' btn-primary' : ''}`}
              onClick={() => setSortBy('name')}
            >
              לפי שם
            </button>
            <button
              className={`btn btn-sm${sortBy === 'original' ? ' btn-primary' : ''}`}
              onClick={() => setSortBy('original')}
              title="סדר הזנה מקורי"
            >
              סדר חשבונית
            </button>
          </div>
          <button
            className="btn"
            onClick={() => runBulkClassify()}
            disabled={bulkRunning || summary.total === summary.classified}
            title="לסווג שוב את כל מה שלא מסווג"
          >
            {bulkRunning ? <span className="spinner" /> : <Sparkles size={15} />}
            {bulkRunning
              ? `מסווג ${autoProgress.done}/${autoProgress.total}...`
              : summary.total === summary.classified
                ? 'הכל מסווג ✓'
                : `סווג ${summary.total - summary.classified} נותרים`}
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
              {sortedProducts.map((p, idx) => {
                const customsRate = p.customs_rate_override ?? p.customs_rate ?? settings?.customs ?? 0;
                const edit = manualEdit[p.id];
                // When sorted by HS code, draw a thick top-border at the start
                // of each HS group so the user can scan groupings visually.
                const prev = idx > 0 ? sortedProducts[idx - 1] : null;
                const isGroupStart = sortBy === 'hs_code' && (!prev || (prev.hs_code || '') !== (p.hs_code || ''));
                const groupCount = p.hs_code ? hsGroupSize[p.hs_code.trim()] || 0 : 0;
                return (
                  <tr
                    key={p.id}
                    style={isGroupStart ? { borderTop: '2px solid var(--violet)' } : undefined}
                  >
                    <td className="td-muted" style={{ textAlign: 'center', fontSize: 11 }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td className="td-muted font-mono">{p.item_no || '—'}</td>
                    <td className="td-num">{n(p.qty)}</td>
                    <td className="font-mono">
                      {p.hs_code
                        ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {p.hs_code}
                            {groupCount > 1 && (
                              <span style={{
                                background: 'rgba(139,92,246,0.2)', color: 'var(--violet)',
                                padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                              }} title={`${groupCount} מוצרים חולקים את אותו קוד HS`}>
                                ×{groupCount}
                              </span>
                            )}
                          </span>
                        )
                        : <span className="td-muted">— לא סווג</span>}
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
                            title="שמור החלטה ידנית"
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
                        <button
                          className="btn btn-sm"
                          onClick={() => setManualEdit(prev => ({
                            ...prev,
                            [p.id]: { group: p.import_group || '', sii_required: p.sii_required },
                          }))}
                          title="עמיל המכס: דרוס סיווג"
                          disabled={bulkRunning}
                        >
                          ערוך
                        </button>
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
            הסיווג של ה-AI מהווה הצעה בלבד — עמיל המכס בודק ומחליט סופית לפי החוק.
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
