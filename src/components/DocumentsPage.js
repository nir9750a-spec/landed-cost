import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Upload, Download, Trash2, ExternalLink, Filter, Image as ImageIcon, FolderOpen } from 'lucide-react';
import {
  listProjectFiles, uploadProjectFile, updateProjectFile, deleteProjectFile,
  FILE_CATEGORIES, CATEGORY_BY_VALUE, getPublicUrl, fmtSize,
} from '../lib/files';

// ─────────────────────────────────────────────────────────────────────────────
//  Documents page — every file attached to the active project.
//  Multi-purpose: invoices, packing lists, BLs, screenshots from forwarder
//  or customs broker. Files open in a new tab.
// ─────────────────────────────────────────────────────────────────────────────

function CategoryBadge({ value }) {
  const c = CATEGORY_BY_VALUE[value] || CATEGORY_BY_VALUE.other;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 6,
      background: c.color, color: '#000', fontWeight: 700, fontSize: 11,
    }}>
      {c.label}
    </span>
  );
}

function isImage(mime) {
  return typeof mime === 'string' && mime.startsWith('image/');
}

function FileCard({ file, onDelete, onCategoryChange }) {
  const url = getPublicUrl(file.storage_path);
  const dateStr = file.uploaded_at
    ? new Date(file.uploaded_at).toLocaleString('he-IL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 12, marginBottom: 10,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 6, background: 'var(--bg3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {isImage(file.mime_type)
          ? <ImageIcon size={22} style={{ color: 'var(--text2)' }} />
          : <FileText size={22} style={{ color: 'var(--text2)' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, wordBreak: 'break-word' }}>
          {file.file_name}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--text3)' }}>
          <CategoryBadge value={file.category} />
          <span>{fmtSize(file.size_bytes)}</span>
          <span>·</span>
          <span>{dateStr}</span>
        </div>
        {file.notes && (
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text2)' }}>{file.notes}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <select
          value={file.category}
          onChange={e => onCategoryChange(file.id, e.target.value)}
          style={{ fontSize: 11, padding: '4px 6px' }}
          title="שנה קטגוריה"
        >
          {FILE_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        {url && (
          <>
            <a className="btn btn-sm" href={url} target="_blank" rel="noopener noreferrer" title="פתח בכרטיסייה חדשה">
              <ExternalLink size={13} />
            </a>
            <a className="btn btn-sm" href={url} download={file.file_name} title="הורד">
              <Download size={13} />
            </a>
          </>
        )}
        <button className="btn btn-sm btn-danger" onClick={() => onDelete(file)} title="מחק">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

export default function DocumentsPage({ activeProject, activeProjectId, showToast }) {
  const [files, setFiles]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');
  const [filter, setFilter]           = useState('all');
  const [uploading, setUploading]     = useState(false);
  const [pendingCategory, setPendingCategory] = useState('logistics_agent');
  const [pendingNotes, setPendingNotes] = useState('');
  const [dragging, setDragging]       = useState(false);
  const fileRef = useRef();

  const refresh = useCallback(async () => {
    if (!activeProjectId) { setFiles([]); return; }
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await listProjectFiles(activeProjectId);
      setFiles(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleFiles(fileList) {
    if (!activeProjectId) {
      showToast?.('בחר פרויקט פעיל לפני העלאה', 'error');
      return;
    }
    const arr = Array.from(fileList || []);
    if (arr.length === 0) return;

    setUploading(true);
    let okCount = 0;
    for (const file of arr) {
      try {
        await uploadProjectFile({
          file,
          projectId: activeProjectId,
          category: pendingCategory,
          notes: pendingNotes,
        });
        okCount++;
      } catch (err) {
        showToast?.(`שגיאה בהעלאת ${file.name}: ${err.message}`, 'error');
      }
    }
    setUploading(false);
    setPendingNotes('');
    if (okCount > 0) {
      showToast?.(`הועלו ${okCount}/${arr.length} קבצים`);
      refresh();
    }
  }

  async function handleCategoryChange(id, category) {
    try {
      await updateProjectFile(id, { category });
      setFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f));
    } catch (err) {
      showToast?.('שגיאה בעדכון קטגוריה: ' + err.message, 'error');
    }
  }

  async function handleDelete(file) {
    if (!window.confirm(`למחוק את ${file.file_name}?`)) return;
    try {
      await deleteProjectFile(file);
      setFiles(prev => prev.filter(f => f.id !== file.id));
      showToast?.('הקובץ נמחק');
    } catch (err) {
      showToast?.('שגיאה במחיקה: ' + err.message, 'error');
    }
  }

  const visible = filter === 'all' ? files : files.filter(f => f.category === filter);
  const countByCategory = files.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1;
    return acc;
  }, {});

  if (!activeProjectId) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <FolderOpen size={32} style={{ color: 'var(--text3)', margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text2)' }}>בחר פרויקט פעיל מהדף "פרויקטים" כדי לראות ולהעלות מסמכים</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <FileText size={20} style={{ color: 'var(--orange)' }} />
        <h1 className="page-title" style={{ fontSize: 18, margin: 0 }}>מסמכים — {activeProject?.name}</h1>
        <span style={{ color: 'var(--text3)', fontSize: 13 }}>({files.length})</span>
      </div>

      {/* ── Upload zone ────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>קטגוריה לקובץ הבא</label>
            <select value={pendingCategory} onChange={e => setPendingCategory(e.target.value)} style={{ width: '100%' }}>
              {FILE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>הערה (אופציונלי)</label>
            <input
              value={pendingNotes}
              onChange={e => setPendingNotes(e.target.value)}
              placeholder="למשל: שטר מטען מקורי מ-MSC"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--orange)' : 'var(--border)'}`,
            borderRadius: 8,
            padding: 24,
            textAlign: 'center',
            background: dragging ? 'rgba(245,158,11,0.08)' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <Upload size={26} style={{ color: 'var(--text3)', marginBottom: 6 }} />
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            {uploading ? 'מעלה...' : 'גרור קבצים לכאן או לחץ לבחירה — PDF, תמונה, Excel, Word, כל דבר'}
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {/* ── Filter chips ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text3)' }} />
        <button
          className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : ''}`}
          onClick={() => setFilter('all')}
        >
          הכול ({files.length})
        </button>
        {FILE_CATEGORIES.map(c => {
          const n = countByCategory[c.value] || 0;
          if (n === 0 && filter !== c.value) return null;
          return (
            <button
              key={c.value}
              className={`btn btn-sm ${filter === c.value ? 'btn-primary' : ''}`}
              onClick={() => setFilter(c.value)}
            >
              {c.label} ({n})
            </button>
          );
        })}
      </div>

      {errorMsg && (
        <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
          {errorMsg.includes('project_files') && errorMsg.includes('does not exist')
            ? 'הטבלה project_files טרם נוצרה. הרץ את ה-migration החדש ב-Supabase.'
            : errorMsg}
        </div>
      )}

      {loading && files.length === 0 && (
        <div style={{ color: 'var(--text3)', fontSize: 12, padding: 10 }}>טוען...</div>
      )}

      {!loading && visible.length === 0 && (
        <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20, textAlign: 'center' }}>
          {files.length === 0 ? 'אין מסמכים בפרויקט זה.' : 'אין מסמכים בקטגוריה הזו.'}
        </div>
      )}

      {visible.map(f => (
        <FileCard
          key={f.id}
          file={f}
          onDelete={handleDelete}
          onCategoryChange={handleCategoryChange}
        />
      ))}
    </div>
  );
}
