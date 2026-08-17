# -*- coding: utf-8 -*-
"""#8 — the SUPERVISOR (orchestrator brain).

Each day it: (1) rotates through the catalog to pick what to feature, (2) — given generated
scene images — renders the ad set, enqueues a job, and sends it to Telegram for approval.
Approved jobs are published multi-channel by publish.py.

The ONE step that needs the Higgsfield MCP (generate a NIR+product scene) is done by the daily
agent that calls this module; everything deterministic lives here so it's testable + repeatable.

Daily cadence (from product-profiles.json): 07:00 TOFU 4:5 · 12:00 MOFU reel 9:16 · 18:00 BOFU 4:5.
"""
import os
import json
import datetime
import make_ad_master as M
import utm

ROT_PATH = os.path.join(os.path.dirname(__file__), 'rotation-state.json')
DEFAULT_CHANNELS = ['ig', 'fb', 'tiktok', 'wa_channel', 'wa_status']
SLOT_FORMAT = {'07:00': 'feed_4x5', '12:00': 'reel_9x16', '18:00': 'feed_4x5'}


def _load_rot():
    if os.path.exists(ROT_PATH):
        with open(ROT_PATH, encoding='utf-8') as f:
            return json.load(f)
    return {'served': {}}


def _save_rot(r):
    with open(ROT_PATH, 'w', encoding='utf-8') as f:
        json.dump(r, f, ensure_ascii=False, indent=2)


def pick_today(n=1):
    """Rotate the catalog: least-recently-served products first (never-served win)."""
    products = M._profiles()['products']
    served = _load_rot()['served']
    order = sorted(products, key=lambda p: served.get(p['id'], ''))
    return order[:n]


def build_spec(sku, fmt='feed_4x5', angle='price', scene=None, variant='v1'):
    """Full job spec for a SKU (hook/price/utm/caption/channels) — no side effects."""
    product, brand = M.get_product(sku)
    u = utm.build_utm(sku, angle=angle, fmt=fmt, variant=variant, source='ig')
    caption = M.build_caption(product, brand)
    link = utm.tracked_link(sku, angle=angle, fmt=fmt, variant=variant, source='ig')
    return {
        'sku': sku, 'product_name': product['name'], 'hook': product['hook'],
        'price': product['price'], 'angle': angle, 'scene': scene or product.get('scene', 'טבע'),
        'format': fmt, 'variant': variant, 'utm_content': u['utm_content'],
        'caption': f'{caption}\n{link}', 'channels': DEFAULT_CHANNELS,
    }


def run(scene_paths, slot='07:00', out_dir=None):
    """Given {sku: scene_image_path}, render → enqueue → send each to Telegram for approval.
    Returns the enqueued job rows. (scene images come from the Higgsfield step done by the agent.)"""
    import ad_queue
    import telegram_gate
    out_dir = out_dir or os.path.join(os.path.dirname(__file__), 'workspace', 'final-ads')
    fmt = SLOT_FORMAT.get(slot, 'feed_4x5')
    is_video = fmt == 'reel_9x16'
    rot = _load_rot()
    jobs = []
    for sku, scene in scene_paths.items():
        spec = build_spec(sku, fmt=fmt)
        M.render_from_sku(sku, scene, out_dir)
        media = f'{out_dir}/{sku}_{"reel_9x16" if is_video else "feed_4x5"}.jpg'
        row = ad_queue.enqueue(
            sku, spec['hook'], spec['price'], format=fmt, angle=spec['angle'],
            scene=spec['scene'], variant=spec['variant'], product_name=spec['product_name'],
            asset_url=media, caption=spec['caption'], channels=spec['channels'],
            utm_content=spec['utm_content'], status='pending_approval')
        telegram_gate.send_for_approval(row, media, is_video=is_video)
        rot['served'][sku] = datetime.date.today().isoformat()
        jobs.append(row)
        print(f"[{sku}] queued + sent for approval → job {row.get('id')}")
    _save_rot(rot)
    return jobs


def pending_retries():
    """Jobs Nir bounced back with 🔄 — they sit in 'queued' with metadata.retry_requested
    and nothing regenerates them until this consumer runs."""
    import ad_queue
    return [j for j in ad_queue.list_jobs(status='queued')
            if (j.get('metadata') or {}).get('retry_requested')]


def retry_brief(job):
    """What the NEXT version of a bounced job should be: same proven hook + format,
    a DIFFERENT scene (rotating the 3×3×3 scene axis). The scene image itself must come
    from the Higgsfield step — this returns the brief for it."""
    import variants
    scenes = list(variants.SCENES)
    used = (job.get('metadata') or {}).get('used_scenes') or []
    nxt = next((s for s in scenes if s not in used), scenes[len(used) % len(scenes)])
    return {'sku': job['sku'], 'format': job.get('format') or 'feed_4x5',
            'scene': nxt, 'scene_prompt': variants.SCENE_PROMPT[nxt],
            'used_scenes': used + [nxt], 'retry_of': job['id'],
            'retries': int((job.get('metadata') or {}).get('retries') or 1)}


def consume_retries(scene_paths=None, out_dir=None):
    """Close the 🔄 loop. For every bounced job: if a fresh scene image was supplied for its
    SKU, re-render → enqueue a NEW job → send a new approval card, and mark the old row
    superseded. Jobs with no scene image are returned under 'needs_scene' together with the
    Higgsfield brief, because generating the photo is the one step Python can't do."""
    import ad_queue
    import telegram_gate
    scene_paths = scene_paths or {}
    out_dir = out_dir or os.path.join(os.path.dirname(__file__), 'workspace', 'final-ads')
    done, needs = [], []
    for job in pending_retries():
        brief = retry_brief(job)
        scene = scene_paths.get(job['sku'])
        if not scene:
            needs.append(brief)
            print(f"[{job['sku']}] retry #{brief['retries']} waiting for a scene → {brief['scene']}: {brief['scene_prompt']}")
            continue
        fmt = brief['format']
        is_video = fmt == 'reel_9x16'
        spec = build_spec(job['sku'], fmt=fmt, scene=brief['scene'],
                          variant=f"r{brief['retries']}")
        M.render_from_sku(job['sku'], scene, out_dir)
        media = f'{out_dir}/{job["sku"]}_{"reel_9x16" if is_video else "feed_4x5"}.jpg'
        row = ad_queue.enqueue(
            job['sku'], spec['hook'], spec['price'], format=fmt, angle=spec['angle'],
            scene=spec['scene'], variant=spec['variant'], product_name=spec['product_name'],
            asset_url=media, caption=spec['caption'], channels=spec['channels'],
            utm_content=spec['utm_content'], status='pending_approval',
            metadata={'retry_of': job['id'], 'retries': brief['retries'],
                      'used_scenes': brief['used_scenes']})
        telegram_gate.send_for_approval(row, media, is_video=is_video)
        ad_queue.update_job(job['id'], status='rejected',
                            metadata={**(job.get('metadata') or {}),
                                      'retry_requested': False,
                                      'superseded_by': row.get('id')})
        done.append(row)
        print(f"[{job['sku']}] retry #{brief['retries']} → new job {row.get('id')} sent for approval")
    return {'resent': done, 'needs_scene': needs}


if __name__ == '__main__':
    picks = pick_today(3)
    print("today's picks:", [(p['id'], p['name']) for p in picks])
    print('--- sample spec ---')
    print(json.dumps(build_spec(picks[0]['id']), ensure_ascii=False, indent=2))
