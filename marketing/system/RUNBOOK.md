# 🏃 RUNBOOK — 4Elements Daily Auto-Post Agent

This is executed by a fresh scheduled session 3×/day. Follow it exactly.

## Fixed IDs (verified working)
- Make team: `1499942`  · org: `7334275`
- Publisher scenario: **6869166** ("4Elements — Publisher (Queue → IG + FB)")
- Post-queue Data Store: **159437** (fields: `image_url`, `caption`, `product_id`)
- Meta connection: **9617477** · IG account: **17841477773982301** (@4elements.il) · FB page: **1355675404284855**
- Repo branch: `claude/daily-conversation-connection-n8ezyf`

## ⚠️ HARD RULES (learned the hard way)
1. **Image MUST be a public JPEG hosted on GitHub raw** (`https://raw.githubusercontent.com/nir9750a-spec/landed-cost/<COMMIT_SHA>/<path>.jpg`). Meta CANNOT fetch weserv, cloudfront, or Google Drive links — those silently fail. Always commit the final JPEG to the repo and use its raw URL with the commit SHA.
2. **IG aspect ratio** must be between 4:5 and 1.91:1. Render at **1080×1350** (4:5) or slightly wider **1080×1300**.
3. Hebrew only, verify spelling twice. NEVER fake reviews/stars/buyer counts. Real 4Elements logo. Remove HISPEED branding if visible. Prices only from `product-profiles.json`.

## Steps (MODE A — free, local composite)
1. **Slot**: from current Israel time → 07:00 TOFU / 12:00 problem→solution / 18:00 conversion+price.
2. **Pick product**: read `marketing/system/rotation-state.json` → use `order[next_index]`. Look up its hook/specs in `marketing/system/product-profiles.json`.
3. **Build the ad locally** (0 credits): create an HTML 1080×1350 composite (base it on `marketing/ad-sources/render-cart.html`): product photo `marketing/ad-sources/<photo>` + top-right 4Elements logo badge + Hebrew headline (the product hook) + orange price badge `₪<price>` + footer `www.4elements.co.il · 052-891-3135`. If the photo shows HISPEED, cover it (crop/logo overlay) or pick the `clean:true` variant.
   Render: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox --disable-gpu --allow-file-access-from-files --screenshot --window-size=1080,1350 file://.../ad.html`
   **Read the PNG to VERIFY** (Hebrew correct, price right, logo present, no HISPEED). Convert to JPEG (`marketing/auto-posts/<YYYY-MM-DD>-<slot>-<product_id>.jpg`).
4. **Commit + push** the JPEG. Capture the commit SHA → build the raw JPEG URL.
5. **Caption** (Hebrew): hook line + 1 benefit line (specs) + `₪<price> · לפרטים ורכישה: 4elements.co.il · 052-891-3135` + hashtags `#קמפינג #אאוטדור #4elements #ציוד_לשטח` + 1–2 product-specific tags.
6. **APPROVAL**: do NOT publish yet. Send the user a message with the raw JPEG URL + caption + product name, ending with: *"תאשר: כתוב **פרסם** לפרסום ל-IG+פייסבוק, או **דלג**/שינויים."* (Push notification fires automatically.)
7. **On user reply "פרסם"**: `data-store-records_create` into store 159437 `{image_url: <raw JPEG URL>, caption, product_id}` → `scenarios_run(6869166, responsive:true)` → confirm `operations >= 4` and `status SUCCESS` → reply "✅ פורסם ל-IG+פייסבוק". Then increment `next_index` (wrap) in rotation-state.json and commit.
   On "דלג" → increment index, skip. On change requests → adjust and re-send for approval.
8. **On any error**: notify the user with the error; never publish junk.

## MODE B (from the 18th, when Higgsfield credits refresh)
For the 07:00 hero slot, ALSO generate a premium Higgsfield image (nano_banana_pro, real photo + logo, Hebrew text). Since Higgsfield/cloudfront can't be auto-hosted for Meta, send it to the user to **download & post manually** (or upscale the local-composite path). Keep 12:00 & 18:00 on Mode A auto.

## DAILY LEARNING (once per day, morning run)
Read IG insights via Make `instagram-business:GetUserInsights2` / `GetMediaInsights` (conn 9617477). Note which of the last posts got the most reach/engagement. Log to `marketing/system/performance-log.md` and bias `rotation-state.json` toward winning products/angles.

## 🔔 חוק התראה (חובה בכל ריצה!)
בכל ריצה, בסופה, **תמיד** שלח `PushNotification` (status: proactive) — בלי יוצאים מן הכלל:
- מודעה מוכנה לאישור → "🔔 4Elements HH:MM: פרסומת [מוצר ₪X] מוכנה — כתוב פרסם".
- אין מודעה / נפסלה / צריך החלטה → "🔔 4Elements HH:MM: צריך החלטה — [סיבה]".
- שגיאה → "🔔 4Elements: שגיאה בריצת HH:MM — [תמצית]".
- אחרי פרסום → "✅ 4Elements: [מוצר] פורסם ל-IG+פייסבוק".
משתמש לא צריך לזכור להיכנס — הצלצול הוא הממשק.
