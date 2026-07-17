-- ─────────────────────────────────────────────────────────────────────────────
--  Inventory module — stock levels valued at LANDED COST.
--
--  Pillar 3 of the business-agent plan. Tracks what's on hand per SKU, and —
--  crucially for an importer — the weighted-average *landed* cost of that stock
--  (not FOB), so pricing and profit are computed on the real cost basis.
--
--  Current stock and average cost are derived from stock_moves (inbound raises
--  qty at a unit_landed_cost; sale/adjustment lower it), aggregated in the app.
--
--  Posture matches the rest of the app: RLS enabled, permissive "allow all" for
--  anon + authenticated, nullable owner_id ready for Phase B isolation.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sku           text,
  name          text NOT NULL,
  barcode       text,
  reorder_point numeric NOT NULL DEFAULT 0,
  notes         text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_owner ON public.inventory_items (owner_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name  ON public.inventory_items (name);

CREATE TABLE IF NOT EXISTS public.stock_moves (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  item_id           uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  kind              text NOT NULL DEFAULT 'inbound',
  -- kind: inbound | sale | adjustment | return
  qty               numeric NOT NULL DEFAULT 0,   -- + for inbound/return, - for sale
  unit_landed_cost  numeric,                      -- ILS per unit at time of inbound
  ref               text,                         -- shipment / invoice / note
  moved_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_moves_item    ON public.stock_moves (item_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_project ON public.stock_moves (project_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_owner   ON public.stock_moves (owner_id);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_moves     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_items_all" ON public.inventory_items;
DROP POLICY IF EXISTS "stock_moves_all"     ON public.stock_moves;

CREATE POLICY "inventory_items_all" ON public.inventory_items
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "stock_moves_all" ON public.stock_moves
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMIT;
