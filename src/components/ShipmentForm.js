import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { CARRIERS, CONTAINER_TYPES_HE, SHIPMENT_STATUSES, inferStatus } from '../lib/shipments';

const EMPTY = {
  container_number: '', container_type: '40HC', carrier: 'MSC',
  vessel_name: '', voyage: '',
  origin_port: '', pod_port: 'Ashdod, IL',
  departure_date: '', eta_date: '', actual_arrival_date: '',
  terminal: '', status: 'planned', notes: '',
  events: [],
};

export default function ShipmentForm({ shipment, onSave, onClose }) {
  const [form, setForm] = useState(shipment ? {
    container_number:    shipment.container_number    || '',
    container_type:      shipment.container_type      || '40HC',
    carrier:             shipment.carrier             || 'MSC',
    vessel_name:         shipment.vessel_name         || '',
    voyage:              shipment.voyage              || '',
    origin_port:         shipment.origin_port         || '',
    pod_port:            shipment.pod_port            || 'Ashdod, IL',
    departure_date:      shipment.departure_date      || '',
    eta_date:            shipment.eta_date            || '',
    actual_arrival_date: shipment.actual_arrival_date || '',
    terminal:            shipment.terminal            || '',
    status:              shipment.status              || 'planned',
    notes:               shipment.notes               || '',
    events:              Array.isArray(shipment.events) ? shipment.events : [],
  } : EMPTY);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function addEvent() {
    set('events', [
      { date: '', location: '', description: '', vessel_voyage: '', terminal: '' },
      ...form.events,
    ]);
  }

  function updateEvent(idx, key, val) {
    set('events', form.events.map((e, i) => i === idx ? { ...e, [key]: val } : e));
  }

  function removeEvent(idx) {
    set('events', form.events.filter((_, i) => i !== idx));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.container_number.trim()) return;
    setSaving(true);
    // Auto-infer status if user didn't change it from default
    const payload = { ...form };
    if (!shipment || shipment.status === 'planned') {
      payload.status = inferStatus(payload);
    }
    await onSave(payload);
    setSaving(false);
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <span className="modal-title">{shipment ? 'עריכת מכולה' : 'מכולה חדשה'}</span>
          <button className="btn btn-sm" onClick={onClose}><X size={15} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-group">
                <label>מספר מכולה *</label>
                <input
                  value={form.container_number}
                  onChange={e => set('container_number', e.target.value.toUpperCase())}
                  required
                  placeholder="TGBU7941499"
                  dir="ltr"
                  style={{ fontFamily: 'monospace', letterSpacing: 1 }}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>סוג מכולה</label>
                <select value={form.container_type} onChange={e => set('container_type', e.target.value)}>
                  {Object.entries(CONTAINER_TYPES_HE).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>חברת הספנות</label>
                <select value={form.carrier} onChange={e => set('carrier', e.target.value)}>
                  {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>שם האונייה</label>
                <input
                  value={form.vessel_name}
                  onChange={e => set('vessel_name', e.target.value)}
                  placeholder="MSC OSCAR"
                  dir="ltr"
                />
              </div>
              <div className="form-group">
                <label>קוד מסע (Voyage)</label>
                <input
                  value={form.voyage}
                  onChange={e => set('voyage', e.target.value)}
                  placeholder="GT619W"
                  dir="ltr"
                />
              </div>
              <div className="form-group">
                <label>סטטוס</label>
                <select value={form.status} onChange={e => set('status', e.target.value)}>
                  {SHIPMENT_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>נמל מוצא</label>
                <input
                  value={form.origin_port}
                  onChange={e => set('origin_port', e.target.value)}
                  placeholder="NINGBO, CN"
                />
              </div>
              <div className="form-group">
                <label>נמל יעד</label>
                <input
                  value={form.pod_port}
                  onChange={e => set('pod_port', e.target.value)}
                  placeholder="Ashdod, IL"
                />
              </div>
              <div className="form-group">
                <label>טרמינל יעד</label>
                <input
                  value={form.terminal}
                  onChange={e => set('terminal', e.target.value)}
                  placeholder="Hadarom Container Terminal"
                />
              </div>
              <div className="form-group">
                <label>תאריך יציאה (Loaded on Vessel)</label>
                <input type="date" value={form.departure_date} onChange={e => set('departure_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label>ETA לנמל יעד</label>
                <input type="date" value={form.eta_date} onChange={e => set('eta_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label>הגעה בפועל</label>
                <input type="date" value={form.actual_arrival_date} onChange={e => set('actual_arrival_date', e.target.value)} />
              </div>
              <div className="form-group full">
                <label>הערות</label>
                <textarea
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="הערות נוספות..."
                  rows={2}
                />
              </div>

              {/* ── Events timeline ── */}
              <div className="form-group full">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ margin: 0 }}>אירועי מעקב ({form.events.length})</label>
                  <button type="button" className="btn btn-sm" onClick={addEvent}>
                    <Plus size={13} /> אירוע
                  </button>
                </div>
                {form.events.length === 0 && (
                  <div style={{ color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>
                    אין אירועים. הוסף אירוע ידנית מתוך התראה של חברת הספנות.
                  </div>
                )}
                {form.events.map((ev, idx) => (
                  <div key={idx} style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr 1.5fr 120px 32px',
                    gap: 6, marginBottom: 6, alignItems: 'center',
                  }}>
                    <input type="date" value={ev.date}
                      onChange={e => updateEvent(idx, 'date', e.target.value)} />
                    <input value={ev.location}
                      onChange={e => updateEvent(idx, 'location', e.target.value)}
                      placeholder="Ningbo, CN" />
                    <input value={ev.description}
                      onChange={e => updateEvent(idx, 'description', e.target.value)}
                      placeholder="Export Loaded on Vessel" />
                    <input value={ev.vessel_voyage}
                      onChange={e => updateEvent(idx, 'vessel_voyage', e.target.value)}
                      placeholder="MSC OSCAR GT619W" dir="ltr" />
                    <button type="button" className="btn btn-sm" onClick={() => removeEvent(idx)} title="מחק">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>ביטול</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.container_number.trim()}>
              {saving ? 'שומר...' : (shipment ? 'עדכן' : 'הוסף')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
