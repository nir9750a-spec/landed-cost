// Finance module — actual costs, payables, and revenue.
//
// Talks to the `expenses`, `parties`, and `sales_invoices` tables
// (migration 20260711_finance.sql) and derives the estimate-vs-actual view by
// mapping the landed-cost engine totals (calculations.js) onto expense
// categories. All amounts are normalized to ILS for comparison.

import { supabase } from './supabase';

// ── Expense categories (aligned with the engine's cost components) ───────────
export const EXPENSE_CATEGORIES = [
  { key: 'goods',           label: 'סחורה (FOB)',      icon: '📦' },
  { key: 'freight',         label: 'שילוח בינ"ל',      icon: '🚢' },
  { key: 'insurance',       label: 'ביטוח',            icon: '🛡️' },
  { key: 'customs',         label: 'מכס',              icon: '🏛️' },
  { key: 'purchase_tax',    label: 'מס קנייה',         icon: '🧾' },
  { key: 'vat',             label: 'מע"מ',             icon: '💰' },
  { key: 'broker',          label: 'עמילות מכס',       icon: '📋' },
  { key: 'port',            label: 'אגרות נמל',        icon: '⚓' },
  { key: 'local_transport', label: 'הובלה מקומית',     icon: '🚚' },
  { key: 'other',           label: 'אחר',              icon: '•' },
];

export const CATEGORY_LABEL = Object.fromEntries(
  EXPENSE_CATEGORIES.map(c => [c.key, c.label])
);

export const STATUS_LABEL = { open: 'פתוח', partial: 'חלקי', paid: 'שולם' };

// Normalize an expense amount to ILS. Uses the row's own usd_rate when the
// expense is in USD; falls back to the passed default rate.
export function expenseToIls(exp, defaultRate = 3.7) {
  if (exp.amount_ils != null && exp.amount_ils !== '') return Number(exp.amount_ils);
  const amount = Number(exp.amount) || 0;
  const cur = (exp.currency || 'ILS').toUpperCase();
  if (cur === 'ILS') return amount;
  const rate = Number(exp.usd_rate) || Number(defaultRate) || 3.7;
  return amount * rate; // USD/EUR treated with the provided rate (v1 simplification)
}

// ── Map engine totals → per-category estimate in ILS ─────────────────────────
// `totals` comes from calcTotals(); mixed USD/ILS. We convert USD components to
// ILS with the project's usd_rate so the comparison is apples-to-apples.
export function estimateByCategory(totals = {}, usdRate = 3.7) {
  const r = Number(usdRate) || 3.7;
  return {
    goods:           (Number(totals.fobTotal)       || 0) * r,
    freight:         (Number(totals.freightTotal)   || 0) * r,
    insurance:       (Number(totals.insuranceTotal) || 0) * r,
    customs:          Number(totals.customsIlsTotal)     || 0,
    purchase_tax:     Number(totals.purchaseTaxIlsTotal) || 0,
    vat:              Number(totals.vatIlsTotal)         || 0,
    broker:           Number(totals.agentIlsTotal)       || 0,
    port:             Number(totals.portIlsTotal)        || 0,
    local_transport:  Number(totals.transportIlsTotal)   || 0,
    other:            Number(totals.chinaIlsTotal)       || 0,
  };
}

export function sumEstimate(est) {
  return Object.values(est).reduce((a, b) => a + (Number(b) || 0), 0);
}

// ── Parties ──────────────────────────────────────────────────────────────────
export async function loadParties() {
  const { data, error } = await supabase
    .from('parties').select('*').order('name', { ascending: true });
  if (error) return [];
  return data || [];
}

export async function addParty(party) {
  const { data, error } = await supabase
    .from('parties').insert([party]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Expenses ─────────────────────────────────────────────────────────────────
export async function loadExpenses(projectId) {
  let q = supabase.from('expenses').select('*').order('created_at', { ascending: false });
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

export async function addExpense(expense) {
  const { data, error } = await supabase
    .from('expenses').insert([expense]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateExpense(id, patch) {
  const { data, error } = await supabase
    .from('expenses').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}

// ── Sales invoices ───────────────────────────────────────────────────────────
export async function loadSalesInvoices(projectId) {
  let q = supabase.from('sales_invoices').select('*').order('created_at', { ascending: false });
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

// ── Aggregate helpers ────────────────────────────────────────────────────────
export function actualByCategory(expenses, defaultRate = 3.7) {
  const acc = {};
  for (const e of expenses) {
    const k = e.category || 'other';
    acc[k] = (acc[k] || 0) + expenseToIls(e, defaultRate);
  }
  return acc;
}

export function financeSummary(expenses, invoices, defaultRate = 3.7) {
  const actualTotal = expenses.reduce((a, e) => a + expenseToIls(e, defaultRate), 0);
  const openTotal = expenses
    .filter(e => e.status !== 'paid')
    .reduce((a, e) => a + expenseToIls(e, defaultRate), 0);
  const revenueTotal = invoices
    .filter(i => i.status !== 'draft')
    .reduce((a, i) => a + (Number(i.total) || 0), 0);
  return { actualTotal, openTotal, revenueTotal };
}
