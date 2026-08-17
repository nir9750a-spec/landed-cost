# -*- coding: utf-8 -*-
"""4Elements MASTER ad template (תבנית-אם אחידה).

One entry point per SKU -> consistent finished ad in the two publish formats,
aligned with marketing/system rules (LEARNINGS.md safe-zone, brand palette, real logo).

Formats:
  - feed  : 4:5  (1080x1350) — Instagram/Facebook feed. Price pill at bottom (feed has no platform UI overlay).
  - reel  : 9:16 (1080x1920) — Reels/TikTok. ALL text in the SAFE upper third (y 160-760),
            because the bottom ~35% + right button column are covered by the platform UI.

Reuses the proven make_ad.py compositor helpers so the visual language stays identical.
"""
import os
from PIL import Image, ImageDraw
from make_ad import build, _white_logo, _f, rtl, _wrap, _rounded, _cover, ORANGE

# SAFE-ZONE (1080x1920) per marketing/system/LEARNINGS.md:
#   top ~140px = search bar | bottom y>1340 (~35%) = caption+buttons | right ~130px = action column
#   => safe text band = y 160..760, kept centered to also clear the right button column.
REEL_SAFE_TOP = 165
REEL_SAFE_BOTTOM = 800


def feed(scene_path, out_path, hook, sub, price, cta='לרכישה באתר', old_price=None, focus='center'):
    """4:5 feed ad — delegates to the approved make_ad.build (headline top, price bottom)."""
    build(scene_path, out_path, 1080, 1350, hook=hook, sub=sub, price=price,
          cta=cta, old_price=old_price, focus=focus, headline_pos='top')


