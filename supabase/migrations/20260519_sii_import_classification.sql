-- ─────────────────────────────────────────────────────────────────────────────
--  Israeli SII (מכון התקנים) import classification
--
--  Adds per-product classification of import oversight group required by the
--  Israel Standards Institute (SII). Groups:
--    1 — Free import (no oversight)
--    2 — Declaration of conformity by importer (may need lab tests)
--    3 — Per-batch SII testing required
--    4 — Type approval + ongoing surveillance (highest scrutiny)
--
--  This is independent of HS classification — the same HS may map to different
--  SII groups depending on intended use, materials, voltage, etc.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sii_required boolean,
  ADD COLUMN IF NOT EXISTS import_group smallint,
  ADD COLUMN IF NOT EXISTS sii_notes    text,
  ADD COLUMN IF NOT EXISTS sii_source   text;  -- 'ai' | 'manual' | NULL

-- Range check (1..4 only when set)
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_import_group_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_import_group_check
  CHECK (import_group IS NULL OR import_group BETWEEN 1 AND 4);

COMMIT;
