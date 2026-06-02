-- ─────────────────────────────────────────────────────────────────────────────
--  Add BL-declared totals to shipments so we can cross-check invoice vs
--  packing vs BL on the dashboard. The new columns hold what the carrier
--  (or the customs broker) declared on the Bill of Lading or Air Waybill.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS declared_pieces    integer,
  ADD COLUMN IF NOT EXISTS declared_packages  integer,  -- cartons / pallets
  ADD COLUMN IF NOT EXISTS declared_cbm       numeric,
  ADD COLUMN IF NOT EXISTS declared_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS declared_value_usd numeric;

COMMIT;
