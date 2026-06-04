-- ─────────────────────────────────────────────────────────────────────────────
--  Supplier address on projects.
--
--  Needed for the broker / forwarder report (BrokerExport): the freight
--  forwarder needs the seller's full address for pickup (FCA/EXW) and for the
--  commercial invoice. The proforma extractor (aiExtract.js) now captures
--  `supplier_address` from the document header; this column persists it.
--
--  Nullable, no default — old projects simply have NULL and the report falls
--  back to its editable inline field.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS supplier_address text;

COMMIT;
