import React, { useState } from 'react';
import { X, Printer, Ship } from 'lucide-react';
import { calcProducts, calcTotals } from '../lib/calculations';

// ─────────────────────────────────────────────────────────────────────────────
//  BrokerExport — printable / save-as-PDF logistics sheet for the freight
//  forwarder / carrier (מוביל / משלח בינלאומי).
//
//  Built from the proforma / commercial invoice. Shows ONLY the physical and
//  commercial facts a forwarder needs to book space and prepare documents:
//  supplier + address, Incoterm, and per-line product / quantity / CBM /
//  gross weight with totals.
//
//  Deliberately HIDES customs %, cost-per-unit, landed cost, margin, sell
//  price and profit — those belong to the importer / accountant / customs
//  broker, not the carrier. (Same rule as the guest-portal forwarder view.)
//
//  Triggers the browser print dialog; the user picks "Save as PDF".
// ─────────────────────────────────────────────────────────────────────────────

const INCOTERM_LEGEND = [
  ['EXW', 'מהמפעל'],
  ['FCA', 'מסירה למוביל'],
  ['FAS', 'לצד האנייה'],
  ['FOB', 'על האנייה'],
  ['CFR', 'עלות והובלה'],
  ['CIF', 'עלות, ביטוח והובלה'],
  ['CPT', 'תובלה משולמת עד'],
  ['CIP', 'תובלה וביטוח עד'],
  ['DAP', 'מסירה ביעד'],
  ['DPU', 'מסירה ופריקה ביעד'],
  ['DDP', 'מסירה משולמת מס'],
];

