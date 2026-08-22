# -*- coding: utf-8 -*-
"""בדיקת בריאות — "מה עובד ומה לא", בפקודה אחת.

This is the answer to "how do I develop/debug something I can't see". Run it locally before
touching anything, and let CI run it on every push + every morning before the daily job. It
touches ONLY read-only endpoints and a throwaway render — it never posts, never enqueues,
never publishes.

  python selftest.py            human table, exit 1 if anything critical is broken
  python selftest.py --json     machine output (used by CI)
  python selftest.py --notify   also push the result to Telegram

Each check is (name, critical, fn) where fn returns (ok, detail).
"""
import os
import sys
import json
import tempfile

try:
    from _env import load as _load_env; _load_env()
except Exception:
    pass


def _check_env():
    need = ['SUPABASE_SERVICE_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']
    missing = [k for k in need if not os.environ.get(k)]
    if missing:
        return False, 'missing: ' + ', '.join(missing)
    # A pasted secret that carries a newline or a leading space still "exists", so the
    # missing-check above passes and the failure surfaces much later as an unexplained HTTP
    # 400. Every consumer strips now, so this is cosmetic rather than broken — worth naming
    # so the next confusing 400 has an obvious first suspect, not worth failing the run over.
    dirty = [k for k in need if os.environ[k] != os.environ[k].strip()]
    note = f" · whitespace trimmed from {', '.join(dirty)}" if dirty else ''
    key = os.environ['SUPABASE_SERVICE_KEY'].strip()
    # Supabase migrated projects off the legacy eyJ service_role key. The new sb_secret keys
    # carry the same privileges and bypass RLS exactly the same way — verified against this
    # project, where read and write both pass with one. Whether the key really has the rights
    # is settled by the supabase write check below, not by a prefix.
    if not (key.startswith('eyJ') or key.startswith('sb_secret')):
        return False, 'SUPABASE_SERVICE_KEY is neither a legacy eyJ key nor an sb_secret key'
    kind = 'legacy service_role' if key.startswith('eyJ') else 'sb_secret'
    return True, f'{len(need)} secret(s) present · supabase key: {kind}{note}'


def _check_supabase():
    import ad_queue
    jobs = ad_queue.list_jobs(limit=5)
    by = {}
    for j in jobs:
        by[j['status']] = by.get(j['status'], 0) + 1
    return True, f'{len(jobs)} recent job(s) · ' + ', '.join(f'{k}={v}' for k, v in by.items())


def _check_supabase_write():
    """Prove the key can actually write — RLS 42501 is the classic silent killer here.
    Writes to a job that does not exist: a valid key returns an empty result, a blocked key raises."""
    import ad_queue
    ad_queue.update_job('00000000-0000-0000-0000-000000000000', error=None)
    return True, 'service_role can write (no RLS block)'


def _check_telegram():
    import telegram_gate as T
    me = T._post_json('getMe', {})
    if not me.get('ok'):
        return False, str(me)
    chat = T._post_json('getChat', {'chat_id': T.resolve_chat_id()})
    if not chat.get('ok'):
        return False, 'bot is alive but TELEGRAM_CHAT_ID is wrong: ' + str(chat)
    return True, '@' + me['result'].get('username', '?') + ' → chat ok'


def _check_profiles():
    import make_ad_master as M
    p = M._profiles()
    n = len(p.get('products') or [])
    if not n:
        return False, 'product-profiles.json has no products'
    return True, f'{n} product(s)'


def _check_heroes():
    import make_ad_master as M
    root = os.path.join(os.path.dirname(__file__), '..', 'catalog', 'heroes')
    if not os.path.isdir(root):
        # catalog/ isn't in the repo, so CI has no heroes — that's fine, headless runs draw
        # from the scene bank and never touch the source photos.
        return True, 'catalog/heroes not present (bank-only run)'
    missing = [p['id'] for p in M._profiles()['products']
               if not os.path.exists(os.path.join(root, p['id'] + '.jpg'))]
    if missing:
        return False, f'{len(missing)} product(s) without a hero photo: ' + ', '.join(missing[:5])
    return True, 'every product has a hero photo'


def _check_render():
    """Full render smoke test on a throwaway scene — catches font/Pillow/RTL breakage."""
    from PIL import Image
    import make_ad_master as M
    import supervisor
    sku = supervisor.pick_today(1)[0]['id']
    with tempfile.TemporaryDirectory() as tmp:
        scene = os.path.join(tmp, 'scene.png')
        Image.new('RGB', (928, 1152), (90, 100, 80)).save(scene)
        M.render_from_sku(sku, scene, tmp)
        out = os.path.join(tmp, f'{sku}_feed_4x5.jpg')
        if not os.path.exists(out):
            return False, 'render produced no feed file'
        w, h = Image.open(out).size
    return True, f'rendered {sku} at {w}x{h}'


def _check_bank():
    import scene_bank
    st = scene_bank.stats()
    total = sum(v['available'] for v in st.values())
    if total == 0:
        return False, 'scene bank EMPTY — headless runs have nothing to post'
    low = scene_bank.low_stock()
    detail = f'{total} scene(s) · ~{scene_bank.days_of_runway()} day(s) runway'
    if low:
        return True, detail + ' · ⚠️ low: ' + ', '.join(low)
    return True, detail


