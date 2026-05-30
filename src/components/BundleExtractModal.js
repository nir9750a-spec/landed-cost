import React, { useState, useRef } from 'react';
import { X, Upload, Sparkles, Trash2, FileText, AlertCircle, Check, Loader, Package, Ship, Receipt } from 'lucide-react';
import { extractBundle } from '../lib/bundleExtract';
import { FILE_CATEGORIES, uploadProjectFile } from '../lib/files';
import { createShipment } from '../lib/shipments';
import { supabase } from '../lib/supabase';
import { confirmAsync } from './ConfirmDialog';

// ─────────────────────────────────────────────────────────────────────────────
//  BundleExtractModal — "new project from a stack of documents" flow.
//
//  Workflow:
//   1. User enters project name
//   2. User drops 1-N files, picks category for each (defaults to invoice)
//   3. ONE button חלץ הכול runs all extractors in parallel
//   4. Consolidated preview: products, shipment, payment, files
//   5. User confirms once → project created + everything saved + files archived
// ─────────────────────────────────────────────────────────────────────────────

const STAGES = {
  setup: 'setup',         // user adding files & picking categories
  extracting: 'extracting',
  preview: 'preview',     // showing consolidated extract
  saving: 'saving',       // persisting everything to Supabase
  done: 'done',
};

