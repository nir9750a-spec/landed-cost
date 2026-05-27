import React, { useState } from 'react';
import { X, Check, AlertCircle, Ship, Package, FileText } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
//  ExtractPreviewModal — common shell for "AI extracted X from your file,
//  here's what it found, click confirm to save."
//  Three modes based on `kind`: shipment | products | packing
// ─────────────────────────────────────────────────────────────────────────────

function n(v, d = 0) {
  return Number(v || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function ExtractPreviewModal({ kind, payload, fileName, onConfirm, onClose }) {
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(payload);

  async function handleConfirm() {
    setSaving(true);
    try {
      await onConfirm(edited);
    } finally {
      setSaving(false);
    }
  }

  const title =
    kind === 'shipment' ? 'תצוגה מקדימה — מכולה' :
    kind === 'products' ? 'תצוגה מקדימה — מוצרים' :
    'תצוגה מקדימה — Packing List';

  const Icon = kind === 'shipment' ? Ship : kind === 'packing' ? Package : FileText;

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon size={16} style={{ color: 'var(--orange)' }} />
            {title}
          </span>
          <button className="btn btn-sm" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="modal-body">
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            מקור: {fileName}
          </div>

          {kind === 'shipment' && (
            <ShipmentPreview value={edited} onChange={setEdited} />
          )}
          {kind === 'products' && (
            <ProductsPreview value={edited} onChange={setEdited} />
          )}
          {kind === 'packing' && (
            <PackingPreview value={edited} onChange={setEdited} />
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={saving}>ביטול</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
            <Check size={13} /> {saving ? 'שומר...' : 'אישור ושמירה'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shipment preview ────────────────────────────────────────────────────────

function ShipmentPreview({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <>
      <div className="form-grid">
        <Field label="מספר מכולה" value={value.container_number} onChange={v => set('container_number', v.toUpperCase())} dir="ltr" mono />
        <Field label="סוג" value={value.container_type} onChange={v => set('container_type', v)} />
        <Field label="חברת ספנות" value={value.carrier} onChange={v => set('carrier', v)} />
        <Field label="אונייה" value={value.vessel_name} onChange={v => set('vessel_name', v)} dir="ltr" />
        <Field label="Voyage" value={value.voyage} onChange={v => set('voyage', v)} dir="ltr" />
        <Field label="נמל מוצא" value={value.origin_port} onChange={v => set('origin_port', v)} />
        <Field label="נמל יעד" value={value.pod_port} onChange={v => set('pod_port', v)} />
        <Field label="טרמינל" value={value.terminal} onChange={v => set('terminal', v)} />
        <Field label="תאריך יציאה" value={value.departure_date} onChange={v => set('departure_date', v)} type="date" />
        <Field label="ETA" value={value.eta_date} onChange={v => set('eta_date', v)} type="date" />
      </div>

      {Array.isArray(value.events) && value.events.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>
            אירועי מעקב ({value.events.length})
          </div>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text3)' }}>
                <th style={{ textAlign: 'right', padding: 4 }}>תאריך</th>
                <th style={{ textAlign: 'right', padding: 4 }}>מיקום</th>
                <th style={{ textAlign: 'right', padding: 4 }}>תיאור</th>
                <th style={{ textAlign: 'right', padding: 4 }}>אונייה/Voyage</th>
              </tr>
            </thead>
            <tbody>
              {value.events.map((e, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 4 }}>{e.date}</td>
                  <td style={{ padding: 4 }}>{e.location}</td>
                  <td style={{ padding: 4 }}>{e.description}</td>
                  <td style={{ padding: 4, direction: 'ltr', fontFamily: 'monospace', fontSize: 10 }}>{e.vessel_voyage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Products preview ───────────────────────────────────────────────────────

function ProductsPreview({ value, onChange }) {
  const products = value.products || [];
  function update(i, k, v) {
    const next = [...products];
    next[i] = { ...next[i], [k]: v };
    onChange({ ...value, products: next });
  }
  function remove(i) {
    onChange({ ...value, products: products.filter((_, idx) => idx !== i) });
  }
  return (
    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ color: 'var(--text3)' }}>
          <th style={{ textAlign: 'right', padding: 4 }}>שם</th>
          <th style={{ textAlign: 'right', padding: 4 }}>קוד</th>
          <th style={{ textAlign: 'right', padding: 4 }}>כמות</th>
          <th style={{ textAlign: 'right', padding: 4 }}>FOB $</th>
          <th style={{ textAlign: 'right', padding: 4 }}>CBM</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {products.map((p, i) => (
          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: 4 }}><input value={p.name || ''} onChange={e => update(i, 'name', e.target.value)} style={{ width: '100%' }} /></td>
            <td style={{ padding: 4 }}><input value={p.item_no || ''} onChange={e => update(i, 'item_no', e.target.value)} style={{ width: 90 }} /></td>
            <td style={{ padding: 4 }}><input type="number" value={p.qty || 0} onChange={e => update(i, 'qty', Number(e.target.value))} style={{ width: 60 }} /></td>
            <td style={{ padding: 4 }}><input type="number" step="any" value={p.fob_price || 0} onChange={e => update(i, 'fob_price', Number(e.target.value))} style={{ width: 80 }} /></td>
            <td style={{ padding: 4 }}><input type="number" step="any" value={p.cbm || 0} onChange={e => update(i, 'cbm', Number(e.target.value))} style={{ width: 70 }} /></td>
            <td><button className="btn btn-sm btn-danger" onClick={() => remove(i)}><X size={11} /></button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Packing-list preview with product matching ─────────────────────────────

function PackingPreview({ value, onChange }) {
  const items = value.items || [];
  const matches = value.matches || [];

  function setMatch(i, productId) {
    const next = matches.slice();
    next[i] = productId || null;
    onChange({ ...value, matches: next });
  }

  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
        כל שורה מותאמת אוטומטית למוצר קיים לפי שם או קוד. שנה את ההתאמה אם נדרש, או הסר אותה אם הפריט חדש.
      </div>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--text3)' }}>
            <th style={{ textAlign: 'right', padding: 4 }}>שם בקובץ</th>
            <th style={{ textAlign: 'right', padding: 4 }}>קוד</th>
            <th style={{ textAlign: 'right', padding: 4 }}>CBM</th>
            <th style={{ textAlign: 'right', padding: 4 }}>משקל ק"ג</th>
            <th style={{ textAlign: 'right', padding: 4 }}>מידות ס"מ</th>
            <th style={{ textAlign: 'right', padding: 4 }}>התאם למוצר</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: 4 }}>{it.name || '—'}</td>
              <td style={{ padding: 4 }}>{it.item_no || '—'}</td>
              <td style={{ padding: 4 }}>{n(it.cbm, 4)}</td>
              <td style={{ padding: 4 }}>{n(it.gross_weight_kg, 2)}</td>
              <td style={{ padding: 4 }}>
                {it.box_l > 0 ? `${it.box_l}×${it.box_w}×${it.box_h}` : '—'}
              </td>
              <td style={{ padding: 4 }}>
                <select
                  value={matches[i] || ''}
                  onChange={e => setMatch(i, e.target.value)}
                  style={{ width: 200, fontSize: 11 }}
                >
                  <option value="">— ללא התאמה (דלג) —</option>
                  {(value._products || []).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.item_no ? ` (${p.item_no})` : ''}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <div style={{ color: 'var(--text3)', padding: 12, textAlign: 'center' }}>
          <AlertCircle size={16} style={{ marginInlineEnd: 6 }} /> לא נמצאו פריטים במסמך
        </div>
      )}
    </>
  );
}

// ── Tiny field helper ───────────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', dir, mono }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        dir={dir}
        style={mono ? { fontFamily: 'monospace', letterSpacing: 1 } : undefined}
      />
    </div>
  );
}
