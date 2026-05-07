import React, { useState } from 'react';
import { X } from 'lucide-react';

const EMPTY = { name: '', supplier: '', status: 'active', notes: '', shipment_date: '' };

export default function ProjectForm({ project, onSave, onClose }) {
  const [form, setForm] = useState(project ? {
    name:          project.name          || '',
    supplier:      project.supplier      || '',
    status:        project.status        || 'active',
    notes:         project.notes         || '',
    shipment_date: project.shipment_date || '',
  } : EMPTY);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave({
      name:          form.name.trim(),
      supplier:      form.supplier.trim(),
      status:        form.status,
      notes:         form.notes.trim(),
      shipment_date: form.shipment_date || null,
    });
    setSaving(false);
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{project ? 'עריכת פרויקט' : 'פרויקט חדש'}</span>
          <button className="btn btn-sm" onClick={onClose}><X size={15} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-group full">
                <label>שם הפרויקט *</label>
                <input
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  required
                  placeholder="למשל: יבוא Q2 2025"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>ספק ראשי</label>
                <input
                  value={form.supplier}
                  onChange={e => set('supplier', e.target.value)}
                  placeholder="שם הספק"
                />
              </div>
              <div className="form-group">
                <label>תאריך משלוח</label>
                <input
                  type="date"
                  value={form.shipment_date}
                  onChange={e => set('shipment_date', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>סטטוס</label>
                <select value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="draft">טיוטה</option>
                  <option value="active">פעיל</option>
                  <option value="closed">סגור</option>
                </select>
              </div>
              <div className="form-group full">
                <label>הערות</label>
                <textarea
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="פרטים על המשלוח, מועד הגעה, הערות כלליות..."
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>ביטול</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving && <span className="spinner" />}
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