function n(v, d = 0) {
  return Number(v || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function BundleExtractModal({ onClose, onCreated, showToast }) {
  const [stage, setStage]         = useState(STAGES.setup);
  const [projectName, setProjectName] = useState('');
  const [supplier, setSupplier]   = useState('');
  const [files, setFiles]         = useState([]); // [{ file, category, status, error }]
  const [bundle, setBundle]       = useState(null);
  const [dragging, setDragging]   = useState(false);
  const fileRef = useRef();

  function addFiles(fileList) {
    const arr = Array.from(fileList || []);
    if (arr.length === 0) return;
    setFiles(prev => [
      ...prev,
      ...arr.map(f => ({ file: f, category: guessCategory(f.name), status: 'pending', error: null })),
    ]);
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function setFileCategory(idx, category) {
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, category } : f));
  }

  async function handleExtractAll() {
    if (!projectName.trim()) {
      showToast?.('הזן שם פרויקט לפני חילוץ', 'error');
      return;
    }
    if (files.length === 0) {
      showToast?.('הוסף לפחות קובץ אחד', 'error');
      return;
    }
    setStage(STAGES.extracting);
    setFiles(prev => prev.map(f => ({ ...f, status: 'pending', error: null })));

    const onProgress = (idx, status, msg) => {
      setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status, error: msg || null } : f));
    };

    try {
      const result = await extractBundle(files, onProgress);
      setBundle(result);
      setStage(STAGES.preview);
    } catch (err) {
      showToast?.('שגיאה כללית בחילוץ: ' + err.message, 'error');
      setStage(STAGES.setup);
    }
  }

  async function handleConfirmSave() {
    if (!bundle) return;
    setStage(STAGES.saving);

    try {
      // 1. Create project
      const { data: project, error: projErr } = await supabase.from('projects').insert({
        name:     projectName.trim(),
        supplier: (supplier || bundle.shipment_settings.supplier || '').trim(),
        status:   'active',
        notes:    'נוצר אוטומטית מ-' + files.length + ' מסמכים',
      }).select().single();
      if (projErr) throw new Error('יצירת פרויקט: ' + projErr.message);

      // 2. Project settings (Incoterms, origin port from extraction)
      const settingsPatch = { project_id: project.id };
      if (bundle.shipment_settings.incoterms)   settingsPatch.incoterms = bundle.shipment_settings.incoterms;
      if (bundle.shipment_settings.origin_port) settingsPatch.origin_port = bundle.shipment_settings.origin_port;
      // From shipment doc: if it was air-courier (container_type=AIR) set shipping_method=air
      if (bundle.shipment?.container_type === 'AIR') settingsPatch.shipping_method = 'air';
      // If receipt found a shipping fee in USD, apply to china_local_transport by default
      if (bundle.payment?.shipping_fee > 0 && (bundle.payment.currency || 'USD') === 'USD') {
        settingsPatch.china_local_transport = bundle.payment.shipping_fee;
      }
      if (Object.keys(settingsPatch).length > 1) {
        await supabase.from('settings').insert(settingsPatch);
      }

      // 3. Products
      if (bundle.products.length > 0) {
        const productRows = bundle.products.map(p => ({
          name:            String(p.name || '').trim(),
          item_no:         String(p.item_no || '').trim(),
          qty:             Number(p.qty) || 0,
          fob_price:       Number(p.fob_price) || 0,
          cbm:             Number(p.cbm) || 0,
          gross_weight_kg: Number(p.gross_weight_kg) || 0,
          box_l:           Number(p.box_l) || 0,
          box_w:           Number(p.box_w) || 0,
          box_h:           Number(p.box_h) || 0,
          supplier:        String(p.supplier || supplier || '').trim(),
          notes:           String(p.notes || '').trim(),
          project_id:      project.id,
        }));
        const { error: prodErr } = await supabase.from('products').insert(productRows);
        if (prodErr) throw new Error('שמירת מוצרים: ' + prodErr.message);
      }

      // 4. Shipment row (container / AWB)
      if (bundle.shipment && (bundle.shipment.container_number || bundle.shipment.vessel_name)) {
        try {
          await createShipment({
            ...bundle.shipment,
            project_id: project.id,
            status: 'planned',
          });
        } catch (err) {
          // Don't block the whole save if shipment fails — tell the user
          showToast?.('הפרויקט נשמר, אך שמירת המכולה נכשלה: ' + err.message, 'error');
        }
      }

      // 5. Archive all uploaded files
      for (const fc of files) {
        try {
          await uploadProjectFile({
            file: fc.file,
            projectId: project.id,
            category: fc.category,
            notes: 'נטען כחלק מחילוץ בונדל',
          });
        } catch (err) {
          // Best-effort — don't fail the whole save
        }
      }

      setStage(STAGES.done);
      showToast?.(`פרויקט "${project.name}" נוצר עם כל המידע`);
      onCreated?.(project.id);
    } catch (err) {
      showToast?.('שגיאה בשמירה: ' + err.message, 'error');
      setStage(STAGES.preview);
    }
  }

  async function handleClose() {
    if (stage === STAGES.preview) {
      const ok = await confirmAsync({
        title: 'יציאה ללא שמירה',
        message: 'החילוץ ייזרק. הקבצים יישארו על המחשב שלך. להמשיך?',
        confirmLabel: 'צא',
        danger: true,
      });
      if (!ok) return;
    }
    onClose?.();
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" style={{ maxWidth: 980, width: '95%' }}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} style={{ color: 'var(--orange)' }} />
            פרויקט חדש מקבצים — חילוץ אוטומטי
          </span>
          <button className="btn btn-sm" onClick={handleClose}><X size={15} /></button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          {/* Stage 1: setup */}
          {stage === STAGES.setup && (
            <SetupStage
              projectName={projectName}
              setProjectName={setProjectName}
              supplier={supplier}
              setSupplier={setSupplier}
              files={files}
              addFiles={addFiles}
              removeFile={removeFile}
              setFileCategory={setFileCategory}
              dragging={dragging}
              setDragging={setDragging}
              fileRef={fileRef}
            />
          )}

          {/* Stage 2: extracting */}
          {stage === STAGES.extracting && (
            <ExtractingStage files={files} />
          )}

          {/* Stage 3: preview */}
          {stage === STAGES.preview && bundle && (
            <PreviewStage bundle={bundle} setBundle={setBundle} files={files} />
          )}

          {/* Stage 4: saving */}
          {stage === STAGES.saving && (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Loader size={32} className="spin" style={{ color: 'var(--orange)', marginBottom: 12 }} />
              <div style={{ fontSize: 14 }}>שומר את הפרויקט והקבצים...</div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {stage === STAGES.setup && (
            <>
              <button className="btn" onClick={handleClose}>ביטול</button>
              <button
                className="btn btn-primary"
                onClick={handleExtractAll}
                disabled={!projectName.trim() || files.length === 0}
              >
                <Sparkles size={13} /> חלץ הכול ({files.length} קבצים)
              </button>
            </>
          )}
          {stage === STAGES.preview && (
            <>
              <button className="btn" onClick={() => setStage(STAGES.setup)}>הוסף עוד קבצים</button>
              <button className="btn btn-primary" onClick={handleConfirmSave}>
                <Check size={13} /> צור פרויקט עם הנתונים
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stage components ────────────────────────────────────────────────────────

function SetupStage({ projectName, setProjectName, supplier, setSupplier, files, addFiles, removeFile, setFileCategory, dragging, setDragging, fileRef }) {
  return (
    <>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label>שם הפרויקט *</label>
          <input
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="למשל: יבוא Q3 2026 — קמפינג סין"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>שם הספק (אופציונלי — ישוחזר אוטומטית מהחשבונית)</label>
          <input
            value={supplier}
            onChange={e => setSupplier(e.target.value)}
            placeholder="Yongkang Hispeed Outdoor"
          />
        </div>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--orange)' : 'var(--border)'}`,
          borderRadius: 8, padding: 24, textAlign: 'center',
          background: dragging ? 'rgba(245,158,11,0.08)' : 'transparent',
          cursor: 'pointer', marginBottom: 14,
        }}
      >
        <Upload size={26} style={{ color: 'var(--text3)', marginBottom: 6 }} />
        <div style={{ fontSize: 13 }}>גרור לכאן את כל המסמכים — חשבונית, רשימת אריזה, שטר מטען, קבלת תשלום, צילום מעקב</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>PDF / תמונה / Excel · עד 20MB לקובץ</div>
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            {files.length} קבצים. סמן את סוג כל קובץ — ה-AI יחלץ בהתאם.
          </div>
          {files.map((f, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', background: 'var(--bg2)',
              border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6,
            }}>
              <FileText size={14} style={{ color: 'var(--text2)', flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.file.name}
              </div>
              <select
                value={f.category}
                onChange={e => setFileCategory(idx, e.target.value)}
                style={{ fontSize: 11, padding: '4px 6px', minWidth: 140 }}
              >
                {FILE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <button className="btn btn-sm btn-danger" onClick={() => removeFile(idx)}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ExtractingStage({ files }) {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <Sparkles size={28} style={{ color: 'var(--orange)', marginBottom: 8 }} />
        <div style={{ fontSize: 15, fontWeight: 600 }}>ה-AI קורא את כל הקבצים במקביל</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
          זה לוקח בערך 10-20 שניות לקובץ. נמתין שהכול יסיים.
        </div>
      </div>
      <div>
        {files.map((f, idx) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', marginBottom: 4,
            background: 'var(--bg2)', borderRadius: 6,
            opacity: f.status === 'skipped' ? 0.5 : 1,
          }}>
            <div style={{ width: 18 }}>
              {f.status === 'pending' && <span style={{ color: 'var(--text3)' }}>○</span>}
              {f.status === 'running' && <Loader size={14} className="spin" style={{ color: 'var(--orange)' }} />}
              {f.status === 'done' && <Check size={14} style={{ color: 'var(--green)' }} />}
              {f.status === 'error' && <AlertCircle size={14} style={{ color: 'var(--red)' }} />}
              {f.status === 'skipped' && <span style={{ color: 'var(--text3)' }}>—</span>}
            </div>
            <div style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.file.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {f.error ? f.error.slice(0, 50) : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewStage({ bundle, setBundle, files }) {
  const errs = bundle.errors || [];
  return (
    <div>
      {errs.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)',
          borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 12,
        }}>
          <AlertCircle size={13} style={{ color: 'var(--red)', marginInlineEnd: 4 }} />
          {errs.length} קבצים נכשלו: {errs.map(e => e.file).join(', ')}. שאר הקבצים נחלצו בהצלחה.
        </div>
      )}

      {/* SHIPMENT SETTINGS */}
      <Section icon={Ship} title={`פרטי משלוח (${bundle.shipment_settings.incoterms || '—'})`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, fontSize: 12 }}>
          <KV k="Incoterms" v={bundle.shipment_settings.incoterms || '—'} />
          <KV k="נמל מוצא" v={bundle.shipment_settings.origin_port || '—'} />
          <KV k="ספק" v={bundle.shipment_settings.supplier || '—'} />
          {bundle.shipment?.container_number && (
            <>
              <KV k="מספר מכולה / AWB" v={bundle.shipment.container_number} mono />
              <KV k="אונייה / מסע" v={`${bundle.shipment.vessel_name || ''} ${bundle.shipment.voyage || ''}`.trim() || '—'} />
              <KV k="ETA" v={bundle.shipment.eta_date || '—'} />
            </>
          )}
        </div>
      </Section>

      {/* PRODUCTS */}
      <Section icon={Package} title={`מוצרים (${bundle.products.length})`}>
        {bundle.products.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 12 }}>לא חולצו מוצרים מהקבצים שסומנו כחשבונית.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text3)' }}>
                <Th>שם</Th>
                <Th>קוד</Th>
                <Th>כמות</Th>
                <Th>FOB $</Th>
                <Th>CBM</Th>
                <Th>משקל</Th>
              </tr>
            </thead>
            <tbody>
              {bundle.products.map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td>
                    <input value={p.name || ''}
                      onChange={e => updateProduct(setBundle, i, 'name', e.target.value)}
                      style={{ width: '100%', minWidth: 160 }} />
                  </Td>
                  <Td>
                    <input value={p.item_no || ''}
                      onChange={e => updateProduct(setBundle, i, 'item_no', e.target.value)}
                      style={{ width: 90 }} />
                  </Td>
                  <Td>
                    <input type="number" value={p.qty || 0}
                      onChange={e => updateProduct(setBundle, i, 'qty', Number(e.target.value))}
                      style={{ width: 60 }} />
                  </Td>
                  <Td>
                    <input type="number" step="any" value={p.fob_price || 0}
                      onChange={e => updateProduct(setBundle, i, 'fob_price', Number(e.target.value))}
                      style={{ width: 80 }} />
                  </Td>
                  <Td>
                    <input type="number" step="any" value={p.cbm || 0}
                      onChange={e => updateProduct(setBundle, i, 'cbm', Number(e.target.value))}
                      style={{ width: 80 }} />
                  </Td>
                  <Td>
                    <input type="number" step="any" value={p.gross_weight_kg || 0}
                      onChange={e => updateProduct(setBundle, i, 'gross_weight_kg', Number(e.target.value))}
                      style={{ width: 70 }} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* PAYMENT */}
      {bundle.payment && (
        <Section icon={Receipt} title="קבלת תשלום">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, fontSize: 12 }}>
            <KV k="מקבל" v={bundle.payment.payee || '—'} />
            <KV k="תאריך" v={bundle.payment.payment_date || '—'} />
            <KV k="שיטה" v={bundle.payment.payment_method || '—'} />
            <KV k="סכום מוצרים" v={`${n(bundle.payment.subtotal_goods, 2)} ${bundle.payment.currency}`} />
            <KV k="משלוח" v={`${n(bundle.payment.shipping_fee, 2)} ${bundle.payment.currency}`} />
            <KV k="סה״כ ששולם" v={`${n(bundle.payment.total_paid, 2)} ${bundle.payment.currency}`} />
          </div>
        </Section>
      )}

      {/* FILES STATUS */}
      <Section icon={FileText} title={`קבצים (${files.length})`}>
        {files.map((f, idx) => (
          <div key={idx} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
            {f.error ? '❌' : '✓'} {f.file.name} ·
            <span style={{ color: 'var(--text3)', marginInlineStart: 4 }}>
              {FILE_CATEGORIES.find(c => c.value === f.category)?.label}
            </span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function updateProduct(setBundle, idx, k, v) {
  setBundle(prev => ({
    ...prev,
    products: prev.products.map((p, i) => i === idx ? { ...p, [k]: v } : p),
  }));
}

function Section({ icon: Icon, title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--orange)', fontSize: 13, fontWeight: 600 }}>
        <Icon size={14} />
        {title}
      </div>
      <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: 10 }}>
        {children}
      </div>
    </div>
  );
}

function KV({ k, v, mono }) {
  return (
    <div>
      <div style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
      <div style={{
        color: 'var(--text)', fontWeight: 600, marginTop: 2,
        fontFamily: mono ? 'monospace' : 'inherit', direction: mono ? 'ltr' : 'inherit', textAlign: 'right',
      }}>{v}</div>
    </div>
  );
}

function Th({ children }) {
  return <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 500 }}>{children}</th>;
}
function Td({ children }) {
  return <td style={{ padding: '4px 6px' }}>{children}</td>;
}

function guessCategory(name) {
  const lc = name.toLowerCase();
  if (/invoice|חשבונית|inv|pi-|pim/.test(lc)) return 'invoice';
  if (/pack|packing|אריזה|装箱/.test(lc)) return 'packing_list';
  if (/bill|lading|b\/l|bol|שטר/.test(lc)) return 'bill_of_lading';
  if (/awb|dhl|fedex|ups|air/.test(lc)) return 'air_waybill';
  if (/receipt|paypal|wise|swift|תשלום|קבלה/.test(lc)) return 'receipt';
  if (/track|tracking|מעקב|ngbo|whatsapp/.test(lc)) return 'logistics_agent';
  return 'invoice';  // safest default
}
