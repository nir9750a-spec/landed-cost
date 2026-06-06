import React, { useEffect, useState } from 'react';
import { LogOut, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import LoginPage from './LoginPage';

// ─────────────────────────────────────────────────────────────────────────────
//  AuthGate — wraps the authenticated app. Renders:
//    • a brief loading state while the session is resolved,
//    • LoginPage when there is no session,
//    • the children (the real App) when a user is signed in.
//
//  Subscribes to onAuthStateChange so sign-in / sign-out flips the UI live.
//  The public /share/<token> guest portal is mounted OUTSIDE this gate (in
//  index.js) and remains accessible without login.
// ─────────────────────────────────────────────────────────────────────────────

export default function AuthGate({ children }) {
  const [session, setSession]   = useState(null);
  const [loading, setLoading]   = useState(true);
  // Initialise from the URL so a "reset password" link shows the set-password
  // form immediately, with no flash of the login screen or the app.
  const [recovery, setRecovery] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
  );

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      // Arriving via the "forgot password" email link — let the user set a new
      // password before dropping them into the app.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', color: 'var(--text2)', fontFamily: 'Heebo, Arial, sans-serif',
      }}>
        <Spinner />
      </div>
    );
  }

  if (recovery) return <><GlobalSpinStyle /><SetNewPassword onDone={() => {
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
    setRecovery(false);
  }} /></>;

  if (!session) return <><GlobalSpinStyle /><LoginPage /></>;

  return (
    <>
      <GlobalSpinStyle />
      {children}
      <SignOutButton email={session.user?.email} />
    </>
  );
}

function SetNewPassword({ onDone }) {
  const [pw, setPw]       = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (pw.length < 6) { setError('הסיסמה חייבת להכיל לפחות 6 תווים'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setError('שגיאה בעדכון הסיסמה — נסה שוב'); return; }
    onDone();
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', direction: 'rtl', fontFamily: 'Heebo, Arial, sans-serif', padding: 20,
    }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: 380, background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '30px 26px', boxShadow: 'var(--glow-soft)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6, textAlign: 'center' }}>
          בחירת סיסמה חדשה
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 18, textAlign: 'center' }}>
          הזן סיסמה חדשה לחשבון שלך
        </div>
        <input
          type="password" value={pw} onChange={e => setPw(e.target.value)} dir="ltr"
          autoComplete="new-password" placeholder="••••••••"
          style={{
            width: '100%', padding: '10px 12px', fontSize: 14, background: 'var(--bg3)',
            border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)',
            boxSizing: 'border-box', marginBottom: 14,
          }}
        />
        {error && (
          <div style={{
            background: 'var(--red-dim)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 14,
          }}>{error}</div>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}
          style={{ width: '100%', justifyContent: 'center', padding: 11, fontSize: 14 }}>
          {busy ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />}
          {busy ? 'רגע...' : 'עדכן סיסמה'}
        </button>
      </form>
    </div>
  );
}

function SignOutButton({ email }) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    // onAuthStateChange flips back to LoginPage; clear active project selection.
    try { localStorage.removeItem('lc_activeProjectId'); } catch { /* ignore */ }
    setBusy(false);
  }
  return (
    <button
      onClick={signOut} disabled={busy} title={email ? `מחובר: ${email}` : 'התנתק'}
      style={{
        // Physical bottom-right so it never overlaps the toast stack, which
        // sits at the physical bottom-left.
        position: 'fixed', right: 12, bottom: 12, zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--bg3)', color: 'var(--text2)',
        border: '1px solid var(--border2)', borderRadius: 999,
        padding: '6px 12px', fontSize: 12, cursor: 'pointer',
        fontFamily: 'Heebo, Arial, sans-serif', direction: 'rtl',
        boxShadow: 'var(--glow-soft)',
      }}
    >
      <LogOut size={13} /> התנתק
    </button>
  );
}

function Spinner() {
  return (
    <>
      <GlobalSpinStyle />
      <div className="spin" style={{
        width: 28, height: 28, border: '3px solid var(--border2)',
        borderTopColor: 'var(--violet)', borderRadius: '50%',
      }} />
    </>
  );
}

function GlobalSpinStyle() {
  return <style>{`
    @keyframes lc-spin { to { transform: rotate(360deg); } }
    .spin { animation: lc-spin 0.8s linear infinite; }
  `}</style>;
}
