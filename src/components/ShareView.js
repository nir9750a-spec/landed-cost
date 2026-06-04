import React, { useState } from 'react';
import { Lock, ShieldCheck, FileText, ExternalLink, Download, Package, Ship, AlertCircle } from 'lucide-react';
import { verifyShareAccess, loadShareData } from '../lib/shares';
import { getPublicUrl, CATEGORY_BY_VALUE, fmtSize } from '../lib/files';

// ─────────────────────────────────────────────────────────────────────────────
//  ShareView — public read-only project view for a freight forwarder or
//  customs broker. URL is /share/:token, the recipient must enter the
//  6-digit access code to unlock.
//
//  Renders ONLY the role-filtered fields returned by loadShareData; the
//  raw products/shipments/settings tables are filtered server-trip-time
//  so the recipient never gets margin / sell price / landed cost numbers.
// ─────────────────────────────────────────────────────────────────────────────

function n(v, d = 0) {
  if (v == null || v === '' || !Number.isFinite(Number(v))) return '—';
  return Number(v).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function ShareView({ token }) {
  const [code, setCode]       = useState('');
  const [stage, setStage]     = useState('login');  // login | loading | view | error
  const [error, setError]     = useState('');
  const [data, setData]       = useState(null);

  async function handleUnlock(e) {
    e?.preventDefault?.();
    setError('');
    if (!code.trim() || code.trim().length !== 6) {
      setError('הזן קוד גישה בן 6 ספרות');
      return;
    }
    setStage('loading');
    try {
      const share = await verifyShareAccess(token, code.trim());
      const payload = await loadShareData(share);
      setData({ ...payload, share });
      setStage('view');
    } catch (err) {
      const msg = (
        err.message === 'wrong_code'    ? 'קוד שגוי' :
        err.message === 'share_not_found' ? 'הקישור לא תקין' :
        err.message === 'revoked'        ? 'הקישור בוטל ע״י המשלח' :
        err.message === 'expired'        ? 'הקישור פג תוקף' :
        'שגיאה: ' + err.message
      );
      setError(msg);
      setStage('login');
    }
  }

  // LOGIN STAGE
  if (stage === 'login' || stage === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg1, #0a0e1a)',
        color: 'var(--text, #f3f4f6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, fontFamily: 'Heebo, Arial, sans-serif',
      }}>
        <form onSubmit={handleUnlock} style={{
          background: 'var(--bg2, #111827)',
          border: '1px solid var(--border, #374151)',
          borderRadius: 12, padding: 36, maxWidth: 420, width: '100%',
        }} dir="rtl">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <Lock size={22} style={{ color: 'var(--orange, #f59e0b)' }} />
            <div style={{ fontWeight: 800, fontSize: 22 }}>Importly · גישת אורח</div>
          </div>
          <div style={{ color: 'var(--text2, #9ca3af)', fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
            קיבלת קישור עם קוד בן 6 ספרות. הקוד הגיע אליך בערוץ נפרד (וואטסאפ, סמס, או הודעה אישית).
            הזן את הקוד כדי לראות את פרטי המשלוח.
          </div>
          <input
            inputMode="numeric"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            disabled={stage === 'loading'}
            style={{
              width: '100%', padding: '14px 16px', fontSize: 26, textAlign: 'center',
              direction: 'ltr', letterSpacing: 8, fontFamily: 'monospace',
              background: 'var(--bg3, #1f2937)', border: '1px solid var(--border, #374151)',
              borderRadius: 8, color: 'var(--text, #f3f4f6)', marginBottom: 14,
            }}
            autoFocus
          />
          {error && (
            <div style={{ color: 'var(--red, #ef4444)', fontSize: 13, marginBottom: 12 }}>
              <AlertCircle size={13} style={{ marginInlineEnd: 4 }} />{error}
            </div>
          )}
          <button
            type="submit"
            disabled={stage === 'loading' || code.length !== 6}
            style={{
              width: '100%', padding: '12px', fontSize: 15, fontWeight: 700,
              background: 'var(--orange, #f59e0b)', color: '#0a0e1a',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              opacity: (stage === 'loading' || code.length !== 6) ? 0.5 : 1,
            }}
          >
            {stage === 'loading' ? 'טוען...' : 'הצג פרטי משלוח'}
          </button>
          <div style={{ marginTop: 20, fontSize: 11, color: 'var(--text3, #6b7280)', textAlign: 'center', lineHeight: 1.6 }}>
            הקישור נשלח ע״י לקוח Importly לצורך הצעת מחיר.
            <br />
            גישה בקריאה בלבד. הנתונים אינם כוללים מחירי מכירה או רווחים.
          </div>
        </form>
      </div>
    );
  }

  // VIEW STAGE
  return <ShareViewContent data={data} />;
}

