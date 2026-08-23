# -*- coding: utf-8 -*-
"""4Elements ad compositor: base scene -> branded Meta ad (logo + hook + price + CTA), Hebrew RTL."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
try:
    from bidi import get_display
except Exception:
    from bidi.algorithm import get_display

ASSETS = os.path.join(os.path.dirname(__file__), 'assets')
# Font resolution. Gisha Bold is the brand face but it is a Windows-only Microsoft font,
# so a headless Linux runner could never render an ad — CI failed on exactly this. Heebo Bold
# (SIL OFL) is vendored in the repo so every machine, local or CI, produces the same pixels.
# Override with ADS_FONT to force a specific file.
_FONT_CANDIDATES = [
    os.environ.get('ADS_FONT'),
    os.path.join(os.path.dirname(__file__), 'assets', 'fonts', 'Heebo.ttf'),
    'C:/Windows/Fonts/gishabd.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansHebrew-Bold.ttf',
]


def _font_path():
    for c in _FONT_CANDIDATES:
        if c and os.path.exists(c):
            return c
    raise RuntimeError('No Hebrew font found. Set ADS_FONT or restore ads/assets/fonts/Heebo.ttf; '
                       f'tried: {[c for c in _FONT_CANDIDATES if c]}')


FONT = _font_path()
ORANGE = (232, 98, 42)
CREAM  = (243, 233, 216)

def _f(sz):
    f = ImageFont.truetype(FONT, sz)
    try:                       # Heebo ships as a variable font — pin the weight we design against
        f.set_variation_by_name('Bold')
    except Exception:
        pass                   # a static face (Gisha Bold) is already the right weight
    return f

# python-bidi reorders the runs but skips the mirroring step (UBA rule L4), so a Hebrew
# "(רקליינר)" came out as ")רקליינר(" in the rendered ad. Our copy is Hebrew-primary, so
# mirroring every paired glyph in the visual string is the correct fix.
_MIRROR = str.maketrans('()[]{}<>', ')(][}{><')

# ...but only when something has to do the reordering. Pillow linked against libraqm runs
# the full bidi algorithm itself, so feeding it an already-reordered string reverses Hebrew
# TWICE and ships a mangled ad — headline backwards, sentence-final period on the wrong
# side. The PyPI Linux wheels bundle raqm, so this is the CI path: every ad rendered on the
# runner came out reversed, while the Windows box that had no raqm looked fine. Reorder only
# when we are the ones who must.
_HAS_RAQM = False
try:
    from PIL import features as _pil_features
    _HAS_RAQM = bool(_pil_features.check('raqm'))
except Exception:
    pass


def rtl(s):
    """Hebrew, laid out for whichever text stack Pillow actually has."""
    return s if _HAS_RAQM else get_display(s).translate(_MIRROR)

def _white_logo():
    lg = Image.open(os.path.join(ASSETS, 'logo.png')).convert('RGBA')
    a = lg.split()[3]
    white = Image.new('RGBA', lg.size, (255, 255, 255, 0))
    white.putalpha(a)
    px = white.load()
    for y in range(white.height):
        for x in range(white.width):
            r, g, b, al = px[x, y]
            px[x, y] = (255, 255, 255, al)
    return white

def _cover(img, W, H, anchor='center'):
    s = max(W / img.width, H / img.height)
    nw, nh = int(img.width * s + 0.5), int(img.height * s + 0.5)
    img = img.resize((nw, nh), Image.LANCZOS)
    x = (nw - W) // 2
    y = (nh - H) // 2 if anchor == 'center' else (nh - H)  # 'bottom'
    return img.crop((x, y, x + W, y + H))

def _wrap(draw, text, font, maxw):
    words = text.split(' ')
    lines, cur = [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(rtl(t), font=font) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def _rounded(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)

def _product_card(img, card_path, W, H, bottom_y):
    """Small clean product photo, bottom-left, on a white rounded card.

    In a lifestyle scene the person is *using* the product and hides most of it. This card
    shows the actual item in one glance without giving up the lifestyle shot. Anchored to the
    left margin and grown upward from `bottom_y` so it never collides with the price/CTA row
    (which builds from the right) or with the headline (top).
    """
    prod = Image.open(card_path).convert('RGBA')
    M = int(W * 0.06)
    side = int(W * 0.30)
    x0, y1 = M, bottom_y
    y0 = y1 - side
    d = ImageDraw.Draw(img)

    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (x0 + 6, y0 + 8, x0 + side + 6, y1 + 8), radius=int(side * 0.12), fill=(0, 0, 0, 90))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x0, y0, x0 + side, y1), radius=int(side * 0.12),
                        fill=(255, 255, 255, 245))

    inner = int(side * 0.86)
    prod.thumbnail((inner, inner), Image.LANCZOS)
    img.alpha_composite(prod, (x0 + (side - prod.width) // 2, y0 + (side - prod.height) // 2))
    return ImageDraw.Draw(img)


def build(base_path, out_path, W, H, hook, sub, price, cta='לינק בביו', focus='bottom', old_price=None, headline_pos='bottom', product_card=None):
    base = Image.open(base_path).convert('RGB')
    img = _cover(base, W, H, 'bottom' if focus == 'bottom' else 'center').convert('RGBA')
    d = ImageDraw.Draw(img)
    M = int(W * 0.06)

    # bottom scrim
    scrim = Image.new('L', (1, H), 0)
    sp = scrim.load()
    top = int(H * 0.46)
    for y in range(H):
        sp[0, y] = 0 if y < top else int(215 * (y - top) / (H - top))
    scrim = scrim.resize((W, H))
    dark = Image.new('RGBA', (W, H), (12, 16, 12, 255)); dark.putalpha(scrim)
    img = Image.alpha_composite(img, dark); d = ImageDraw.Draw(img)

    # top scrim (for headline placed at top, over sky/negative space)
    if headline_pos == 'top':
        ts = Image.new('L', (1, H), 0); tp = ts.load()
        bot = int(H * 0.42)
        for yy in range(H):
            tp[0, yy] = int(185 * (bot - yy) / bot) if yy < bot else 0
        ts = ts.resize((W, H))
        td = Image.new('RGBA', (W, H), (12, 16, 12, 255)); td.putalpha(ts)
        img = Image.alpha_composite(img, td); d = ImageDraw.Draw(img)

    # logo on dark pill, top-right
    logo = _white_logo()
    lw = int(W * 0.30); lh = int(lw * logo.height / logo.width)
    logo = logo.resize((lw, lh), Image.LANCZOS)
    pad = int(W * 0.025)
    pill = (W - M - lw - 2 * pad, M, W - M, M + lh + 2 * pad)
    _rounded(d, pill, r=int(lh * 0.5), fill=(15, 20, 15, 165))
    img.alpha_composite(logo, (W - M - lw - pad, M + pad))
    d = ImageDraw.Draw(img)

    # headline at TOP (below logo), when product occupies the lower/center
    if headline_pos == 'top':
        xr_t = W - M
        ty = M + lh + 2 * pad + int(H * 0.030)
        hf = _f(int(W * 0.076))
        for line in _wrap(d, hook, hf, W - 2 * M):
            d.text((xr_t, ty), rtl(line), font=hf, fill=(255, 255, 255, 255), anchor='ra',
                   stroke_width=2, stroke_fill=(0, 0, 0, 150))
            ty += int(W * 0.076) + int(H * 0.006)
        ty += int(H * 0.006)
        sf2 = _f(int(W * 0.038))
        for line in _wrap(d, sub, sf2, W - 2 * M):
            d.text((xr_t, ty), rtl(line), font=sf2, fill=(240, 240, 235, 255), anchor='ra')
            ty += int(W * 0.038) + int(H * 0.008)

    xr = W - M                      # right edge for RTL text
    y = H - int(H * 0.035)          # build upward from bottom (footer first)

    # footer
    ff = _f(int(W * 0.030))
    d.text((xr, y), rtl('www.4elements.co.il  ·  052-891-3135'), font=ff,
           fill=(235, 235, 230, 255), anchor='rb')
    y -= int(W * 0.030) + int(H * 0.022)

    # price pill + CTA row
    pf = _f(int(W * 0.062)); vf = _f(int(W * 0.028)); cf = _f(int(W * 0.040))
    of = _f(int(W * 0.032))
    ptxt = rtl(price)
    pw = d.textlength(ptxt, font=pf); vtxt = rtl('כולל מע"מ')
    vw = d.textlength(vtxt, font=vf)
    otxt = rtl(old_price) if old_price else None
    ow = d.textlength(otxt, font=of) if otxt else 0
    ph = int(W * (0.150 if old_price else 0.115)); pad2 = int(W * 0.035)
    box_w = max(pw, vw, ow) + 2 * pad2
    pbox = (xr - box_w, y - ph, xr, y)
    _rounded(d, pbox, r=int(ph * 0.22), fill=ORANGE + (255,))
    cx = xr - box_w / 2
    if old_price:
        oyc = y - ph + int(ph*0.16)
        d.text((cx, oyc), otxt, font=of, fill=(255,225,210,255), anchor='ma')
        d.line((cx-ow/2, oyc+int(W*0.018), cx+ow/2, oyc+int(W*0.018)), fill=(255,255,255,235), width=4)
        d.text((cx, y - ph + int(ph*0.34)), ptxt, font=pf, fill=(255,255,255,255), anchor='ma')
        d.text((cx, y - int(ph*0.22)), vtxt, font=vf, fill=(255,235,225,255), anchor='ma')
    else:
        d.text((cx, y - ph + int(ph*0.14)), ptxt, font=pf, fill=(255,255,255,255), anchor='ma')
        d.text((cx, y - int(ph*0.30)), vtxt, font=vf, fill=(255,235,225,255), anchor='ma')
    # CTA pill to the left of price
    ctxt = rtl(cta); cw = d.textlength(ctxt, font=cf); ch = ph
    arrow = int(ch * 0.16)
    cbox = (pbox[0] - int(W*0.03) - (cw + 2*pad2 + arrow*2), y - ch, pbox[0] - int(W*0.03), y)
    _rounded(d, cbox, r=int(ch * 0.28), fill=(255,255,255,235))
    cyc = (cbox[1] + cbox[3]) / 2
    d.text((cbox[2] - pad2*0.8, cyc), ctxt, font=cf, fill=(18,22,18,255), anchor='rm')
    tx = cbox[0] + pad2*0.9
    d.polygon([(tx + arrow*0.7, cyc - arrow), (tx, cyc + arrow*0.7), (tx + arrow*1.4, cyc + arrow*0.7)],
              fill=ORANGE + (255,))
    y -= ph + int(H * 0.028)

    if product_card and os.path.exists(product_card):
        d = _product_card(img, product_card, W, H, bottom_y=y + int(H * 0.010))

    if headline_pos == 'bottom':
        # sub-benefit
        sf = _f(int(W * 0.038))
        for line in reversed(_wrap(d, sub, sf, W - 2*M)):
            d.text((xr, y), rtl(line), font=sf, fill=(240,240,235,255), anchor='rb')
            y -= int(W * 0.038) + int(H*0.008)
        y -= int(H * 0.010)
        # hook
        hf = _f(int(W * 0.078))
        for line in reversed(_wrap(d, hook, hf, W - 2*M)):
            d.text((xr, y), rtl(line), font=hf, fill=(255,255,255,255), anchor='rb',
                   stroke_width=2, stroke_fill=(0,0,0,140))
            y -= int(W * 0.078) + int(H*0.006)

    img.convert('RGB').save(out_path, quality=94)
    print('saved', out_path, (W, H))

if __name__ == '__main__':
    W916, H916 = 1080, 1920
    W45,  H45  = 1080, 1350
    out = os.path.join(os.path.dirname(__file__), 'workspace', 'final-ads')
    os.makedirs(out, exist_ok=True)
    cart = os.path.join(os.path.dirname(__file__), 'workspace', 'cart_scene_2.png')
    chair = 'C:/Users/Admin/landed-cost/catalog/heroes/YF-YZ-06B__3.jpg'

    build(cart, f'{out}/cart_YF-LYC-03A_9x16.jpg', W916, H916,
          hook='טוענים הכל — ונוסעים.',
          sub='עגלת קמפינג מתקפלת 150 ליטר · גלגלי בלון לחול ולשטח · עומס עד 150 ק"ג',
          price='₪250', focus='bottom')
    build(cart, f'{out}/cart_YF-LYC-03A_4x5.jpg', W45, H45,
          hook='טוענים הכל — ונוסעים.',
          sub='150 ליטר · גלגלי בלון לחול · עומס עד 150 ק"ג · מתקפלת לתא המטען',
          price='₪250', focus='bottom')

    build(chair, f'{out}/chair_YF-YZ-06B_9x16.jpg', W916, H916,
          hook='שוקעים פנימה. הראש מתנקה.',
          sub='כיסא רקליינר מתקפל · משענת ראש והטיה מלאה · כיס צד לטלפון',
          price='₪220', focus='center')
    build(chair, f'{out}/chair_YF-YZ-06B_4x5.jpg', W45, H45,
          hook='שוקעים פנימה. הראש מתנקה.',
          sub='רקליינר מתקפל · הטיה מלאה · קל לנשיאה לכל טיול',
          price='₪220', focus='center')
