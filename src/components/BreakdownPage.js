import React, { useMemo } from 'react';
import { FolderOpen } from 'lucide-react';
import { calcProducts, calcTotals, fmt } from '../lib/calculations';

function fmtN(n, d = 0) {
  return Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function BreakdownPage({ products, settings, activeProject, setPage }) {
  const calced = useMemo(() => calcProducts(products, settings), [products, settings]);
  const totals = useMemo(() => calcTotals(calced), [calced]);

  // Cost structure percentages (in USD for comparability)
  const totalUsd    = totals.landedUsdTotal || 1;
  const fobPct      = totals.fobTotal       / totalUsd * 100;
  const freInsPct   = (totals.freightTotal + totals.insuranceTotal) / totalUsd * 100;
  const custAgntPct = (totals.customsTotal  + totals.agentTotal)    / totalUsd * 100;

  if (!activeProject) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">פירוט מלא</h1></div>
        <div className="page-body">
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <div className="empty-text">לא נבחר פרויקט</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPage && setPage('projects')}>
              <FolderOpen size={15} /> לפרויקטים
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">פירוט מלא — {activeProject.name}</h1>
          {activeProject.supplier && <div className="text-sm text-muted" style={{ marginTop: 2 }}>ספק: {activeProject.supplier}</div>}
        </div>
      </div>

      <div className="page-body">
        {/* VAT notice */}
        <div className="vat-notice">
          💡 מע״מ ({settings.vat}%) מוצג לעיון בלבד — <strong>אינו נכלל</strong> בחישוב עלות המחסן.
          כיצרן/יבואן רשום, תקבל חזרה על המע״מ. הערכת החזר: כ-{fmt.ils(totals.vatTotal * Number(settings.usd_rate || 3.7))}.
        </div>

        {/* Cost structure cards */}
        {products.length > 0 && (
          <div className="cost-structure-cards">
            <div className="cost-struct-card">
              <div className="cost-struct-label">רכיב FOB</div>
              <div className="cost-struct-pct" style={{ color: 'var(--blue)' }}>{fmtN(fobPct, 1)}%</div>
              <div className="cost-struct-abs">{fmt.usd(totals.fobTotal)}</div>
            </div>
            <div className="cost-struct-card">
              <div className="cost-struct-label">הובלה + ביטוח</div>
              <div className="cost-struct-pct" style={{ color: 'var(--purple)' }}>{fmtN(freInsPct, 1)}%</div>
              <div className="cost-struct-abs">{fmt.usd(totals.freightTotal + totals.insuranceTotal)}</div>
            </div>
            <div className="cost-struct-card">
              <div className="cost-struct-label">מכס + עמלת סוכן</div>
              <div className="cost-struct-pct" style={{ color: 'var(--gold)' }}>{fmtN(custAgntPct, 1)}%</div>
              <div className="cost-struct-abs">{fmt.usd(totals.customsTotal + totals.agentTotal)}</div>
            </div>
          </div>
        )}

        {/* Full breakdown table */}
        {products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-text">אין מוצרים בפרויקט זה</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>שם מוצר</th>
                  <th>כמות</th>
                  <th>FOB/יח׳ $</th>
                  <th>FOB סה״כ $</th>
                  <th>הובלה $</th>
                  <th>ביטוח $</th>
                  <th>CIF $</th>
                  <th>מכס %</th>
                  <th>מכס $</th>
                  <th>לפני מע״מ $</th>
                  <th style={{ color: 'var(--gold)', opacity: 0.7 }}>מע״מ $ ⁽¹⁾</th>
                  <th>עמלת סוכן $</th>
                  <th>עלות מחסן/יח׳ ₪</th>
                  <th>Breakeven ₪</th>
                  <th>מחיר מכירה/יח׳ ₪</th>
                  <th>רווח/יח׳ ₪</th>
                  <th>ROI %</th>
                </tr>
              </thead>
              <tbody>
                {calced.map((p, idx) => {
                  const customsRateDisplay = p.customs_rate_override != null && p.customs_rate_override !== ''
                    ? Number(p.customs_rate_override)
                    : Number(settings.customs);
                  return (
                    <tr key={p.id}>
                      <td className="td-muted">{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="td-num">{fmtN(p.qty)}</td>
                      <td className="td-usd">${fmtN(p.fob_price, 2)}</td>
                      <td className="td-usd">${fmtN(p._fobTotal, 2)}</td>
                      <td className="td-usd">${fmtN(p._freightShare, 2)}</td>
                      <td className="td-usd">${fmtN(p._insuranceAmount, 2)}</td>
                      <td className="td-usd">${fmtN(p._cif, 2)}</td>
                      <td>{customsRateDisplay}%</td>
                      <td className="td-usd">${fmtN(p._customsAmount, 2)}</td>
                      <td className="td-usd">${fmtN(p._beforeVat, 2)}</td>
                      <td style={{ color: 'var(--gold)', opacity: 0.6 }}>${fmtN(p._vatAmount, 2)}</td>
                      <td className="td-usd">${fmtN(p._agentShare, 2)}</td>
                      <td className="td-ils" style={{ fontWeight: 700 }}>{fmt.ils(p._costPerUnit)}</td>
                      <td className="td-ils">{fmt.ils(p._breakevenUnit)}</td>
                      <td className="td-sell">{fmt.ils(p._sellPerUnit)}</td>
                      <td className="td-profit">{fmt.ils(p._profitPerUnit)}</td>
                      <td style={{ color: p._roi >= 15 ? 'var(--green)' : p._roi >= 5 ? 'var(--gold)' : 'var(--red)' }}>
                        {fmtN(p._roi, 1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>סה״כ ({products.length} פריטים)</td>
                  <td className="td-usd">${fmtN(totals.fobTotal, 2)}</td>
                  <td className="td-usd">${fmtN(totals.freightTotal, 2)}</td>
                  <td className="td-usd">${fmtN(totals.insuranceTotal, 2)}</td>
                  <td className="td-usd">${fmtN(totals.cifTotal, 2)}</td>
                  <td></td>
                  <td className="td-usd">${fmtN(totals.customsTotal, 2)}</td>
                  <td className="td-usd">${fmtN(totals.beforeVatTotal, 2)}</td>
                  <td style={{ opacity: 0.6 }}>${fmtN(totals.vatTotal, 2)}</td>
                  <td className="td-usd">${fmtN(totals.agentTotal, 2)}</td>
                  <td className="td-ils">{fmt.ils(totals.landedIlsTotal)}</td>
                  <td></td>
                  <td className="td-sell">{fmt.ils(totals.sellTotal)}</td>
                  <td className="td-profit">{fmt.ils(totals.profitTotal)}</td>
                  <td style={{ color: 'var(--green)' }}>{fmtN(totals.roiTotal, 1)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {products.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
            ⁽¹⁾ מע״מ מוצג לעיון בלבד — אינו נכלל בחישוב עלות המחסן.
          </div>
        )}
      </div>
    </div>
  );
}