function n(v, d = 0) {
  return Number(v || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function todayIso() {
  return new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function BrokerExport({ project, products, settings, calcCtx, onClose }) {
  const calced = calcProducts(products, settings, calcCtx);
  const totals = calcTotals(calced);

  // Supplier name + address are editable inline so the sheet is usable even
  // before the supplier_address migration runs, and the importer can correct
  // them before sending to the forwarder.
  const [supplierName, setSupplierName]     = useState(project?.supplier || '');
  const [supplierAddr, setSupplierAddr]     = useState(project?.supplier_address || '');

  const incoterm = (settings.incoterms || '').toUpperCase();
  const totalGrossKg = calced.reduce((a, p) => a + (Number(p.qty) || 0) * (Number(p.gross_weight_kg) || 0), 0);
  const anyWeight = totalGrossKg > 0;

  return (
    <div className="modal-overlay no-print" onClick={onClose} style={{ alignItems: 'flex-start', overflow: 'auto' }}>
      <div
        className="modal export-doc"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 920, width: '95%', margin: '24px auto',
          background: '#fff', color: '#111', padding: 0,
        }}
      >
        {/* Toolbar — hidden in print */}
        <div className="no-print" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 18px', background: '#f3f4f6', borderBottom: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: 13, color: '#374151' }}>
            דף ריכוז למוביל / משלח — מלא ספק וכתובת, ואז שמור כ-PDF (Ctrl+P → "שמור כ-PDF")
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={13} /> הדפס / שמור PDF
            </button>
            <button className="btn" onClick={onClose}>
              <X size={13} /> סגור
            </button>
          </div>
        </div>

        {/* PRINTABLE CONTENT */}
        <div className="export-body" style={{ padding: '32px 40px', fontFamily: 'Heebo, Arial, sans-serif', direction: 'rtl' }}>
          {/* Header */}
          <div style={{ borderBottom: '2px solid #3b82f6', paddingBottom: 18, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#111', marginBottom: 4 }}>Importly</div>
                <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ship size={14} /> דף ריכוז משלוח — להעברה למוביל / משלח בינלאומי
                </div>
              </div>
              <div style={{ textAlign: 'left', fontSize: 11, color: '#6b7280' }}>
                <div>תאריך הפקה: {todayIso()}</div>
                <div>נמל מוצא: {settings.origin_port || '—'}</div>
                <div>שיטת משלוח: {settings.shipping_method === 'air' ? 'אוויר' : 'ים'}</div>
              </div>
            </div>
          </div>

          {/* Supplier + terms */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 12 }}>
              {project?.name || 'משלוח יבוא'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, fontSize: 12 }}>
              <div>
                <FieldLabel>ספק (Supplier)</FieldLabel>
                <input
                  className="no-print" value={supplierName}
                  onChange={e => setSupplierName(e.target.value)}
                  placeholder="שם הספק"
                  style={editInputStyle}
                />
                <div className="print-only" style={printValueStyle}>{supplierName || '—'}</div>

                <FieldLabel style={{ marginTop: 10 }}>כתובת ספק (Address)</FieldLabel>
                <textarea
                  className="no-print" value={supplierAddr}
                  onChange={e => setSupplierAddr(e.target.value)}
                  placeholder="רחוב, עיר, מדינה"
                  rows={2}
                  style={{ ...editInputStyle, resize: 'vertical' }}
                />
                <div className="print-only" style={printValueStyle}>{supplierAddr || '—'}</div>
              </div>
              <div style={{
                background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 14px',
              }}>
                <FieldLabel>תנאי מסירה (Incoterm 2020)</FieldLabel>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1d4ed8', marginTop: 2 }}>
                  {incoterm || '—'}
                  {incoterm && settings.origin_port ? <span style={{ fontSize: 13, fontWeight: 600 }}> · {settings.origin_port}</span> : null}
                </div>
                <div style={{ fontSize: 11, color: '#1e40af', marginTop: 4 }}>
                  {INCOTERM_LEGEND.find(([c]) => c === incoterm)?.[1] || 'יש לאשר תנאי מסירה מול הספק'}
                </div>
              </div>
            </div>
          </div>

          {/* Goods table */}
          <div style={{ marginBottom: 24 }}>
            <SectionTitle>פירוט סחורה</SectionTitle>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #d1d5db' }}>
                  <Th>#</Th>
                  <Th>שם פריט</Th>
                  <Th>קוד / SKU</Th>
                  <Th>כמות</Th>
                  <Th>CBM סה״כ</Th>
                  <Th>משקל ברוטו ק״ג</Th>
                </tr>
              </thead>
              <tbody>
                {calced.map((p, i) => {
                  const lineKg = (Number(p.qty) || 0) * (Number(p.gross_weight_kg) || 0);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <Td>{i + 1}</Td>
                      <Td>{p.name}</Td>
                      <Td mono>{p.item_no || '—'}</Td>
                      <Td>{n(p.qty)}</Td>
                      <Td>{n(p._productCbm, 4)}</Td>
                      <Td>{lineKg > 0 ? n(lineKg, 2) : '—'}</Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f3f4f6', fontWeight: 700, borderTop: '2px solid #111' }}>
                  <Td colSpan={3}>סה״כ</Td>
                  <Td bold>{n(totals.qtyTotal)}</Td>
                  <Td bold>{n(totals.totalCbm, 4)}</Td>
                  <Td bold>{anyWeight ? n(totalGrossKg, 2) : '—'}</Td>
                </tr>
              </tfoot>
            </table>
            {!anyWeight && (
              <div style={{ fontSize: 10, color: '#9a3412', marginTop: 6 }}>
                משקל ברוטו לא הוזן. חלץ את רשימת האריזה (Packing List) במסך המסמכים כדי למלא משקלים אוטומטית.
              </div>
            )}
          </div>

          {/* Forwarder checklist */}
          <div style={{
            marginTop: 8, padding: 14, background: '#f9fafb',
            border: '1px solid #d1d5db', borderRadius: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 8 }}>
              מה שהמוביל צריך כדי לתמחר ולהזמין מקום
            </div>
            <ol style={{ margin: 0, paddingInlineStart: 18, fontSize: 11, color: '#374151', lineHeight: 1.7 }}>
              <li>תנאי מסירה (Incoterm) + נמל הטעינה — נקודת האיסוף ומי משלם על מה</li>
              <li>נפח כולל (CBM) + משקל ברוטו כולל + מספר קרטונים</li>
              <li>תיאור הסחורה וסוגה (סוללות / עץ / סחורה מסוכנת?)</li>
              <li>תאריך מוכנות הסחורה אצל הספק + כתובת איסוף (ל-FCA / EXW)</li>
              <li>נמל יעד (אשדוד / חיפה) וכתובת מסירה סופית בישראל</li>
              <li>ערך מסחרי לצורך ביטוח, והאם נדרש ביטוח</li>
            </ol>
          </div>

          {/* Incoterm legend */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
              11 תנאי המסירה (Incoterms® 2020)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px 16px', fontSize: 10, color: '#6b7280' }}>
              {INCOTERM_LEGEND.map(([code, he]) => (
                <div key={code} style={{ fontWeight: code === incoterm ? 800 : 400, color: code === incoterm ? '#1d4ed8' : '#6b7280' }}>
                  <strong>{code}</strong> — {he}
                </div>
              ))}
            </div>
          </div>

          {/* Footer note */}
          <div style={{
            marginTop: 24, padding: 14,
            background: '#f9fafb', borderTop: '1px solid #d1d5db',
            fontSize: 10, color: '#6b7280', lineHeight: 1.6,
          }}>
            <strong>הערה למקבל המסמך:</strong> דף ריכוז זה הופק מתוך החשבונית / פרופורמה שהוזנה ל-Importly על-ידי
            היבואן, ואינו תחליף לחשבונית המסחרית הרשמית או לשטר המטען. הוא נועד להאיץ את התיאום מול המוביל.
            הנתונים אינם כוללים מכס, מע״מ או עלות נחיתה — אלו באחריות היבואן ועמיל המכס.
          </div>
        </div>
      </div>

      <style>{`
        .print-only { display: none; }
        @media print {
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden; }
          .export-doc, .export-doc * { visibility: visible; }
          .export-doc { position: absolute; inset: 0; box-shadow: none; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
      `}</style>
    </div>
  );
}

// ── Local helpers ────────────────────────────────────────────────────────────

const editInputStyle = {
  width: '100%', padding: '7px 9px', fontSize: 12,
  border: '1px solid #d1d5db', borderRadius: 6, color: '#111',
  fontFamily: 'inherit', direction: 'rtl', boxSizing: 'border-box',
};

const printValueStyle = { fontSize: 13, fontWeight: 600, color: '#111', marginTop: 2 };

function FieldLabel({ children, style }) {
  return (
    <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3, ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 14, fontWeight: 700, color: '#111',
      borderBottom: '1px solid #d1d5db', paddingBottom: 6, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function Th({ children }) {
  return <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600, color: '#374151' }}>{children}</th>;
}

function Td({ children, mono, bold, colSpan }) {
  return (
    <td colSpan={colSpan} style={{
      textAlign: 'right', padding: '7px 6px', color: '#111',
      fontFamily: mono ? 'monospace' : 'inherit', fontWeight: bold ? 700 : 400,
    }}>
      {children}
    </td>
  );
}
