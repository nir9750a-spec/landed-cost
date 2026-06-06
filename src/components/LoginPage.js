import React, { useState } from 'react';
import { LogIn, UserPlus, Mail, Lock, Loader2, KeyRound, ArrowRight, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
//  LoginPage — landing + auth gate for Importly.
//
//  Modes: signin | signup | reset (forgot password).
//  Methods: email+password, plus OAuth (Google, Apple) — the OAuth buttons
//  require the matching provider to be enabled in Supabase → Auth → Providers,
//  otherwise they return a friendly "not configured yet" message.
// ─────────────────────────────────────────────────────────────────────────────

// ⚙️  EDIT THESE — your real support contacts (shown in the footer).
const SUPPORT_EMAIL    = 'nir9750a@gmail.com';
const SUPPORT_WHATSAPP = '972524422320'; // digits only, international format

export default function LoginPage() {
  const [mode, setMode]         = useState('signin'); // signin | signup | reset
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [oauthBusy, setOauthBusy] = useState('');
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');

  function switchMode(m) { setMode(m); setError(''); setNotice(''); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setNotice('');

    if (mode === 'reset') {
      if (!email.trim()) { setError('הזן אימייל לאיפוס'); return; }
      setBusy(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setNotice('נשלח אליך קישור לאיפוס סיסמה. בדוק את תיבת הדואר.');
        setMode('signin');
      } catch (err) {
        setError(translateAuthError(err?.message));
      } finally { setBusy(false); }
      return;
    }

    if (!email.trim() || !password) { setError('יש למלא אימייל וסיסמה'); return; }
    if (mode === 'signup' && password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים'); return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          setNotice('נשלח אליך אימייל לאישור החשבון. אשר אותו ואז התחבר.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(translateAuthError(err?.message));
    } finally { setBusy(false); }
  }

  async function oauth(provider) {
    setError(''); setNotice(''); setOauthBusy(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // On success the browser redirects to the provider — nothing more here.
    } catch (err) {
      setOauthBusy('');
      const m = (err?.message || '').toLowerCase();
      if (m.includes('not enabled') || m.includes('unsupported') || m.includes('provider')) {
        setError(`ההתחברות עם ${provider === 'google' ? 'Google' : 'Apple'} עדיין לא הופעלה בהגדרות`);
      } else {
        setError(translateAuthError(err?.message));
      }
    }
  }

  const submitLabel =
    mode === 'signin' ? 'התחבר' : mode === 'signup' ? 'הרשם' : 'שלח קישור איפוס';
  const SubmitIcon =
    mode === 'signin' ? LogIn : mode === 'signup' ? UserPlus : KeyRound;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)', direction: 'rtl',
      fontFamily: 'Heebo, "DM Sans", Arial, sans-serif', padding: 20, gap: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 410, background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 18, padding: '34px 30px',
        boxShadow: 'var(--glow-soft)', animation: 'fade-in-up 0.4s ease',
      }}>
        {/* Brand / logo */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 18, background: 'var(--grad-brand)',
            boxShadow: 'var(--glow-violet)', marginBottom: 14,
          }}>
            <ArrowRight size={32} color="#fff" style={{ transform: 'rotate(-45deg)' }} />
          </div>
          <div style={{
            fontSize: 38, fontWeight: 800, letterSpacing: -1, lineHeight: 1,
            background: 'var(--grad-brand)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Importly
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>
            {mode === 'signin' ? 'התחברות לחשבון שלך'
              : mode === 'signup' ? 'יצירת חשבון חדש'
              : 'איפוס סיסמה'}
          </div>
        </div>

        {/* OAuth */}
        {mode !== 'reset' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
              <button type="button" onClick={() => oauth('google')} disabled={!!oauthBusy} style={oauthBtnStyle}>
                {oauthBusy === 'google' ? <Loader2 size={16} className="spin" /> : <GoogleIcon />}
                המשך עם Google
              </button>
              <button type="button" onClick={() => oauth('apple')} disabled={!!oauthBusy} style={oauthBtnStyle}>
                {oauthBusy === 'apple' ? <Loader2 size={16} className="spin" /> : <AppleIcon />}
                המשך עם Apple
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px', color: 'var(--text3)', fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              או באמצעות אימייל
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}><Mail size={13} /> אימייל</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              dir="ltr" autoComplete="email" placeholder="you@company.com" style={inputStyle} disabled={busy} />
          </div>

          {mode !== 'reset' && (
            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}><Lock size={13} /> סיסמה</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                dir="ltr" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="••••••••" style={inputStyle} disabled={busy} />
            </div>
          )}

          {mode === 'signin' && (
            <div style={{ textAlign: 'left', marginBottom: 14 }}>
              <button type="button" onClick={() => switchMode('reset')} style={{ ...linkBtnStyle, fontSize: 12 }}>
                שכחתי סיסמה
              </button>
            </div>
          )}

          {error && <div style={alertStyle('error')}>{error}</div>}
          {notice && <div style={alertStyle('ok')}>{notice}</div>}

          <button type="submit" className="btn btn-primary" disabled={busy}
            style={{ width: '100%', justifyContent: 'center', padding: 11, fontSize: 14, marginTop: 4 }}>
            {busy ? <Loader2 size={15} className="spin" /> : <SubmitIcon size={15} />}
            {busy ? 'רגע...' : submitLabel}
          </button>
        </form>

        {/* Mode switches */}
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text2)' }}>
          {mode === 'signin' && (
            <>אין לך חשבון?{' '}
              <button type="button" onClick={() => switchMode('signup')} style={linkBtnStyle}>הצטרפות</button>
            </>
          )}
          {mode === 'signup' && (
            <>כבר יש לך חשבון?{' '}
              <button type="button" onClick={() => switchMode('signin')} style={linkBtnStyle}>התחבר</button>
            </>
          )}
          {mode === 'reset' && (
            <button type="button" onClick={() => switchMode('signin')} style={linkBtnStyle}>חזרה להתחברות</button>
          )}
        </div>
      </div>

      {/* Support footer */}
      <div style={{
        fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center',
        gap: 16, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <span>תמיכה טכנית:</span>
        <a href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>
          <Mail size={13} /> {SUPPORT_EMAIL}
        </a>
        <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noreferrer" style={footerLink}>
          <MessageCircle size={13} /> וואטסאפ
        </a>
      </div>
    </div>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────
const labelStyle = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontWeight: 600 };
const inputStyle = { width: '100%', padding: '10px 12px', fontSize: 14, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', boxSizing: 'border-box' };
const linkBtnStyle = { background: 'none', border: 'none', color: 'var(--violet)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 };
const oauthBtnStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: '10px', fontSize: 14, fontWeight: 600, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, cursor: 'pointer' };
const footerLink = { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text2)', textDecoration: 'none' };
function alertStyle(kind) {
  const ok = kind === 'ok';
  return {
    background: ok ? 'var(--green-dim)' : 'var(--red-dim)',
    color: ok ? '#6ee7b7' : '#fca5a5',
    border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
    borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12,
  };
}

// ── brand glyphs (lucide has no brand icons) ─────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 1.43c.06 1.06-.34 2.09-1 2.84-.69.78-1.83 1.38-2.94 1.29-.08-1.02.42-2.08 1.05-2.74.7-.74 1.9-1.31 2.89-1.39zM20.1 17.2c-.55 1.27-.82 1.84-1.53 2.97-.99 1.57-2.39 3.53-4.12 3.54-1.54.02-1.94-1-4.03-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.05-1.78-4.04-3.35C-.34 16.79-.62 11.3 1.4 8.43c.96-1.39 2.48-2.27 3.93-2.27 1.48 0 2.41 1.01 3.63 1.01 1.19 0 1.91-1.01 3.62-1.01 1.29 0 2.66.7 3.64 1.92-3.2 1.75-2.68 6.32.28 7.7z"/>
    </svg>
  );
}

// Translate the most common Supabase auth errors to Hebrew.
function translateAuthError(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'אימייל או סיסמה שגויים';
  if (m.includes('email not confirmed'))       return 'האימייל עדיין לא אושר — בדוק את תיבת הדואר';
  if (m.includes('user already registered'))    return 'האימייל כבר רשום — התחבר במקום';
  if (m.includes('rate limit') || m.includes('too many')) return 'יותר מדי ניסיונות — נסה שוב בעוד דקה';
  if (m.includes('password'))                   return 'הסיסמה אינה עומדת בדרישות (לפחות 6 תווים)';
  return msg || 'שגיאת התחברות';
}