def reel(scene_path, out_path, hook, sub, price, cta='לרכישה באתר', old_price=None):
    """9:16 reel/story ad — everything in the SAFE upper third, product scene left clean below."""
    W, H = 1080, 1920
    img = _cover(Image.open(scene_path).convert('RGB'), W, H, 'center').convert('RGBA')

    # top scrim for legibility over the sky/upper scene
    scrim = Image.new('L', (1, H), 0); sp = scrim.load()
    bot = int(H * 0.50)
    for y in range(H):
        sp[0, y] = int(205 * (bot - y) / bot) if y < bot else 0
    scrim = scrim.resize((W, H))
    dark = Image.new('RGBA', (W, H), (12, 20, 15, 255)); dark.putalpha(scrim)
    img = Image.alpha_composite(img, dark)
    d = ImageDraw.Draw(img)

    cx = W // 2
    y = REEL_SAFE_TOP

    # logo — centered
    logo = _white_logo()
    lw = int(W * 0.34); lh = int(lw * logo.height / logo.width)
    logo = logo.resize((lw, lh), Image.LANCZOS)
    img.alpha_composite(logo, ((W - lw) // 2, y)); d = ImageDraw.Draw(img)
    y += lh + int(H * 0.022)

    # hook — centered, big (<=7 words per LEARNINGS)
    hf = _f(int(W * 0.072))
    for line in _wrap(d, hook, hf, int(W * 0.86)):
        d.text((cx, y), rtl(line), font=hf, fill=(255, 255, 255, 255), anchor='ma',
               stroke_width=2, stroke_fill=(0, 0, 0, 150))
        y += int(W * 0.072) + 8
    y += 6

    # sub-benefit — centered
    sf = _f(int(W * 0.036))
    for line in _wrap(d, sub, sf, int(W * 0.80)):
        d.text((cx, y), rtl(line), font=sf, fill=(240, 240, 235, 255), anchor='ma')
        y += int(W * 0.036) + 7
    y += int(H * 0.018)

    # price pill (right) + CTA pill (left), centered as a group
    pf = _f(int(W * 0.058)); vf = _f(int(W * 0.025)); cf = _f(int(W * 0.038))
    ptxt = rtl(price); vtxt = rtl('כולל מע"מ')
    pw = max(d.textlength(ptxt, font=pf), d.textlength(vtxt, font=vf))
    pad = int(W * 0.033); ph = int(W * 0.113)
    price_w = pw + 2 * pad
    ctxt = rtl(cta); cw = d.textlength(ctxt, font=cf); arrow = int(ph * 0.16)
    cta_w = cw + 2 * pad + arrow * 2
    gap = int(W * 0.03)
    total = price_w + gap + cta_w
    x0 = cx - total // 2

    # price pill (right end of the group)
    px_right = x0 + total
    pbox = (px_right - price_w, y, px_right, y + ph)
    _rounded(d, pbox, r=int(ph * 0.22), fill=ORANGE + (255,))
    pcx = px_right - price_w / 2
    d.text((pcx, y + int(ph * 0.14)), ptxt, font=pf, fill=(255, 255, 255, 255), anchor='ma')
    d.text((pcx, y + ph - int(ph * 0.30)), vtxt, font=vf, fill=(255, 235, 225, 255), anchor='ma')

    # CTA pill (left)
    cbox = (x0, y, x0 + cta_w, y + ph)
    _rounded(d, cbox, r=int(ph * 0.28), fill=(255, 255, 255, 235))
    cyc = y + ph / 2
    d.text((cbox[2] - pad * 0.8, cyc), ctxt, font=cf, fill=(18, 22, 18, 255), anchor='rm')
    tx = cbox[0] + pad * 0.9
    d.polygon([(tx + arrow * 0.7, cyc - arrow), (tx, cyc + arrow * 0.7), (tx + arrow * 1.4, cyc + arrow * 0.7)],
              fill=ORANGE + (255,))
    y += ph

    assert y < REEL_SAFE_BOTTOM, f"text overran safe zone: y={y} >= {REEL_SAFE_BOTTOM}"
    img.convert('RGB').save(out_path, quality=94)
    print('saved', out_path, (W, H), 'text ends at y=%d (safe<%d)' % (y, REEL_SAFE_BOTTOM))


def render_sku(sku, scene_path, hook, sub, price, out_dir, cta='לרכישה באתר', old_price=None):
    """Master entry: one scene image -> both finished formats, consistently named."""
    os.makedirs(out_dir, exist_ok=True)
    feed(scene_path, f'{out_dir}/{sku}_feed_4x5.jpg', hook, sub, price, cta, old_price)
    reel(scene_path, f'{out_dir}/{sku}_reel_9x16.jpg', hook, sub, price, cta, old_price)


import json

PROFILES_PATH = os.path.join(os.path.dirname(__file__), 'product-profiles.json')


def _profiles():
    with open(PROFILES_PATH, encoding='utf-8') as f:
        return json.load(f)


def get_product(sku):
    """Return the product dict from product-profiles.json (source of truth for hook/price/angle)."""
    data = _profiles()
    for p in data.get('products', []):
        if p['id'] == sku:
            return p, data['brand']
    raise KeyError(f'SKU {sku} not in product-profiles.json')


def _sub_from(product):
    """Build a one-line sub-benefit from the product name + category."""
    return f"{product['name']} · {product.get('audience', '')}".strip(' ·')


def build_caption(product, brand, question='מי בא איתכם ליציאה הקרובה? 👇'):
    """Hebrew caption per LEARNINGS: hook + benefit + price/CTA + question + 3-5 hashtags. No fake reviews."""
    tags = list(brand.get('hashtags_base', []))
    return (
        f"{product['hook']}\n"
        f"{product['name']}.\n"
        f"📍 ₪{product['price']} · 🔗 {brand.get('cta', 'לינק בביו')} · {brand.get('phone', '')}\n"
        f"{question}\n"
        + ' '.join(tags)
    )


def render_from_sku(sku, scene_path, out_dir):
    """MASTER one-command entry: SKU + a scene image -> feed 4:5 + reel 9:16 + caption.txt,
    pulling hook/price/sub straight from product-profiles.json."""
    product, brand = get_product(sku)
    os.makedirs(out_dir, exist_ok=True)
    hook = product['hook']
    sub = _sub_from(product)
    price = f"₪{product['price']}"
    feed(scene_path, f'{out_dir}/{sku}_feed_4x5.jpg', hook, sub, price)
    reel(scene_path, f'{out_dir}/{sku}_reel_9x16.jpg', hook, sub, price)
    caption = build_caption(product, brand)
    with open(f'{out_dir}/{sku}_caption.txt', 'w', encoding='utf-8') as f:
        f.write(caption)
    print(f'[{sku}] feed+reel+caption ready in {out_dir}')
    return caption


def render_and_enqueue(sku, scene_path, out_dir, *, channels=('ig', 'fb'),
                       status='pending_approval', source='ig'):
    """Render the ad set AND push a job row per format to the ad_jobs queue with a
    tracked UTM link — the SKU→job→(awaiting approval) flow of the asset agent.
    Degrades gracefully (still renders) if the queue/env isn't configured yet."""
    product, brand = get_product(sku)
    render_from_sku(sku, scene_path, out_dir)
    caption = build_caption(product, brand)
    try:
        import ad_queue
        import utm
    except Exception as e:
        print(f'[{sku}] rendered; queue not wired ({e})')
        return []
    angle = {'משפחה/ערך': 'price'}.get(product.get('angle', ''), 'price')
    rows = []
    for fmt in ('feed_4x5', 'reel_9x16'):
        u = utm.build_utm(sku, angle=angle, fmt=fmt, variant='v1', source=source, medium='organic')
        link = utm.tracked_link(sku, angle=angle, fmt=fmt, variant='v1', source=source)
        try:
            row = ad_queue.enqueue(
                sku, product['hook'], product['price'], format=fmt, angle=angle,
                scene=product.get('scene'), variant='v1', product_name=product['name'],
                asset_url=f'{out_dir}/{sku}_{"feed_4x5" if fmt=="feed_4x5" else "reel_9x16"}.jpg',
                caption=f'{caption}\n{link}', channels=channels,
                utm_content=u['utm_content'], status=status,
            )
            rows.append(row)
            print(f'[{sku}] queued {fmt} → job {row.get("id")}')
        except Exception as e:
            print(f'[{sku}] enqueue {fmt} failed: {e}')
    return rows


if __name__ == '__main__':
    scene = os.environ.get('SCENE')
    render_sku(
        os.environ.get('SKU', 'DEMO'),
        scene,
        hook=os.environ.get('HOOK', ''),
        sub=os.environ.get('SUB', ''),
        price=os.environ.get('PRICE', ''),
        out_dir=os.path.join(os.path.dirname(__file__), 'workspace', 'final-ads'),
    )
