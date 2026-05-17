-- ─────────────────────────────────────────────────────────────────────────────
--  Security migration: remove api_key from public table + tighten settings RLS
--
--  Context:
--   - api_key was stored in `settings.api_key` as plain text.
--   - The Supabase publishable key is embedded in the client, so any visitor
--     could read this column.
--   - Anthropic key is now stored only in Supabase Secrets (used by the
--     anthropic-proxy Edge Function).
--
--  This migration:
--   1. Wipes any existing key values (defense in depth — key should already be
--      rotated in Anthropic Console).
--   2. Drops the api_key column entirely so it cannot be re-populated by stale
--      client code.
--   3. Enables RLS on `settings` if not already enabled.
--   4. Adds permissive read/write policies for the anon role (matches existing
--      behavior of the app since there's no auth) — but the sensitive column
--      no longer exists.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Wipe key values before dropping (in case migration is reviewed in audit logs)
UPDATE public.settings SET api_key = NULL WHERE api_key IS NOT NULL;

-- 2. Drop the column
ALTER TABLE public.settings DROP COLUMN IF EXISTS api_key;

-- 3. Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 4. Replace any old broad policies with explicit ones
DROP POLICY IF EXISTS "settings_select_all" ON public.settings;
DROP POLICY IF EXISTS "settings_insert_all" ON public.settings;
DROP POLICY IF EXISTS "settings_update_all" ON public.settings;
DROP POLICY IF EXISTS "settings_delete_all" ON public.settings;

CREATE POLICY "settings_select_all" ON public.settings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "settings_insert_all" ON public.settings
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "settings_update_all" ON public.settings
  FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "settings_delete_all" ON public.settings
  FOR DELETE TO anon, authenticated
  USING (true);

COMMIT;
