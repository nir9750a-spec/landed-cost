-- ─────────────────────────────────────────────────────────────────────────────
--  Phase A: container auto-selection + dynamic pricing
--
--  Adds:
--   1. container_types lookup table (20ft / 40ft / 40hc / 45hc / lcl)
--   2. container_pricing table (origin_port × container_code → price + war risk)
--   3. settings columns: manual_container_code, force_lcl, actual_freight_usd
--
--  Selection thresholds (min_cbm_to_select) are stored on container_types so
--  business rules can be tweaked without code changes.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. container_types ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.container_types (
  code               text PRIMARY KEY,
  display_name_he    text NOT NULL,
  nominal_cbm        numeric NOT NULL,
  practical_cbm      numeric NOT NULL,
  min_cbm_to_select  numeric NOT NULL,
  sort_order         int  NOT NULL,
  is_active          boolean DEFAULT true,
  created_at         timestamptz DEFAULT now()
);

-- Seed (idempotent)
INSERT INTO public.container_types (code, display_name_he, nominal_cbm, practical_cbm, min_cbm_to_select, sort_order)
VALUES
  ('lcl',   'LCL — חלק מקונטיינר',         0,  0,  0,   0),
  ('20ft',  '20ft קונטיינר רגיל',          33, 28, 18,  1),
  ('40ft',  '40ft קונטיינר רגיל',          67, 58, 25,  2),
  ('40hc',  '40ft HC — High Cube',         76, 68, 55,  3),
  ('45hc',  '45ft HC — High Cube',         86, 76, 70,  4)
ON CONFLICT (code) DO UPDATE SET
  display_name_he   = EXCLUDED.display_name_he,
  nominal_cbm       = EXCLUDED.nominal_cbm,
  practical_cbm     = EXCLUDED.practical_cbm,
  min_cbm_to_select = EXCLUDED.min_cbm_to_select,
  sort_order        = EXCLUDED.sort_order;

ALTER TABLE public.container_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "container_types_all" ON public.container_types;
CREATE POLICY "container_types_all" ON public.container_types
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);


-- ─── 2. container_pricing ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.container_pricing (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_port           text NOT NULL,
  container_code        text NOT NULL REFERENCES public.container_types(code),
  base_price_usd        numeric NOT NULL,
  war_risk_usd          numeric DEFAULT 0,
  valid_from            date NOT NULL DEFAULT current_date,
  project_id            uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_container_pricing_lookup
  ON public.container_pricing (origin_port, container_code, project_id, valid_from DESC);

ALTER TABLE public.container_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "container_pricing_all" ON public.container_pricing;
CREATE POLICY "container_pricing_all" ON public.container_pricing
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);


-- ─── 3. New columns on settings ───────────────────────────────────────────────
-- manual_container_code: user override (NULL = auto-select)
-- force_lcl:             user forces LCL regardless of CBM (rare but useful)
-- actual_freight_usd:    user entered the actual quote from forwarder
--                        (NULL = use estimate from container_pricing)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS manual_container_code text,
  ADD COLUMN IF NOT EXISTS force_lcl             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS actual_freight_usd    numeric;

-- ─── 4. Seed initial pricing for Shanghai (global defaults) ──────────────────
-- These are sensible starting numbers; the user will tune them through the UI.
INSERT INTO public.container_pricing (origin_port, container_code, base_price_usd, war_risk_usd, valid_from, project_id, notes)
VALUES
  ('שנגחאי', '20ft',  1400, 500, current_date, NULL, 'Default seed — please verify'),
  ('שנגחאי', '40ft',  2500, 800, current_date, NULL, 'Default seed — please verify'),
  ('שנגחאי', '40hc',  2500, 800, current_date, NULL, 'Default seed — please verify'),
  ('שנגחאי', '45hc',  3200, 800, current_date, NULL, 'Default seed — please verify'),
  ('שנגחאי', 'lcl',   75,   30,  current_date, NULL, 'Per CBM — Default seed')
ON CONFLICT DO NOTHING;

COMMIT;
