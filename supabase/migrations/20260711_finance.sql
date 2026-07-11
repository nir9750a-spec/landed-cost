-- ─────────────────────────────────────────────────────────────────────────────
--  Finance module — actual costs, payables, and sales invoices.
--
--  Pillar 2 of the business-agent plan (docs/AGENT_BUSINESS_PLAN.md). Lets the
--  importer track what was ACTUALLY spent per project/shipment (vs. the engine's
--  landed-cost estimate), who is owed money (payables + due dates), and revenue
--  from sales invoices — the basis for real profit and the FinBot integration.
--
--  Posture matches the rest of the app pre-auth: RLS enabled with permissive
--  "allow all" for anon + authenticated, and a nullable owner_id already in place
--  so Phase B isolation (20260606) can tighten these without a schema change.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Parties — suppliers, forwarders, brokers, insurers, customers ────────
CREATE TABLE IF NOT EXISTS public.parties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'supplier',
  -- kind: supplier | forwarder | broker | insurer | customer | other
  tax_id      text,
  email       text,
  phone       text,
  address     text,
  notes       text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parties_owner ON public.parties (owner_id);
CREATE INDEX IF NOT EXISTS idx_parties_kind  ON public.parties (kind);

-- ─── 2. Expenses — actual costs per project (vs. the estimate) ────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id  uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  party_id    uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  category    text NOT NULL DEFAULT 'other',
  -- category: goods | freight | insurance | customs | purchase_tax | vat
  --         | broker | port | local_transport | other
  description text,
  amount      numeric NOT NULL DEFAULT 0,       -- amount in `currency`
  currency    text NOT NULL DEFAULT 'ILS',      -- 'ILS' | 'USD' | 'EUR' | ...
  usd_rate    numeric,                          -- rate actually paid, if FX
  amount_ils  numeric,                          -- convenience: amount converted to ILS
  doc_url     text,                             -- link to source doc in storage
  due_date    date,
  paid_at     date,
  status      text NOT NULL DEFAULT 'open',     -- open | partial | paid
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_project  ON public.expenses (project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_owner    ON public.expenses (owner_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status   ON public.expenses (status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses (category);

-- ─── 3. Sales invoices — revenue (later synced to FinBot) ─────────────────────
CREATE TABLE IF NOT EXISTS public.sales_invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id   uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_id  uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  number       text,                            -- doc number (from FinBot once issued)
  doc_type     text DEFAULT 'invoice',          -- invoice | invoice_receipt | quote | ...
  issued_at    date,
  due_date     date,
  subtotal     numeric DEFAULT 0,
  vat          numeric DEFAULT 0,
  total        numeric DEFAULT 0,
  currency     text NOT NULL DEFAULT 'ILS',
  external_id  text,                            -- FinBot document id
  pdf_url      text,
  status       text NOT NULL DEFAULT 'draft',   -- draft | issued | paid
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_project ON public.sales_invoices (project_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_owner   ON public.sales_invoices (owner_id);

CREATE TABLE IF NOT EXISTS public.sales_invoice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text,
  qty         numeric DEFAULT 1,
  unit_price  numeric DEFAULT 0,
  vat_rate    numeric DEFAULT 18
);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_lines_invoice ON public.sales_invoice_lines (invoice_id);

-- ─── 4. RLS — permissive for now (single-org), auth-ready ─────────────────────
ALTER TABLE public.parties             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parties_all"             ON public.parties;
DROP POLICY IF EXISTS "expenses_all"            ON public.expenses;
DROP POLICY IF EXISTS "sales_invoices_all"      ON public.sales_invoices;
DROP POLICY IF EXISTS "sales_invoice_lines_all" ON public.sales_invoice_lines;

CREATE POLICY "parties_all"             ON public.parties
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "expenses_all"            ON public.expenses
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_invoices_all"      ON public.sales_invoices
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_invoice_lines_all" ON public.sales_invoice_lines
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMIT;
