import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
//  Project file attachments — Supabase Storage + project_files metadata table.
//  Used by the Documents page and by FileUpload (auto-saves original invoice).
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET = 'project-files';

export const FILE_CATEGORIES = [
  { value: 'invoice',         label: 'חשבונית',           color: '#3b82f6' },
  { value: 'packing_list',    label: 'רשימת אריזה',       color: '#10b981' },
  { value: 'bill_of_lading',  label: 'שטר מטען (BL)',     color: '#8b5cf6' },
  { value: 'logistics_agent', label: 'סוכן לוגיסטיקה',    color: '#f59e0b' },
  { value: 'customs_agent',   label: 'סוכן מכס',          color: '#ef4444' },
  { value: 'screenshot',      label: 'צילום מסך',         color: '#6b7280' },
  { value: 'other',           label: 'אחר',               color: 'var(--text3)' },
];

export const CATEGORY_BY_VALUE = Object.fromEntries(
  FILE_CATEGORIES.map(c => [c.value, c])
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  // Strip path separators and risky characters; keep Hebrew letters and dots.
  return name
    .replace(/[\\/]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .slice(-150); // cap length
}

function buildStoragePath(projectId, filename) {
  const safe = sanitizeFilename(filename);
  const stamp = Date.now();
  return `${projectId || 'unassigned'}/${stamp}_${safe}`;
}

export function getPublicUrl(storagePath) {
  if (!storagePath) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

export function fmtSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function listProjectFiles(projectId) {
  let q = supabase.from('project_files').select('*').order('uploaded_at', { ascending: false });
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function uploadProjectFile({ file, projectId, category = 'other', notes = '' }) {
  if (!file) throw new Error('לא נבחר קובץ');
  if (!projectId) throw new Error('בחר פרויקט פעיל לפני העלאה');

  const path = buildStoragePath(projectId, file.name);

  // 1. Upload bytes
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
  if (upErr) throw new Error('העלאה נכשלה: ' + upErr.message);

  // 2. Metadata row
  const { data, error } = await supabase.from('project_files').insert({
    project_id:   projectId,
    storage_path: path,
    file_name:    file.name,
    category,
    mime_type:    file.type || null,
    size_bytes:   file.size || null,
    notes:        notes || null,
  }).select().single();

  if (error) {
    // Roll back the upload so we don't leave orphans
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error('שמירת מטא-דאטה נכשלה: ' + error.message);
  }
  return data;
}

export async function updateProjectFile(id, patch) {
  const allowed = {};
  ['category', 'notes', 'file_name'].forEach(k => {
    if (patch[k] !== undefined) allowed[k] = patch[k];
  });
  const { data, error } = await supabase
    .from('project_files').update(allowed).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteProjectFile(file) {
  // Best-effort storage cleanup first, then metadata row.
  if (file.storage_path) {
    await supabase.storage.from(BUCKET).remove([file.storage_path]).catch(() => {});
  }
  const { error } = await supabase.from('project_files').delete().eq('id', file.id);
  if (error) throw new Error(error.message);
  return true;
}
