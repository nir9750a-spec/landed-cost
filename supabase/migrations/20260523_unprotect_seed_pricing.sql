-- ─────────────────────────────────────────────────────────────────────────────
--  Hotfix: undo the over-aggressive seed-row protection from
--  20260520_pricing_source.sql.
--
--  Original intent: protect manually entered seed values from being
--  overwritten on first auto-sync.
--  Actual problem: those seed values were placeholder/aspirational, NOT real
--  market quotes. Marking them 'manual' meant FBX13 auto-sync never updated
--  them — defeating the whole auto-sync feature for the owner.
--
--  Fix: reset 'seed' rows back to 'auto' so the next sync pulls real FBX13.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.container_pricing
SET source = 'auto'
WHERE source = 'manual' AND notes IS NOT NULL AND notes LIKE '%seed%';
