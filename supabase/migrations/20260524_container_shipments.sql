-- ─────────────────────────────────────────────────────────────────────────────
--  Container shipment tracking
--
--  One row per physical container (e.g. TGBU7941499). Manual entry for now —
--  data comes from the forwarder's tracking page (MSC, COSCO, ZIM, etc.).
--  Phase 2 can wire ShipsGo / Searates API into this same table.
--
--  Event history is kept as a JSONB array so we don't need a second table for
--  the timeline. Each event:
--    { date: 'YYYY-MM-DD', location, description, vessel_voyage, terminal }
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.shipments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  container_number      text NOT NULL,
  container_type        text,                       -- '40HC', '40GP', '20GP', 'LCL'
  carrier               text,                       -- 'MSC', 'COSCO', 'ZIM', ...
  vessel_name           text,                       -- 'MSC OSCAR'
  voyage                text,                       -- 'GT619W'
  origin_port           text,                       -- 'NINGBO, CN'
  pod_port              text DEFAULT 'Ashdod, IL',  -- Port of Discharge
  departure_date        date,                       -- when loaded on vessel
  eta_date              date,                       -- expected arrival
  actual_arrival_date   date,                       -- null until arrived
  last_event            text,                       -- 'Export Loaded on Vessel'
  last_event_at         timestamptz,
  last_event_location   text,
  terminal              text,                       -- 'Hadarom Container Terminal'
  status                text DEFAULT 'planned',     -- planned | in_transit | arrived | cleared
  notes                 text,
  events                jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipments_project   ON public.shipments (project_id);
CREATE INDEX IF NOT EXISTS idx_shipments_container ON public.shipments (container_number);
CREATE INDEX IF NOT EXISTS idx_shipments_eta       ON public.shipments (eta_date);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipments_all" ON public.shipments;
CREATE POLICY "shipments_all" ON public.shipments
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.shipments_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shipments_updated_at ON public.shipments;
CREATE TRIGGER shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.shipments_touch_updated_at();

COMMIT;
