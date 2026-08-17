# -*- coding: utf-8 -*-
"""Render a transparent 1080x1920 branded overlay PNG for video reels (Hebrew RTL)."""
import os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
try:
    from bidi import get_display
except Exception:
    from bidi.algorithm import get_display
import sys; sys.path.insert(0, os.path.dirname(__file__))
from make_ad import _white_logo, _f, rtl, _rounded, ORANGE, _wrap

def overlay(out_path, hook, sub, price, cta='לרכישה באתר', old_price=None, W=1080, H=1920):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    M = int(W * 0.06)

    # bottom scrim (transparent -> dark)
    grad = Image.new('L', (1, H), 0); gp = grad.load()
    top = int(H * 0.52)
    for yy in range(H):
        gp[0, yy] = 0 if yy < top else int(200 * (yy - top) / (H - top))
    grad = grad.resize((W, H))
    dark = Image.new('RGBA', (W, H), (10, 14, 10, 255)); dark.putalpha(grad)
    img = Image.alpha_composite(img, dark); d = ImageDraw.Draw(img)
    # fully opaque safety strip at very bottom (covers any residual burned-in caption)
    d.rectangle((0, H - 78, W, H), fill=(10, 14, 10, 255))

    # logo pill top-right
    logo = _white_logo(); lw = int(W * 0.30); lh = int(lw * logo.height / logo.width)
    logo = logo.resize((lw, lh), Image.LANCZOS); pad = int(W * 0.025)
    _rounded(d, (W - M - lw - 2*pad, M, W - M, M + lh + 2*pad), r=int(lh*0.5), fill=(15,20,15,165))
    img.alpha_composite(logo, (W - M - lw - pad, M + pad)); d = ImageDraw.Draw(img)

    xr = W - M; y = H - int(H * 0.035)
    ff = _f(int(W*0.030))
    d.text((xr, y), rtl('www.4elements.co.il  ·  052-891-3135'), font=ff, fill=(235,235,230,255), anchor='rb')
    y -= int(W*0.030) + int(H*0.022)

    # price pill + CTA
    pf=_f(int(W*0.062)); vf=_f(int(W*0.028)); cf=_f(int(W*0.040)); of=_f(int(W*0.032))
    ptxt=rtl(price); pw=d.textlength(ptxt,font=pf); vtxt=rtl('כולל מע"מ'); vw=d.textlength(vtxt,font=vf)
    otxt=rtl(old_price) if old_price else None; ow=d.textlength(otxt,font=of) if otxt else 0
    ph=int(W*(0.150 if old_price else 0.115)); pad2=int(W*0.035)
    box_w=max(pw,vw,ow)+2*pad2; pbox=(xr-box_w,y-ph,xr,y)
    _rounded(d,pbox,r=int(ph*0.22),fill=ORANGE+(255,)); cx=xr-box_w/2
    if old_price:
        oyc=y-ph+int(ph*0.16); d.text((cx,oyc),otxt,font=of,fill=(255,225,210,255),anchor='ma')
        d.line((cx-ow/2,oyc+int(W*0.018),cx+ow/2,oyc+int(W*0.018)),fill=(255,255,255,235),width=4)
        d.text((cx,y-ph+int(ph*0.34)),ptxt,font=pf,fill=(255,255,255,255),anchor='ma')
        d.text((cx,y-int(ph*0.22)),vtxt,font=vf,fill=(255,235,225,255),anchor='ma')
    else:
        d.text((cx,y-ph+int(ph*0.14)),ptxt,font=pf,fill=(255,255,255,255),anchor='ma')
        d.text((cx,y-int(ph*0.30)),vtxt,font=vf,fill=(255,235,225,255),anchor='ma')
    arrow=int(ph*0.16)
    cbox=(pbox[0]-int(W*0.03)-(d.textlength(rtl(cta),font=cf)+2*pad2+arrow*2), y-ph, pbox[0]-int(W*0.03), y)
    _rounded(d,cbox,r=int(ph*0.22),fill=(255,255,255,235)); cyc=(cbox[1]+cbox[3])/2
    d.text((cbox[2]-pad2*0.8,cyc),rtl(cta),font=cf,fill=(18,22,18,255),anchor='rm')
    tx=cbox[0]+pad2*0.9
    d.polygon([(tx,cyc),(tx+arrow*1.4,cyc-arrow),(tx+arrow*1.4,cyc+arrow)],fill=ORANGE+(255,))
    y-=ph+int(H*0.028)

    sf=_f(int(W*0.038))
    for line in reversed(_wrap(d,sub,sf,W-2*M)):
        d.text((xr,y),rtl(line),font=sf,fill=(240,240,235,255),anchor='rb'); y-=int(W*0.038)+int(H*0.008)
    y-=int(H*0.010)
    hf=_f(int(W*0.078))
    for line in reversed(_wrap(d,hook,hf,W-2*M)):
        d.text((xr,y),rtl(line),font=hf,fill=(255,255,255,255),anchor='rb',stroke_width=2,stroke_fill=(0,0,0,150))
        y-=int(W*0.078)+int(H*0.006)
    img.save(out_path); print('overlay saved', out_path)

if __name__ == '__main__':
    overlay('ads/workspace/overlay_recliner.png',
            hook='שוקעים פנימה. הראש מתנקה.',
            sub='רקליינר מתקפל · פתיחה בשניות · 4 מצבי הטיה + משענת ראש',
            price='₪99', old_price='₪199')
