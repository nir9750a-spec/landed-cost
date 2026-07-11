import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Wallet, Plus, Trash2, Check, X, AlertTriangle, Building2 } from 'lucide-react';
import { calcProducts, calcTotals, fmt } from '../lib/calculations';
import {
  EXPENSE_CATEGORIES, CATEGORY_LABEL, STATUS_LABEL,
  estimateByCategory, sumEstimate, actualByCategory,
  loadExpenses, addExpense, updateExpense, deleteExpense,
  loadSalesInvoices, financeSummary, expenseToIls,
} from '../lib/finance';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'CNY'];

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL');
}

// Diff badge: actual vs estimate. Over-estimate is red, under is green.
function DiffBadge({ estimate, actual }) {
  if (!estimate && !actual) return <span style={{ color: 'var(--text3)' }}>—</span>;
  const diff = actual - estimate;
  const pct = estimate > 0 ? (diff / estimate) * 100 : (actual > 0 ? 100 : 0);
  const over = diff > 0.5;
  const under = diff < -0.5;
  const color = over ? 'var(--red)' : under ? 'var(--green)' : 'var(--text3)';
  const sign = diff > 0 ? '+' : '';
  return (
    <span style={{ color, fontWeight: 600, fontSize: 12 }}>
      {sign}{fmt.ils(diff)} ({sign}{pct.toFixed(0)}%)
    </span>
  );
}

