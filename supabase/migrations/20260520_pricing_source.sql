-- ─────────────────────────────────────────────────────────────────────────────
--  Mark container_pricing rows as auto-synced or manually edited.
--
--  'auto'   = value was computed from market_rates (FBX13 × ratio or lcl_per_cbm)
--             — safe to overwrite on next sync.
--  'manual' = user edited via PricingMatrix UI
--             — do NOT overwrite on auto-sync.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.container_pricing
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto'
  CHECK (source IN ('auto', 'manual'));

-- Backfill: anything in there already from manual seed → mark as 'manual'
-- so we don't accidentally overwrite them on first auto-sync.
UPDATE public.container_pricing
SET source = 'manual'
WHERE source = 'auto' AND notes IS NOT NULL AND notes LIKE '%seed%';

COMMIT;
