# -*- coding: utf-8 -*-
"""#5 — MULTI-CHANNEL auto-publish bridge. Turns an APPROVED ad_job into a per-channel
publish plan across every target Nir uses:

  ig / fb        → Make.com (one scenario posts to BOTH)         [AUTO]
  tiktok         → Higgsfield connector (tiktok_* MCP tools)      [AUTO]
  wa_channel     → WhatsApp Channel  — NO API → hand the ready    [MANUAL handoff]
  wa_status      → WhatsApp Status    asset+caption to Nir's       [MANUAL handoff]
                   Telegram to post in one tap

The hosting + Make/TikTok calls are MCP operations; this module produces the exact ordered
plan. Verified against the live Make team + CONNECTIONS on 2026-08-15.

MEDIA per channel:
  photo (feed_4x5/static) → image asset;  reel_9x16 / tiktok → video asset (mp4).
HOSTING:
  Make image → cloudfront ok;  Make video → GitHub raw;  TikTok/Higgsfield → jsDelivr URL.
"""

MAKE = {
    'team_id': 1499942,
    'data_store_id': 159437,          # "4Elements Post Queue"
    'photo_scenario': 6869166,        # IG CreatePostPhoto + FB CreatePostWithPhotos
    'reel_scenario': 6903724,         # IG CreateAReelPost + FB uploadAReel
}
TIKTOK = {
    'connector_id': 'a8e869f3-5860-4267-9389-b1fdc60bdcbc',   # @4elements, via Higgsfield
    'country': 'IL',
}

ALL_CHANNELS = ('ig', 'fb', 'tiktok', 'wa_channel', 'wa_status')


def plan(job):
    """Ordered, per-channel publish plan for an APPROVED ad_job.

    job needs: status=='approved', format, sku, caption, and asset urls:
      image_public_url  (for photo/Make image + WhatsApp)
      video_public_url  (for reel/Make video + TikTok)  — a jsDelivr URL for TikTok.
    """
    if job.get('status') != 'approved':
        raise ValueError(f"refusing job in status {job.get('status')!r}; only 'approved'")

    channels = [c for c in (job.get('channels') or ['ig', 'fb']) if c in ALL_CHANNELS]
    is_video = job['format'] == 'reel_9x16'
    img = job.get('image_public_url')
    vid = job.get('video_public_url')
    caption = job['caption']
    groups = []

    # --- Meta (IG + FB) via Make: one scenario posts to both -----------------
    if 'ig' in channels or 'fb' in channels:
        scen = MAKE['reel_scenario'] if is_video else MAKE['photo_scenario']
        other = MAKE['photo_scenario'] if is_video else MAKE['reel_scenario']
        field = 'video_url' if is_video else 'image_url'
        groups.append({'channel': 'ig+fb (Make)', 'steps': [
            {'op': 'scenarios_deactivate', 'scenarioId': other},   # free plan: one active at a time
            {'op': 'scenarios_activate', 'scenarioId': scen},
            {'op': 'data-store-records_create', 'dataStoreId': MAKE['data_store_id'],
             'data': {field: (vid if is_video else img), 'caption': caption, 'product_id': job['sku']}},
            {'op': 'scenarios_run', 'scenarioId': scen, 'responsive': False,
             'note': 'reel ~70s; may 502 — DO NOT re-run; verify via records_list empty'},
        ]})

    # --- TikTok via Higgsfield connector (video only) ------------------------
    if 'tiktok' in channels:
        groups.append({'channel': 'tiktok (Higgsfield)', 'requires': 'video (mp4)', 'steps': [
            {'op': 'media_import_url', 'url': '<jsDelivr mp4 url>', 'gives': 'media_id + cloudfront url'},
            {'op': 'tiktok_music_trending', 'connector_id': TIKTOK['connector_id'], 'country_code': 'IL'},
            {'op': 'tiktok_prepare_publish', 'video_url': '<cloudfront url>', 'mode': 'DIRECT_POST',
             'media_type': 'VIDEO', 'title': caption[:150]},
            {'op': 'tiktok_publish', 'privacy_level': 'PUBLIC_TO_EVERYONE',
             'commercial_content_disclosure': {'enabled': True, 'your_brand': True, 'branded_content': False},
             'note': 'set music_sound_id from trending; video_original_sound_volume 0'},
            {'op': 'tiktok_publish_status', 'until': 'PUBLISH_COMPLETE'},
        ]})

    # --- WhatsApp Channel + Status — NO API → manual handoff -----------------
    wa = [c for c in channels if c in ('wa_channel', 'wa_status')]
    if wa:
        groups.append({'channel': 'whatsapp (manual handoff)', 'targets': wa, 'steps': [
            {'op': 'telegram_handoff',
             'send': {'media': (vid if is_video else img), 'caption': caption},
             'note': 'bot DMs Nir the ready asset+caption; he posts to Channel/Status in one tap. No API exists.'},
        ]})

    return {'sku': job['sku'], 'format': job['format'], 'groups': groups,
            'on_success': 'ad_queue.update_job(job.id, status="published", external_ref=...)'}


if __name__ == '__main__':
    import json
    demo = {'id': 'x', 'status': 'approved', 'format': 'feed_4x5', 'sku': 'combo2',
            'caption': 'כולם סביב שולחן אחד. …', 'image_public_url': 'https://cdn/combo2.jpg',
            'video_public_url': 'https://cdn/combo2.mp4',
            'channels': ['ig', 'fb', 'tiktok', 'wa_channel', 'wa_status']}
    print(json.dumps(plan(demo), ensure_ascii=False, indent=2))
