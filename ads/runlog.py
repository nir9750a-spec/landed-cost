# -*- coding: utf-8 -*-
"""יומן ריצה — איך רואים מה עבד ומה לא כשאף אחד לא מסתכל.

A headless engine is only trustworthy if it *reports*. Every headless run opens a Run, logs
each step, and closes it with ok/failed. Three places you can see it:

  1. Telegram   — one short message per run (and a loud one on failure). Your phone is the
                  dashboard; you already get the approval cards there.
  2. JSONL      — ads/workspace/runs.jsonl, one line per step. Grep-able, survives locally.
  3. GitHub Actions — the workflow run page keeps stdout + exit code for every scheduled run.

Deliberately dependency-free: if Telegram is down the run still completes and still logs.
"""
import os
import sys
import json
import time
import datetime
import traceback

# A Hebrew Windows console is cp1255 and cannot encode the status emoji — printing a single
# ❌ used to raise UnicodeEncodeError and kill the run *while it was reporting a failure*,
# hiding the real error behind an encoding traceback. Force UTF-8 and never die on output.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

LOG = os.path.join(os.path.dirname(__file__), 'workspace', 'runs.jsonl')
_ICON = {'ok': '✅', 'failed': '❌', 'skipped': '⏭️', 'warn': '⚠️'}


def _write(record):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(json.dumps(record, ensure_ascii=False) + '\n')


def notify(text, quiet=False):
    """Best-effort Telegram message. Never raises — a broken notifier must not fail a run."""
    if quiet:
        return False
    try:
        import telegram_gate as T
        T._post_json('sendMessage', {'chat_id': T.resolve_chat_id(), 'text': text[:4000],
                                     'disable_web_page_preview': True})
        return True
    except Exception as e:
        _write({'ts': datetime.datetime.now().isoformat(timespec='seconds'),
                'kind': 'notify_failed', 'error': str(e)})
        return False


class Run:
    """with Run('daily-ad') as run: run.step('render', ok=True, detail=...)

    On exit it writes a summary line and pushes one Telegram message. An exception inside the
    block is caught, logged, announced, and re-raised so CI goes red."""

    def __init__(self, name, quiet=False):
        self.name = name
        self.quiet = quiet
        self.steps = []
        self.started = time.time()
        self.id = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')

    def step(self, label, ok=True, detail='', status=None):
        st = status or ('ok' if ok else 'failed')
        self.steps.append({'label': label, 'status': st, 'detail': str(detail)[:500]})
        _write({'ts': datetime.datetime.now().isoformat(timespec='seconds'), 'run': self.id,
                'name': self.name, 'step': label, 'status': st, 'detail': str(detail)[:500]})
        line = f'{_ICON.get(st, "·")} {label}' + (f' — {detail}' if detail else '')
        try:
            print(line)
        except Exception:                       # last-resort: never let logging break a run
            print(line.encode('ascii', 'replace').decode('ascii'))
        return ok

    def fail(self, label, detail=''):
        return self.step(label, ok=False, detail=detail)

    @property
    def failed(self):
        return [s for s in self.steps if s['status'] == 'failed']

    def summary(self):
        secs = int(time.time() - self.started)
        head = ('❌ נכשל' if self.failed else '✅ הצליח')
        lines = [f'{head} · {self.name} · {secs}s',
                 datetime.datetime.now().strftime('%d/%m %H:%M')]
        for s in self.steps:
            lines.append(f"{_ICON.get(s['status'], '·')} {s['label']}"
                         + (f" — {s['detail']}" if s['detail'] else ''))
        return '\n'.join(lines)

    def __enter__(self):
        _write({'ts': datetime.datetime.now().isoformat(timespec='seconds'), 'run': self.id,
                'name': self.name, 'step': '__start__', 'status': 'ok', 'detail': ''})
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc is not None:
            self.step('unhandled error', ok=False, detail=f'{exc_type.__name__}: {exc}')
            _write({'ts': datetime.datetime.now().isoformat(timespec='seconds'), 'run': self.id,
                    'name': self.name, 'step': '__traceback__', 'status': 'failed',
                    'detail': traceback.format_exc()[-1500:]})
        notify(self.summary(), quiet=self.quiet)
        return False        # re-raise: a failed scheduled run must exit non-zero


def recent(n=20, name=None):
    """Last N log lines — `python runlog.py` prints them."""
    if not os.path.exists(LOG):
        return []
    with open(LOG, encoding='utf-8') as f:
        rows = [json.loads(l) for l in f if l.strip()]
    if name:
        rows = [r for r in rows if r.get('name') == name]
    return rows[-n:]


def last_run_status(name=None):
    """'ok' / 'failed' / None — the health of the most recent run."""
    rows = [r for r in recent(500, name) if r.get('step') not in ('__start__', '__traceback__')]
    if not rows:
        return None
    last_id = rows[-1].get('run')
    same = [r for r in rows if r.get('run') == last_id]
    return 'failed' if any(r['status'] == 'failed' for r in same) else 'ok'


if __name__ == '__main__':
    rows = recent(30)
    if not rows:
        print('no runs logged yet.')
    for r in rows:
        print(f"{r['ts']}  {_ICON.get(r['status'], '·')} {r.get('name', '?'):<12} "
              f"{r.get('step', '')}  {r.get('detail', '')[:80]}")
    print('\nlast run:', last_run_status() or '—')
