import React, { useState, useMemo } from 'react';
import { Plus, Upload, Edit2, Trash2, ExternalLink, Sparkles, FolderOpen } from 'lucide-react';
import { calcProducts, calcTotals } from '../lib/calculations';
import { classifyHsCode } from '../lib/hsClassify';
import ProductForm from './ProductForm';
import FileUpload from './FileUpload';

function fmt(n, d = 0) {
  return Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

const HEADERS = [
  '#', 'שם מוצר', 'קוד HS', 'כמות',
  'FOB/יח׳ ($)', 'FOB סה״כ ($)', 'הובלה ($)', 'ביטוח ($)',
  'CIF ($)', 'מכס ($)', 'לפני מע״מ ($)', 'מע״מ ($)',
  'עלות מחסן $', 'עלות מחסן ₪', 'עלות מחסן/יח׳ ₪', 'מחיר מכירה/יח׳ ₪',
  'רווח/יח׳ ₪', 'רווח כולל ₪', 'פעולות',
];

export default function ProductsPage({ products, settings, showToast, addProduct, updateProduct, deleteProduct, addProducts, activeProject, setPage }) {
  const [showForm, setShowForm]           = useState(false);
  const [editProd, setEditProd]           = useState(null);
  const [showUpload, setShowUpload]       = useState(false);
  const [confirmDel, setConfirmDel]       = useState(null);
  const [classifyingId, setClassifyingId] = useState(null);
  // { id, result:{hs_code,customs_rate,explanation}, agentHsCode, agentCustomsRate } | { id, error }
  const [classifyPopup, setClassifyPopup] = useState(null);

  const calced = useMemo(() => calcProducts(products, settings), [products, settings]);
  const totals  = useMemo(() => calcTotals(calced), [calced]);

  function openEdit(p) { setEditProd(p); setShowForm(true); }
  function openAdd()   { setEditProd(null); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditProd(null); }

  async function handleSave(data) {
    const ok = editProd ? await updateProduct(editProd.id, data) : await addProduct(data);
    if (ok) closeForm();
  }

  async function handleDelete(id) {
    if (confirmDel === id) {
      setConfirmDel(null);
      await deleteProduct(id);
    } else {
      setConfirmDel(id);
      setTimeout(() => setConfirmDel(c => c === id ? null : c), 3000);
    }
  }

  async function handleClassifyInline(p) {
    if (classifyPopup?.id === p.id && !classifyingId) { setClassifyPopup(null); return; }
    setClassifyingId(p.id);
    setClassifyPopup(null);
    try {
      const result = await classifyHsCode(p.name, p.notes, settings?.api_key);
      setClassifyPopup({ id: p.id, result, agentHsCode: '', agentCustomsRate: '' });
    } catch (err) {
      setClassifyPopup({ id: p.id, error: err.message });
    } finally {
      setClassifyingId(null);
    }
  }

  function setAgentField(key, value) {
    setClassifyPopup(prev => ({ ...prev, [key]: value }));
  }

  // Recompute landed cost in ILS for a given customs rate%, holding everything else constant.
  function computeLandedIls(p, customsRatePct) {
    const customs   = p._cif * (Number(customsRatePct) / 100);
    const beforeVat = p._cif + customs;
    const vat       = beforeVat * (Number(settings?.vat ?? 18) / 100);
    return (beforeVat + vat + p._agentShare) * Number(settings?.usd_rate ?? 3.7);
  }

  async function saveAsAi(p) {
    const { result } = classifyPopup;
    const ok = await updateProduct(p.id, { hs_code: result.hs_code, customs_rate_override: result.customs_rate });
    if (ok) { showToast(`AI: HS ${result.hs_code} נשמר`); setClassifyPopup(null); }
  }

  async function saveAsAgent(p) {
    const { result, agentHsCode, agentCustomsRate } = classifyPopup;
    const hs = agentHsCode.trim() || result.hs_code;
    const ok = await updateProduct(p.id, { hs_code: hs, customs_rate_override: Number(agentCustomsRate) });
    if (ok) { showToast(`עמיל מכס: HS ${hs} נשמר`); setClassifyPopup(null); }
  }

  // ── Inner components (defined inside so they close over state/handlers) ──

  function HsCell({ p }) {
    const busy = classifyingId === p.id;
    const open = classifyPopup?.id === p.id && !busy;
    return (
      <div className="hs-cell">
        {p.hs_code && <span className="hs-code-text">{p.hs_code}</span>}
        <div className="hs-cell-actions">
          <button
            className={`btn btn-sm btn-classify-inline${open ? ' active' : ''}`}
            onClick={() => handleClassifyInline(p)}
            disabled={busy}
            title="סווג עם AI"
          >
            {busy ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : <Sparkles size={11} />}
            סווג
          </button>
          <a
            href={p.hs_code ? `https://nfx.co.il/tariff/import/${p.hs_code}` : 'https://nfx.co.il'}
            target="_blank" rel="noopener noreferrer"
            className="btn btn-sm" title="פתח בטריף ישראלי"
          >
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    );
  }

  function ComparisonPanel({ p, inCard = false }) {
    if (classifyPopup?.id !== p.id) return null;
    const { error, result, agentHsCode, agentCustomsRate } = classifyPopup;

    if (error) {
      return (
        <div className={inCard ? 'cc-panel cc-panel-card' : 'cc-panel'}>
          <div className="classify-inline-error">
            <span>{error}</span>
            <button className="btn btn-sm" onClick={() => setClassifyPopup(null)}>✕</button>
          </div>
        </div>
      );
    }

    const hasAgentRate   = agentCustomsRate !== '';
    const aiLanded       = computeLandedIls(p, result.customs_rate);
    const agentLanded    = hasAgentRate ? computeLandedIls(p, agentCustomsRate) : null;
    const diff           = hasAgentRate ? agentLanded - aiLanded : null;
    const diffPositive   = diff !== null && diff > 0;
    const diffNegative   = diff !== null && diff < 0;

    return (
      <div className={inCard ? 'cc-panel cc-panel-card' : 'cc-panel'}>
        <div className="cc-body">
          <table className="cc-table">
            <thead>
              <tr>
                <th>מקור</th>
                <th>קוד HS</th>
                <th>מכס %</th>
                <th>Landed ₪</th>
              </tr>
            </thead>
            <tbody>
              {/* AI row */}
              <tr className="cc-row-ai">
                <td><span className="cc-source-badge cc-badge-ai">AI</span></td>
                <td><span className="mono cc-code">{result.hs_code}</span></td>
                <td>{result.customs_rate}%</td>
                <td className="cc-val">₪{fmt(aiLanded)}</td>
              </tr>

              {/* Agent row — inputs */}
              <tr className="cc-row-agent">
                <td><span className="cc-source-badge cc-badge-agent">עמיל</span></td>
                <td>
                  <input
                    className="cc-input"
                    value={agentHsCode}
                    onChange={e => setAgentField('agentHsCode', e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="00000000"
                    dir="ltr"
                    style={{ fontFamily: 'monospace', letterSpacing: 1 }}
                  />
                </td>
                <td>
                  <input
                    className="cc-input"
                    type="number"
                    value={agentCustomsRate}
                    onChange={e => setAgentField('agentCustomsRate', e.target.value)}
                    placeholder="0"
                    min="0" max="200" step="0.5"
                  />
                </td>
                <td className="cc-val">
                  {hasAgentRate ? `₪${fmt(agentLanded)}` : <span className="text-muted">—</span>}
                </td>
              </tr>

              {/* Diff row */}
              {hasAgentRate && (
                <tr className="cc-row-diff">
                  <td colSpan={3} className="cc-diff-label">הפרש בעלות ממונפת</td>
                  <td className={`cc-diff-val ${diffPositive ? 'cc-more' : diffNegative ? 'cc-less' : 'cc-same'}`}>
                    {diff > 0 ? '+' : ''}{fmt(diff)} ₪
                    <span className="cc-diff-note">
                      {diffPositive ? ' · עמיל יקר יותר' : diffNegative ? ' · עמיל זול יותר' : ' · זהה'}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {result.explanation && (
            <div className="cc-explanation">{result.explanation}</div>
          )}
        </div>

        <div className="cc-actions">
          <button className="btn btn-sm btn-success" onClick={() => saveAsAi(p)}>
            שמור לפי AI
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => saveAsAgent(p)} disabled={!hasAgentRate}>
            שמור לפי עמיל
          </button>
          <button className="btn btn-sm" onClick={() => setClassifyPopup(null)}>ביטול</button>
        </div>
      </div>
    );
  }

  // ── Render ──

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            מוצרים{activeProject ? ` — ${activeProject.name}` : ''}
          </h1>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setShowUpload(true)} disabled={!activeProject}>
            <Upload size={15} /> ייבוא קובץ
          </button>
          <button className="btn btn-primary" onClick={openAdd} disabled={!activeProject}>
            <Plus size={15} /> הוסף מוצר
          </button>
        </div>
      </div>

      <div className="page-body">
        {!activeProject ? (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <div className="empty-text">לא נבחר פרויקט</div>
            <div className="empty-hint">בחר פרויקט מעמוד הפרויקטים כדי להציג ולנהל מוצרים</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPage('projects')}>
              <FolderOpen size={15} /> לפרויקטים
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-text">אין מוצרים בפרויקט זה</div>
            <div className="empty-hint">הוסף מוצר ידנית או ייבא קובץ Excel / PDF / תמונה</div>
          </div>
        ) : (
          <>
            {/* ── Desktop table ── */}
            <div className="desktop-only">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>{HEADERS.map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {calced.map((p, idx) => (
                      <React.Fragment key={p.id}>
                        <tr>
                          <td className="text-muted" style={{ textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ fontWeight: 500 }}>{p.name}</td>
                          <td style={{ minWidth: 130 }}><HsCell p={p} /></td>
                          <td className="td-num">{fmt(p.qty)}</td>
                          <td className="td-usd">${fmt(p.fob_price, 2)}</td>
                          <td className="td-usd">${fmt(p._fobTotal, 2)}</td>
                          <td className="td-usd">${fmt(p._freightShare, 2)}</td>
                          <td className="td-usd">${fmt(p._insuranceAmount, 2)}</td>
                          <td className="td-usd">${fmt(p._cif, 2)}</td>
                          <td className="td-usd">${fmt(p._customsAmount, 2)}</td>
                          <td className="td-usd">${fmt(p._beforeVat, 2)}</td>
                          <td className="td-usd">${fmt(p._vatAmount, 2)}</td>
                          <td className="td-usd" style={{ fontWeight: 600 }}>${fmt(p._landedCostUsd, 2)}</td>
                          <td className="td-ils" style={{ fontWeight: 600 }}>₪{fmt(p._landedCostIls)}</td>
                          <td className="td-ils">₪{fmt(p._costPerUnit)}</td>
                          <td className="td-sell">₪{fmt(p._sellPerUnit)}</td>
                          <td className="td-profit">₪{fmt(p._profitPerUnit)}</td>
                          <td className="td-profit" style={{ fontWeight: 600 }}>₪{fmt(p._profit)}</td>
                          <td>
                            <div className="flex gap-2">
                              <button className="btn btn-sm" onClick={() => openEdit(p)} title="ערוך"><Edit2 size={13} /></button>
                              <button
                                className={`btn btn-sm ${confirmDel === p.id ? 'btn-danger' : ''}`}
                                onClick={() => handleDelete(p.id)}
                                title={confirmDel === p.id ? 'לחץ שוב לאישור מחיקה' : 'מחק'}
                              >
                                <Trash2 size={13} />
                                {confirmDel === p.id && <span>אישור?</span>}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Comparison expand row */}
                        {classifyPopup?.id === p.id && (
                          <tr className="cc-expand-row">
                            <td colSpan={HEADERS.length} style={{ padding: 0 }}>
                              <ComparisonPanel p={p} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td></td>
                      <td>סה״כ ({products.length} מוצרים)</td>
                      <td></td>
                      <td className="td-num">{fmt(totals.qtyTotal)}</td>
                      <td></td>
                      <td className="td-usd">${fmt(totals.fobTotal, 2)}</td>
                      <td className="td-usd">${fmt(totals.freightTotal, 2)}</td>
                      <td className="td-usd">${fmt(totals.insuranceTotal, 2)}</td>
                      <td className="td-usd">${fmt(totals.cifTotal, 2)}</td>
                      <td className="td-usd">${fmt(totals.customsTotal, 2)}</td>
                      <td className="td-usd">${fmt(totals.beforeVatTotal, 2)}</td>
                      <td className="td-usd">${fmt(totals.vatTotal, 2)}</td>
                      <td className="td-usd">${fmt(totals.landedUsdTotal, 2)}</td>
                      <td className="td-ils">₪{fmt(totals.landedIlsTotal)}</td>
                      <td></td><td></td><td></td>
                      <td className="td-profit" style={{ fontWeight: 600 }}>₪{fmt(totals.profitTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── Mobile card view ── */}
            <div className="mobile-only">
              <div className="mobile-totals">
                <div className="mobile-totals-title">סה״כ — {products.length} מוצרים</div>
                <div className="pc-item">
                  <span className="pc-label">FOB סה״כ</span>
                  <span className="pc-value td-usd">${fmt(totals.fobTotal, 2)}</span>
                </div>
                <div className="pc-item">
                  <span className="pc-label">Landed ₪</span>
                  <span className="pc-value td-ils">₪{fmt(totals.landedIlsTotal)}</span>
                </div>
                <div className="pc-item">
                  <span className="pc-label">מחיר מכירה ₪</span>
                  <span className="pc-value td-sell">₪{fmt(totals.sellTotal)}</span>
                </div>
                <div className="pc-item">
                  <span className="pc-label">רווח כולל ₪</span>
                  <span className="pc-value td-profit">₪{fmt(totals.profitTotal)}</span>
                </div>
              </div>

              <div className="product-cards-list">
                {calced.map((p, idx) => (
                  <div key={p.id} className="product-card">
                    <div className="product-card-header">
                      <span className="product-card-name">{p.name}</span>
                      <span className="product-card-num">#{idx + 1}</span>
                    </div>
                    <div className="product-card-grid">
                      <div className="pc-item">
                        <span className="pc-label">כמות</span>
                        <span className="pc-value">{fmt(p.qty)}</span>
                      </div>
                      <div className="pc-item">
                        <span className="pc-label">FOB סה״כ</span>
                        <span className="pc-value td-usd">${fmt(p._fobTotal, 2)}</span>
                      </div>
                      <div className="pc-item">
                        <span className="pc-label">Landed $</span>
                        <span className="pc-value td-usd">${fmt(p._landedCostUsd, 2)}</span>
                      </div>
                      <div className="pc-item">
                        <span className="pc-label">Landed ₪</span>
                        <span className="pc-value td-ils">₪{fmt(p._landedCostIls)}</span>
                      </div>
                      <div className="pc-item">
                        <span className="pc-label">מחיר מכירה/יח׳</span>
                        <span className="pc-value td-sell">₪{fmt(p._sellPerUnit)}</span>
                      </div>
                      <div className="pc-item">
                        <span className="pc-label">רווח כולל ₪</span>
                        <span className="pc-value td-profit">₪{fmt(p._profit)}</span>
                      </div>
                    </div>

                    {/* HS row */}
                    <div className="mobile-hs-row">
                      {p.hs_code && <span className="hs-code-text">{p.hs_code}</span>}
                      <div className="hs-cell-actions">
                        <button
                          className={`btn btn-sm btn-classify-inline${classifyPopup?.id === p.id && !classifyingId ? ' active' : ''}`}
                          onClick={() => handleClassifyInline(p)}
                          disabled={classifyingId === p.id}
                        >
                          {classifyingId === p.id
                            ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
                            : <Sparkles size={11} />}
                          סווג
                        </button>
                        <a
                          href={p.hs_code ? `https://nfx.co.il/tariff/import/${p.hs_code}` : 'https://nfx.co.il'}
                          target="_blank" rel="noopener noreferrer"
                          className="btn btn-sm"
                        >
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>

                    {/* Comparison panel inside card */}
                    <ComparisonPanel p={p} inCard />

                    <div className="product-card-footer">
                      <button className="btn btn-sm" onClick={() => openEdit(p)} title="ערוך"><Edit2 size={13} /></button>
                      <button
                        className={`btn btn-sm ${confirmDel === p.id ? 'btn-danger' : ''}`}
                        onClick={() => handleDelete(p.id)}
                        title={confirmDel === p.id ? 'לחץ שוב לאישור מחיקה' : 'מחק'}
                      >
                        <Trash2 size={13} />
                        {confirmDel === p.id && <span>אישור?</span>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <ProductForm product={editProd} onSave={handleSave} onClose={closeForm} settings={settings} />
      )}
      {showUpload && (
        <FileUpload settings={settings} onSave={addProducts} onClose={() => setShowUpload(false)} showToast={showToast} />
      )}
    </div>
  );
}
