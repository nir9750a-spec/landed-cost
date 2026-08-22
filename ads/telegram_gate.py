# -*- coding: utf-8 -*-
"""#6 — Telegram approval gate. Nir SEES the media + caption, then taps
✅ אשר · 🔄 נסה שוב · ❌ דחה. Nothing publishes without an approve tap.

Two halves:
  send_for_approval(job, media_path)  — pushes a pending_approval job to Telegram with the 3 buttons.
  handle_updates()                    — long-polls button presses and advances the ad_jobs row:
                                          approve → status 'approved' (publisher picks it up)
                                          reject  → status 'rejected'
                                          retry   → status 'queued' + retries++ (asset agent regenerates a NEW variant)

Config (env — secrets stay in the environment, never in git):
  TELEGRAM_BOT_TOKEN   from @BotFather
  TELEGRAM_CHAT_ID     your personal chat id (message the bot once, or ask @userinfobot)
"""
import os
import json
import time
import mimetypes
import urllib.request
import urllib.parse
import urllib.error

try:
    from _env import load as _load_env; _load_env()
except Exception:
    pass

def _secret(name):
    """Read a secret and strip surrounding whitespace. A token pasted out of BotFather or a
    chat id typed into a web form arrives with a trailing newline or a leading space often
    enough that it is worth handling here: the space survives into the request URL and
    Telegram answers 400, which reads like a bad token rather than a bad paste."""
    return (os.environ.get(name) or '').strip() or None


TOKEN = _secret('TELEGRAM_BOT_TOKEN')
CHAT_ID = _secret('TELEGRAM_CHAT_ID')
API = 'https://api.telegram.org/bot{token}/{method}'

try:
    import ad_queue
except Exception:
    ad_queue = None


def _need_token():
    if not TOKEN:
        raise RuntimeError('Set TELEGRAM_BOT_TOKEN (and TELEGRAM_CHAT_ID) in the environment.')
    return TOKEN


def _post_json(method, payload):
    url = API.format(token=_need_token(), method=method)
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST',
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def _post_multipart(method, fields, file_field, file_path):
    """Upload a local file (sendPhoto/sendVideo) via multipart/form-data — stdlib only."""
    url = API.format(token=_need_token(), method=method)
    boundary = '----4elgate' + str(int(time.time() * 1000))
    body = bytearray()
    for k, v in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode('utf-8')
    fname = os.path.basename(file_path)
    ctype = mimetypes.guess_type(file_path)[0] or 'application/octet-stream'
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="{file_field}"; filename="{fname}"\r\n'.encode('utf-8')
    body += f'Content-Type: {ctype}\r\n\r\n'.encode('utf-8')
    with open(file_path, 'rb') as f:
        body += f.read()
    body += f'\r\n--{boundary}--\r\n'.encode('utf-8')
    req = urllib.request.Request(url, data=bytes(body), method='POST',
                                 headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode('utf-8'))


def _keyboard(job_id):
    return {'inline_keyboard': [[
        {'text': '✅ אשר',   'callback_data': f'approve:{job_id}'},
        {'text': '🔄 נסה שוב', 'callback_data': f'retry:{job_id}'},
        {'text': '❌ דחה',   'callback_data': f'reject:{job_id}'},
    ]]}


def resolve_chat_id():
    """Use TELEGRAM_CHAT_ID if set, else derive it from the latest message sent to the bot."""
    if CHAT_ID:
        return CHAT_ID
    res = _post_json('getUpdates', {})
    for upd in reversed(res.get('result', [])):
        msg = upd.get('message') or upd.get('edited_message')
        chat = (msg or {}).get('chat') or {}
        if chat.get('id'):
            return str(chat['id'])
    raise RuntimeError('No chat id found — send your bot any message first, then retry.')


def send_for_approval(job, media_path, is_video=False):
    """Send the rendered media + caption + 3 buttons to Telegram for review."""
    jid = job['id']
    header = f"🆕 מודעה לאישור\n{job.get('sku')} · {job.get('format')} · ₪{job.get('price')}\n\n"
    caption = (header + (job.get('caption') or ''))[:1024]
    fields = {'chat_id': resolve_chat_id(), 'caption': caption,
              'reply_markup': json.dumps(_keyboard(jid))}
    method, field = ('sendVideo', 'video') if is_video else ('sendPhoto', 'photo')
    return _post_multipart(method, fields, field, media_path)


def send_whatsapp_handoff(media_path, caption, is_video=False, targets=('wa_channel', 'wa_status')):
    """No WhatsApp Channel/Status API exists → DM Nir the ready asset + caption so he posts
    it to his Channel + Status in one tap from the phone."""
    where = ' + '.join({'wa_channel': 'ערוץ', 'wa_status': 'סטטוס'}.get(t, t) for t in targets)
    header = f"📤 מוכן לוואטסאפ ({where})\nהעתק את הטקסט והעלה את הקובץ:\n\n"
    fields = {'chat_id': resolve_chat_id(), 'caption': (header + (caption or ''))[:1024]}
    method, field = ('sendVideo', 'video') if is_video else ('sendPhoto', 'photo')
    return _post_multipart(method, fields, field, media_path)


def _answer(callback_id, text):
    try:
        _post_json('answerCallbackQuery', {'callback_query_id': callback_id, 'text': text})
    except Exception:
        pass


def handle_updates(once=False, poll=25):
    """Long-poll button presses and advance the ad_jobs row. Run as a small daemon or scheduled task."""
    offset = None
    while True:
        params = {'timeout': poll}
        if offset is not None:
            params['offset'] = offset
        try:
            res = _post_json('getUpdates', params)
        except Exception as e:
            print('getUpdates error:', e); time.sleep(3); continue
        for upd in res.get('result', []):
            offset = upd['update_id'] + 1
            cq = upd.get('callback_query')
            if not cq:
                continue
            action, _, jid = (cq.get('data') or '').partition(':')
            done = {'approve': 'approved', 'reject': 'rejected', 'retry': 'queued'}.get(action)
            if not done or not jid:
                continue
            if ad_queue:
                try:
                    if action == 'retry':
                        # Merge into the existing metadata (don't clobber it) and bump the counter,
                        # so supervisor.consume_retries() can pick the next variant.
                        cur = ad_queue.get_job(jid) or {}
                        meta = dict(cur.get('metadata') or {})
                        meta['retry_requested'] = True
                        meta['retries'] = int(meta.get('retries') or 0) + 1
                        meta['retried_variant'] = cur.get('variant')
                        ad_queue.update_job(jid, status='queued', metadata=meta)
                    else:
                        ad_queue.update_job(jid, status=done)
                except Exception as e:
                    _answer(cq['id'], f'DB error: {e}'); continue
            label = {'approve': 'אושר — יוצא לפרסום', 'reject': 'נדחה', 'retry': 'מייצר גרסה חדשה'}[action]
            _answer(cq['id'], label)
            print(f'[{jid}] {action} → {done}')
        if once:
            return


if __name__ == '__main__':
    print('token set:', bool(TOKEN), '| chat set:', bool(CHAT_ID))
    if TOKEN:
        print(_post_json('getMe', {}))
