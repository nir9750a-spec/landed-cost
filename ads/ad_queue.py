# -*- coding: utf-8 -*-
"""ad_jobs queue client (task #4/#5) — thin PostgREST wrapper over Supabase, stdlib only.

The autonomous ad engine's shared state lives in public.ad_jobs (see
supabase/migrations/20260815_ad_jobs.sql). This module lets the Python asset
engine enqueue jobs, read work by status, and advance the lifecycle.

Config (env):
  SUPABASE_URL           default https://eginihtpqahpejnkqznn.supabase.co
  SUPABASE_SERVICE_KEY   service_role key (bypasses RLS) — REQUIRED for inserts/updates.
                         Falls back to SUPABASE_KEY / REACT_APP_SUPABASE_KEY (anon, reads only).

Lifecycle: queued → generating → pending_approval → approved → publishing → published
           (or → failed / rejected). Publishers act ONLY on 'approved' rows.
"""
import os
import json
import urllib.request
import urllib.parse
import urllib.error

try:
    from _env import load as _load_env; _load_env()
except Exception:
    pass

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://eginihtpqahpejnkqznn.supabase.co').rstrip('/')
_KEY = (os.environ.get('SUPABASE_SERVICE_KEY')
        or os.environ.get('SUPABASE_KEY')
        or os.environ.get('REACT_APP_SUPABASE_KEY'))

TABLE = 'ad_jobs'
STATUSES = ('queued', 'generating', 'pending_approval', 'approved',
            'publishing', 'published', 'failed', 'rejected')


class QueueError(RuntimeError):
    pass


def _require_key():
    if not _KEY:
        raise QueueError('No Supabase key. Set SUPABASE_SERVICE_KEY (writes) or SUPABASE_KEY (reads).')
    return _KEY


def _request(method, path, params=None, body=None, prefer=None):
    key = _require_key()
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    if params:
        url += '?' + urllib.parse.urlencode(params, safe='.*()')
    data = json.dumps(body).encode('utf-8') if body is not None else None
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode('utf-8')
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise QueueError(f'{method} {path} -> {e.code}: {e.read().decode("utf-8", "replace")}')


def enqueue(sku, hook, price, *, format='feed_4x5', angle=None, scene=None,
            variant=None, product_name=None, asset_url=None, caption=None,
            channels=('ig', 'fb'), utm_content=None, status='queued', metadata=None):
    """Insert one ad_job row and return it."""
    row = {
        'sku': sku, 'hook': hook, 'price': price, 'format': format,
        'angle': angle, 'scene': scene, 'variant': variant,
        'product_name': product_name, 'asset_url': asset_url, 'caption': caption,
        'channels': list(channels), 'utm_content': utm_content,
        'status': status, 'metadata': metadata or {},
    }
    row = {k: v for k, v in row.items() if v is not None}
    out = _request('POST', TABLE, body=row, prefer='return=representation')
    return out[0] if isinstance(out, list) and out else out


def list_jobs(status=None, sku=None, limit=100):
    """Read jobs, optionally filtered by status/sku (newest first)."""
    params = {'select': '*', 'order': 'created_at.desc', 'limit': str(limit)}
    if status:
        params['status'] = f'eq.{status}'
    if sku:
        params['sku'] = f'eq.{sku}'
    return _request('GET', TABLE, params=params) or []


def get_job(job_id):
    """Fetch one job by id (None if it's gone)."""
    out = _request('GET', TABLE, params={'select': '*', 'id': f'eq.{job_id}', 'limit': '1'})
    return out[0] if out else None


def update_job(job_id, **fields):
    """Patch a job by id (e.g. update_job(id, status='approved', external_ref='...'))."""
    if 'status' in fields and fields['status'] not in STATUSES:
        raise QueueError(f'invalid status {fields["status"]!r}; allowed: {STATUSES}')
    out = _request('PATCH', TABLE, params={'id': f'eq.{job_id}'},
                   body=fields, prefer='return=representation')
    return out[0] if isinstance(out, list) and out else out


def approve(job_id):
    return update_job(job_id, status='approved')


def reject(job_id):
    return update_job(job_id, status='rejected')


if __name__ == '__main__':
    # smoke test — safe: only reads. Run after the migration is applied + env is set.
    try:
        jobs = list_jobs(limit=5)
        print(f'OK — ad_jobs reachable. {len(jobs)} recent row(s).')
        for j in jobs:
            print(f"  [{j.get('status'):>15}] {j.get('sku')} · {j.get('format')} · {j.get('hook')}")
    except QueueError as e:
        print('QUEUE NOT READY:', e)
