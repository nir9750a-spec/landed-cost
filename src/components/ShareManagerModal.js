import React, { useEffect, useState } from 'react';
import { X, Share2, Copy, Check, Trash2, Ban, Plus, Eye } from 'lucide-react';
import { createShare, listShares, revokeShare, deleteShare, SHARE_ROLES, shareUrl } from '../lib/shares';
import { confirmAsync } from './ConfirmDialog';

// ─────────────────────────────────────────────────────────────────────────────
//  ShareManagerModal — Nir creates / manages share links for a project. He
//  picks the recipient role (forwarder vs customs broker), enters their
//  details, clicks generate, and gets a URL + 6-digit code to send via
//  WhatsApp / email. The code is shown ONCE; never recoverable.
// ─────────────────────────────────────────────────────────────────────────────

export default function ShareManagerModal({ projectId, projectName, onClose, showToast }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [justCreated, setJustCreated] = useState(null); // { url, code, share }

  const [form, setForm] = useState({
    role: 'forwarder',
    recipientName: '', recipientCompany: '', recipientEmail: '',
    notes: '',
    expiresInDays: 30,
  });

  async function refresh() {
    setLoading(true);
    try {
      const data = await listShares(projectId);
      setShares(data);
    } catch (err) {
      showToast?.('שגיאה בטעינת שיתופים: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (projectId) refresh(); }, [projectId]);

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function handleCreate() {
    try {
      const result = await createShare({
        projectId,
        role: form.role,
        recipientName: form.recipientName,
        recipientCompany: form.recipientCompany,
        recipientEmail: form.recipientEmail,
        notes: form.notes,
        expiresInDays: Number(form.expiresInDays) || 0,
      });
      setJustCreated(result);
      setShowForm(false);
      setForm({ role: 'forwarder', recipientName: '', recipientCompany: '', recipientEmail: '', notes: '', expiresInDays: 30 });
      refresh();
    } catch (err) {
      showToast?.('שגיאה ביצירת שיתוף: ' + err.message, 'error');
    }
  }

  async function handleRevoke(s) {
    const ok = await confirmAsync({
      title: 'ביטול גישה',
      message: `הגישה של "${s.recipient_name || s.recipient_email || 'אורח'}" תושבת מיידית. הוא לא יוכל יותר לראות את הפרויקט.`,
      confirmLabel: 'בטל גישה',
      danger: true,
    });
    if (!ok) return;
    try {
      await revokeShare(s.id);
      refresh();
    } catch (err) {
      showToast?.('שגיאה: ' + err.message, 'error');
    }
  }

  async function handleDelete(s) {
    const ok = await confirmAsync({
      title: 'מחיקת שיתוף',
      message: 'הרשומה תימחק לצמיתות מההיסטוריה. השימוש שלפני המחיקה לא יישמר. למחוק?',
      confirmLabel: 'מחק',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteShare(s.id);
      refresh();
    } catch (err) {
      showToast?.('שגיאה: ' + err.message, 'error');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: 760, width: '95%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Share2 size={16} style={{ color: 'var(--orange)' }} /> שיתוף לעמיל / פורווארדר — {projectName}
          </span>
          <button className="btn btn-sm" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          {/* "Just created" reveal — show the code ONCE */}
          {justCreated && (
            <JustCreatedReveal
              data={justCreated}
              onClose={() => setJustCreated(null)}
            />
          )}

          {!justCreated && !showForm && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ color: 'var(--text2)', fontSize: 13 }}>
                  כל גישה היא קישור חד-פעמי + קוד 6 ספרות. הקוד נוצר פעם אחת ולא ניתן לשחזרו.
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                  <Plus size={13} /> שיתוף חדש
                </button>
              </div>

              {loading ? (
                <div style={{ color: 'var(--text3)', padding: 14 }}>טוען...</div>
              ) : shares.length === 0 ? (
                <div style={{ color: 'var(--text3)', fontSize: 13, padding: 16, textAlign: 'center' }}>
                  אין שיתופים בפרויקט זה.
                </div>
              ) : (
                shares.map(s => (
                  <ShareRow key={s.id} share={s} onRevoke={handleRevoke} onDelete={handleDelete} showToast={showToast} />
                ))
              )}
            </>
          )}

          {/* CREATE form */}
          {!justCreated && showForm && (
            <div className="form-grid">
              <div className="form-group full">
                <label>סוג גישה</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                  {SHARE_ROLES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => set('role', r.value)}
                      className={`btn ${form.role === r.value ? 'btn-primary' : ''}`}
                      style={{ flexDirection: 'column', alignItems: 'flex-start', padding: 14, height: 'auto' }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{r.label}</div>
                      <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85, textAlign: 'right' }}>{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>שם המקבל</label>
                <input value={form.recipientName} onChange={e => set('recipientName', e.target.value)} placeholder="יוסי" />
              </div>
              <div className="form-group">
                <label>חברה</label>
                <input value={form.recipientCompany} onChange={e => set('recipientCompany', e.target.value)} placeholder="עמילות מכס יוסי" />
              </div>
              <div className="form-group">
                <label>אימייל</label>
                <input type="email" value={form.recipientEmail} onChange={e => set('recipientEmail', e.target.value)} placeholder="yossi@example.co.il" />
              </div>
              <div className="form-group">
                <label>תוקף (ימים)</label>
                <input type="number" min="1" max="365" value={form.expiresInDays} onChange={e => set('expiresInDays', e.target.value)} />
              </div>
              <div className="form-group full">
                <label>הערות (פנימי בלבד)</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="לשליחה לחברת שילוח לקבלת ציטוט" />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!justCreated && showForm && (
            <>
              <button className="btn" onClick={() => setShowForm(false)}>ביטול</button>
              <button className="btn btn-primary" onClick={handleCreate}>
                <Share2 size={13} /> צור שיתוף
              </button>
            </>
          )}
          {!justCreated && !showForm && (
            <button className="btn" onClick={onClose}>סגור</button>
          )}
          {justCreated && (
            <button className="btn btn-primary" onClick={() => setJustCreated(null)}>
              <Check size={13} /> סיימתי להעתיק
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function JustCreatedReveal({ data, onClose }) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  function copy(text, setter) {
    navigator.clipboard?.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 1500);
  }

  return (
    <div style={{
      background: 'rgba(245,158,11,0.08)',
      border: '1px solid var(--orange)',
      borderRadius: 8, padding: 18, marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 15, marginBottom: 10, color: 'var(--orange)' }}>
        <Share2 size={15} /> שיתוף נוצר בהצלחה
      </div>
      <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 14 }}>
        העתק את שני הפריטים ושלח אותם <strong>בשני ערוצים נפרדים</strong> — את הקישור באימייל ואת הקוד בוואטסאפ, או להפך.
        הקוד יוצג רק פעם אחת.
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>קישור</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input readOnly value={data.url} style={{ flex: 1, direction: 'ltr', fontFamily: 'monospace', fontSize: 12 }} />
          <button className="btn" onClick={() => copy(data.url, setCopiedUrl)}>
            {copiedUrl ? <Check size={13} /> : <Copy size={13} />} {copiedUrl ? 'הועתק' : 'העתק'}
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>קוד גישה (6 ספרות)</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input readOnly value={data.code} style={{
            flex: 1, direction: 'ltr', fontFamily: 'monospace',
            fontSize: 28, textAlign: 'center', letterSpacing: 12, padding: '10px 14px',
            background: 'var(--bg3)',
          }} />
          <button className="btn" onClick={() => copy(data.code, setCopiedCode)}>
            {copiedCode ? <Check size={13} /> : <Copy size={13} />} {copiedCode ? 'הועתק' : 'העתק'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareRow({ share, onRevoke, onDelete, showToast }) {
  const url = shareUrl(share.access_token);
  const isRevoked = !!share.revoked_at;
  const isExpired = share.expires_at && new Date(share.expires_at) < new Date();
  const status = isRevoked ? 'מבוטל' : isExpired ? 'פג תוקף' : 'פעיל';
  const statusColor = isRevoked ? 'var(--red)' : isExpired ? 'var(--text3)' : 'var(--green)';
  const roleLabel = SHARE_ROLES.find(r => r.value === share.role)?.label || share.role;

  return (
    <div style={{
      padding: 12, background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 6, marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
            <span style={{ padding: '1px 8px', borderRadius: 6, background: statusColor, color: '#000', fontSize: 10, fontWeight: 700 }}>{status}</span>
            {share.recipient_name || share.recipient_email || 'אורח'}
            <span style={{ color: 'var(--text3)', fontSize: 11 }}>· {roleLabel}</span>
          </div>
          {share.recipient_company && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{share.recipient_company}</div>
          )}
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span><Eye size={11} style={{ marginInlineEnd: 3 }} />צפיות: {share.viewed_count || 0}</span>
            {share.expires_at && <span>תוקף עד: {new Date(share.expires_at).toLocaleDateString('he-IL')}</span>}
            {share.last_viewed_at && <span>נצפה לאחרונה: {new Date(share.last_viewed_at).toLocaleDateString('he-IL')}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(url); showToast?.('הקישור הועתק'); }}>
            <Copy size={11} /> קישור
          </button>
          {!isRevoked && (
            <button className="btn btn-sm" onClick={() => onRevoke(share)} title="בטל גישה">
              <Ban size={11} />
            </button>
          )}
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(share)}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
