import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
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
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (mounted) setSession(s);
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

  if (!session) return <><GlobalSpinStyle /><LoginPage /></>;

  return (
    <>
      <GlobalSpinStyle />
      {children}
      <SignOutButton email={session.user?.email} />
    </>
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
        position: 'fixed', insetInlineEnd: 12, bottom: 12, zIndex: 9999,
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
