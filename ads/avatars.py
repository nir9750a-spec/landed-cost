# -*- coding: utf-8 -*-
"""אווטארים — מאגר תמונות הרפרנס של ניר.

Every generated scene is "NIR + the real product photo". Until now there was exactly ONE
hardcoded avatar URL, so every ad showed the same face angle, same crop. This module keeps a
registry of MANY reference photos so a scene can pick the one that fits (portrait / half-body /
action / seated), or mix two for a stronger likeness.

Layout:
  ads/avatars/<file>.jpg        the local photos Nir drops in
  ads/avatars/registry.json     {id, file, media_id, tags, note, added}

`media_id` is the Higgsfield media id — filled in by the agent after uploading the photo
(media_upload → PUT → media_confirm). Local files with no media_id yet show up in
`pending_upload()` so a session can flush them in one go.

CLI:
  python avatars.py            list the registry
  python avatars.py scan       add any new local photo as an un-uploaded entry
"""
import os
import json
import datetime

DIR = os.path.join(os.path.dirname(__file__), 'avatars')
REGISTRY = os.path.join(DIR, 'registry.json')
IMAGE_EXT = ('.jpg', '.jpeg', '.png', '.webp')


def _load():
    if os.path.exists(REGISTRY):
        with open(REGISTRY, encoding='utf-8') as f:
            return json.load(f)
    return {'avatars': []}


def _save(reg):
    os.makedirs(DIR, exist_ok=True)
    with open(REGISTRY, 'w', encoding='utf-8') as f:
        json.dump(reg, f, ensure_ascii=False, indent=2)


def list_all(tag=None):
    """Every registered avatar, optionally filtered by tag (e.g. 'portrait', 'seated')."""
    av = _load()['avatars']
    return [a for a in av if not tag or tag in (a.get('tags') or [])]


def ready(tag=None):
    """Only avatars that are usable as a generation reference (have a Higgsfield media_id)."""
    return [a for a in list_all(tag) if a.get('media_id')]


def pending_upload():
    """Photos sitting in ads/avatars/ that still need uploading to Higgsfield."""
    return [a for a in list_all() if not a.get('media_id')]


def get(avatar_id):
    return next((a for a in list_all() if a['id'] == avatar_id), None)


def pick(tag=None, index=0):
    """Deterministic pick — index rotates through the ready avatars (no randomness, so a
    headless run is reproducible and a retry can ask for the NEXT one)."""
    pool = ready(tag) or ready()
    if not pool:
        raise RuntimeError('No uploaded avatar yet. Drop photos in ads/avatars/ and upload them.')
    return pool[index % len(pool)]


def add(file, *, avatar_id=None, media_id=None, tags=(), note='', url=None):
    """Register one avatar photo (idempotent on id)."""
    reg = _load()
    aid = avatar_id or os.path.splitext(os.path.basename(file))[0]
    entry = next((a for a in reg['avatars'] if a['id'] == aid), None)
    if entry is None:
        entry = {'id': aid, 'added': datetime.date.today().isoformat()}
        reg['avatars'].append(entry)
    entry.update({'file': os.path.basename(file) if file else None,
                  'tags': list(tags) or entry.get('tags') or [],
                  'note': note or entry.get('note') or ''})
    if media_id:
        entry['media_id'] = media_id
    if url:
        entry['url'] = url
    _save(reg)
    return entry


def set_media_id(avatar_id, media_id, url=None):
    """Called after the agent uploads the photo to Higgsfield."""
    return add(None, avatar_id=avatar_id, media_id=media_id, url=url)


def scan():
    """Pick up any new image dropped into ads/avatars/ and register it un-uploaded."""
    os.makedirs(DIR, exist_ok=True)
    known = {a.get('file') for a in list_all()}
    found = []
    for name in sorted(os.listdir(DIR)):
        if name.lower().endswith(IMAGE_EXT) and name not in known:
            found.append(add(name, tags=['unsorted'])['id'])
    return found


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'scan':
        new = scan()
        print(f'{len(new)} new photo(s) registered:', ', '.join(new) or '—')
    rows = list_all()
    print(f'{len(rows)} avatar(s) · {len(ready())} ready · {len(pending_upload())} awaiting upload')
    for a in rows:
        mark = '✅' if a.get('media_id') else '⬆️ '
        print(f"  {mark} {a['id']:<24} {','.join(a.get('tags') or []) or '-':<22} {a.get('note', '')}")