function ShareViewContent({ data }) {
  const { project, products, shipments, files, settings, role } = data;
  const isForwarder = role === 'forwarder';

  const totals = {
    qty:    products.reduce((s, p) => s + (Number(p.qty) || 0), 0),
    cbm:    products.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.cbm) || 0), 0),
    weight: products.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.gross_weight_kg) || 0), 0),
    fobUsd: products.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.fob_price) || 0), 0),
  };

  const ship = shipments[0] || null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg1, #0a0e1a)',
      color: 'var(--text, #f3f4f6)',
      fontFamily: 'Heebo, Arial, sans-serif',
      direction: 'rtl',
    }}>
      {/* HEADER */}
      <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--border, #374151)', background: 'var(--bg2, #111827)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>Importly · {project.name}</div>
            <div style={{ color: 'var(--text2, #9ca3af)', fontSize: 12, marginTop: 2 }}>
              <ShieldCheck size={12} style={{ color: 'var(--violet, #8b5cf6)', marginInlineEnd: 4 }} />
              גישה {isForwarder ? 'לחברת שילוח' : 'לעמיל מכס'} · קריאה בלבד
            </div>
          </div>
          {project.supplier && (
            <div style={{ textAlign: 'left', fontSize: 12, color: 'var(--text2, #9ca3af)' }}>
              <div>ספק:</div>
              <div style={{ color: 'var(--text, #f3f4f6)', fontWeight: 600, marginTop: 2 }}>{project.supplier}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        {/* SUMMARY */}
        <SummaryCards
          totals={totals}
          settings={settings}
          isForwarder={isForwarder}
          declared={ship}
        />

        {/* SHIPMENT */}
        {ship && (
          <Card icon={Ship} title="פרטי משלוח">
            <Grid>
              <KV k="מספר מכולה / AWB" v={ship.container_number} mono />
              <KV k="סוג"               v={ship.container_type} />
              <KV k="חברת ספנות"        v={ship.carrier} />
              <KV k="אונייה / מסע"      v={[ship.vessel_name, ship.voyage].filter(Boolean).join(' · ')} />
              <KV k="נמל מוצא"          v={ship.origin_port} />
              <KV k="נמל יעד"           v={ship.pod_port} />
              <KV k="טרמינל יעד"        v={ship.terminal} />
              <KV k="תאריך יציאה"       v={ship.departure_date} />
              <KV k="ETA"               v={ship.eta_date} />
              <KV k="הגעה בפועל"        v={ship.actual_arrival_date} />
            </Grid>
          </Card>
        )}

        {/* PRODUCTS */}
        <Card icon={Package} title={`פרטי מוצרים (${products.length})`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border, #374151)' }}>
                  <Th>שם</Th>
                  <Th>קוד</Th>
                  {!isForwarder && <Th>HS</Th>}
                  {!isForwarder && <Th>מכס %</Th>}
                  <Th>כמות</Th>
                  <Th>CBM/יח׳</Th>
                  <Th>משקל/יח׳</Th>
                  <Th>FOB ליח׳</Th>
                  <Th>סה״כ FOB</Th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const fobTotal = (Number(p.qty) || 0) * (Number(p.fob_price) || 0);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border, #374151)' }}>
                      <Td>{p.name}</Td>
                      <Td mono>{p.item_no || '—'}</Td>
                      {!isForwarder && <Td mono>{p.hs_code || '—'}</Td>}
                      {!isForwarder && <Td>{n(p.customs_rate_override ?? p.customs_rate, 1)}%</Td>}
                      <Td>{n(p.qty)}</Td>
                      <Td>{n(p.cbm, 4)}</Td>
                      <Td>{n(p.gross_weight_kg, 2)} kg</Td>
                      <Td>${n(p.fob_price, 2)}</Td>
                      <Td bold>${n(fobTotal, 2)}</Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg3, #1f2937)', fontWeight: 800, borderTop: '2px solid var(--border, #374151)' }}>
                  <Td>סה״כ</Td>
                  <Td></Td>
                  {!isForwarder && <Td></Td>}
                  {!isForwarder && <Td></Td>}
                  <Td>{n(totals.qty)}</Td>
                  <Td>{n(totals.cbm, 4)} m³</Td>
                  <Td>{n(totals.weight, 2)} kg</Td>
                  <Td></Td>
                  <Td>${n(totals.fobUsd, 2)}</Td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* FILES */}
        {files.length > 0 && (
          <Card icon={FileText} title={`מסמכים (${files.length})`}>
            <div>
              {files.map(f => {
                const url = getPublicUrl(f.storage_path);
                const cat = CATEGORY_BY_VALUE[f.category];
                return (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderBottom: '1px solid var(--border, #374151)',
                  }}>
                    <FileText size={16} style={{ color: 'var(--text3, #6b7280)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.file_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3, #6b7280)', marginTop: 2 }}>
                        {cat?.label || f.category} · {fmtSize(f.size_bytes)}
                      </div>
                    </div>
                    {url && (
                      <>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          style={{ padding: '6px 10px', background: 'var(--bg3, #1f2937)', borderRadius: 6, color: 'var(--text, #f3f4f6)', textDecoration: 'none', fontSize: 12 }}>
                          <ExternalLink size={12} /> פתח
                        </a>
                        <a href={url} download={f.file_name}
                          style={{ padding: '6px 10px', background: 'var(--bg3, #1f2937)', borderRadius: 6, color: 'var(--text, #f3f4f6)', textDecoration: 'none', fontSize: 12 }}>
                          <Download size={12} /> הורד
                        </a>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* FOOTER */}
        <div style={{
          marginTop: 32, padding: 16, background: 'var(--bg2, #111827)',
          borderRadius: 8, fontSize: 11, color: 'var(--text3, #6b7280)', textAlign: 'center',
        }}>
          מסמך זה הופק מ-Importly · גישה בקריאה בלבד · מחירי מכירה ורווחים אינם כלולים
        </div>
      </div>
    </div>
  );
}

function SummaryCards({ totals, settings, isForwarder, declared }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
      <Stat label="סה״כ יחידות" v={n(totals.qty)} />
      <Stat label="סה״כ CBM"    v={`${n(totals.cbm, 4)} m³`} />
      <Stat label="סה״כ משקל"   v={`${n(totals.weight, 2)} kg`} />
      <Stat label="סה״כ FOB"    v={`$${n(totals.fobUsd, 2)}`} />
      {settings?.incoterms && <Stat label="Incoterms" v={settings.incoterms} />}
      {settings?.origin_port && <Stat label="נמל מוצא" v={settings.origin_port} />}
      {!isForwarder && settings?.customs != null && (
        <Stat label="מכס ברירת מחדל" v={`${settings.customs}%`} />
      )}
    </div>
  );
}

function Stat({ label, v }) {
  return (
    <div style={{
      background: 'var(--bg2, #111827)', border: '1px solid var(--border, #374151)',
      borderRadius: 8, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text3, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--text, #f3f4f6)' }}>{v}</div>
    </div>
  );
}

function Card({ icon: Icon, title, children }) {
  return (
    <div style={{
      background: 'var(--bg2, #111827)', border: '1px solid var(--border, #374151)',
      borderRadius: 8, padding: 16, marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, color: 'var(--orange, #f59e0b)', fontSize: 14, fontWeight: 700 }}>
        <Icon size={16} />
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>{children}</div>;
}

function KV({ k, v, mono }) {
  return (
    <div>
      <div style={{ color: 'var(--text3, #6b7280)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
      <div style={{
        color: 'var(--text, #f3f4f6)', fontWeight: 600, marginTop: 2,
        fontFamily: mono ? 'monospace' : 'inherit', direction: mono ? 'ltr' : 'inherit',
      }}>{v || '—'}</div>
    </div>
  );
}

function Th({ children }) { return <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, color: 'var(--text2, #9ca3af)', fontWeight: 600 }}>{children}</th>; }
function Td({ children, mono, bold }) {
  return <td style={{
    textAlign: 'right', padding: '8px 6px',
    fontFamily: mono ? 'monospace' : 'inherit',
    fontWeight: bold ? 700 : 400,
    direction: mono ? 'ltr' : 'inherit',
  }}>{children}</td>;
}
