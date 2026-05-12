import React, { useState } from 'react';
import { X, Sparkles, ExternalLink } from 'lucide-react';
import { classifyHsCode } from '../lib/hsClassify';

const EMPTY = {
  name: '', item_no: '', qty: '', fob_price: '', cbm: '', supplier: '', notes: '',
  hs_code: '', customs_rate_override: '',
  gross_weight_kg: '', box_l: '', box_w: '', box_h: '',
  purchase_tax_rate_override: '',
};

export default function ProductForm({ product, onSave, onClose, settings }) {
  const [form, setForm] = useState(product ? {
    name:                       product.name                       || '',
    item_no:                    product.item_no                    || '',
    qty:                        product.qty                        ?? '',
    fob_price:                  product.fob_price                  ?? '',
    cbm:                        product.cbm                        ?? '',
    supplier:                   product.supplier                   || '',
    notes:                      product.notes                      || '',
    hs_code:                    product.hs_code                    || '',
    customs_rate_override:      product.customs_rate_override      ?? '',
    gross_weight_kg:            product.gross_weight_kg            ?? '',
    box_l:                      product.box_l                      ?? '',
    box_w:                      product.box_w                      ?? '',
    box_h:                      product.box_h                      ?? '',
    purchase_tax_rate_override: product.purchase_tax_rate_override ?? '',
  } : EMPTY);

  const [saving, setSaving]           = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState(null);
  const [classifyError, setClassifyError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleClassify() {
    if (!form.name.trim()) return;
    setClassifying(true);
    setClassifyResult(null);
    setClassifyError('');
    try {
      const result = await classifyHsCode(form.name, form.notes, settings?.api_key);
      setClassifyResult(result);
    } catch (err) {
      setClassifyError(err.message);
    } finally {
      setClassifying(false);
    }
  }

  function applyClassify() {
    set('hs_code', classifyResult.hs_code);
    set('customs_rate_override', String(classifyResult.customs_rate));
    setClassifyResult(null);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave({
      name:      form.name.trim(),
      item_no:   form.item_no.trim(),
      qty:       Number(form.qty)       || 0,
      fob_price: Number(form.fob_price) || 0,
      cbm:       Number(form.cbm)       || 0,
      supplier:  form.supplier.trim(),
      notes:     form.notes.trim(),
      hs_code:   form.hs_code.trim() || null,
      customs_rate_override:      form.customs_rate_override      !== '' ? Number(form.customs_rate_override)      : null,
      gross_weight_kg:            form.gross_weight_kg            !== '' ? Number(form.gross_weight_kg)            : 0,
      box_l:                      form.box_l                      !== '' ? Number(form.box_l)                      : 0,
      box_w:                      form.box_w                      !== '' ? Number(form.box_w)                      : 0,
      box_h:                      form.box_h                      !== '' ? Number(form.box_h)                      : 0,
      purchase_tax_rate_override: form.purchase_tax_rate_override !== '' ? Number(form.purchase_tax_rate_override) : null,
    });
    setSaving(false);
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{product ? 'עריכת מוצר' : 'הוספת מוצר'}</span>
          <button className="btn btn-sm" onClick={onClose}><X size={15} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-grid">

              <div className="form-group">
                <label>שם מוצר *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="שם המוצר" />
              </div>
              <div className="form-group">
                <label>מק"ט / SKU</label>
                <input value={form.item_no} onChange={e => set('item_no', e.target.value)} placeholder="קוד מוצר" />
              </div>
              <div className="form-group">
                <label>ספק</label>
                <input value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="שם הספק" />
              </div>
              <div className="form-group">
                <label>כמות (יח')</label>
                <input type="number" value={form.qty} onChange={e => set('qty', e.target.value)} placeholder="0" min="0" step="1" />
              </div>
              <div className="form-group">
                <label>מחיר FOB ליח' ($)</label>
                <input type="number" value={form.fob_price} onChange={e => set('fob_price', e.target.value)} placeholder="0.00" min="0" step="0.01" />
              </div>
              <div className="form-group">
                <label>CBM ליח'</label>
                <input type="number" value={form.cbm} onChange={e => set('cbm', e.target.value)} placeholder="0.0000" min="0" step="0.0001" />
              </div>
              <div className="form-group">
                <label>משקל ברוטו ק"ג ליח'</label>
                <input type="number" value={form.gross_weight_kg} onChange={e => set('gross_weight_kg', e.target.value)} placeholder="0.00" min="0" step="0.01" />
              </div>

              {/* Box dimensions for air volumetric */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label style={{ marginBottom: 8, display: 'block' }}>מידות ארגז ס"מ (ל × ר × ג) — לחישוב משקל נפחי אוויר</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <input type="number" value={form.box_l} onChange={e => set('box_l', e.target.value)} placeholder="אורך" min="0" step="0.1" />
                  <input type="number" value={form.box_w} onChange={e => set('box_w', e.target.value)} placeholder="רוחב" min="0" step="0.1" />
                  <input type="number" value={form.box_h} onChange={e => set('box_h', e.target.value)} placeholder="גובה" min="0" step="0.1" />
                </div>
              </div>

              <div className="form-group">
                <label>מס קניה ספציפי % (override)</label>
                <input type="number" value={form.purchase_tax_rate_override} onChange={e => set('purchase_tax_rate_override', e.target.value)} placeholder="ברירת מחדל: 0%" min="0" max="200" step="0.5" />
              </div>

              <div className="form-group full">
                <label>הערות</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="הערות נוספות..." />
              </div>

              {/* ── HS Classification ── */}
              <div className="form-group full">
                <div className="hs-section-title">סיווג מכס ישראלי</div>
                <div className="hs-row">
                  <div style={{ flex: 1 }}>
                    <label style={{ marginBottom: 6, display: 'block' }}>קוד HS (8 ספרות)</label>
                    <div className="hs-input-row">
                      <input
                        value={form.hs_code}
                        onChange={e => set('hs_code', e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="00000000"
                        dir="ltr"
                        style={{ fontFamily: 'monospace', letterSpacing: 2 }}
                      />
                      {form.hs_code.length === 8 && (
                        <a
                          href={`https://nfx.co.il/tariff/import/${form.hs_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          title="פתח בטריף ישראלי"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ marginBottom: 6, display: 'block' }}>שיעור מכס ספציפי (%)</label>
                    <input
                      type="number"
                      value={form.customs_rate_override}
                      onChange={e => set('customs_rate_override', e.target.value)}
                      placeholder={`ברירת מחדל: ${settings?.customs ?? 5}%`}
                      min="0"
                      max="200"
                      step="0.5"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-classify"
                  onClick={handleClassify}
                  disabled={classifying || !form.name.trim()}
                  style={{ marginTop: 10 }}
                >
                  {classifying ? <span className="spinner" /> : <Sparkles size={14} />}
                  {classifying ? 'מסווג...' : 'סווג אוטומטית עם AI'}
                </button>

                {classifyError && (
                  <div className="classify-error">{classifyError}</div>
                )}

                {classifyResult && (
                  <div className="classify-result">
                    <div className="classify-result-header">תוצאת סיווג AI</div>
                    <div className="classify-result-body">
                      <div className="classify-kv">
                        <span className="classify-k">קוד HS</span>
                        <span className="classify-v" style={{ fontFamily: 'monospace', letterSpacing: 2 }}>{classifyResult.hs_code}</span>
                      </div>
                      <div className="classify-kv">
                        <span className="classify-k">שיעור מכס</span>
                        <span className="classify-v">{classifyResult.customs_rate}%</span>
                      </div>
                      {classifyResult.explanation && (
                        <div className="classify-explanation">{classifyResult.explanation}</div>
                      )}
                    </div>
                    <div className="classify-actions">
                      <button type="button" className="btn btn-success btn-sm" onClick={applyClassify}>
                        ✓ החל על המוצר
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setClassifyResult(null)}>
                        התעלם
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>ביטול</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving && <span className="spinner" />}
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
