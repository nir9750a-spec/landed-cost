# -*- coding: utf-8 -*-
"""Agent #5 — the LEARNER. Turns published-post metrics into a per (sku, format) score,
so format_router and scout stop guessing and start following what actually sold.

The scoring weights intent over applause: a save or a link click says far more about a
camping chair than a like does. Scores are an exponentially-weighted mean, so a product
that improves after a new photo set is not held down forever by its old numbers.

Metrics arrive from whoever can read them — the Make Instagram connection, a manual paste,
or a CSV export. record() is the only writer; everything else reads workspace/performance.json.
"""
import os
import json
import datetime

PERF_PATH = os.path.join(os.path.dirname(__file__), 'workspace', 'performance.json')

# Intent-weighted: a click is worth 8 likes, a save 5, a comment 3.
WEIGHTS = {'likes': 1.0, 'comments': 3.0, 'saves': 5.0, 'clicks': 8.0, 'shares': 4.0}
ALPHA = 0.4          # how fast a new datapoint displaces the running mean
MIN_REACH = 20       # below this the rate is noise, not signal


def _load():
    if os.path.exists(PERF_PATH):
        with open(PERF_PATH, encoding='utf-8') as f:
            return json.load(f)
    return {'scores': {}, 'history': []}


def _save(p):
    os.makedirs(os.path.dirname(PERF_PATH), exist_ok=True)
    with open(PERF_PATH, 'w', encoding='utf-8') as f:
        json.dump(p, f, ensure_ascii=False, indent=2)


def engagement_rate(metrics):
    """Weighted engagements per person reached. None when reach is too small to mean anything."""
    reach = metrics.get('reach') or metrics.get('impressions') or 0
    if reach < MIN_REACH:
        return None
    weighted = sum(WEIGHTS[k] * float(metrics.get(k) or 0) for k in WEIGHTS)
    return weighted / reach


def record(sku, fmt, metrics, job_id=None, when=None, perf=None, persist=True):
    """Fold one published post's metrics into the running score for (sku, fmt)."""
    perf = perf if perf is not None else _load()
    rate = engagement_rate(metrics)
    when = when or datetime.date.today().isoformat()

    entry = {'sku': sku, 'format': fmt, 'date': when, 'job_id': job_id,
             'rate': rate, 'metrics': metrics}
    perf.setdefault('history', []).append(entry)

    if rate is not None:
        cell = perf.setdefault('scores', {}).setdefault(sku, {}).setdefault(
            fmt, {'n': 0, 'score': 0.0})
        # First real sample seeds the mean; later ones decay toward the newest.
        cell['score'] = rate if cell['n'] == 0 else (1 - ALPHA) * cell['score'] + ALPHA * rate
        cell['n'] += 1
        cell['updated'] = when

    if persist:
        _save(perf)
    return entry


def leaderboard(perf=None, min_n=1):
    """Every (sku, format) with enough samples, best first. This is the weekly read-out."""
    perf = perf if perf is not None else _load()
    rows = [{'sku': sku, 'format': fmt, 'score': c['score'], 'n': c['n']}
            for sku, formats in perf.get('scores', {}).items()
            for fmt, c in formats.items() if c['n'] >= min_n]
    return sorted(rows, key=lambda r: r['score'], reverse=True)


def verdict(perf=None):
    """What the learner would tell Nir this week, in plain Hebrew."""
    board = leaderboard(perf)
    if not board:
        return 'אין עדיין מספיק נתונים — צריך פרסומים עם Insights.'
    best, worst = board[0], board[-1]
    lines = [f"מנצח: {best['sku']} ב-{best['format']} ({best['score']:.3f}, {best['n']} דגימות)"]
    if len(board) > 1:
        lines.append(f"חלש: {worst['sku']} ב-{worst['format']} ({worst['score']:.3f})")
    reels = [r for r in board if r['format'] == 'reel_9x16']
    feeds = [r for r in board if r['format'] == 'feed_4x5']
    if reels and feeds:
        ra = sum(r['score'] for r in reels) / len(reels)
        fa = sum(r['score'] for r in feeds) / len(feeds)
        better = 'רילסים' if ra > fa else 'תמונות'
        lines.append(f"בממוצע {better} עובדים יותר ({ra:.3f} מול {fa:.3f})")
    return ' · '.join(lines)


if __name__ == '__main__':
    print(verdict())
    for r in leaderboard():
        print(f"  {r['sku']:<14} {r['format']:<11} {r['score']:.3f}  n={r['n']}")
