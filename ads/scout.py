# -*- coding: utf-8 -*-
"""Agent #1 — the SCOUT. Picks what to feature today and from which angle.

supervisor.pick_today() sorts purely by least-recently-served, which is fair but blind:
a product that reliably sells gets exactly as much air as one nobody ever clicks. The scout
keeps that fairness as the floor and then tilts toward what the learner has proven, so
winners repeat sooner without any product ever falling off the rotation entirely.

score = coverage(days since last shown, capped) × performance(learned, gently applied)
"""
import os
import json
import datetime
import learner

PROFILES_PATH = os.path.join(os.path.dirname(__file__), 'product-profiles.json')

COVERAGE_CAP = 21      # after 3 weeks unshown, more waiting adds no more urgency
PERF_TILT = 0.6        # 0 = pure rotation, 1 = fully performance-driven. 0.6 keeps a floor.
NEVER_SHOWN_BONUS = 1.35

ANGLES = ('price', 'problem', 'lifestyle')
SLOT_ANGLE = {'07:00': 'lifestyle', '12:00': 'problem', '18:00': 'price'}


def products():
    """The catalog, read straight from the profiles. Deliberately does NOT import
    make_ad_master — picking what to feature must not drag in the image renderer (and Pillow)."""
    with open(PROFILES_PATH, encoding='utf-8') as f:
        return json.load(f)['products']


def _days_since(iso, today):
    if not iso:
        return None
    try:
        return (today - datetime.date.fromisoformat(iso)).days
    except ValueError:
        return None


def _perf_factor(sku, perf):
    """Mean learned score for a SKU across formats, rescaled around 1.0."""
    cells = (perf.get('scores') or {}).get(sku) or {}
    vals = [c['score'] for c in cells.values() if c.get('n')]
    if not vals:
        return 1.0
    mine = sum(vals) / len(vals)
    everyone = [c['score'] for f in (perf.get('scores') or {}).values()
                for c in f.values() if c.get('n')]
    avg = sum(everyone) / len(everyone) if everyone else 0
    if avg <= 0:
        return 1.0
    ratio = mine / avg
    return 1.0 + PERF_TILT * (ratio - 1.0)


def rank(products, served=None, perf=None, today=None, available=None):
    """Every product scored for 'should this go out today', best first, with the reasoning.

    `available` — the SKUs that actually have a scene ready to render. Ranking a product we
    cannot produce today is worse than useless: coverage favours never-shown products, which
    are precisely the ones least likely to be banked, so without this the scout confidently
    picks a SKU the run then dies on. Unavailable products are pushed below every available
    one rather than dropped, so a manual run can still choose to generate a scene for them."""
    served = served or {}
    perf = perf if perf is not None else learner._load()
    today = today or datetime.date.today()
    out = []
    for p in products:
        sku = p['id']
        days = _days_since(served.get(sku), today)
        if days is None:
            coverage, note = COVERAGE_CAP * NEVER_SHOWN_BONUS, 'מעולם לא פורסם'
        else:
            coverage = min(days, COVERAGE_CAP)
            note = f'{days} ימים מאז הפעם האחרונה'
        pf = _perf_factor(sku, perf)
        ready = True if available is None else sku in available
        if not ready:
            note += ' · אין סצנה בבנק'
        out.append({'sku': sku, 'name': p.get('name'), 'score': coverage * pf,
                    'coverage': coverage, 'perf_factor': round(pf, 3),
                    'ready': ready, 'why': note})
    # Ready first, then by score — a banked product always outranks an unbanked one.
    return sorted(out, key=lambda r: (r['ready'], r['score']), reverse=True)


def pick_today(products, n=1, served=None, perf=None, today=None, available=None):
    return rank(products, served=served, perf=perf, today=today, available=available)[:n]


def angle_for(slot):
    return SLOT_ANGLE.get(slot, 'price')


def brief(products, slot='07:00', served=None, perf=None, credits=None, today=None,
          available=None):
    """The full morning decision: what · which format · which angle · and why for each."""
    import format_router
    perf = perf if perf is not None else learner._load()
    top = pick_today(products, 1, served=served, perf=perf, today=today, available=available)
    if not top:
        return None
    pick = top[0]
    fmt, why_fmt = format_router.choose(pick['sku'], slot, credits=credits, perf=perf)
    return {'slot': slot, 'sku': pick['sku'], 'name': pick['name'],
            'format': fmt, 'angle': angle_for(slot),
            'why_product': pick['why'], 'why_format': why_fmt, 'ready': pick['ready'],
            'perf_factor': pick['perf_factor']}


if __name__ == '__main__':
    prods = products()
    served = json.load(open(os.path.join(os.path.dirname(__file__), 'rotation-state.json'),
                            encoding='utf-8')).get('served', {})
    b = brief(prods, slot='07:00', served=served)
    if b:
        print(f"היום: {b['name']} ({b['sku']})")
        print(f"  פורמט: {b['format']}  ·  זווית: {b['angle']}")
        print(f"  למה המוצר: {b['why_product']}")
        print(f"  למה הפורמט: {b['why_format']}")
