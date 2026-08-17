# 📮 PUBLISH RUNBOOK (#5) — approved ad_job → live IG/FB (via Make)

The publisher agent (or Claude, with Nir's per-post OK) runs this **only** for rows where
`ad_jobs.status = 'approved'`. Grounded in the live Make team (verified 2026-08-15).

## Constants (verified)
- Make team `1499942` · Data Store `159437` "4Elements Post Queue" (fields `image_url`, `video_url`, `caption`, `product_id`)
- **Photo** scenario `6869166` — IG CreatePostPhoto + FB CreatePostWithPhotos
- **Reel** scenario `6903724` — IG CreateAReelPost + FB uploadAReel
- ⚠️ FREE plan → **only ONE scenario active at a time**. Currently the Reel publisher is active.

## Sequence (per approved job)
1. **Gate** — confirm `status == 'approved'`. Never publish `queued`/`pending_approval`.
2. **Host the asset publicly:**
   - image (`feed_4x5`/`static`) → `media_upload` to Higgsfield → use the returned **cloudfront** url.
   - video (`reel_9x16`) → push the mp4 to GitHub → use the **raw.githubusercontent** url (Meta rejects cloudfront/octet-stream for video).
3. **Build the plan** — `ads/publish.py` → `plan(job)` gives the exact ordered steps.
4. **Switch scenarios** (single-active): `scenarios_deactivate(<other>)` → `scenarios_activate(<target>)`.
5. **Queue the post:** `data-store-records_create(159437, {image_url|video_url, caption, product_id})`.
6. **Run:** `scenarios_run(<target>, responsive=false)`. Reel upload ~70s → a responsive run may return 502; **do NOT re-run.**
7. **Verify:** `data-store-records_list(159437)` is empty (record consumed = success), or `executions_get-detail` shows END with all operations.
8. **Record outcome:** `ad_queue.update_job(job.id, status='published', external_ref=<execution/post id>)`. On failure → `status='failed'`, `error=<msg>`.

## Safety
- **Public post = irreversible.** Requires Nir's explicit OK per post until the WhatsApp approval gate (#6) automates the go/no-go.
- Don't run two scenarios at once; don't re-run on 502.
- TikTok is NOT via Make — separate Higgsfield `tiktok_*` flow (see marketing/system CONNECTIONS).
- WhatsApp status is manual (no API) — hand Nir the 9:16 asset.
