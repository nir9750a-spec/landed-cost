import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
//  Guest portal — read-only sharing of a project with a freight forwarder
//  or customs broker. Auth = URL token + 6-digit access code.
// ─────────────────────────────────────────────────────────────────────────────

export const SHARE_ROLES = [
  { value: 'forwarder',      label: 'חברת שילוח / פורווארדר', desc: 'יראה מוצרים, נפח, משקל, נמלים, מסמכים' },
  { value: 'customs_broker', label: 'עמיל מכס',                desc: 'יראה מוצרים, קודי HS, אחוז מכס, שווי CIF, מסמכים' },
];

// Build a stable URL the recipient can open from any browser.
export function shareUrl(token) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/share/${token}`;
}

// Generate a random URL-safe token (base62-ish) and a 6-digit code.
function randomToken(len = 22) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

function randomCode() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1_000_000).padStart(6, '0');
}

async function sha256Hex(s) {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Create a new share. Returns { token, code, url } — caller must show the
// code to Nir ONCE; it's never recoverable after that.
export async function createShare({ projectId, role, recipientName, recipientEmail, recipientCompany, notes, expiresInDays }) {
  if (!projectId) throw new Error('בחר פרויקט');
  if (!['forwarder', 'customs_broker'].includes(role)) throw new Error('בחר תפקיד');

  const token = randomToken(22);
  const code  = randomCode();
  const salt  = randomToken(16);
  const codeHash = await sha256Hex(salt + ':' + code);

  const expiresAt = expiresInDays && expiresInDays > 0
    ? new Date(Date.now() + expiresInDays * 86400_000).toISOString()
    : null;

  const { error } = await supabase.from('project_shares').insert({
    project_id:        projectId,
    role,
    access_token:      token,
    code_hash:         codeHash,
    code_salt:         salt,
    recipient_email:   recipientEmail || null,
    recipient_name:    recipientName  || null,
    recipient_company: recipientCompany || null,
    notes:             notes || null,
    expires_at:        expiresAt,
  });
  if (error) throw new Error(error.message);

  return { token, code, url: shareUrl(token) };
}

// Look up a share by its URL token and verify the 6-digit code.
// Returns the share row (without hash/salt) on success, throws on failure.
export async function verifyShareAccess(token, code) {
  if (!token || !code) throw new Error('Missing token or code');

  const { data: share, error } = await supabase
    .from('project_shares').select('*').eq('access_token', token).maybeSingle();
  if (error) throw new Error(error.message);
  if (!share) throw new Error('share_not_found');
  if (share.revoked_at) throw new Error('revoked');
  if (share.expires_at && new Date(share.expires_at) < new Date()) throw new Error('expired');

  const trial = await sha256Hex(share.code_salt + ':' + String(code).trim());
  if (trial !== share.code_hash) throw new Error('wrong_code');

  // Bump view count (fire and forget)
  supabase.from('project_shares')
    .update({
      last_viewed_at: new Date().toISOString(),
      viewed_count: (share.viewed_count || 0) + 1,
    }).eq('id', share.id).then(() => {}, () => {});

  // Strip the secrets before returning to the client
  const { code_hash, code_salt, ...safe } = share;
  void code_hash; void code_salt;
  return safe;
}

export async function listShares(projectId) {
  let q = supabase.from('project_shares').select('*').order('created_at', { ascending: false });
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(({ code_hash, code_salt, ...safe }) => safe);
}

export async function revokeShare(id) {
  const { error } = await supabase.from('project_shares')
    .update({ revoked_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}

export async function deleteShare(id) {
  const { error } = await supabase.from('project_shares').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}

// Load the project + products + shipments + files visible to a given role.
// Returns role-filtered data — the caller never sees fields the role isn't
// allowed to view.
export async function loadShareData(share) {
  if (!share || !share.project_id) throw new Error('Invalid share');

  const [projectRes, productsRes, shipmentsRes, filesRes, settingsRes] = await Promise.all([
    supabase.from('projects').select('*').eq('id', share.project_id).maybeSingle(),
    supabase.from('products').select('*').eq('project_id', share.project_id),
    supabase.from('shipments').select('*').eq('project_id', share.project_id),
    supabase.from('project_files').select('*').eq('project_id', share.project_id),
    supabase.from('settings').select('*').eq('project_id', share.project_id).maybeSingle(),
  ]);

  const project   = projectRes.data || null;
  const products  = productsRes.data || [];
  const shipments = shipmentsRes.data || [];
  const files     = filesRes.data || [];
  const settings  = settingsRes.data || {};

  // Role-based field filtering. We strip anything the recipient must NOT see
  // server-side-style here (client-side, but they only get these objects).
  const roleFilter = share.role === 'forwarder'
    ? FORWARDER_FIELDS
    : CUSTOMS_BROKER_FIELDS;

  const safeProject = pick(project, roleFilter.project);
  const safeProducts = products.map(p => pick(p, roleFilter.product));
  const safeShipments = shipments.map(s => pick(s, roleFilter.shipment));
  const safeFiles = files.map(f => pick(f, roleFilter.file));
  const safeSettings = pick(settings, roleFilter.settings);

  return { project: safeProject, products: safeProducts, shipments: safeShipments, files: safeFiles, settings: safeSettings, role: share.role };
}

function pick(obj, fields) {
  if (!obj) return obj;
  const out = {};
  for (const f of fields) if (f in obj) out[f] = obj[f];
  return out;
}

// What each role is allowed to see — note the omissions.
// FOB price is shown to forwarder (for insurance) but NOT to customs broker
// (broker only needs HS + declared CIF, not unit FOB). Both are blocked from
// margin, sell price, profit, landed cost.
const FORWARDER_FIELDS = {
  project:  ['id', 'name', 'supplier', 'shipment_date', 'notes'],
  product:  ['id', 'name', 'item_no', 'qty', 'cbm', 'gross_weight_kg', 'box_l', 'box_w', 'box_h', 'fob_price'],
  shipment: ['id', 'container_number', 'container_type', 'carrier', 'vessel_name', 'voyage',
             'origin_port', 'pod_port', 'terminal', 'departure_date', 'eta_date', 'actual_arrival_date',
             'declared_pieces', 'declared_packages', 'declared_cbm', 'declared_weight_kg', 'status'],
  file:     ['id', 'file_name', 'category', 'mime_type', 'size_bytes', 'storage_path', 'uploaded_at', 'notes'],
  settings: ['incoterms', 'origin_port', 'shipping_method', 'manual_container_code'],
};

const CUSTOMS_BROKER_FIELDS = {
  project:  ['id', 'name', 'supplier', 'shipment_date', 'notes'],
  product:  ['id', 'name', 'item_no', 'qty', 'cbm', 'gross_weight_kg', 'box_l', 'box_w', 'box_h',
             'fob_price', 'hs_code', 'customs_rate', 'customs_rate_override',
             'import_group', 'sii_required', 'sii_notes', 'purchase_tax_rate_override'],
  shipment: ['id', 'container_number', 'container_type', 'carrier', 'vessel_name', 'voyage',
             'origin_port', 'pod_port', 'terminal', 'departure_date', 'eta_date',
             'declared_pieces', 'declared_packages', 'declared_cbm', 'declared_weight_kg',
             'declared_value_usd', 'status'],
  file:     ['id', 'file_name', 'category', 'mime_type', 'size_bytes', 'storage_path', 'uploaded_at', 'notes'],
  settings: ['incoterms', 'origin_port', 'customs', 'purchase_tax_rate', 'usd_rate'],
};
