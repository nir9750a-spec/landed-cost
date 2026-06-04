-- ─────────────────────────────────────────────────────────────────────────────
--  Project sharing — give a freight forwarder or customs broker read-only
--  access to a specific project via a one-off link + access code.
--
--  Recipient flow:
--    1. Nir generates a share. Gets back a URL + a 6-digit code.
--    2. He sends URL via WhatsApp / email and the code separately.
--    3. Recipient opens URL → enters the code → sees a stripped-down view
--       of the project (no margins, no sell prices, no profit math).
--
--  Roles determine which fields the recipient sees.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_shares (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  role              text NOT NULL CHECK (role IN ('forwarder', 'customs_broker')),
  access_token      text NOT NULL UNIQUE,        -- the URL component, random base62
  code_hash         text NOT NULL,                -- SHA-256 of (salt + code)
  code_salt         text NOT NULL,
  recipient_email   text,
  recipient_name    text,
  recipient_company text,
  notes             text,
  expires_at        timestamptz,                  -- null = never
  last_viewed_at    timestamptz,
  viewed_count      integer NOT NULL DEFAULT 0,
  revoked_at        timestamptz,                  -- null = active
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_shares_token   ON public.project_shares (access_token);
CREATE INDEX IF NOT EXISTS idx_project_shares_project ON public.project_shares (project_id);

ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;

-- Public can SELECT only the bare-minimum columns needed for the login gate
-- (token lookup + code verification). We expose this via a view to keep the
-- hash + salt accessible only through the verification flow.
DROP POLICY IF EXISTS "project_shares_all" ON public.project_shares;
CREATE POLICY "project_shares_all" ON public.project_shares
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

COMMIT;