def _check_cards():
    """Every SKU with a banked scene should also have a clean product card — without one the
    ad ships with the product half-hidden behind Nir."""
    import cutouts
    import scene_bank
    banked = {e['sku'] for e in scene_bank.available()}
    if not banked:
        return True, 'no banked scenes to check'
    gaps = sorted(banked - set(cutouts.have()))
    if gaps:
        return False, f'{len(gaps)} banked SKU(s) with no product card: ' + ', '.join(gaps)
    return True, f'{len(banked)} banked SKU(s) all have a product card'


def _check_avatars():
    import avatars
    r, p = avatars.ready(), avatars.pending_upload()
    if not r:
        return False, 'no uploaded avatar — scene generation has no face reference'
    return True, f'{len(r)} ready' + (f' · {len(p)} awaiting upload' if p else '')


def _check_decision():
    """The scout/router/learner chain — the part that decides WHAT goes out and in which
    format. It is pure logic with no network, so if it breaks it breaks silently: the
    daily run still posts, just the wrong thing. Cheap to verify, so verify it."""
    import scout
    import format_router
    import learner
    prods = scout.products()
    if not prods:
        return False, 'scout sees no products'
    ranked = scout.rank(prods)
    if len(ranked) != len(prods):
        return False, f'rank() returned {len(ranked)} of {len(prods)} products'
    sku = ranked[0]['sku']
    fmt, why = format_router.choose(sku, '12:00')
    if fmt not in ('feed_4x5', 'reel_9x16'):
        return False, f'router returned an unknown format {fmt!r}'
    board = learner.leaderboard()
    tail = f' · {len(board)} scored (sku,format) pair(s)' if board else ' · no metrics yet'
    return True, f'next up {sku} → {fmt} ({why}){tail}'


def _check_bundles():
    """The Sukkot bundles: every SKU must exist, and every bundle must clear the free-shipping
    threshold on its own. A bundle that references a dead SKU or lands under the threshold
    reads fine in JSON and only fails once it is in front of a customer."""
    import json
    path = os.path.join(os.path.dirname(__file__), 'bundles.json')
    if not os.path.exists(path):
        return True, 'no bundles.json — single-SKU rotation only'
    with open(path, encoding='utf-8') as f:
        cfg = json.load(f)
    import scout
    known = {p['id'] for p in scout.products()}
    bundles = cfg.get('bundles', [])
    problems = []
    for b in bundles:
        missing = [i for i in b['items'] if i not in known]
        if missing:
            problems.append(f"{b['id']}: unknown SKU {', '.join(missing)}")
        if b['price'] < cfg.get('free_shipping_threshold', 0):
            problems.append(f"{b['id']}: ₪{b['price']} is under the free-shipping threshold")
    if problems:
        return False, ' · '.join(problems)
    avg = sum(b['price'] for b in bundles) / len(bundles) if bundles else 0
    return True, f'{len(bundles)} bundle(s) · average basket ₪{avg:.0f}'


def _check_last_run():
    import runlog
    st = runlog.last_run_status()
    if st is None:
        return True, 'no headless run logged yet'
    return st == 'ok', f'last run: {st}'


CHECKS = [
    ('env / secrets',      True,  _check_env),
    ('supabase read',      True,  _check_supabase),
    ('supabase write',     True,  _check_supabase_write),
    ('telegram bot',       True,  _check_telegram),
    ('product profiles',   True,  _check_profiles),
    ('hero photos',        False, _check_heroes),
    ('render pipeline',    True,  _check_render),
    ('scene bank',         True,  _check_bank),
    ('product cards',      False, _check_cards),
    ('avatars',            False, _check_avatars),
    ('decision chain',     True,  _check_decision),
    ('sukkot bundles',     True,  _check_bundles),
    ('last headless run',  False, _check_last_run),
]


def run():
    results = []
    for name, critical, fn in CHECKS:
        try:
            ok, detail = fn()
        except Exception as e:
            ok, detail = False, f'{type(e).__name__}: {e}'
        results.append({'check': name, 'ok': bool(ok), 'critical': critical,
                        'detail': str(detail)})
    return results


def main():
    results = run()
    broken = [r for r in results if not r['ok'] and r['critical']]
    warn = [r for r in results if not r['ok'] and not r['critical']]

    if '--json' in sys.argv:
        print(json.dumps({'ok': not broken, 'results': results}, ensure_ascii=False, indent=2))
    else:
        width = max(len(r['check']) for r in results)
        for r in results:
            icon = '✅' if r['ok'] else ('❌' if r['critical'] else '⚠️ ')
            print(f"{icon} {r['check']:<{width}}  {r['detail']}")
        print()
        print('BROKEN:' if broken else ('OK (with warnings)' if warn else 'ALL GREEN'),
              ', '.join(r['check'] for r in broken) if broken else '')

    if '--notify' in sys.argv:
        import runlog
        head = '❌ בדיקת בריאות נכשלה' if broken else ('⚠️ בריאות: אזהרות' if warn else '✅ הכול תקין')
        body = '\n'.join(('✅' if r['ok'] else ('❌' if r['critical'] else '⚠️'))
                         + f" {r['check']} — {r['detail']}" for r in results)
        runlog.notify(head + '\n' + body)

    return 1 if broken else 0


if __name__ == '__main__':
    sys.exit(main())
