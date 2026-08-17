# -*- coding: utf-8 -*-
"""תמונות מוצר נקיות — כדי שרואים מה מוכרים.

In a lifestyle scene Nir is *using* the product, which means his body hides most of it: the
beach ad sells a recliner you can barely see. The fix is the standard e-commerce move —
lifestyle photo PLUS a small clean product card in the corner, so the viewer sees the actual
thing in one glance.

The source can't be the supplier hero photos: most of them are catalog sheets with dimension
arrows, carry bags, multiple views and a competitor logo. So the cutout is generated once per
SKU (product only, plain white, no text) and parked here — same pattern as the scene bank:
the file is local, the CDN `url` is what lets CI fetch it.

  ads/workspace/cutouts/<SKU>.png
  ads/workspace/cutouts/index.json   {sku: {file, url, added}}

CLI:  python cutouts.py     which SKUs have a product card and which don't
"""
import os
import json
import shutil
import datetime
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), 'workspace', 'cutouts')
INDEX = os.path.join(ROOT, 'index.json')


def _load():
    if os.path.exists(INDEX):
        with open(INDEX, encoding='utf-8') as f:
            return json.load(f)
    return {'cutouts': {}}


def _save(idx):
    os.makedirs(ROOT, exist_ok=True)
    with open(INDEX, 'w', encoding='utf-8') as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)


def add(sku, src_path=None, *, url=None, move=False):
    """Register the clean product image for a SKU."""
    ext = os.path.splitext(src_path or url or '.png')[1].split('?')[0] or '.png'
    fname = f'{sku}{ext}'
    if src_path:
        os.makedirs(ROOT, exist_ok=True)
        (shutil.move if move else shutil.copy2)(src_path, os.path.join(ROOT, fname))
    idx = _load()
    idx['cutouts'][sku] = {'file': fname, 'url': url,
                           'added': datetime.date.today().isoformat()}
    _save(idx)
    return os.path.join(ROOT, fname)


def path_for(sku):
    """Local path to the SKU's product card, downloading it from the CDN if needed.
    Returns None when the SKU has no cutout yet — callers must render without one."""
    entry = _load()['cutouts'].get(sku)
    if not entry:
        return None
    dest = os.path.join(ROOT, entry['file'])
    if os.path.exists(dest):
        return dest
    if not entry.get('url'):
        return None
    os.makedirs(ROOT, exist_ok=True)
    try:
        with urllib.request.urlopen(entry['url'], timeout=60) as r, open(dest, 'wb') as f:
            shutil.copyfileobj(r, f)
    except Exception:
        if os.path.exists(dest):
            os.remove(dest)
        return None
    return dest


def have():
    return sorted(_load()['cutouts'])


def missing():
    """SKUs in the catalog with no product card yet."""
    import make_ad_master as M
    got = set(have())
    return [p['id'] for p in M._profiles()['products'] if p['id'] not in got]


if __name__ == '__main__':
    got, miss = have(), missing()
    print(f'{len(got)} product card(s) ready · {len(miss)} missing')
    for s in got:
        print('  ✅', s)
    if miss:
        print('  missing:', ', '.join(miss[:12]) + ('…' if len(miss) > 12 else ''))
