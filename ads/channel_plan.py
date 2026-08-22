# -*- coding: utf-8 -*-
"""Which surfaces a product goes to, and what each one actually gets.

The tempting model is "one ad, posted everywhere". It is wrong in two places, and both cost
real money in Israel:

  * Marketplace is not a feed. People arrive there searching to buy, and a branded ad tile
    reads as a business pushing rather than a thing for sale. It gets a LISTING — clean
    product photo, no overlay, plain Hebrew title and price. Israeli Marketplace has no
    checkout and no fees: it is a free lead surface that ends in WhatsApp, which is where
    the sale actually closes.
  * The 4x4 parts are a different business. A ₪2,200 winch shares no buyer, no price logic
    and no sales cycle with a ₪59 chair, and putting it in the camping feed wastes the slot.
    It goes to Yad2's automotive audience and the 4x4 forums.

So the unit is not "four versions of an ad". It is one creative decision per product,
rendered into the ratios each surface needs, plus one listing that is not an ad at all.
"""
import os
import json

HIGH_TICKET = 800          # above this the feed is the wrong room entirely
FOURXFOUR = 'שדרוגי 4x4'

# What each surface consumes. 'ad' = branded creative; 'listing' = plain goods-for-sale.
SURFACES = {
    'ig_feed':     {'kind': 'ad',      'ratio': '4:5',  'auto': True,
                    'via': 'Make 6869166 (מפרסם ל-IG+FB יחד)'},
    'fb_feed':     {'kind': 'ad',      'ratio': '4:5',  'auto': True,
                    'via': 'אותו תרחיש Make'},
    'ig_reels':    {'kind': 'ad',      'ratio': '9:16', 'auto': True,
                    'via': 'Make 6903724'},
    'fb_reels':    {'kind': 'ad',      'ratio': '9:16', 'auto': True,
                    'via': 'אותו תרחיש Make'},
    'tiktok':      {'kind': 'ad',      'ratio': '9:16', 'auto': False,
                    'via': 'Higgsfield connector · סאונד טרנדי לא זמין ב-API'},
    'whatsapp':    {'kind': 'closing', 'ratio': '4:5',  'auto': False,
                    'via': 'כרטיס לטלגרם → ניר מפרסם בערוץ'},
    'marketplace': {'kind': 'listing', 'ratio': '1:1',  'auto': False,
                    'via': 'רישום ידני, 6-8 ביום'},
    'yad2':        {'kind': 'listing', 'ratio': '1:1',  'auto': False,
                    'via': 'לוח רכב — בתשלום, לברר מחיר'},
    'forums':      {'kind': 'listing', 'ratio': '1:1',  'auto': False,
                    'via': '4x4.co.il · Jeepolog · קבוצות מותג'},
}


def _profiles():
    import scout
    return {p['id']: p for p in scout.products()}


def listing(sku, profiles=None):
    """The Marketplace/Yad2 asset: what it says, not how it is dressed.

    Deliberately carries no hook and no CTA. On a search surface the buyer supplies the
    intent; the copy's whole job is to answer what it is, what it costs and how fast it
    arrives — the three things AliExpress cannot beat us on."""
    profiles = profiles or _profiles()
    p = profiles.get(sku)
    if not p:
        return None
    return {
        'title': f"{p['name']} — ₪{p['price']}",
        'photo': 'תמונת מוצר נקייה, בלי לוגו ובלי שכבת מיתוג',
        'body': [
            p['name'],
            f"מחיר: ₪{p['price']} כולל מע\"מ",
            'במלאי בארץ — משלוח 1-4 ימי עסקים',
            'עוסק מורשה · חשבונית · אחריות',
            'שאלות בוואטסאפ, עונה אדם',
        ],
        'no': 'בלי הוק שיווקי, בלי תג מחיר גרפי, בלי CTA — זה לא פרסומת',
    }


def plan(sku, slot='07:00', credits=None, profiles=None):
    """Every surface this product should reach today, and what each one gets."""
    import format_router
    profiles = profiles or _profiles()
    p = profiles.get(sku)
    if not p:
        return None

    heavy = p['price'] >= HIGH_TICKET or p.get('category') == FOURXFOUR

    if heavy:
        # Every surface a heavy item goes to takes a listing, so there is no ad to shape and
        # asking the router which one to render is a question with no consumer.
        fmt, why = 'listing', 'לוח ופורומים — רישום, לא מודעה'
        is_video = False
    else:
        fmt, why = format_router.choose(sku, slot, credits=credits)
        is_video = fmt == 'reel_9x16'

    if heavy:
        # Feed advertising a ₪2,200 winch to a camping audience burns the slot. The buyer
        # is researching, not scrolling, and reaches a decision over weeks.
        names = ['yad2', 'forums', 'whatsapp']
        note = f"₪{p['price']} · {p.get('category')} — קהל אחר, מחזור מכירה ארוך. לא לפיד."
    else:
        names = (['ig_reels', 'fb_reels', 'tiktok'] if is_video else ['ig_feed', 'fb_feed'])
        names += ['whatsapp', 'marketplace']
        note = None

    out = []
    for name in names:
        s = dict(SURFACES[name])
        s['surface'] = name
        if s['kind'] == 'listing':
            s['asset'] = listing(sku, profiles)
        else:
            s['asset'] = f"{'וידאו' if is_video else 'תמונה'} {s['ratio']} · ממותג"
        out.append(s)

    return {'sku': sku, 'name': p['name'], 'price': p['price'], 'format': fmt,
            'why_format': why, 'note': note, 'surfaces': out,
            'demo_value': format_router.demo_value(sku, profiles)}


if __name__ == '__main__':
    import sys
    sku = sys.argv[1] if len(sys.argv) > 1 else 'YF-ZP-14A'
    d = plan(sku, sys.argv[2] if len(sys.argv) > 2 else '07:00')
    print(f"{d['name']} (₪{d['price']}) · demo={d['demo_value']}")
    print(f"פורמט: {d['format']} — {d['why_format']}")
    if d['note']:
        print(f"⚠️  {d['note']}")
    for s in d['surfaces']:
        a = s['asset']
        a = a['title'] if isinstance(a, dict) else a
        print(f"  {s['surface']:<12} [{s['kind']:<7}] {'אוטו' if s['auto'] else 'ידני'}  {a}")
