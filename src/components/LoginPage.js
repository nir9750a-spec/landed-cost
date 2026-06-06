import React, { useState } from 'react';
import { LogIn, UserPlus, Mail, Lock, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
//  LoginPage — Supabase email + password auth gate.
//
//  Two modes: sign in (default) and sign up. After sign-up, Supabase may
//  require email confirmation (depends on the project's Auth settings); we
//  surface that state instead of pretending the user is logged in.
//
//  This is the first line of multi-tenancy: once a user is authenticated, the
//  Supabase client attaches their JWT to every request, so auth.uid() is
//  available for owner-scoped RLS (Phase B).
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [mode, setMode]         = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setNotice('');
    if (!email.trim() || !password) { setError('יש למלא אימייל וסיסמה'); return; }
    if (mode === 'signup' && password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים'); return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // On success, onAuthStateChange in AuthGate swaps to the app.
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        // If email confirmation is required, there's no active session yet.
        if (!data.session) {
          setNotice('נשלח אליך אימייל לאישור החשבון. אשר אותו ואז התחבר.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(translateAuthError(err?.message || 'שגיאת התחברות'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', direction: 'rtl', fontFamily: 'Heebo, "DM Sans", Arial, sans-serif',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 400, background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 16, padding: '32px 28px',
        boxShadow: 'var(--glow-soft)',
      }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{
            fontSize: 30, fontWeight: 800, letterSpacing: -0.5,
            background: 'var(--grad-brand)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 6,
          }}>
            Importly
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            {mode === 'signin' ? 'התחברות לחשבון שלך' : 'יצירת חשבון חדש'}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}><Mail size={13} /> אימייל</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              dir="ltr" autoComplete="email" placeholder="you@company.com"
              style={inputStyle} disabled={busy}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}><Lock size={13} /> סיסמה</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              dir="ltr" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder="••••••••" style={inputStyle} disabled={busy}
            />
          </div>

          {error && (
            <div style={{
              background: 'var(--red-dim)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 14,
            }}>{error}</div>
          )}
          {notice && (
            <div style={{
              background: 'var(--green-dim)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 14,
            }}>{notice}</div>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}
            style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: 14 }}>
            {busy ? <Loader2 size={15} className="spin" />
                  : mode === 'signin' ? <LogIn size={15} /> : <UserPlus size={15} />}
            {busy ? 'רגע...' : mode === 'signin' ? 'התחבר' : 'הרשם'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text2)' }}>
          {mode === 'signin' ? (
            <>אין לך חשבון?{' '}
              <button type="button" onClick={() => { setMode('signup'); setError(''); setNotice(''); }}
                style={linkBtnStyle}>צור חשבון</button>
            </>
          ) : (
            <>כבר יש לך חשבון?{' '}
              <button type="button" onClick={() => { setMode('signin'); setError(''); setNotice(''); }}
                style={linkBtnStyle}>התחבר</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
  color: 'var(--text2)', marginBottom: 6, fontWeight: 600,
};
const inputStyle = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8,
  color: 'var(--text)', boxSizing: 'border-box',
};
const linkBtnStyle = {
  background: 'none', border: 'none', color: 'var(--violet)', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, padding: 0,
};

// Translate the most common Supabase auth errors to Hebrew.
function translateAuthError(msg) {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'אימייל או סיסמה שגויים';
  if (m.includes('email not confirmed'))       return 'האימייל עדיין לא אושר — בדוק את תיבת הדואר';
  if (m.includes('user already registered'))    return 'האימייל כבר רשום — התחבר במקום';
  if (m.includes('rate limit') || m.includes('too many')) return 'יותר מדי ניסיונות — נסה שוב בעוד דקה';
  if (m.includes('password'))                   return 'הסיסמה אינה עומדת בדרישות (לפחות 6 תווים)';
  return msg;
}
