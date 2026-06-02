import React, { useEffect, useState, useMemo } from 'react';
import { ShieldCheck, AlertTriangle, Check, FileSearch } from 'lucide-react';
import { loadShipments } from '../lib/shipments';

// ─────────────────────────────────────────────────────────────────────────────
//  DocVerificationPanel — side-by-side cross-check of:
//    Invoice (computed from products table)
//    Packing list (computed from products' packing-list-sourced fields)
//    Bill of Lading (declared_* columns on the shipments table)
//
//  Customs-broker sanity check before submitting the file: catches
//  miscounted pieces, missing cartons, CBM mismatch (often a clue that the
//  shipper packed differently than promised), and weight discrepancies
//  that trigger customs flags.
// ─────────────────────────────────────────────────────────────────────────────

function n(v, d = 0) {
  if (v == null || v === '' || !Number.isFinite(Number(v))) return '—';
  return Number(v).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Returns 'match' | 'mismatch' | 'missing'
function compareNumeric(a, b, tolerancePct = 5) {
  const na = Number(a); const nb = Number(b);
  if (!Number.isFinite(na) || na === 0 || !Number.isFinite(nb) || nb === 0) return 'missing';
  const diffPct = Math.abs(na - nb) / Math.max(na, nb) * 100;
  return diffPct <= tolerancePct ? 'match' : 'mismatch';
}

function compareString(a, b) {
  const sa = String(a || '').trim().toLowerCase();
  const sb = String(b || '').trim().toLowerCase();
  if (!sa || !sb) return 'missing';
  // Tolerant: substring match either way (handles "Ningbo, CN" vs "NINGBO")
  if (sa === sb) return 'match';
  const cleanA = sa.replace(/[,.\s]+/g, '');
  const cleanB = sb.replace(/[,.\s]+/g, '');
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return 'match';
  return 'mismatch';
}

function StatusDot({ status }) {
  const color = status === 'match' ? 'var(--green)'
              : status === 'mismatch' ? 'var(--red)'
              : 'var(--text3)';
  const Icon = status === 'match' ? Check
             : status === 'mismatch' ? AlertTriangle
             : null;
  return Icon ? <Icon size={13} style={{ color }} /> : <span style={{ color, fontSize: 12 }}>—</span>;
}

function Row({ label, invoice, packing, bl, compare = 'numeric', unit = '', tolerancePct = 5 }) {
  // Determine status pairs
  const invoiceVsBl = compare === 'string'
    ? compareString(invoice, bl)
    : compareNumeric(invoice, bl, tolerancePct);
  const packingVsBl = compare === 'string'
    ? compareString(packing, bl)
    : compareNumeric(packing, bl, tolerancePct);

  const worst = [invoiceVsBl, packingVsBl].includes('mismatch') ? 'mismatch'
              : [invoiceVsBl, packingVsBl].includes('match') ? 'match'
              : 'missing';

  return (
    <tr style={{
      borderBottom: '1px solid var(--border)',
      background: worst === 'mismatch' ? 'rgba(239,68,68,0.06)' : 'transparent',
    }}>
      <td style={{ padding: '8px 6px', fontWeight: 600 }}>
        <StatusDot status={worst} /> {label}
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'left', fontFamily: 'monospace' }}>
        {compare === 'numeric' ? `${n(invoice)} ${unit}`.trim() : (invoice || '—')}
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'left', fontFamily: 'monospace' }}>
        {compare === 'numeric' ? `${n(packing)} ${unit}`.trim() : (packing || '—')}
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'left', fontFamily: 'monospace' }}>
        {compare === 'numeric' ? `${n(bl)} ${unit}`.trim() : (bl || '—')}
      </td>
    </tr>
  );
}

