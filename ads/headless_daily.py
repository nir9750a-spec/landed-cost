# -*- coding: utf-8 -*-
"""המחזור היומי — בלי מחשב פתוח.

Entry point for the scheduled cloud run (GitHub Actions). It does the whole morning cycle
using ONLY plain HTTP + local rendering, because the one step that needs a Claude session
— generating the NIR+product scene — was already done in advance and parked in scene_bank.

  1. serve any pending 🔄 retry first (Nir asked for a new version — that outranks a new product)
  2. otherwise pick today's product from the rotation
  3. take a scene from the bank
  4. render feed+reel, enqueue the job, send the Telegram approval card
  5. log every step + report to Telegram; warn when the bank runs low

  python headless_daily.py              real run
  python headless_daily.py --dry-run    render only: no enqueue, no Telegram card, no bank spend
  python headless_daily.py --slot 12:00 reel instead of feed
"""
import os
import sys
import argparse

try:
    from _env import load as _load_env; _load_env()
except Exception:
    pass

import runlog
import scene_bank
import supervisor


def _args(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('--dry-run', action='store_true',
                   help='render only — touches nothing external')
    p.add_argument('--slot', default='07:00', choices=sorted(supervisor.SLOT_FORMAT),
                   help='which daily slot (decides feed vs reel)')
    p.add_argument('--sku', help='force a specific product instead of the rotation')
    return p.parse_args(argv)


def main(argv=None):
    a = _args(argv)
    label = 'daily-ad' + (' (dry-run)' if a.dry_run else '')

    with runlog.Run(label, quiet=a.dry_run) as run:
        # --- 1. retries outrank new products --------------------------------
        # A dry run must stay offline to be worth anything: reading the retry queue hits
        # Supabase, so without secrets the render check died before rendering a thing.
        retries = [] if a.dry_run else supervisor.pending_retries()
        if retries:
            job = retries[0]
            brief = supervisor.retry_brief(job)
            scene = scene_bank.take(job['sku'], mark=not a.dry_run)
            if not scene:
                run.step('retry', status='skipped',
                         detail=f"{job['sku']} needs a new scene, bank empty for it")
            elif a.dry_run:
                run.step('retry', detail=f"would re-serve {job['sku']} from {os.path.basename(scene)}")
                return 0
            else:
                out = supervisor.consume_retries({job['sku']: scene})
                new = (out['resent'] or [None])[0]
                if not new:
                    return run.fail('retry', 'consume_retries returned nothing') or 1
                scene_bank.attach_job(job['sku'], scene, new['id'])
                run.step('retry', detail=f"{job['sku']} → job {new['id'][:8]} (retry #{brief['retries']})")
                _stock_warning(run)
                return 0

        # --- 2. pick today's product ----------------------------------------
        sku = a.sku or supervisor.pick_today(1)[0]['id']
        run.step('pick', detail=sku)

        # --- 3. take a scene from the bank ----------------------------------
        scene = scene_bank.take(sku, mark=not a.dry_run)
        if not scene:
            run.fail('scene', f'bank is empty for {sku} — refill needed before this can post')
            return 1
        run.step('scene', detail=os.path.basename(scene))

        # --- 4. render → queue → approval card -------------------------------
        if a.dry_run:
            import make_ad_master as M
            fmt, why = supervisor.choose_format(sku, a.slot)
            run.step('format', detail=f'{fmt} — {why}')
            spec = supervisor.build_spec(sku, fmt=fmt)
            M.render_from_sku(sku, scene, os.path.join(os.path.dirname(__file__),
                                                       'workspace', 'dry-run'))
            run.step('render', detail=f"{spec['format']} · {spec['hook']}")
            run.step('enqueue', status='skipped', detail='dry-run')
            return 0

        jobs = supervisor.run({sku: scene}, slot=a.slot)
        if not jobs:
            return run.fail('enqueue', 'supervisor.run produced no job') or 1
        job = jobs[0]
        scene_bank.attach_job(sku, scene, job['id'])
        run.step('enqueue', detail=f"job {job['id'][:8]} · {job['format']}")
        run.step('approval card', detail='sent to Telegram — waiting for ✅')

        _stock_warning(run)
    return 0


def _stock_warning(run):
    low = scene_bank.low_stock()
    runway = scene_bank.days_of_runway()
    if runway <= 3:
        run.step('bank stock', status='warn',
                 detail=f'~{runway} day(s) left — refill session needed')
    elif low:
        run.step('bank stock', status='warn', detail='low: ' + ', '.join(low))
    else:
        run.step('bank stock', detail=f'~{runway} day(s) of runway')


if __name__ == '__main__':
    sys.exit(main())
