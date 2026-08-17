// Telegram approval webhook — the piece that makes the gate work with the laptop closed.
//
// Until now a local `telegram_gate.handle_updates()` had to be RUNNING for a button press to
// register. If nobody polled, the tap silently sat in Telegram's update queue. As a webhook
// this function is called by Telegram the instant Nir taps, 24/7, no machine involved.
//
// Buttons (callback_data): approve:<job_id> · retry:<job_id> · reject:<job_id>
//   approve → ad_jobs.status = 'approved'   (the publisher acts only on this)
//   reject  → 'rejected'
//   retry   → 'queued' + metadata.retry_requested, so the next daily run re-serves it
//
// Deploy:
//   supabase functions deploy telegram-webhook --no-verify-jwt
//   supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=...
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FN_URL>&secret_token=<SECRET>"
//
// --no-verify-jwt is required (Telegram cannot send a Supabase JWT). The shared secret below
// is what actually authenticates the caller — without it anyone could approve your ads.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';

const NEXT: Record<string, { status: string; label: string }> = {
  approve: { status: 'approved', label: 'אושר — יוצא לפרסום' },
  reject: { status: 'rejected', label: 'נדחה' },
  retry: { status: 'queued', label: 'מייצר גרסה חדשה' },
};

async function tg(method: string, body: unknown) {
  return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getJob(id: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ad_jobs?select=*&id=eq.${id}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function patchJob(id: string, fields: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ad_jobs?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

Deno.serve(async (req) => {
  // Telegram echoes the secret we registered with setWebhook. Anything else is not Telegram.
  if (WEBHOOK_SECRET &&
      req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const cq = update.callback_query;
  if (!cq) return new Response('ok'); // plain messages: nothing to do

  const [action, jobId] = String(cq.data ?? '').split(':');
  const next = NEXT[action];
  if (!next || !jobId) {
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'פעולה לא מוכרת' });
    return new Response('ok');
  }

  try {
    if (action === 'retry') {
      const job = await getJob(jobId);
      const meta = { ...(job?.metadata ?? {}) };
      meta.retry_requested = true;
      meta.retries = Number(meta.retries ?? 0) + 1;
      meta.retried_variant = job?.variant ?? null;
      await patchJob(jobId, { status: next.status, metadata: meta });
    } else {
      await patchJob(jobId, { status: next.status });
    }
  } catch (e) {
    await tg('answerCallbackQuery', {
      callback_query_id: cq.id,
      text: `שגיאת DB: ${e}`.slice(0, 190),
      show_alert: true,
    });
    return new Response('db error', { status: 500 });
  }

  // Acknowledge in the UI and stamp the message so the history shows what was decided.
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: next.label });
  if (cq.message?.chat?.id && cq.message?.message_id) {
    await tg('editMessageReplyMarkup', {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: `— ${next.label} —`, callback_data: 'noop' }]] },
    });
  }
  return new Response('ok');
});
