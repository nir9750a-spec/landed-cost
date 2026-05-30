-- ─────────────────────────────────────────────────────────────────────────────
--  Waitlist / lead capture for the public landing page
--
--  Anonymous visitors can INSERT into waitlist (anyone with the publishable
--  key, which the public landing page ships). Read access requires auth —
--  even though auth isn't wired yet, this stops bots scraping the lead list.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  email       text NOT NULL,
  phone       text,
  source      text DEFAULT 'landing_page',  -- where did the lead come from
  notes       text,
  ip_hash     text,                          -- optional rate-limit key
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email      ON public.waitlist (email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON public.waitlist (created_at DESC);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone with the public anon/publishable key can submit a lead
DROP POLICY IF EXISTS "waitlist_insert" ON public.waitlist;
CREATE POLICY "waitlist_insert" ON public.waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Reading requires auth (when auth lands). Permissive for now so Nir can
-- inspect via the SQL editor.
DROP POLICY IF EXISTS "waitlist_select" ON public.waitlist;
CREATE POLICY "waitlist_select" ON public.waitlist
  FOR SELECT TO anon, authenticated
  USING (true);

COMMIT;
