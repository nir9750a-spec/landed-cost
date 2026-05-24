import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
//  Container shipment tracking — CRUD + helpers.
//  Manual entry for now (data sourced from the forwarder's tracking page).
// ─────────────────────────────────────────────────────────────────────────────

export const SHIPMENT_STATUSES = [
  { value: 'planned',    label: 'מתוכנן',         color: 'var(--text3)' },
  { value: 'in_transit', label: 'בים',            color: 'var(--orange)' },
  { value: 'arrived',    label: 'הגיע לאשדוד',   color: 'var(--green)' },
  { value: 'cleared',    label: 'שוחרר ממכס',    color: '#3b82f6' },
];

export const CONTAINER_TYPES_HE = {
  '20GP':  '20ft סטנדרט',
  '40GP':  '40ft סטנדרט',
  '40HC':  '40ft High Cube',
  '45HC':  '45ft High Cube',
  'LCL':   'LCL — חלק מקונטיינר',
};

export const CARRIERS = ['MSC', 'COSCO', 'Maersk', 'ZIM', 'Hapag-Lloyd', 'CMA CGM', 'Evergreen', 'ONE', 'Yang Ming', 'אחר'];

// Status inference — if the user fills events but not status, we can guess.
export function inferStatus(shipment) {
  if (shipment.actual_arrival_date) {
    return shipment.status === 'cleared' ? 'cleared' : 'arrived';
  }
  if (shipment.departure_date) return 'in_transit';
  return 'planned';
}

// Days until ETA — negative means past due.
export function daysUntilEta(shipment) {
  if (!shipment.eta_date) return null;
  const eta = new Date(shipment.eta_date + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((eta - today) / 86400000);
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function loadShipments(projectId) {
  let q = supabase.from('shipments').select('*').order('eta_date', { ascending: true, nullsLast: true });
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createShipment(input) {
  const payload = normalize(input);
  const { data, error } = await supabase.from('shipments').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateShipment(id, patch) {
  const payload = normalize(patch, { partial: true });
  const { data, error } = await supabase.from('shipments').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteShipment(id) {
  const { error } = await supabase.from('shipments').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}

// Append one event to the events JSONB array + update the snapshot fields.
export async function addShipmentEvent(id, event) {
  const { data: existing, error: e1 } = await supabase
    .from('shipments').select('events').eq('id', id).single();
  if (e1) throw new Error(e1.message);

  const cleanEvent = {
    date:           event.date || '',
    location:       (event.location || '').trim(),
    description:    (event.description || '').trim(),
    vessel_voyage:  (event.vessel_voyage || '').trim(),
    terminal:       (event.terminal || '').trim(),
  };

  // Insert sorted by date descending — newest first.
  const events = [...(existing.events || []), cleanEvent]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Snapshot fields reflect the most recent event.
  const top = events[0] || {};
  const patch = {
    events,
    last_event:           top.description || null,
    last_event_at:        top.date ? `${top.date}T00:00:00Z` : null,
    last_event_location:  top.location || null,
  };

  const { data, error } = await supabase
    .from('shipments').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalize(input, { partial = false } = {}) {
  const out = {};
  const set = (k, v) => { if (!partial || v !== undefined) out[k] = v ?? null; };

  set('project_id',           input.project_id);
  set('container_number',     (input.container_number || '').trim().toUpperCase() || null);
  set('container_type',       input.container_type || null);
  set('carrier',              input.carrier || null);
  set('vessel_name',          (input.vessel_name || '').trim() || null);
  set('voyage',               (input.voyage || '').trim() || null);
  set('origin_port',          (input.origin_port || '').trim() || null);
  set('pod_port',             (input.pod_port || 'Ashdod, IL').trim() || 'Ashdod, IL');
  set('departure_date',       input.departure_date || null);
  set('eta_date',             input.eta_date || null);
  set('actual_arrival_date',  input.actual_arrival_date || null);
  set('terminal',             (input.terminal || '').trim() || null);
  set('status',               input.status || (partial ? undefined : 'planned'));
  set('notes',                (input.notes || '').trim() || null);
  if (Array.isArray(input.events)) out.events = input.events;

  // Drop undefined keys for partial update.
  if (partial) Object.keys(out).forEach(k => out[k] === undefined && delete out[k]);
  return out;
}
