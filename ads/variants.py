# -*- coding: utf-8 -*-
"""#3 — the 3×3×3 variant engine (volume + variety is the moat).

One product → hook(3) × scene(3) × format(3) = 27 variant specs, each with its own
utm_content so the analytics agent (#8) can score which AXIS value wins (not whole ads).
Efficient: 3 generated scene images cover all 27 variants (formats + angles are composited
locally for ~0 credits).

Copy note: the 'price' angle uses the product's proven hook from product-profiles.json.
'pain' / 'transform' ship as clearly-marked DRAFT templates — the copy agent (or Nir)
refines them per product before publish.
"""
import make_ad_master as M
import utm

ANGLES = ('pain', 'price', 'transform')
SCENES = ('desert', 'trail', 'home')          # realism-first, per LEARNINGS
FORMATS = ('reel_9x16', 'feed_4x5', 'static')

SCENE_PROMPT = {
    'desert': 'a scenic Israeli desert wadi at golden hour, warm sunset backlight',
    'trail':  'a Galilee forest / stream-bank trail, dappled green-gold light',
    'home':   'a home balcony/yard just before a trip, gear packed, warm daylight',
}


def angle_hook(product, angle):
    """Hebrew hook per angle. price = proven hook; pain/transform = DRAFT templates."""
    if angle == 'price':
        return product['hook']
    if angle == 'pain':
        return f'נמאס להתפשר בשטח? [טיוטה]'
    return f'ככה נראית יציאה מסודרת. [טיוטה]'   # transform


def build_matrix(sku, angles=ANGLES, scenes=SCENES, formats=FORMATS, source='ig'):
    """Return the full list of variant specs (default 27) for one SKU."""
    product, _ = M.get_product(sku)
    out = []
    for a in angles:
        hook = angle_hook(product, a)
        for s in scenes:
            for f in formats:
                vid = f'{a[:2]}-{s[:2]}-{f.split("_")[0]}'   # e.g. pa-de-reel
                u = utm.build_utm(sku, angle=a, fmt=f, variant=vid, source=source, medium='organic')
                out.append({
                    'sku': sku, 'angle': a, 'hook': hook, 'scene': s, 'format': f,
                    'variant': vid, 'price': product['price'],
                    'scene_prompt': SCENE_PROMPT[s], 'utm_content': u['utm_content'],
                    'draft': a != 'price',
                })
    return out


def summary(sku):
    m = build_matrix(sku)
    drafts = sum(1 for v in m if v['draft'])
    return (f'{sku}: {len(m)} variants '
            f'({len(set(v["angle"] for v in m))}×{len(set(v["scene"] for v in m))}×'
            f'{len(set(v["format"] for v in m))}) · {drafts} draft-copy, {len(m)-drafts} ready')


if __name__ == '__main__':
    print(summary('YF-ZZ-31B'))
    for v in build_matrix('YF-ZZ-31B')[:3]:
        print(' ', v['variant'], '·', v['utm_content'], '·', v['hook'])