export default function DocVerificationPanel({ activeProjectId, products, settings }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (!activeProjectId) return;
    setLoading(true);
    loadShipments(activeProjectId)
      .then(setShipments)
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  }, [activeProjectId]);

  // Pick the most relevant shipment row (the one with declared totals;
  // if multiple, pick the one with most declared fields filled).
  const bl = useMemo(() => {
    if (!shipments.length) return null;
    const scored = shipments.map(s => ({
      s,
      score: ['declared_pieces','declared_packages','declared_cbm','declared_weight_kg']
        .reduce((n, k) => n + (s[k] ? 1 : 0), 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].score > 0 ? scored[0].s : shipments[0];
  }, [shipments]);

  // Invoice totals — computed from products table
  const invoice = useMemo(() => {
    let pieces = 0, cbm = 0, weight = 0, fobUsd = 0;
    for (const p of products) {
      const q = Number(p.qty) || 0;
      pieces += q;
      cbm    += q * (Number(p.cbm) || 0);
      weight += q * (Number(p.gross_weight_kg) || 0);
      fobUsd += q * (Number(p.fob_price) || 0);
    }
    return {
      pieces,
      cbm,
      weight,
      fobUsd,
      supplier:  products[0]?.supplier || settings?.supplier || '',
      origin:    settings?.origin_port || '',
      incoterms: settings?.incoterms || '',
    };
  }, [products, settings]);

  // Packing list totals — for now derived from the same product rows but
  // using only the dimensions that were stamped by the packing-list extract
  // (we store gross_weight_kg/box_l/w/h from packing). Same numbers as
  // invoice when packing list wasn't uploaded.
  const packing = useMemo(() => {
    let pieces = 0, cbm = 0, weight = 0;
    let packages = 0;
    for (const p of products) {
      const q = Number(p.qty) || 0;
      pieces += q;
      cbm    += q * (Number(p.cbm) || 0);
      weight += q * (Number(p.gross_weight_kg) || 0);
      // Estimate cartons: if box dims known, assume one carton per unit (we
      // don't store packing-list cartons separately yet); else leave 0.
      // This is a placeholder until cartons-per-product is tracked.
    }
    return { pieces, cbm, weight, packages, supplier: invoice.supplier };
  }, [products, invoice.supplier]);

  if (!activeProjectId) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <FileSearch size={18} style={{ color: 'var(--violet)' }} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>אימות מסמכים — חשבונית ↔ אריזה ↔ שטר מטען</span>
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>
          סבולת 5% למספרים. שורות שונות מסומנות באדום.
        </span>
      </div>

      {!bl ? (
        <div style={{ color: 'var(--text3)', fontSize: 12, padding: 10 }}>
          {loading ? 'טוען...' : 'אין שטר מטען בפרויקט. העלה BL / שטר אווירי דרך טאב המסמכים והרץ "חלץ הכול" כדי להפעיל את האימות.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>שדה</th>
                <th style={{ padding: '8px 6px', textAlign: 'left', color: '#3b82f6' }}>חשבונית</th>
                <th style={{ padding: '8px 6px', textAlign: 'left', color: '#10b981' }}>אריזה</th>
                <th style={{ padding: '8px 6px', textAlign: 'left', color: '#f59e0b' }}>שטר מטען (BL)</th>
              </tr>
            </thead>
            <tbody>
              <Row label="סך יחידות (PCS)"
                invoice={invoice.pieces} packing={packing.pieces} bl={bl.declared_pieces}
                unit="" tolerancePct={2} />
              <Row label="סך קרטונים / חבילות"
                invoice={packing.packages || invoice.pieces}
                packing={packing.packages || invoice.pieces}
                bl={bl.declared_packages} unit="" />
              <Row label="נפח כולל (CBM)"
                invoice={invoice.cbm} packing={packing.cbm} bl={bl.declared_cbm}
                unit="m³" tolerancePct={5} />
              <Row label="משקל ברוטו (KG)"
                invoice={invoice.weight} packing={packing.weight} bl={bl.declared_weight_kg}
                unit="kg" tolerancePct={5} />
              <Row label="שווי מוצהר (USD)"
                invoice={invoice.fobUsd} packing="" bl={bl.declared_value_usd}
                unit="$" tolerancePct={2} />
              <Row label="ספק"
                invoice={invoice.supplier} packing={packing.supplier}
                bl={bl.carrier ? '' : ''} compare="string" />
              <Row label="נמל מוצא"
                invoice={invoice.origin} packing="" bl={bl.origin_port}
                compare="string" />
            </tbody>
          </table>

          <div style={{ marginTop: 10, padding: 10, background: 'var(--bg2)', borderRadius: 6, fontSize: 11, color: 'var(--text2)' }}>
            <ShieldCheck size={12} style={{ color: 'var(--violet)', marginInlineEnd: 4 }} />
            הסבר: ירוק = תואם בסבולת. אדום = פער מעבר ל-5% (CBM/משקל) או 2% (יחידות/שווי). אפור = נתון חסר במסמך.
            אם משקל ה-BL נמוך מהחשבונית, סביר שהספק לא כלל את משקל האריזה — בדוק עם הפורווארדר.
          </div>
        </div>
      )}
    </div>
  );
}
