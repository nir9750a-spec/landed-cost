# -*- coding: utf-8 -*-
"""UTM link builder (task #1) — the merchant-owned attribution layer.

iOS strips fbclid/gclid, but UTM params pass through. Encoding the creative's
identity in the URL is what lets the analytics agent (#8) join spend→revenue
back to a single VARIANT and score which hook/scene/format wins.

Convention:  utm_content = "{angle}_{format}_{variant}"   (ascii codes, not the
Hebrew hook text — keeps analytics clean). utm_campaign = the SKU.
"""
import urllib.parse

SITE = 'https://www.4elements.co.il'

# short ascii codes so UTM stays analytics-friendly (the Hebrew hook lives in the caption)
ANGLE_CODE = {'כאב': 'pain', 'מחיר': 'price', 'טרנספורמציה': 'transform',
              'pain': 'pain', 'price': 'price', 'transform': 'transform'}
FORMAT_CODE = {'feed_4x5': 'feed', 'reel_9x16': 'reel', 'static': 'static',
               'feed': 'feed', 'reel': 'reel'}


def build_utm(sku, angle='price', fmt='feed_4x5', variant='v1', source='ig', medium='organic'):
    """Return the utm_* dict for a creative."""
    a = ANGLE_CODE.get(angle, angle)
    f = FORMAT_CODE.get(fmt, fmt)
    return {
        'utm_source': source,          # ig | fb | tiktok | wa
        'utm_medium': medium,          # organic | paid | status
        'utm_campaign': sku,
        'utm_content': f'{a}_{f}_{variant}',
    }


def tracked_link(sku, angle='price', fmt='feed_4x5', variant='v1',
                 source='ig', medium='organic', base=None, path=''):
    """Full tracked URL for the bio/link/CTA of a given creative."""
    base = (base or SITE).rstrip('/')
    if path:
        base = base + '/' + path.lstrip('/')
    q = urllib.parse.urlencode(build_utm(sku, angle, fmt, variant, source, medium))
    return f'{base}?{q}'


if __name__ == '__main__':
    print(tracked_link('YF-ZZ-31B', angle='price', fmt='reel_9x16', variant='v1', source='ig'))
    print(tracked_link('combo2', angle='כאב', fmt='feed_4x5', variant='v2', source='tiktok', medium='organic'))
