import React, { useState, useEffect, useCallback } from 'react';
import { Ship, Plus, Pencil, Trash2, MapPin, Calendar, Anchor, ChevronDown, ChevronUp } from 'lucide-react';
import {
  loadShipments, createShipment, updateShipment, deleteShipment,
  SHIPMENT_STATUSES, CONTAINER_TYPES_HE, daysUntilEta,
} from '../lib/shipments';
import ShipmentForm from './ShipmentForm';

// ─────────────────────────────────────────────────────────────────────────────
//  ShipmentsPanel — embedded on Dashboard for the active project.
//  Lists all containers belonging to the project, ETA countdown,
//  and an expandable event timeline.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_BY_VAL = Object.fromEntries(SHIPMENT_STATUSES.map(s => [s.value, s]));

function StatusBadge({ value }) {
  const s = STATUS_BY_VAL[value] || STATUS_BY_VAL.planned;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 6,
      background: s.color, color: '#000', fontWeight: 700, fontSize: 11,
    }}>
      {s.label}
    </span>
  );
}

function EtaCountdown({ shipment }) {
  if (shipment.actual_arrival_date) {
    return (
      <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 600 }}>
        הגיע {fmtDate(shipment.actual_arrival_date)}
      </span>
    );
  }
  const days = daysUntilEta(shipment);
  if (days === null) return <span style={{ color: 'var(--text3)', fontSize: 12 }}>ETA לא הוגדר</span>;
  const color = days < 0 ? 'var(--red)' : days <= 3 ? 'var(--orange)' : 'var(--text2)';
  const label = days < 0 ? `איחור ${-days} י׳` : days === 0 ? 'היום!' : `בעוד ${days} י׳`;
  return (
    <span style={{ color, fontSize: 12, fontWeight: 600 }}>
      <Calendar size={11} style={{ marginInlineEnd: 4 }} />
      {label} ({fmtDate(shipment.eta_date)})
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function ShipmentCard({ shipment, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const events = Array.isArray(shipment.events) ? shipment.events : [];
  const sorted = [...events].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 12, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ship size={16} style={{ color: 'var(--orange)' }} />
            <span style={{ fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1, direction: 'ltr' }}>
              {shipment.container_number}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {CONTAINER_TYPES_HE[shipment.container_type] || shipment.container_type}
            </span>
            <StatusBadge value={shipment.status} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: 'var(--text2)' }}>
            {shipment.vessel_name && (
              <span><Anchor size={11} style={{ marginInlineEnd: 4 }} />{shipment.vessel_name} {shipment.voyage && `· ${shipment.voyage}`}</span>
            )}
            {shipment.origin_port && (
              <span><MapPin size={11} style={{ marginInlineEnd: 4 }} />{shipment.origin_port} → {shipment.pod_port}</span>
            )}
            <EtaCountdown shipment={shipment} />
          </div>

          {shipment.last_event && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
              אחרון: {shipment.last_event}
              {shipment.last_event_location && ` · ${shipment.last_event_location}`}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {events.length > 0 && (
            <button className="btn btn-sm" onClick={() => setExpanded(x => !x)} title="היסטוריית אירועים">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {events.length}
            </button>
          )}
          <button className="btn btn-sm" onClick={onEdit} title="ערוך"><Pencil size={13} /></button>
          <button className="btn btn-sm btn-danger" onClick={onDelete} title="מחק"><Trash2 size={13} /></button>
        </div>
      </div>

      {expanded && sorted.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text3)', textAlign: 'right' }}>
                <th style={{ padding: '4px 6px', fontWeight: 500 }}>תאריך</th>
                <th style={{ padding: '4px 6px', fontWeight: 500 }}>מיקום</th>
                <th style={{ padding: '4px 6px', fontWeight: 500 }}>תיאור</th>
                <th style={{ padding: '4px 6px', fontWeight: 500 }}>אונייה/מסע</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((ev, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 6px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(ev.date)}</td>
                  <td style={{ padding: '4px 6px' }}>{ev.location || '—'}</td>
                  <td style={{ padding: '4px 6px' }}>{ev.description || '—'}</td>
                  <td style={{ padding: '4px 6px', direction: 'ltr', fontFamily: 'monospace', fontSize: 10 }}>{ev.vessel_voyage || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ShipmentsPanel({ activeProjectId, showToast }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [editing, setEditing]     = useState(null); // null = closed, {} = new, object = edit
  const [errorMsg, setErrorMsg]   = useState('');

  const refresh = useCallback(async () => {
    if (!activeProjectId) { setShipments([]); return; }
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await loadShipments(activeProjectId);
      setShipments(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleSave(payload) {
    try {
      if (editing && editing.id) {
        await updateShipment(editing.id, payload);
        showToast?.('המכולה עודכנה');
      } else {
        await createShipment({ ...payload, project_id: activeProjectId });
        showToast?.('המכולה נוספה');
      }
      setEditing(null);
      refresh();
    } catch (err) {
      showToast?.('שגיאה: ' + err.message, 'error');
    }
  }

  async function handleDelete(s) {
    if (!window.confirm(`למחוק את מכולה ${s.container_number}?`)) return;
    try {
      await deleteShipment(s.id);
      showToast?.('המכולה נמחקה');
      refresh();
    } catch (err) {
      showToast?.('שגיאה במחיקה: ' + err.message, 'error');
    }
  }

  if (!activeProjectId) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ship size={18} style={{ color: 'var(--orange)' }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>מעקב מכולות ({shipments.length})</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing({})}>
          <Plus size={13} /> מכולה חדשה
        </button>
      </div>

      {errorMsg && (
        <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
          {errorMsg.includes('shipments') && errorMsg.includes('does not exist')
            ? 'הטבלה shipments טרם נוצרה. הרץ את ה-migration החדש ב-Supabase.'
            : errorMsg}
        </div>
      )}

      {loading && shipments.length === 0 && (
        <div style={{ color: 'var(--text3)', fontSize: 12, padding: 10 }}>טוען...</div>
      )}

      {!loading && shipments.length === 0 && !errorMsg && (
        <div style={{ color: 'var(--text3)', fontSize: 12, padding: 10, textAlign: 'center' }}>
          אין מכולות בפרויקט זה. הוסף את הראשונה כדי לעקוב אחר ETA וסטטוס.
        </div>
      )}

      {shipments.map(s => (
        <ShipmentCard
          key={s.id}
          shipment={s}
          onEdit={() => setEditing(s)}
          onDelete={() => handleDelete(s)}
        />
      ))}

      {editing !== null && (
        <ShipmentForm
          shipment={editing.id ? editing : null}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
