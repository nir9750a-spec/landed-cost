# -*- coding: utf-8 -*-
"""בנק סצנות — מה שמאפשר לכל היום לרוץ בלי מחשב פתוח.

THE problem: generating a "NIR + real product" scene goes through the Higgsfield MCP, which
only exists inside a Claude session. Everything else in the engine (render, queue, Telegram,
publish) is plain HTTP and can run anywhere.

THE fix: decouple them in time. In one session we generate a BATCH of scenes up front and
park them here. The daily headless run then just *takes* a scene from the bank — no AI, no
session, no laptop. When the bank runs low it tells us, and we refill in one sitting.

Layout:
  ads/workspace/scene-bank/<SKU>/<scene>__<n>.png
  ads/workspace/scene-bank/index.json   {sku: [{file, scene, used_at, job_id}]}

CLI:
  python scene_bank.py            stock report
  python scene_bank.py import     adopt loose files already in workspace/scenes/
"""
import os
import json
import shutil
import datetime
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), 'workspace', 'scene-bank')
INDEX = os.path.join(ROOT, 'index.json')
LOW_STOCK = 2          # per SKU — below this we ask for a refill


def _load():
    if os.path.exists(INDEX):
        with open(INDEX, encoding='utf-8') as f:
            return json.load(f)
    return {'scenes': {}}


def _save(idx):
    os.makedirs(ROOT, exist_ok=True)
    with open(INDEX, 'w', encoding='utf-8') as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)


def path_of(sku, entry):
    return os.path.join(ROOT, sku, entry['file'])


def _ensure_local(sku, entry):
    """Return a local path for a bank entry, downloading it from `url` if the bytes aren't
    here. This is what lets CI run with a light repo: index.json is committed, the PNGs are
    fetched from the Higgsfield CDN on demand."""
    dest = path_of(sku, entry)
    if os.path.exists(dest):
        return dest
    url = entry.get('url')
    if not url:
        return None
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=60) as r, open(dest, 'wb') as f:
            shutil.copyfileobj(r, f)
    except Exception:
        if os.path.exists(dest):
            os.remove(dest)
        return None
    return dest


def add(sku, scene, src_path=None, *, avatar_id=None, move=False, url=None):
    """Park one generated scene image in the bank. Give it a local file, a CDN url, or both —
    the url is what makes the entry usable from a machine that never saw the file."""
    idx = _load()
    bucket = idx['scenes'].setdefault(sku, [])
    n = sum(1 for e in bucket if e['scene'] == scene) + 1
    ext = os.path.splitext(src_path or url or '.png')[1].split('?')[0] or '.png'
    fname = f'{scene}__{n}{ext}'
    dest_dir = os.path.join(ROOT, sku)
    dest = os.path.join(dest_dir, fname)
    if src_path:
        os.makedirs(dest_dir, exist_ok=True)
        (shutil.move if move else shutil.copy2)(src_path, dest)
    entry = {'file': fname, 'scene': scene, 'avatar_id': avatar_id, 'url': url,
             'added': datetime.date.today().isoformat(), 'used_at': None, 'job_id': None}
    bucket.append(entry)
    _save(idx)
    return dest


def available(sku=None):
    """Unused scenes, oldest first (so the bank drains FIFO)."""
    idx = _load()['scenes']
    skus = [sku] if sku else list(idx)
    out = []
    for s in skus:
        for e in idx.get(s, []):
            if not e.get('used_at'):
                out.append({**e, 'sku': s, 'path': path_of(s, e)})
    return sorted(out, key=lambda e: e['added'])


def take(sku, scene=None, mark=True):
    """Claim the next unused scene for a SKU. Returns its path, or None if the bank is dry.
    `mark=False` peeks without consuming (used by the dry-run)."""
    pool = [e for e in available(sku) if not scene or e['scene'] == scene]
    if not pool:
        return None
    picked = pool[0]
    local = _ensure_local(sku, picked)            # download from the CDN if not on this machine
    if not local:                                 # index says yes, disk and CDN say no
        release(sku, picked['file'], missing=True)
        return take(sku, scene, mark)
    picked['path'] = local
    if mark:
        idx = _load()
        for e in idx['scenes'].get(sku, []):
            if e['file'] == picked['file']:
                e['used_at'] = datetime.datetime.now().isoformat(timespec='seconds')
        _save(idx)
    return picked['path']


def release(sku, file, *, missing=False, job_id=None):
    """Give a scene back (a retry that never shipped) — or drop a broken index entry."""
    idx = _load()
    bucket = idx['scenes'].get(sku, [])
    if missing:
        idx['scenes'][sku] = [e for e in bucket if e['file'] != file]
    else:
        for e in bucket:
            if e['file'] == file:
                e['used_at'] = None
                e['job_id'] = job_id
    _save(idx)


def attach_job(sku, path, job_id):
    """Record which ad_job a scene ended up in — the audit trail from photo to post."""
    idx = _load()
    for e in idx['scenes'].get(sku, []):
        if e['file'] == os.path.basename(path):
            e['job_id'] = job_id
    _save(idx)


def stats():
    """Per-SKU stock: how many scenes are left, how many were burned."""
    idx = _load()['scenes']
    out = {}
    for sku, entries in idx.items():
        free = [e for e in entries if not e.get('used_at')]
        out[sku] = {'available': len(free), 'used': len(entries) - len(free),
                    'total': len(entries), 'low': len(free) < LOW_STOCK}
    return out


def low_stock():
    """SKUs that need a refill session."""
    return sorted(k for k, v in stats().items() if v['low'])


def days_of_runway(per_day=1):
    return sum(v['available'] for v in stats().values()) // max(per_day, 1)


def import_loose(scenes_dir=None):
    """Adopt the scene PNGs we generated by hand before the bank existed."""
    scenes_dir = scenes_dir or os.path.join(os.path.dirname(__file__), 'workspace', 'scenes')
    if not os.path.isdir(scenes_dir):
        return []
    known = {e['file'] for b in _load()['scenes'].values() for e in b}
    added = []
    for name in sorted(os.listdir(scenes_dir)):
        if not name.endswith(('.png', '.jpg')) or name in known:
            continue
        base = name.rsplit('_scene', 1)[0]                 # YF-YZ-03_scene_r1.png → YF-YZ-03
        scene = 'forest' if name.endswith('_scene.png') else 'desert'
        add(base, scene, os.path.join(scenes_dir, name))
        added.append(f'{base}/{scene}')
    return added


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'import':
        print('imported:', ', '.join(import_loose()) or '—')
    st = stats()
    total = sum(v['available'] for v in st.values())
    print(f'bank: {total} scene(s) ready · ~{days_of_runway()} day(s) of runway')
    for sku, v in sorted(st.items()):
        flag = '⚠️ LOW' if v['low'] else ''
        print(f"  {sku:<12} {v['available']} free / {v['total']} total  {flag}")
    if low_stock():
        print('refill needed for:', ', '.join(low_stock()))
