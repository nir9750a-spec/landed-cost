# -*- coding: utf-8 -*-
"""Which format should today's ad be — a reel or a feed image?

supervisor.SLOT_FORMAT used to answer this with a fixed dict (07:00 feed · 12:00 reel ·
18:00 feed). That ignores three things that actually matter: reels cost Higgsfield credits
while a feed composite is free, some products demonstrably perform better in one format,
and posting the same shape for the same SKU over and over goes stale.

choose() layers those on top of the cadence, most decisive first, and always explains itself
so a run log says WHY a format was picked and not just which.
"""
import os
import json
import datetime

PERF_PATH = os.path.join(os.path.dirname(__file__), 'workspace', 'performance.json')
DEMO_PATH = os.path.join(os.path.dirname(__file__), 'demo-value.json')

SLOT_DEFAULT = {'07:00': 'feed_4x5', '12:00': 'reel_9x16', '18:00': 'feed_4x5'}
FEED, REEL = 'feed_4x5', 'reel_9x16'

REEL_CREDIT_COST = 25       # kling3_0, no audio; the cheap reel path
CREDIT_RESERVE = 150        # keep ~6 reels of runway before falling back to free feed posts
MIN_SAMPLES = 3             # per (sku, format) before performance may override the cadence
WIN_MARGIN = 1.25           # the winner must beat the loser by 25% to be worth overriding
MAX_STREAK = 3              # never post the same format for one SKU more than 3× running
DEMO_NEEDS_VIDEO = 0.70     # above this the product cannot be understood from a still
DEMO_STILL_IS_FINE = 0.35   # below this a video adds cost and nothing else


def _load_perf():
    if os.path.exists(PERF_PATH):
        with open(PERF_PATH, encoding='utf-8') as f:
            return json.load(f)
    return {'scores': {}, 'history': []}


def demo_value(sku, profiles=None):
    """How badly this product needs to be seen in motion, 0..1.

    A pop-up tent whose whole claim is "opens in a second" is unprovable in a still; a ₪59
    moon chair is fully understood from one photo and a reel about it just costs credits.
    The clock knows neither, which is why the cadence alone kept producing reels for chairs.
    Scores are curated judgement in demo-value.json, with a per-category fallback for a SKU
    that has not been rated yet."""
    try:
        with open(DEMO_PATH, encoding='utf-8') as f:
            cfg = json.load(f)
    except Exception:
        return None
    row = cfg.get('products', {}).get(sku)
    if row:
        return float(row[0])
    if profiles is None:
        try:
            import scout
            profiles = {p['id']: p for p in scout.products()}
        except Exception:
            return None
    cat = (profiles.get(sku) or {}).get('category')
    fb = cfg.get('category_fallback', {})
    return float(fb[cat]) if cat in fb else None


def _streak(history, sku):
    """How many times in a row this SKU most recently went out in the same format."""
    runs = [h for h in history if h.get('sku') == sku]
    if not runs:
        return None, 0
    last = runs[-1].get('format')
    n = 0
    for h in reversed(runs):
        if h.get('format') != last:
            break
        n += 1
    return last, n


def choose(sku, slot='07:00', credits=None, perf=None, now=None):
    """Return (format, reason). Pure — pass credits/perf in so it stays testable."""
    perf = perf if perf is not None else _load_perf()
    default = SLOT_DEFAULT.get(slot, FEED)
    scores = perf.get('scores', {}).get(sku, {})
    history = perf.get('history', [])

    # 1. Credit guard wins over everything: a reel we cannot pay for is not a choice.
    if credits is not None and credits < CREDIT_RESERVE:
        if default == REEL:
            return FEED, f'credit guard: {credits:.0f} < {CREDIT_RESERVE} reserve — free feed instead of reel'
        return FEED, f'credit guard: {credits:.0f} credits low; staying on the free feed format'

    # 2. Learned preference, but only once both formats have a real sample for this SKU.
    f_s, r_s = scores.get(FEED, {}), scores.get(REEL, {})
    if f_s.get('n', 0) >= MIN_SAMPLES and r_s.get('n', 0) >= MIN_SAMPLES:
        f_v, r_v = f_s.get('score', 0.0), r_s.get('score', 0.0)
        if r_v >= f_v * WIN_MARGIN:
            return REEL, f'learned: reel {r_v:.3f} beats feed {f_v:.3f} for {sku}'
        if f_v >= r_v * WIN_MARGIN:
            return FEED, f'learned: feed {f_v:.3f} beats reel {r_v:.3f} for {sku}'

    # 3. The product's own nature. Weaker than measured performance, stronger than the clock:
    #    with no data yet, what the product IS beats what hour it happens to be.
    dv = demo_value(sku)
    if dv is not None:
        if dv >= DEMO_NEEDS_VIDEO and default != REEL:
            return REEL, f'demo value {dv:.2f}: {sku} cannot be shown in a still'
        if dv <= DEMO_STILL_IS_FINE and default == REEL:
            return FEED, f'demo value {dv:.2f}: a still says it all — reel would just cost credits'

    # 4. Fatigue: break a long run of one shape even when the cadence keeps asking for it.
    last, n = _streak(history, sku)
    if last == default and n >= MAX_STREAK:
        other = REEL if default == FEED else FEED
        if other == REEL and credits is not None and credits < CREDIT_RESERVE:
            return default, f'cadence {slot}: would break a {n}× streak but credits are short'
        return other, f'fatigue: {sku} ran {default} {n}× in a row — switching to {other}'

    # 5. Otherwise the planned cadence stands.
    return default, f'cadence {slot} → {default}'


def plan_day(sku, credits=None, perf=None):
    """The three slots for one SKU, decided together. Handy for the morning brief."""
    perf = perf if perf is not None else _load_perf()
    return [{'slot': s, 'format': f, 'why': w}
            for s in ('07:00', '12:00', '18:00')
            for f, w in [choose(sku, s, credits=credits, perf=perf)]]


if __name__ == '__main__':
    import sys
    sku = sys.argv[1] if len(sys.argv) > 1 else 'YF-YZ-06B'
    cr = float(sys.argv[2]) if len(sys.argv) > 2 else None
    for row in plan_day(sku, credits=cr):
        print(f"{row['slot']}  {row['format']:<11} {row['why']}")
