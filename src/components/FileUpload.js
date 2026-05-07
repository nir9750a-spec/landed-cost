import React, { useState, useRef } from 'react';
import { X, Check, AlertCircle, Upload, AlertTriangle } from 'lucide-react';
import { extractProductsFromFile } from '../lib/aiExtract';

export default function FileUpload({ settings, onSave, onClose, showToast }) {
  const [dragging, setDragging]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [fileName, setFileName]   = useState('');
  const [extracted, setExtracted] = useState(null);
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);
  const fileRef = useRef();

  async function handleFile(file) {
    setError('');
    setExtracted(null);
    setFileName(file.name);
    setLoading(true);
    try {
      const data = await extractProductsFromFile(file, settings?.api_key);
      if (!data.length) throw new Error('לא נמצאו מוצרים בקובץ');
      setExtracted(data);
    } catch (err) {
      setError(err.message || 'שגיאה בחילוץ הנתונים');
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function update(idx, field, val) {
    setExtracted(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));
  }

  function removeRow(idx) {
    setExtracted(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!extracted?.length) return;
    setSaving(true);
    const rows = extracted.map(p => ({
      name:      String(p.name      || '').trim(),
      item_no:   String(p.item_no   || '').trim(),
      qty:       Number(p.qty)       || 0,
      fob_price: Number(p.fob_price) || 0,
      cbm:       Number(p.cbm)       || 0,
      supplier:  String(p.supplier  || '').trim(),
      notes:     String(p.notes     || '').trim(),
    }));
    const ok = await onSave(rows);
    setSaving(false);
    if (ok) onClose();
  }

  // Validation warnings shown in the preview
  const noCbm   = extracted ? extracted.filter(p => !Number(p.cbm)).length   : 0;
  const noPrice = extracted ? extracted.filter(p => !Number(p.fob_price)).length : 0;
  const noName  = extracted ? extracted.filter(p => !String(p.name).trim()).length : 0;

  return (
    <div className="modal-overlay">
      <div className={`modal ${extracted ? 'modal-lg' : ''}`}>
        <div className="modal-header">
          <span className="modal-title">ייבוא מוצרים מקובץ</span>
          <button className="btn btn-sm" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="modal-body">

          {/* ── Drop zone (shown when no data yet) ── */}
          {!extracted && !loading && (
            <>
              <div
                className={`upload-area ${dragging ? 'drag-over' : ''}`}
                onClick={() => fileRef.current.click()}
                onDrop={onDrop}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
              >
                <Upload size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
                <div style={{ fontSize: 15, marginBottom: 4 }}>גרור קובץ לכאן, או לחץ לבחירה</div>
                <div className="upload-hint">
                  Excel (.xlsx, .xls, .csv) &nbsp;|&nbsp; PDF &nbsp;|&nbsp; תמונה (JPG, PNG, WEBP)
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.gif,.webp"
                style={{ display: 'none' }}
                onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
              />
              {!settings?.api_key && (
                <div className="alert alert-warn" style={{ marginTop: 12 }}>
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    לחילוץ מ-PDF ותמונות נדרש מפתח Anthropic API — הגדר בהגדרות כלליות.
                    קבצי Excel מיובאים ללא AI.
                  </span>
                </div>
              )}
            </>
          )}

          {/* ── Loading ── */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <span className="spinner" style={{ width: 36, height: 36 }} />
              <div style={{ marginTop: 16, color: 'var(--text2)', fontSize: 14 }}>
                מחלץ נתונים מ-{fileName}...
              </div>
              <div style={{ marginTop: 8, color: 'var(--text3)', fontSize: 12 }}>
                עבור PDF ותמונות זה עשוי לקחת 10–20 שניות
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {error && !loading && (
            <div className="alert alert-err" style={{ marginTop: 8 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>שגיאה בחילוץ הנתונים</div>
                <div style={{ whiteSpace: 'pre-line' }}>{error}</div>
                <button
                  className="btn btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => { setError(''); setFileName(''); }}
                >
                  נסה שוב
                </button>
              </div>
            </div>
          )}

          {/* ── Preview table ── */}
          {extracted && (
            <>
              <div className="flex items-center gap-2 mb-4" style={{ flexWrap: 'wrap', rowGap: 8 }}>
                <Check size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                  נמצאו {extracted.length} מוצרים מתוך {fileName}
                </span>
                <button
                  className="btn btn-sm"
                  style={{ marginRight: 'auto' }}
                  onClick={() => { setExtracted(null); setError(''); setFileName(''); }}
                >
                  <Upload size={13} /> העלה קובץ אחר
                </button>
              </div>

              {/* Validation warnings */}
              {(noCbm > 0 || noPrice > 0 || noName > 0) && (
                <div className="alert alert-warn" style={{ marginBottom: 12, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div className="flex items-center gap-2" style={{ fontWeight: 600 }}>
                    <AlertTriangle size={14} /> שים לב — ערכים חסרים
                  </div>
                  {noName  > 0 && <div>· {noName} מוצרים ללא שם — בדוק ותקן לפני שמירה</div>}
                  {noPrice > 0 && <div>· {noPrice} מוצרים עם מחיר FOB = 0 — ייתכן שהעמודה לא זוהתה</div>}
                  {noCbm   > 0 && <div>· {noCbm} מוצרים עם CBM = 0 — ניתן להזין ידנית בטבלה למטה</div>}
                </div>
              )}

              <div className="table-wrap">
                <table style={{ minWidth: 780 }}>
                  <thead>
                    <tr>
                      <th>שם מוצר</th>
                      <th>מק"ט</th>
                      <th>ספק</th>
                      <th>כמות</th>
                      <th>FOB $</th>
                      <th>CBM</th>
                      <th>הערות</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {extracted.map((p, i) => (
                      <tr key={i} style={!p.name ? { background: 'rgba(248,81,73,0.05)' } : undefined}>
                        <td>
                          <input
                            value={p.name}
                            onChange={e => update(i, 'name', e.target.value)}
                            style={{ minWidth: 140 }}
                            placeholder="שם מוצר *"
                          />
                        </td>
                        <td>
                          <input
                            value={p.item_no}
                            onChange={e => update(i, 'item_no', e.target.value)}
                            style={{ width: 90 }}
                          />
                        </td>
                        <td>
                          <input
                            value={p.supplier}
                            onChange={e => update(i, 'supplier', e.target.value)}
                            style={{ width: 100 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={p.qty}
                            onChange={e => update(i, 'qty', e.target.value)}
                            style={{ width: 70 }}
                            min="0"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={p.fob_price}
                            onChange={e => update(i, 'fob_price', e.target.value)}
                            style={{ width: 80 }}
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={p.cbm}
                            onChange={e => update(i, 'cbm', e.target.value)}
                            style={{ width: 78, borderColor: Number(p.cbm) === 0 ? 'var(--orange)' : undefined }}
                            min="0"
                            step="0.0001"
                            title={Number(p.cbm) === 0 ? 'CBM חסר — הזן ידנית' : undefined}
                          />
                        </td>
                        <td>
                          <input
                            value={p.notes}
                            onChange={e => update(i, 'notes', e.target.value)}
                            style={{ width: 110 }}
                          />
                        </td>
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={() => removeRow(i)} title="הסר שורה">
                            <X size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>ביטול</button>
          {extracted && (
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !extracted.length}
            >
              {saving ? <span className="spinner" /> : <Check size={15} />}
              {saving ? 'שומר...' : `שמור ${extracted.length} מוצרים לפרויקט`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
