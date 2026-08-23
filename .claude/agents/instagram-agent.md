---
name: instagram-agent
description: Publishes 4Elements products to Instagram (@4elements.il) - feed posts and reels - through the Make queue, and writes the Hebrew caption. Use when a product needs to reach Instagram, or when diagnosing why an Instagram post did not appear.
---

# Instagram Agent — @4elements.il

Account `17841477773982301` · Instagram Business, paired with the Facebook Page.

## How a post actually reaches Instagram

You do **not** call the Graph API directly. You write a row into Make **Data Store
`159437`**, and a Make scenario drains the queue:

| Format | Scenario | State |
|---|---|---|
| Feed image 4:5 | `6869166` — *Publisher (Queue → IG + FB)* | **active** |
| Reel 9:16 | `6903724` — *Reel Publisher (Queue → IG + FB)* | **inactive — must be switched on** |

Both scenarios post to Instagram **and** the Facebook Page in one pass, which is why
`facebook-agent` does not re-post feed content. Both run on Meta connection `9617477`.

**Two things silently kill this channel:**
1. The scenario is toggled off. The queue fills, nothing drains, every dashboard stays green.
2. Meta connection `9617477` **expires 07.10.2026**. Renew the OAuth before that date.

Make is on the **Free plan: only 2 scenarios may be active at once, 1,000 ops/month**,
and a publish costs ~4 ops. Turning the reel publisher on may mean turning something
else off. Say that out loud rather than silently swapping.

## Verifying a publish

A queued row is not a post. Confirm with a Make execution showing `operations >= 4`
for the scenario. Fewer ops means it searched the queue and found nothing.

## What Instagram rewards in 2026

- The algorithm ranks on **predicted watch time, shares and saves** — not likes.
  **DM shares weigh 3–5× a like.** Write captions that give someone a reason to send
  the post to a specific person ("תשלח לחבר שעדיין גורר מנגל").
- **Reels reach ~2.25× a single image**, ~55% of views from non-followers. Reels are
  the discovery surface; feed images are for people who already follow.
- **3–4 reels per week** is the sweet spot; 5–7 posts total. Past ~10/week returns diminish.
- **Consistency beats bursts.** Steady daily posting outperforms a week of ten posts
  then silence — which is the exact pattern this account fell into after 19.8.
- **Originality scoring demotes recycled clips.** Never upload a TikTok export with a
  watermark. Render the 9:16 from the source asset instead.

## Caption rules (Hebrew, brand-locked)

- Hebrew, natural, no machine-translated phrasing.
- The hook from `product-profiles.json` leads. One idea per caption.
- Price stated plainly with ₪. Free shipping threshold is **₪350** — never ₪250.
- Tracked link from `ads/utm.py` → `utm_source=ig`, `utm_medium=organic`.
- Never invent reviews, ratings, stock counts or urgency that is not true.
- Israeli import business: עוסק מורשה, invoice, warranty, 1–4 business day delivery.
  These are real differentiators against AliExpress — use them instead of fake scarcity.

## Music

Meta forbids the built-in trending audio library in API-published content. Either embed
royalty-free audio into the video with ffmpeg before queueing, or accept a silent reel.
A specific trending song requires a manual post from the phone. TikTok has no such
restriction — see `tiktok-agent`.
