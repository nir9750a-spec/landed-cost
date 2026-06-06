-- ─────────────────────────────────────────────────────────────────────────────
--  PHASE A — Auth ownership (NON-DESTRUCTIVE, safe to apply now).
--
--  Adds an owner to each project and auto-stamps it from the logged-in user on
--  insert. Does NOT change RLS yet — the app keeps working for everyone exactly
--  as before. This only prepares the ground so that Phase B (20260606) can flip
--  on per-user isolation without losing data.
--
--  Run order:
--    1. Apply THIS migration.
--    2. Ship the app with the login gate; sign in with your own account.
--    3. Backfill existing rows + flip RLS via 20260606_rls_isolation.sql.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Owner of a project = the authenticated user who created it.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_owner_id_idx ON public.projects (owner_id);

-- Auto-stamp owner_id from the JWT on insert when the client didn't set it.
-- auth.uid() is NULL for anon (un-logged-in) requests, so pre-auth inserts
-- simply leave owner_id NULL — backfilled in Phase B.
CREATE OR REPLACE FUNCTION public.set_project_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_project_owner ON public.projects;
CREATE TRIGGER trg_set_project_owner
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_owner();

COMMIT;
