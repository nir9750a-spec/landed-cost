import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Package, Plus, Trash2, Check, X, AlertTriangle, ArrowDownToLine, Boxes } from 'lucide-react';
import { calcProducts, fmt } from '../lib/calculations';
import {
  MOVE_KINDS,
  loadItems, addItem, deleteItem,
  loadMoves, addMove, itemStats, inventoryTotals, findOrCreateItem,
} from '../lib/inventory';

export default function InventoryPage({ activeProject, products, settings, calcCtx, showToast }) {
  const [items, setItems]   = useState([]);
  const [moves, setMoves]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal]   = useState(null); // 'add' | {type:'move', item}

  const refresh = useCallback(async () => {
    setLoading(true);
    const [it, mv] = await Promise.all([loadItems(), loadMoves()]);
    setItems(it);
    setMoves(mv);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const totals = useMemo(() => inventoryTotals(items, moves), [items, moves]);

  // Active project's per-unit landed cost, for the "receive from project" action.
  const projectLanded = useMemo(() => {
    if (!activeProject) return [];
    try {
      return calcProducts(products || [], settings, calcCtx || {})
        .map(p => ({ name: p.name, sku: p.item_no || null, qty: Number(p.qty) || 0, cost: Number(p._costPerUnit) || 0 }))
        .filter(p => p.qty > 0);
    } catch { return []; }
  }, [activeProject, products, settings, calcCtx]);

  async function handleAddItem(row) {
    try {
      const created = await addItem(row);
      setItems(prev => [...prev, created].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he')));
      setModal(null);
      showToast?.('פריט נוסף');
    } catch (e) { showToast?.('שגיאה: ' + e.message, 'error'); }
  }

  async function handleAddMove(item, row) {
    try {
      const kind = MOVE_KINDS.find(k => k.key === row.kind);
      const signedQty = Math.abs(Number(row.qty) || 0) * (kind?.sign || 1);
      const created = await addMove({
        item_id: item.id,
        kind: row.kind,
        qty: signedQty,
        unit_landed_cost: row.kind === 'inbound' && row.unit_landed_cost !== ''
          ? Number(row.unit_landed_cost) : null,
        ref: row.ref || null,
        project_id: activeProject?.id || null,
      });
      setMoves(prev => [created, ...prev]);
      setModal(null);
      showToast?.('תנועת מלאי נרשמה');
    } catch (e) { showToast?.('שגיאה: ' + e.message, 'error'); }
  }

  async function handleDeleteItem(id) {
    try {
      await deleteItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
      setMoves(prev => prev.filter(m => m.item_id !== id));
      showToast?.('פריט נמחק');
    } catch (e) { showToast?.('שגיאה: ' + e.message, 'error'); }
  }

  // Receive the whole active project into stock at its landed cost.
  async function receiveFromProject() {
    if (!projectLanded.length) { showToast?.('אין מוצרים עם כמות בפרויקט', 'error'); return; }
    setLoading(true);
    let current = [...items];
    const newItems = [];
    const newMoves = [];
    try {
      for (const p of projectLanded) {
        const { item, created } = await findOrCreateItem(current, { name: p.name, sku: p.sku });
        if (created) { current.push(item); newItems.push(item); }
        const mv = await addMove({
          item_id: item.id, kind: 'inbound', qty: p.qty,
          unit_landed_cost: p.cost, ref: `קליטה מפרויקט: ${activeProject.name}`,
          project_id: activeProject.id,
        });
        newMoves.push(mv);
      }
      setItems(prev => {
        const merged = [...prev];
        newItems.forEach(i => { if (!merged.find(x => x.id === i.id)) merged.push(i); });
        return merged.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
      });
      setMoves(prev => [...newMoves, ...prev]);
      showToast?.(`נקלטו ${projectLanded.length} פריטים מהפרויקט לפי עלות נחיתה`);
    } catch (e) {
      showToast?.('שגיאה בקליטה: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Boxes size={20} style={{ color: 'var(--blue)' }} /> מלאי
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {activeProject && projectLanded.length > 0 && (
            <button className="btn btn-sm" onClick={receiveFromProject} disabled={loading}
              title="צור פריטים ותנועות כניסה מהפרויקט הפעיל לפי עלות נחיתה">
              <ArrowDownToLine size={14} /> קלוט מ"{activeProject.name}"
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setModal('add')}>
            <Plus size={14} /> פריט חדש
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="cards-grid" style={{ marginBottom: 18 }}>
          <Card label="פריטים" value={totals.itemCount} />
          <Card label="יחידות במלאי" value={fmt.num(totals.totalUnits)} />
          <Card label="שווי מלאי (עלות נחיתה)" value={fmt.ils(totals.totalValue)} color="green" />
          <Card label="מתחת לנקודת הזמנה" value={totals.lowCount}
            color={totals.lowCount > 0 ? 'orange' : undefined} />
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center' }}><span className="spinner" /></div>}
          {!loading && items.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--text2)' }}>
              אין עדיין פריטים במלאי. הוסף פריט ידנית, או לחץ "קלוט מפרויקט" כדי ליצור
              מלאי אוטומטית לפי עלות הנחיתה של הפרויקט הפעיל.
            </div>
          )}
          {!loading && items.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text2)', textAlign: 'right' }}>
                    <th style={{ padding: '8px 16px' }}>פריט</th>
                    <th style={{ padding: '8px 16px' }}>במלאי</th>
                    <th style={{ padding: '8px 16px' }}>עלות נחיתה ממוצעת</th>
                    <th style={{ padding: '8px 16px' }}>שווי</th>
                    <th style={{ padding: '8px 16px' }}>נק' הזמנה</th>
                    <th style={{ padding: '8px 16px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const s = itemStats(it, moves);
                    return (
                      <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 16px' }}>
                          <div style={{ fontWeight: 600 }}>{it.name}</div>
                          {it.sku && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{it.sku}</div>}
                        </td>
                        <td style={{ padding: '8px 16px', fontWeight: 700 }}>
                          {fmt.num(s.onHand)}
                          {s.low && (
                            <span style={{ marginRight: 6, padding: '1px 6px', borderRadius: 4,
                              background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 10, fontWeight: 700 }}>
                              <AlertTriangle size={9} style={{ verticalAlign: -1 }} /> נמוך
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 16px' }}>{s.avgCost ? fmt.ils(s.avgCost) : '—'}</td>
                        <td style={{ padding: '8px 16px', fontWeight: 600 }}>{s.value ? fmt.ils(s.value) : '—'}</td>
                        <td style={{ padding: '8px 16px', color: 'var(--text2)' }}>{s.reorder || '—'}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={() => setModal({ type: 'move', item: it })}>תנועה</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => handleDeleteItem(it.id)} title="מחק">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>
          <Package size={12} style={{ verticalAlign: -1 }} /> שווי המלאי מחושב לפי עלות נחיתה ממוצעת
          משוקללת (לא FOB) — כך שהתמחור והרווח מבוססים על העלות האמיתית.
        </p>
      </div>

      {modal === 'add' && (
        <AddItemModal onClose={() => setModal(null)} onSave={handleAddItem} />
      )}
      {modal?.type === 'move' && (
        <AddMoveModal item={modal.item} onClose={() => setModal(null)}
          onSave={row => handleAddMove(modal.item, row)} />
      )}
    </>
  );
}

function Card({ label, value, color }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value ${color || ''}`}>{value}</div>
    </div>
  );
}

function AddItemModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', sku: '', reorder_point: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave({
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      reorder_point: Number(form.reorder_point) || 0,
    });
    setSaving(false);
  }

  return (
    <Modal title="פריט מלאי חדש" onClose={onClose}>
      <Field label="שם הפריט">
        <input value={form.name} onChange={e => set('name', e.target.value)} style={{ width: '100%' }} autoFocus />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="מק״ט (אופציונלי)" style={{ flex: 1 }}>
          <input value={form.sku} onChange={e => set('sku', e.target.value)} style={{ width: '100%' }} />
        </Field>
        <Field label="נקודת הזמנה" style={{ flex: 1 }}>
          <input type="number" min="0" value={form.reorder_point}
            onChange={e => set('reorder_point', e.target.value)} style={{ width: '100%' }} />
        </Field>
      </div>
      <ModalActions onClose={onClose} onSave={submit} saving={saving} disabled={!form.name.trim()} />
    </Modal>
  );
}

function AddMoveModal({ item, onClose, onSave }) {
  const [form, setForm] = useState({ kind: 'inbound', qty: '', unit_landed_cost: '', ref: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!(Number(form.qty) > 0)) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <Modal title={`תנועת מלאי — ${item.name}`} onClose={onClose}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="סוג" style={{ flex: 1 }}>
          <select value={form.kind} onChange={e => set('kind', e.target.value)} style={{ width: '100%' }}>
            {MOVE_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="כמות" style={{ flex: 1 }}>
          <input type="number" min="0" step="any" value={form.qty}
            onChange={e => set('qty', e.target.value)} style={{ width: '100%' }} autoFocus />
        </Field>
      </div>
      {form.kind === 'inbound' && (
        <Field label="עלות נחיתה ליחידה (₪)">
          <input type="number" min="0" step="any" value={form.unit_landed_cost}
            onChange={e => set('unit_landed_cost', e.target.value)} style={{ width: '100%' }}
            placeholder="למשל מתוך פירוט העלויות" />
        </Field>
      )}
      <Field label="אסמכתא (אופציונלי)">
        <input value={form.ref} onChange={e => set('ref', e.target.value)}
          placeholder="מס' משלוח / חשבונית / הערה" style={{ width: '100%' }} />
      </Field>
      <ModalActions onClose={onClose} onSave={submit} saving={saving} disabled={!(Number(form.qty) > 0)} />
    </Modal>
  );
}

// ── Small shared modal primitives ────────────────────────────────────────────
function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="card" style={{ width: 'min(440px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
            <Package size={17} /> {title}
          </h3>
          <button className="btn btn-sm btn-ghost" onClick={onClose}><X size={15} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSave, saving, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
      <button className="btn" onClick={onClose}>ביטול</button>
      <button className="btn btn-primary" onClick={onSave} disabled={saving || disabled}>
        {saving ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Check size={14} />} שמור
      </button>
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
