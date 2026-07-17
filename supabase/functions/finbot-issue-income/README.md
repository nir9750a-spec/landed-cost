# finbot-issue-income

Server-side proxy that issues income documents in **FinBot** (פינבוט) via its
"API להפקת הכנסות". Keeps the FinBot API key off the browser — same pattern as
`anthropic-proxy`.

## Status: scaffold (inert until configured)

The function will **not** call any URL until `FINBOT_API_URL` is set. Before that
it returns HTTP 501 `{ configured: false }`. This makes it safe to deploy while
the exact API contract is still being confirmed.

## To activate — 3 things from the FinBot docs page

Open FinBot → **הגדרות העסק → מפתח API להפקת הכנסות → מסמך דוקומנטציה**, then set:

```bash
# 1. The API key (from the same screen). Treat as a secret — never commit it.
supabase secrets set FINBOT_API_KEY=<your-key>

# 2. The exact POST endpoint for creating an income document (from the docs).
supabase secrets set FINBOT_API_URL=<https://.../...>

# 3. How the key is passed (from the docs). One of:
#      body:apiKey            → { "apiKey": "<key>", ... }   (default if unset)
#      body:token             → { "token": "<key>", ... }
#      header:X-Api-Key       → header  X-Api-Key: <key>
#      header:Authorization:Bearer  → header  Authorization: Bearer <key>
supabase secrets set FINBOT_KEY_MODE=body:apiKey
```

Then deploy:

```bash
supabase functions deploy finbot-issue-income --no-verify-jwt
```

## Confirm the payload field names

`src/lib/finbot.js → buildFinbotPayload()` maps our invoice shape to FinBot's
request. The field names there (`documentType`, `customer.save`, `items[].price`,
`linkedDocument`, …) and the document-type **codes** in `FINBOT_DOC_TYPES` are
based on FinBot's documented behavior but must be verified against the docs page
and adjusted there if they differ. That function is the only place to touch.

## Response contract (as documented by FinBot)

- `status === 1` → success; `data` holds the document link.
- `linkedDocument` (serial number) is **required** for credit invoices.
- `customer.save = true` saves the customer; `false` = one-off (לקוח מזדמן).

## Security note

The API key issues real financial documents. If it was ever shared in plaintext
(chat, screenshot, email), **regenerate it** in FinBot (🗑️ → create new) and
update the `FINBOT_API_KEY` secret.
