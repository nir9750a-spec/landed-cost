import React, { useState, useMemo } from 'react';
import { AlertTriangle, Check, Sparkles } from 'lucide-react';
import {
  detectCbmAnomalies,
  detectMissingWeights,
  estimateWeights,
  applyCbmFix,
  applyWeightFix,
} from '../lib/dataQuality';

export default function DataQualityPanel({ allProducts = [], projects = [], showToast }) {
  const [cbmChoices, setCbmChoices]     = useState({}); // { productId: suggestionIndex }
  const [cbmCustom, setCbmCustom]       = useState({}); // { productId: userTypedValue }
  const [cbmApplyingIds, setCbmApplyingIds] = useState(new Set());

  const [weightEstimates, setWeightEstimates] = useState({}); // { productId: { kg, confidence, reasoning } }
  const [weightApplyingIds, setWeightApplyingIds] = useState(new Set());
  const [weightOverrides, setWeightOverrides] = useState({}); // { productId: userTypedKg }
  const [estimating, setEstimating]       = useState(false);
  const [estimateError, setEstimateError] = useState('');

  const cbmAnomalies   = useMemo(() => detectCbmAnomalies(allProducts), [allProducts]);
  const missingWeights = useMemo(() => detectMissingWeights(allProducts), [allProducts]);

  const projectName = (id) => projects.find(p => p.id === id)?.name || '—';

  // ── CBM fix ────────────────────────────────────────────────────────────

  function chooseCbm(productId, index) {
    setCbmChoices(prev => ({ ...prev, [productId]: index }));
    setCbmCustom(prev => ({ ...prev, [productId]: '' }));
  }

  function typeCustomCbm(productId, value) {
    setCbmCustom(prev => ({ ...prev, [productId]: value }));
    setCbmChoices(prev => ({ ...prev, [productId]: 'custom' }));
  }

  async function applyOneCbmFix(anomaly) {
    const choice = cbmChoices[anomaly.id];
    let newCbm = null;
    if (choice === 'custom') {
      newCbm = Number(cbmCustom[anomaly.id]);
      if (!(newCbm > 0)) { showToast('הזן ערך CBM חיובי', 'error'); return; }
    } else if (typeof choice === 'number') {
      newCbm = anomaly.suggestions[choice]?.newCbm;
    }
    if (!newCbm || newCbm <= 0) { showToast('בחר תיקון או הזן ערך', 'error'); return; }

    setCbmApplyingIds(prev => new Set(prev).add(anomaly.id));
    try {
      await applyCbmFix(anomaly.id, newCbm);
      showToast(`CBM תוקן עבור "${anomaly.name}"`);
      setCbmChoices(prev => { const c = { ...prev }; delete c[anomaly.id]; return c; });
      setCbmCustom(prev => { const c = { ...prev }; delete c[anomaly.id]; return c; });
    } catch (err) {
      showToast('שגיאה בעדכון: ' + err.message, 'error');
    } finally {
      setCbmApplyingIds(prev => { const s = new Set(prev); s.delete(anomaly.id); return s; });
    }
  }

  async function applyAllAutoCbm() {
    const eligible = cbmAnomalies.filter(a => a.suggestions.length > 0 && a.suggestions[0].score >= 0.9);
    if (eligible.length === 0) { showToast('אין תיקונים אוטומטיים בטוחים', 'error'); return; }
    if (!window.confirm(`לתקן אוטומטית ${eligible.length} מוצרים עם הצעה תואמת מאוד?`)) return;
    let success = 0;
    for (const a of eligible) {
      try {
        await applyCbmFix(a.id, a.suggestions[0].newCbm);
        success++;
      } catch {}
    }
    showToast(`${success}/${eligible.length} מוצרים תוקנו`);
  }

  // ── Weight estimation ──────────────────────────────────────────────────

  async function runWeightEstimation() {
    if (missingWeights.length === 0) return;
    setEstimating(true);
    setEstimateError('');
    try {
      const results = await estimateWeights(missingWeights);
      const map = {};
      results.forEach(r => { map[r.id] = r; });
      setWeightEstimates(map);
      showToast(`התקבלו ${results.length} הערכות משקל`);
    } catch (err) {
      setEstimateError(err.message);
      showToast('שגיאה בהערכת משקל: ' + err.message, 'error');
    } finally {
      setEstimating(false);
    }
  }

  function typeWeightOverride(productId, value) {
    setWeightOverrides(prev => ({ ...prev, [productId]: value }));
  }

  async function applyOneWeight(item) {
    const override = weightOverrides[item.id];
    const est      = weightEstimates[item.id];
    const kg = override !== undefined && override !== '' ? Number(override) : est?.estimated_kg;
    if (!(kg > 0)) { showToast('הזן משקל חיובי', 'error'); return; }

    setWeightApplyingIds(prev => new Set(prev).add(item.id));
    try {
      await applyWeightFix(item.id, kg);
      showToast(`משקל נשמר עבור "${item.name}"`);
      setWeightEstimates(prev => { const c = { ...prev }; delete c[item.id]; return c; });
      setWeightOverrides(prev => { const c = { ...prev }; delete c[item.id]; return c; });
    } catch (err) {
      showToast('שגיאה: ' + err.message, 'error');
    } finally {
      setWeightApplyingIds(prev => { const s = new Set(prev); s.delete(item.id); return s; });
    }
  }

  async function applyAllHighConfidenceWeights() {
    const eligible = Object.values(weightEstimates).filter(e =>
      e.confidence === 'high' && e.estimated_kg > 0,
    );
    if (eligible.length === 0) { showToast('אין הערכות בביטחון גבוה', 'error'); return; }
    if (!window.confirm(`לשמור ${eligible.length} הערכות משקל ברמת ביטחון גבוהה?`)) return;
    let success = 0;
    for (const e of eligible) {
      try {
        await applyWeightFix(e.id, e.estimated_kg);
        success++;
      } catch {}
    }
    showToast(`${success}/${eligible.length} משקלים נשמרו`);
    setWeightEstimates({});
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (cbmAnomalies.length === 0 && missingWeights.length === 0) {
    return (
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 20, marginTop: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Check size={18} style={{ color: 'var(--green)' }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>ניקוי נתונים</span>
        </div>
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>
          לא זוהו בעיות איכות נתונים — כל ה-CBM סבירים וכל המשקלים מלאים.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── CBM Anomalies ── */}
      {cbmAnomalies.length > 0 && (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={18} style={{ color: 'var(--orange)' }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                CBM חריג — {cbmAnomalies.length} מוצרים
              </span>
            </div>
            <button
              className="btn btn-sm btn-primary"
              onClick={applyAllAutoCbm}
              disabled={cbmAnomalies.every(a => !a.suggestions[0] || a.suggestions[0].score < 0.9)}
            >
              תיקון אוטומטי לכל הבטוחים
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cbmAnomalies.map(a => {
              const choice = cbmChoices[a.id];
              const isApplying = cbmApplyingIds.has(a.id);
              return (
                <div key={a.id} style={{
                  background: 'var(--bg3)', borderRadius: 8, padding: 12,
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {projectName(a.project_id)} · מק"ט {a.item_no || '—'} · כמות {a.qty}
                      </div>
                    </div>
                    <div style={{ textAlign: 'left', direction: 'ltr' }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>CBM נוכחי</div>
                      <div style={{ fontWeight: 700, color: 'var(--orange)' }}>{a.currentCbm.toLocaleString()} m³</div>
                    </div>
                  </div>

                  {a.suggestions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {a.suggestions.map((s, idx) => (
                        <label key={idx} style={{
                          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                          cursor: 'pointer', padding: 6, borderRadius: 6,
                          background: choice === idx ? 'rgba(168,85,247,0.1)' : 'transparent',
                        }}>
                          <input
                            type="radio"
                            name={`cbm-${a.id}`}
                            checked={choice === idx}
                            onChange={() => chooseCbm(a.id, idx)}
                          />
                          <span style={{ flex: 1 }}>{s.label}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {s.newCbm.toFixed(4)} m³
                          </span>
                          {s.score >= 0.9 && (
                            <span style={{
                              background: 'var(--green)', color: '#000', padding: '1px 6px',
                              borderRadius: 4, fontSize: 10, fontWeight: 700,
                            }}>בטוח</span>
                          )}
                        </label>
                      ))}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <input
                          type="radio"
                          name={`cbm-${a.id}`}
                          checked={choice === 'custom'}
                          onChange={() => chooseCbm(a.id, 'custom')}
                        />
                        <span>ידני:</span>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={cbmCustom[a.id] || ''}
                          onChange={e => typeCustomCbm(a.id, e.target.value)}
                          placeholder="m³ ליחידה"
                          style={{ flex: 1, padding: '4px 8px', borderRadius: 4 }}
                        />
                      </label>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text3)', fontSize: 12, fontStyle: 'italic' }}>
                      לא נמצאה הצעת תיקון אוטומטית — הזן ידנית
                    </div>
                  )}

                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => applyOneCbmFix(a)}
                      disabled={isApplying || (choice === undefined && a.suggestions.length === 0)}
                    >
                      {isApplying ? <span className="spinner" /> : <Check size={13} />}
                      תקן
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Missing Weights ── */}
      {missingWeights.length > 0 && (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={18} style={{ color: 'var(--orange)' }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                משקל ברוטו חסר — {missingWeights.length} מוצרים
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                (קריטי לחישוב משלוח אווירי)
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.keys(weightEstimates).length > 0 && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={applyAllHighConfidenceWeights}
                >
                  שמור הערכות ברמת ביטחון גבוהה
                </button>
              )}
              <button
                className="btn btn-sm"
                onClick={runWeightEstimation}
                disabled={estimating}
              >
                {estimating ? <span className="spinner" /> : <Sparkles size={13} />}
                {estimating ? 'מעריך...' : 'הערך עם AI'}
              </button>
            </div>
          </div>

          {estimateError && (
            <div className="alert alert-warn" style={{ marginBottom: 10, fontSize: 12 }}>
              {estimateError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
            {missingWeights.map(item => {
              const est = weightEstimates[item.id];
              const isApplying = weightApplyingIds.has(item.id);
              const override = weightOverrides[item.id];
              return (
                <div key={item.id} style={{
                  background: 'var(--bg3)', borderRadius: 8, padding: 10,
                  border: '1px solid var(--border)',
                  display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                  gap: 10, alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {projectName(item.project_id)} · {item.item_no || '—'}
                      {item.cbm > 0 && ` · CBM ${item.cbm}`}
                      {item.box_l > 0 && ` · ${item.box_l}×${item.box_w}×${item.box_h} ס"מ`}
                    </div>
                  </div>

                  {est ? (
                    <div style={{ textAlign: 'left', direction: 'ltr', minWidth: 120 }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>הערכת AI</div>
                      <div style={{ fontWeight: 700 }}>
                        {est.estimated_kg ? `${est.estimated_kg} ק"ג` : '—'}
                        <span style={{
                          marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4,
                          background: est.confidence === 'high' ? 'var(--green)' :
                                       est.confidence === 'medium' ? 'var(--orange)' : 'var(--bg2)',
                          color: est.confidence === 'low' ? 'var(--text3)' : '#000',
                          fontWeight: 700,
                        }}>{est.confidence}</span>
                      </div>
                      {est.reasoning && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', maxWidth: 200, direction: 'rtl' }}>
                          {est.reasoning}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text3)', fontSize: 12, fontStyle: 'italic' }}>
                      —
                    </div>
                  )}

                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="ק״ג"
                    value={override !== undefined ? override : (est?.estimated_kg ?? '')}
                    onChange={e => typeWeightOverride(item.id, e.target.value)}
                    style={{ width: 80, padding: '4px 8px', borderRadius: 4 }}
                  />

                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => applyOneWeight(item)}
                    disabled={isApplying || (!est && override === undefined)}
                  >
                    {isApplying ? <span className="spinner" /> : <Check size={13} />}
                    שמור
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
