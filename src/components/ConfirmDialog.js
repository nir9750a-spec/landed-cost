import React, { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, X, Check } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
//  ConfirmDialog — styled, RTL-aware replacement for window.confirm() and
//  window.alert(). Exposed via a Promise-based confirmAsync() helper so
//  existing callsites can be migrated with one line of change:
//
//    OLD:  if (!window.confirm('Sure?')) return;
//    NEW:  if (!(await confirmAsync('Sure?'))) return;
//
//  Or with more control:
//    await confirmAsync({ title, message, confirmLabel, danger: true })
// ─────────────────────────────────────────────────────────────────────────────

let setStateRef = null;

export function confirmAsync(input) {
  if (!setStateRef) {
    // Fallback to window.confirm if the host component hasn't mounted yet.
    // Keeps the function safe to call at any time.
    if (typeof input === 'string') return Promise.resolve(window.confirm(input));
    return Promise.resolve(window.confirm(input.message || ''));
  }
  return new Promise((resolve) => {
    const opts = typeof input === 'string' ? { message: input } : (input || {});
    setStateRef({
      open: true,
      title:        opts.title        || 'אישור',
      message:      opts.message      || '',
      confirmLabel: opts.confirmLabel || 'אישור',
      cancelLabel:  opts.cancelLabel  || 'ביטול',
      danger:       !!opts.danger,
      info:         !!opts.info,   // info mode: only one button, mimics alert()
      onResolve:    resolve,
    });
  });
}

export function alertAsync(message, title = 'הודעה') {
  return confirmAsync({ message, title, info: true, confirmLabel: 'סגור' });
}

const INITIAL = { open: false, title: '', message: '', confirmLabel: '', cancelLabel: '', danger: false, info: false, onResolve: null };

export default function ConfirmDialogHost() {
  const [state, setState] = useState(INITIAL);

  // Register the setter so confirmAsync can reach it
  useEffect(() => {
    setStateRef = setState;
    return () => { setStateRef = null; };
  }, []);

  // ESC to cancel, Enter to confirm
  useEffect(() => {
    if (!state.open) return;
    function onKey(e) {
      if (e.key === 'Escape') handle(false);
      else if (e.key === 'Enter') handle(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open]);

  const handle = useCallback((result) => {
    setState(prev => {
      if (prev.onResolve) prev.onResolve(result);
      return INITIAL;
    });
  }, []);

  if (!state.open) return null;

  const accentColor = state.danger ? 'var(--red)' : 'var(--orange)';

  return (
    <div
      className="modal-overlay"
      onClick={() => handle(false)}
      style={{ alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        className="modal"
        style={{ maxWidth: 460, padding: 0 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={{
          padding: '20px 24px 0',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `${accentColor}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle size={18} style={{ color: accentColor }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{state.title}</div>
            <div style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {state.message}
            </div>
          </div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => handle(false)}
            title="סגור"
            style={{ padding: 4 }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{
          padding: '16px 24px 20px',
          marginTop: 16,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          {!state.info && (
            <button className="btn" onClick={() => handle(false)}>
              {state.cancelLabel}
            </button>
          )}
          <button
            className={state.danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => handle(true)}
            autoFocus
          >
            <Check size={13} /> {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
