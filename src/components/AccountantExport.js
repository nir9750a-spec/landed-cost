import React from 'react';
import { X, Printer } from 'lucide-react';
import { calcProducts, calcTotals } from '../lib/calculations';

// ─────────────────────────────────────────────────────────────────────────────
//  AccountantExport — printable / save-as-PDF summary of a project's landed
//  cost calculation. Designed to be emailed straight to the importer's
//  accountant or customs broker as documentation of how the cost was
//  computed: not a tax document, just a working sheet.
//
//  Triggers browser print dialog; the user picks "Save as PDF" from there.
//  No external PDF library needed — keeps the bundle small.
// ─────────────────────────────────────────────────────────────────────────────

function n(v, d = 0) {
  return Number(v || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function todayIso() {
  return new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AccountantExport({ project, products, settings, calcCtx, onClose }) {
  const calced = calcProducts(products, settings, calcCtx);
  const totals = calcTotals(calced);
  const rate   = Number(settings.usd_rate) || 3.7;

  function handlePrint() {
    // Hide the modal chrome temporarily, print, restore.
    window.print();
  }

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
            תצוגה מקדימה — שמור כ-PDF דרך תפריט ההדפסה (Ctrl+P → "שמור כ-PDF")
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary" onClick={handlePrint}>
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
          <div style={{ borderBottom: '2px solid #f59e0b', paddingBottom: 18, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#111', marginBottom: 4 }}>Importly</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>חישוב עלות נחיתה — להעברה לרואה חשבון / עמיל מכס</div>
              </div>
              <div style={{ textAlign: 'left', fontSize: 11, color: '#6b7280' }}>
                <div>תאריך הפקה: {todayIso()}</div>
                <div>שער דולר: ₪{rate.toFixed(3)}</div>
              </div>
            </div>
          </div>

          {/* Project info */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>
              {project?.name || 'פרויקט יבוא'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
              <InfoCell label="ספק" value={project?.supplier || '—'} />
              <InfoCell label="נמל מוצא" value={settings.origin_port || '—'} />
              <InfoCell label="תנאי מסירה" value={settings.incoterms || '—'} />
              <InfoCell label="שיטת משלוח" value={settings.shipping_method === 'air' ? 'אוויר' : 'ים'} />
            </div>
          </div>

          {/* Products table */}
          <div style={{ marginBottom: 24 }}>
            <SectionTitle>פירוט פריטים</SectionTitle>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #d1d5db' }}>
                  <Th>שם פריט</Th>
                  <Th>קוד</Th>
                  <Th>HS</Th>
                  <Th>כמות</Th>
                  <Th>FOB ליח׳ $</Th>
                  <Th>FOB סה״כ $</Th>
                  <Th>CBM סה״כ</Th>
                  <Th>מכס %</Th>
                  <Th>עלות יח׳ ₪</Th>
                </tr>
              </thead>
              <tbody>
                {calced.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <Td>{p.name}</Td>
                    <Td mono>{p.item_no || '—'}</Td>
                    <Td mono>{p.hs_code || '—'}</Td>
                    <Td>{n(p.qty)}</Td>
                    <Td>${n(p.fob_price, 2)}</Td>
                    <Td>${n(p._fobTotal, 2)}</Td>
                    <Td>{n(p._productCbm, 4)}</Td>
                    <Td>{n(p.customs_rate_override ?? settings.customs ?? 0, 1)}%</Td>
                    <Td bold>₪{n(p._costPerUnit, 2)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f3f4f6', fontWeight: 700, borderTop: '2px solid #111' }}>
                  <Td colSpan={3}>סה״כ</Td>
                  <Td>{n(totals.qtyTotal)}</Td>
                  <Td></Td>
                  <Td>${n(totals.fobTotal, 2)}</Td>
                  <Td>{n(totals.totalCbm, 4)}</Td>
                  <Td></Td>
                  <Td></Td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Cost breakdown */}
          <div style={{ marginBottom: 24 }}>
            <SectionTitle>סיכום עלויות</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              <BreakdownTable
                title="עלויות במטבע מקור (USD)"
                rows={[
                  ['FOB סה״כ',         `$${n(totals.fobTotal, 2)}`],
                  ['הובלה',             `$${n(totals.freightTotal, 2)}`],
                  ['ביטוח',             `$${n(totals.insuranceTotal, 2)}`],
                  ['CIF סה״כ',         `$${n(totals.cifTotal, 2)}`],
                ]}
              />
              <BreakdownTable
                title="עלויות במטבע יעד (ILS)"
                rows={[
                  ['CIF × שער',         `₪${n(totals.cifTotal * rate, 2)}`],
                  ['מכס',               `₪${n(totals.customsIlsTotal, 2)}`],
                  ['מס קניה',           `₪${n(totals.purchaseTaxIlsTotal, 2)}`],
                  ['מע״מ',              `₪${n(totals.vatIlsTotal, 2)}`],
                  ['עמלת סוכן מכס',     `₪${n(totals.agentIlsTotal, 2)}`],
                  ['אגרות נמל',         `₪${n(totals.portIlsTotal, 2)}`],
                  ['הובלה מקומית IL',   `₪${n(totals.transportIlsTotal, 2)}`],
                  ['הובלה מקומית סין',  `₪${n(totals.chinaIlsTotal, 2)}`],
                ]}
              />
            </div>
            <div style={{
              marginTop: 16, padding: 14, background: '#fef3c7', border: '2px solid #f59e0b',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>סה״כ עלות נחיתה לכלל המשלוח</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#92400e' }}>₪{n(totals.landedIlsTotal, 2)}</div>
              </div>
              <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>
                שווה ערך ${n(totals.landedUsdTotal, 2)} בשער {rate.toFixed(3)}
              </div>
            </div>
          </div>

          {/* Methodology footer */}
          <div style={{
            marginTop: 28, padding: 14,
            background: '#f9fafb', borderTop: '1px solid #d1d5db',
            fontSize: 10, color: '#6b7280', lineHeight: 1.6,
          }}>
            <strong>שיטת חישוב:</strong> בסיס CIF לפי תקנות מכס ישראל. מכס = CIF × שער × שיעור%, מס קניה לפי קודי HS,
            בסיס מע״מ = CIF × שער + מכס + מס קניה. עמלת סוכן מתחלקת לפי שווי FOB; הובלה ואגרות נמל לפי נפח (CBM).
            <br />
            <strong>הערה למקבל המסמך:</strong> מסמך עבודה זה אינו תחליף לחישוב הרשמי של עמיל המכס. הנתונים בו מבוססים
            על הנתונים שהוזנו ל-Importly על-ידי היבואן. בקש מסמכים תומכים (חשבונית מסחרית, רשימת אריזה, שטר מטען) לאימות.
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden; }
          .export-doc, .export-doc * { visibility: visible; }
          .export-doc { position: absolute; inset: 0; box-shadow: none; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── Local helpers ────────────────────────────────────────────────────────────

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

function InfoCell({ label, value }) {
  return (
    <div>
      <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: '#111', fontWeight: 600, marginTop: 2 }}>{value}</div>
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

function BreakdownTable({ title, rows }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, paddingInlineStart: 4 }}>
        {title}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '5px 8px', color: '#374151' }}>{k}</td>
              <td style={{ padding: '5px 8px', textAlign: 'left', fontFamily: 'monospace', color: '#111' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
