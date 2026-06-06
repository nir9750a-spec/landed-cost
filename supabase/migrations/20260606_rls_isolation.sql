-- ─────────────────────────────────────────────────────────────────────────────
--  PHASE B — Per-user data isolation (DESTRUCTIVE / GATED — DO NOT RUN YET).
--
--  ⚠️  Running this BEFORE the steps below will make the app appear empty,
--      because every existing row has owner_id = NULL until backfilled.
--
--  PRE-FLIGHT (in order):
--    1. 20260605_auth_owner.sql is already applied.
--    2. The app with the login gate is deployed and you have signed in at least
--       once with YOUR account.
--    3. Get your user id:  select id, email from auth.users order by created_at;
--    4. Put that uuid in BACKFILL_OWNER below (replace the placeholder).
--    5. Switch the share portal to the get_share_bundle() RPC (see AUTH_PLAN.md)
--       — otherwise /share stops working once the tables are locked.
--    6. THEN run this file. Test: your data shows; a second account sees nothing
--       of yours; an existing /share link still opens.
--
--  Rollback: re-create the old permissive policies (FOR ALL TO anon,
--  authenticated USING (true) WITH CHECK (true)) on each table.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Backfill existing rows to the owner ───────────────────────────────────
-- Replace this placeholder with your real auth.users.id before running.
DO $$
DECLARE
  backfill_owner uuid := '00000000-0000-0000-0000-000000000000'; -- <-- EDIT ME
BEGIN
  IF backfill_owner = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'Set backfill_owner to your real auth.users.id before running Phase B';
  END IF;
  UPDATE public.projects SET owner_id = backfill_owner WHERE owner_id IS NULL;
END $$;

-- ── 2. Helper: does the current user own this project? ────────────────────────
CREATE OR REPLACE FUNCTION public.owns_project(pid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = pid AND p.owner_id = auth.uid()
  );
$$;

-- ── 3. Owner-scoped policies ──────────────────────────────────────────────────
-- projects: owner sees/edits only their own.
DROP POLICY IF EXISTS "projects_all" ON public.projects;
DROP POLICY IF EXISTS "projects_owner" ON public.projects;
CREATE POLICY "projects_owner" ON public.projects
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- products / shipments / project_files / project_shares: scope through project.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','shipments','project_files','project_shares'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (public.owns_project(project_id))
        WITH CHECK (public.owns_project(project_id))
    $f$, t || '_owner', t);
  END LOOP;
END $$;

-- settings: project rows scoped by owner; the shared global row (project_id IS
-- NULL) stays readable/writable by any authenticated user FOR NOW.
-- TODO (Phase B.1): give settings its own owner_id and make global per-user.
DROP POLICY IF EXISTS "settings_all" ON public.settings;
DROP POLICY IF EXISTS "settings_scoped" ON public.settings;
CREATE POLICY "settings_scoped" ON public.settings
  FOR ALL TO authenticated
  USING  (project_id IS NULL OR public.owns_project(project_id))
  WITH CHECK (project_id IS NULL OR public.owns_project(project_id));

-- Shared reference data (freight/container pricing) — every signed-in user may
-- READ; writes stay as-is for now (Nir-curated). TODO: admin-only writes.
-- (No policy change here — they already allow authenticated. Listed for clarity.)

-- ── 4. Public share portal via SECURITY DEFINER RPC ───────────────────────────
-- The /share/<token> portal uses the anon key and therefore can't pass the
-- owner check. This function validates token + 6-digit code, bumps the view
-- counter, and returns a role-filtered bundle with the money-secret columns
-- stripped SERVER-SIDE (so they never travel over the wire).
CREATE OR REPLACE FUNCTION public.get_share_bundle(p_token text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s            public.project_shares%ROWTYPE;
  secret_cols text[] := ARRAY[
    'margin','margin_type','sell_price','sell_per_unit','profit','profit_per_unit',
    'landed_cost','landed_cost_ils','landed_cost_usd','cost_per_unit','roi','market_rates'
  ];
  result jsonb;
BEGIN
  SELECT * INTO s FROM public.project_shares WHERE access_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'share_not_found'; END IF;
  IF s.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'revoked'; END IF;
  IF s.expires_at IS NOT NULL AND s.expires_at < now() THEN RAISE EXCEPTION 'expired'; END IF;
  IF encode(digest(s.code_salt || ':' || p_code, 'sha256'), 'hex') <> s.code_hash THEN
    RAISE EXCEPTION 'wrong_code';
  END IF;

  UPDATE public.project_shares
    SET last_viewed_at = now(), viewed_count = COALESCE(viewed_count,0) + 1
    WHERE id = s.id;

  SELECT jsonb_build_object(
    'role', s.role,
    'project',   (SELECT to_jsonb(p) - secret_cols FROM public.projects p WHERE p.id = s.project_id),
    'products',  COALESCE((SELECT jsonb_agg(to_jsonb(pr) - secret_cols) FROM public.products pr WHERE pr.project_id = s.project_id), '[]'::jsonb),
    'shipments', COALESCE((SELECT jsonb_agg(to_jsonb(sh)) FROM public.shipments sh WHERE sh.project_id = s.project_id), '[]'::jsonb),
    'files',     COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM public.project_files f WHERE f.project_id = s.project_id), '[]'::jsonb),
    'settings',  (SELECT to_jsonb(se) - secret_cols FROM public.settings se WHERE se.project_id = s.project_id)
  ) INTO result;

  RETURN result;
END;
$$;

-- Anyone (anon) may call the RPC; it does its own token/code auth inside.
GRANT EXECUTE ON FUNCTION public.get_share_bundle(text, text) TO anon, authenticated;

-- NOTE: digest() requires pgcrypto. If not enabled:  create extension if not exists pgcrypto;

COMMIT;
