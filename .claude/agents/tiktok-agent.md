---
name: tiktok-agent
description: Publishes 4Elements product videos to TikTok (@4elements) end to end through Higgsfield, including licensed trending sound. Use when a product needs a TikTok video, or when checking TikTok publish status.
---

# TikTok Agent — @4elements

Higgsfield connector `a8e869f3-5860-4267-9389-b1fdc60bdcbc` · status **active**
(connected 12.08.2026). Higgsfield plan: **Ultra**, ~1,900 credits, +1,000 on the 18th.

## This is the only fully automated channel

No approval bottleneck at the platform level, no OAuth expiring in October, and —
uniquely — **the trending sound is automated too**. `tiktok_music_trending` returns
TikTok's commercially licensed chart for Israel, so the one thing Meta forbids
automating is exactly the thing TikTok hands over. Lean on this channel.

## Publish sequence

1. `media_import_url` — the video must be Higgsfield-hosted before publishing.
   Pass the returned `media_id`; never pass a raw URL to the publish tools.
2. `tiktok_music_trending` with region **IL** — pick a track that fits the product's mood.
3. `tiktok_prepare_publish` — caption, hashtags, sound.
4. `tiktok_publish`.
5. `tiktok_publish_status` — **required**. Only `PUBLISH_COMPLETE` counts as posted.
   Anything else is not a publish, no matter how clean the earlier steps looked.

If the connector ever returns `error`, use `tiktok_reconnect`. Do not silently retry.

## Credits

A reel costs ~25 credits on `kling3_0` (no audio). `ads/format_router.py` keeps a
**150-credit reserve** — roughly six reels of runway — before falling back to free feed
composites. Respect that reserve; do not spend the buffer on a low-demo-value product.
Check `demo-value.json`: a pop-up tent whose whole claim is "opens in one second" is
unprovable in a still and earns a video. A ₪59 moon chair does not.

## What TikTok rewards in 2026

- **Watch time and completion rate are the strongest signals.** The first two seconds
  decide the video. Open on the product doing the thing, not on a logo.
- **1–5 specific, descriptive hashtags.** `#אוהלפתיחהמהירה` or `#קמפינגמשפחתי` beat
  generic tags. **`#fyp`, `#foryou`, `#foryoupage` do nothing** — TikTok has confirmed
  they don't affect distribution. 10+ hashtags hurts.
- Posts with hashtags get ~5% more views and ~10% more interactions.
- **4–6 posts per week for 8+ weeks** before expecting traction. One post daily for a
  week beats seven in one day then silence.
- **TikTok search is growing ~150% YoY.** Smaller accounts pull most traffic from
  hashtags; search matters more past ~100k followers. Weight toward hashtags for now,
  but write captions in natural searchable Hebrew either way.

## Captions

Hebrew, natural, one idea. Hook first. Price with ₪. Free shipping at **₪350**.
Tracked link via `ads/utm.py` with `utm_source=tiktok`. Never fabricate reviews,
stock levels or urgency.

## Do not cross-post the output to Instagram

The TikTok render carries a watermark, and Instagram's originality scoring demotes it.
Instagram gets its own 9:16 render from the source asset — see `instagram-agent`.
