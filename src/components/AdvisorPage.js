import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles, Send, User, RotateCcw } from 'lucide-react';
import { calcProducts, calcTotals } from '../lib/calculations';
import {
  askAdvisor, buildProjectContext, ADVISOR_SUGGESTIONS,
} from '../lib/advisor';

// ── Very small Markdown-ish renderer ─────────────────────────────────────────
// The advisor replies in light Markdown (##, **bold**, - bullets). We render it
// without pulling a dependency: headings, bold, and bullet lists, RTL-safe.
function renderRich(text) {
  const lines = String(text).split('\n');
  const out = [];
  let list = null;

  const flushList = () => {
    if (list) { out.push(<ul key={'ul' + out.length} className="advisor-ul">{list}</ul>); list = null; }
  };

  const inline = (s) => {
    // **bold**
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      /^\*\*[^*]+\*\*$/.test(p)
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : <span key={i}>{p}</span>
    );
  };

  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (/^#{1,4}\s/.test(line)) {
      flushList();
      const t = line.replace(/^#{1,4}\s/, '');
      out.push(<div key={i} className="advisor-h">{inline(t)}</div>);
    } else if (/^\s*[-•]\s/.test(line)) {
      const t = line.replace(/^\s*[-•]\s/, '');
      (list = list || []).push(<li key={i}>{inline(t)}</li>);
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      out.push(<p key={i} className="advisor-p">{inline(line)}</p>);
    }
  });
  flushList();
  return out;
}

export default function AdvisorPage({ products, settings, calcCtx, activeProject }) {
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const scrollRef = useRef(null);
  const taRef     = useRef(null);

  // Live landed-cost totals for the active project → grounding context.
  const context = useMemo(() => {
    let totals = {};
    let calced = products;
    try {
      calced = calcProducts(products || [], settings, calcCtx || {});
      totals = calcTotals(calced);
    } catch {
      totals = {};
    }
    return buildProjectContext({
      project: activeProject, settings, totals, products: calced,
    });
  }, [products, settings, calcCtx, activeProject]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setError(null);
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
    setLoading(true);
    try {
      const reply = await askAdvisor({ history: next, context });
      setMessages(m => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e.message || 'שגיאה בפנייה לסוכן');
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function autosize(e) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  const empty = messages.length === 0;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={20} style={{ color: 'var(--purple)' }} />
          סוכן היבוא
          {activeProject && (
            <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}>
              · {activeProject.name}
            </span>
          )}
        </h1>
        {!empty && (
          <button className="btn btn-sm btn-ghost" onClick={() => { setMessages([]); setError(null); }}>
            <RotateCcw size={14} /> שיחה חדשה
          </button>
        )}
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: 0 }}>
        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px', minHeight: 0 }}>
          {empty && (
            <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', paddingTop: 32 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
                background: 'var(--purple-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={26} style={{ color: 'var(--purple)' }} />
              </div>
              <h2 style={{ fontSize: 20, marginBottom: 8 }}>שלום, אני סוכן היבוא שלך 👋</h2>
              <p style={{ color: 'var(--text2)', marginBottom: 24, lineHeight: 1.6 }}>
                מומחה למכס, מע"מ, עמילות, שילוח, תקינה ותמחור עלות נחיתה — עם גישה מלאה
                לנתוני הפרויקט הפעיל שלך. שאל אותי כל דבר על העסק.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, textAlign: 'right' }}>
                {ADVISOR_SUGGESTIONS.map((q, i) => (
                  <button
                    key={i}
                    className="card"
                    onClick={() => send(q)}
                    style={{ cursor: 'pointer', textAlign: 'right', border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.5 }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!empty && (
            <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {messages.map((m, i) => (
                <Bubble key={i} role={m.role}>{m.content}</Bubble>
              ))}
              {loading && (
                <div className="advisor-msg advisor-assistant">
                  <div className="advisor-avatar" style={{ background: 'var(--purple-dim)', color: 'var(--purple)' }}>
                    <Sparkles size={15} />
                  </div>
                  <div className="advisor-bubble" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)' }}>
                    <span className="spinner" style={{ width: 14, height: 14 }} /> חושב…
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ maxWidth: 820, margin: '12px auto 0', color: 'var(--red)', fontSize: 13, textAlign: 'center' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 24px', background: 'var(--bg2)' }}>
          <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={taRef}
              value={input}
              onChange={autosize}
              onKeyDown={onKeyDown}
              placeholder="שאל את סוכן היבוא… (Enter לשליחה, Shift+Enter לשורה חדשה)"
              rows={1}
              style={{
                flex: 1, resize: 'none', minHeight: 44, maxHeight: 160,
                padding: '11px 14px', borderRadius: 12, lineHeight: 1.5,
              }}
            />
            <button
              className="btn btn-primary"
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{ height: 44, paddingInline: 16 }}
              title="שלח"
            >
              <Send size={16} />
            </button>
          </div>
          <div style={{ maxWidth: 820, margin: '6px auto 0', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
            הסוכן מספק מידע כללי ואינו תחליף לייעוץ של עמיל מכס או רו"ח. לשיעורי מכס מדויקים השתמש בעמוד "תקינה ומכס".
          </div>
        </div>
      </div>
    </>
  );
}

function Bubble({ role, children }) {
  const isUser = role === 'user';
  return (
    <div className={`advisor-msg ${isUser ? 'advisor-user' : 'advisor-assistant'}`}>
      <div className="advisor-avatar" style={{
        background: isUser ? 'var(--bg4)' : 'var(--purple-dim)',
        color: isUser ? 'var(--text)' : 'var(--purple)',
      }}>
        {isUser ? <User size={15} /> : <Sparkles size={15} />}
      </div>
      <div className="advisor-bubble">
        {isUser ? <p className="advisor-p" style={{ whiteSpace: 'pre-wrap' }}>{children}</p> : renderRich(children)}
      </div>
    </div>
  );
}