export default function FinancePage({ activeProject, products, settings, calcCtx, showToast }) {
  const [expenses, setExpenses] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [showAdd, setShowAdd]   = useState(false);

  const projectId = activeProject?.id || null;
  const usdRate = Number(settings?.usd_rate) || 3.7;

  // Engine estimate for the active project.
  const totals = useMemo(() => {
    try {
      return calcTotals(calcProducts(products || [], settings, calcCtx || {}));
    } catch {
      return {};
    }
  }, [products, settings, calcCtx]);

  const estimate = useMemo(() => estimateByCategory(totals, usdRate), [totals, usdRate]);
  const estimateTotal = sumEstimate(estimate);

  const refresh = useCallback(async () => {
    if (!projectId) { setExpenses([]); setInvoices([]); return; }
    setLoading(true);
    const [ex, inv] = await Promise.all([
      loadExpenses(projectId),
      loadSalesInvoices(projectId),
    ]);
    setExpenses(ex);
    setInvoices(inv);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const actual = useMemo(() => actualByCategory(expenses, usdRate), [expenses, usdRate]);
  const summary = useMemo(() => financeSummary(expenses, invoices, usdRate), [expenses, invoices, usdRate]);
  const profit = summary.revenueTotal - summary.actualTotal;

  async function handleAdd(row) {
    try {
      const created = await addExpense({ ...row, project_id: projectId });
      setExpenses(prev => [created, ...prev]);
      setShowAdd(false);
      showToast?.('הוצאה נוספה');
    } catch (e) {
      showToast?.('שגיאה: ' + e.message, 'error');
    }
  }

  async function togglePaid(exp) {
    const paid = exp.status === 'paid';
    try {
      const updated = await updateExpense(exp.id, {
        status: paid ? 'open' : 'paid',
        paid_at: paid ? null : new Date().toISOString().split('T')[0],
      });
      setExpenses(prev => prev.map(e => e.id === exp.id ? updated : e));
    } catch (e) {
      showToast?.('שגיאה: ' + e.message, 'error');
    }
  }

  async function handleDelete(id) {
    try {
      await deleteExpense(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
      showToast?.('הוצאה נמחקה');
    } catch (e) {
      showToast?.('שגיאה: ' + e.message, 'error');
    }
  }

  if (!activeProject) {
    return (
      <>
        <div className="page-header"><h1 className="page-title">כספים</h1></div>
        <div className="page-body">
          <div className="card" style={{ textAlign: 'center', color: 'var(--text2)', padding: 40 }}>
            בחר פרויקט פעיל כדי לנהל את הכספים שלו (הוצאות בפועל, תשלומים והכנסות).
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wallet size={20} style={{ color: 'var(--gold)' }} />
          כספים <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}>· {activeProject.name}</span>
        </h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> הוסף הוצאה
        </button>
      </div>

      <div className="page-body">
        {/* Summary cards */}
        <div className="cards-grid" style={{ marginBottom: 18 }}>
          <SummaryCard label="עלות נחיתה מוערכת" value={fmt.ils(estimateTotal)} sub="מהמנוע" />
          <SummaryCard label="הוצאות בפועל" value={fmt.ils(summary.actualTotal)}
            sub={<DiffBadge estimate={estimateTotal} actual={summary.actualTotal} />} />
          <SummaryCard label="פתוח לתשלום" value={fmt.ils(summary.openTotal)} color="orange"
            sub={summary.openTotal > 0 ? 'ממתין' : 'הכל שולם'} />
          <SummaryCard label="רווח בפועל" value={fmt.ils(profit)} color={profit >= 0 ? 'green' : undefined}
            sub={`הכנסות ${fmt.ils(summary.revenueTotal)}`} />
        </div>

        {/* Estimate vs actual by category */}
        <div className="card" style={{ marginBottom: 18, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
            הערכה מול בפועל — לפי קטגוריה
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text2)', textAlign: 'right' }}>
                  <th style={{ padding: '8px 16px' }}>קטגוריה</th>
                  <th style={{ padding: '8px 16px' }}>הערכה</th>
                  <th style={{ padding: '8px 16px' }}>בפועל</th>
                  <th style={{ padding: '8px 16px' }}>פער</th>
                </tr>
              </thead>
              <tbody>
                {EXPENSE_CATEGORIES.map(c => {
                  const est = estimate[c.key] || 0;
                  const act = actual[c.key] || 0;
                  if (est === 0 && act === 0) return null;
                  return (
                    <tr key={c.key} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 16px' }}>{c.icon} {c.label}</td>
                      <td style={{ padding: '8px 16px', color: 'var(--text2)' }}>{fmt.ils(est)}</td>
                      <td style={{ padding: '8px 16px', fontWeight: 600 }}>{act ? fmt.ils(act) : '—'}</td>
                      <td style={{ padding: '8px 16px' }}><DiffBadge estimate={est} actual={act} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expenses list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
            הוצאות ({expenses.length})
          </div>
          {loading && <div style={{ padding: 20, textAlign: 'center' }}><span className="spinner" /></div>}
          {!loading && expenses.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)' }}>
              עדיין אין הוצאות רשומות. לחץ "הוסף הוצאה" כדי להתחיל לעקוב אחר העלויות בפועל.
            </div>
          )}
          {!loading && expenses.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text2)', textAlign: 'right' }}>
                    <th style={{ padding: '8px 16px' }}>קטגוריה</th>
                    <th style={{ padding: '8px 16px' }}>תיאור</th>
                    <th style={{ padding: '8px 16px' }}>סכום</th>
                    <th style={{ padding: '8px 16px' }}>לתשלום עד</th>
                    <th style={{ padding: '8px 16px' }}>סטטוס</th>
                    <th style={{ padding: '8px 16px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 16px' }}>{CATEGORY_LABEL[e.category] || e.category}</td>
                      <td style={{ padding: '8px 16px', color: 'var(--text2)' }}>{e.description || '—'}</td>
                      <td style={{ padding: '8px 16px', fontWeight: 600 }}>
                        {Number(e.amount).toLocaleString('he-IL')} {e.currency}
                        {e.currency !== 'ILS' && (
                          <span style={{ color: 'var(--text3)', fontSize: 11, marginRight: 4 }}>
                            (≈{fmt.ils(expenseToIls(e, usdRate))})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 16px', color: 'var(--text2)' }}>{fmtDate(e.due_date)}</td>
                      <td style={{ padding: '8px 16px' }}>
                        <button
                          onClick={() => togglePaid(e)}
                          className={`btn btn-sm ${e.status === 'paid' ? 'btn-success' : 'btn-ghost'}`}
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          title="סמן כשולם / פתוח"
                        >
                          {e.status === 'paid' ? <Check size={11} /> : null}
                          {STATUS_LABEL[e.status] || e.status}
                        </button>
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'left' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(e.id)} title="מחק">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>
          <AlertTriangle size={12} style={{ verticalAlign: -1 }} /> מע"מ תשומות מקוזז ליבואן מורשה —
          ברווחיות התייחס לעלות ללא מע"מ. הפקת חשבוניות ישירות לפינבוט תתווסף בשלב הבא.
        </p>
      </div>

      {showAdd && (
        <AddExpenseModal
          usdRate={usdRate}
          onClose={() => setShowAdd(false)}
          onSave={handleAdd}
        />
      )}
    </>
  );
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value ${color || ''}`}>{value}</div>
      {sub != null && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AddExpenseModal({ usdRate, onClose, onSave }) {
  const [form, setForm] = useState({
    category: 'goods', description: '', amount: '', currency: 'ILS',
    usd_rate: usdRate, due_date: '', status: 'open',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    const row = {
      category: form.category,
      description: form.description || null,
      amount,
      currency: form.currency,
      usd_rate: form.currency === 'ILS' ? null : (Number(form.usd_rate) || usdRate),
      due_date: form.due_date || null,
      status: form.status,
    };
    await onSave(row);
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div className="card" style={{ width: 'min(460px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
            <Building2 size={17} /> הוצאה חדשה
          </h3>
          <button className="btn btn-sm btn-ghost" onClick={onClose}><X size={15} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="קטגוריה">
            <select value={form.category} onChange={e => set('category', e.target.value)} style={{ width: '100%' }}>
              {EXPENSE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="תיאור (אופציונלי)">
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="למשל: חשבונית ספק / עמיל מכס" style={{ width: '100%' }} />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="סכום" style={{ flex: 2 }}>
              <input type="number" min="0" step="any" value={form.amount}
                onChange={e => set('amount', e.target.value)} style={{ width: '100%' }} autoFocus />
            </Field>
            <Field label="מטבע" style={{ flex: 1 }}>
              <select value={form.currency} onChange={e => set('currency', e.target.value)} style={{ width: '100%' }}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          {form.currency !== 'ILS' && (
            <Field label={`שער ל-${form.currency} (₪)`}>
              <input type="number" min="0" step="any" value={form.usd_rate}
                onChange={e => set('usd_rate', e.target.value)} style={{ width: '100%' }} />
            </Field>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="לתשלום עד" style={{ flex: 1 }}>
              <input type="date" value={form.due_date}
                onChange={e => set('due_date', e.target.value)} style={{ width: '100%' }} />
            </Field>
            <Field label="סטטוס" style={{ flex: 1 }}>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={{ width: '100%' }}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !(Number(form.amount) > 0)}>
            {saving ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Check size={14} />}
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <label style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}
