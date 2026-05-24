-- ─────────────────────────────────────────────────────────────────────────────
--  Project file attachments
--
--  Every file the user uploads (invoice, packing list, BL, screenshots from
--  the forwarder, customs broker docs) lands in Supabase Storage and gets a
--  metadata row here so the Documents tab can list, categorize, and link them.
--
--  Storage path convention: {project_id}/{epoch_ms}_{safe_filename}
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Metadata table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path      text NOT NULL,             -- key inside the bucket
  file_name         text NOT NULL,             -- display name (original)
  category          text NOT NULL DEFAULT 'other',
  -- categories: invoice | packing_list | bill_of_lading | logistics_agent
  --           | customs_agent | screenshot | other
  mime_type         text,
  size_bytes        bigint,
  notes             text,
  uploaded_at       timestamptz DEFAULT now(),
  uploaded_by       text                        -- email/name if we add auth later
);

CREATE INDEX IF NOT EXISTS idx_project_files_project  ON public.project_files (project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_category ON public.project_files (category);

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_files_all" ON public.project_files;
CREATE POLICY "project_files_all" ON public.project_files
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);


-- ─── 2. Storage bucket (public read for simplicity in v1) ────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Permissive policies — same posture as the rest of the app (single-org for now).
-- When auth lands, tighten these to auth.uid()-based checks.
DROP POLICY IF EXISTS "project_files_storage_read"   ON storage.objects;
DROP POLICY IF EXISTS "project_files_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "project_files_storage_delete" ON storage.objects;

CREATE POLICY "project_files_storage_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'project-files');

CREATE POLICY "project_files_storage_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'project-files');

CREATE POLICY "project_files_storage_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'project-files');

COMMIT;
