-- ============================================================================
-- FOCUS — INVENTORY CENTRAL BACKFILL — CANONICAL DATASET (Phase A, Step 4)
--
-- Type: DATA (INSERT only). DRAFT FOR REVIEW — NOT EXECUTED.
-- Run as postgres in the Supabase SQL Editor, ONLY after the owner's Phase A GO.
--
-- GUARANTEES
--   * ALL-OR-NOTHING: one transaction. A single multi-row INSERT is atomic in
--     PostgreSQL — any row violating a CHECK / FK / unique constraint aborts
--     the whole statement → 0 rows committed. Two explicit guards (Guard 1:
--     central inventory must be empty; Guard 2: exactly 8 rows committed for
--     the 8 canonical source_keys) force ROLLBACK if the invariant fails.
--     7/8 is impossible by construction.
--   * No RPC is used: every inventory_% management RPC requires auth.uid() in
--     an admin session; a one-shot maintenance backfill runs as postgres.
--     The audit trigger records one 'created' movement per row automatically.
--   * Values below are the VERIFIED canonical dataset (source:
--     docs/release/production-bugs/evidence/canonical-dataset.json, derived
--     from inventory-phase-c/exports/chrome-pc.json sha256 de8b08df…5f45f0).
--   * is_published = FALSE for every row (D-CANON-2 — no auto-publishing).
--
-- Rollback: run 02-inventory-rollback.sql (erases central data).
-- ============================================================================

BEGIN;

-- Guard 1: central inventory must be empty. An unexpected pre-existing row
-- (including an unexpected source_key) aborts BEFORE any write.
DO $$
DECLARE v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows FROM public.inventory_items;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'inventory_items is not empty (% rows) — aborting backfill', v_rows;
  END IF;
END $$;

INSERT INTO public.inventory_items
  (model_id, brand, model, variant, ram, storage, condition, color, quantity, status,
   buy_price, sell_price, created_at, updated_at, total_purchased, total_sold,
   code, is_published, source_key)
VALUES
  ('Apple iPhone 15 Pro',     'Apple',  'iPhone 15 Pro',      '8/256',  '8GB',   '256GB', 'Like New',   '', 2, 'low_stock',  175000, 199000, '2026-08-06T09:37:32.994Z', '2026-08-06T09:37:32.994Z', 2, 0, NULL, FALSE, '5cd016dd-d233-4502-93aa-dfa16ddd168f'),
  ('Apple iPhone 14',         'Apple',  'iPhone 14',          '6/128',  '6GB',   '128GB', 'Excellent',  '', 2, 'low_stock',  115000, 135000, '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 2, 0, NULL, FALSE, 'dd304e72-4ed3-456b-99cc-4fcef6986ccd'),
  ('Apple iPhone 13',         'Apple',  'iPhone 13',          '4/128',  '4GB',   '128GB', 'Good',       '', 3, 'low_stock',  85000,  105000, '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 3, 0, NULL, FALSE, 'b9f47a46-38ba-49f1-8323-70ac783c59ea'),
  ('Samsung Galaxy S24 Ultra','Samsung','Galaxy S24 Ultra',   '12/512', '12GB',  '512GB', 'Like New',   '', 2, 'low_stock',  165000, 190000, '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 2, 0, NULL, FALSE, '89cd5d97-603a-4b16-89b3-898e3acb6f4e'),
  ('Samsung Galaxy S22',      'Samsung','Galaxy S22',         '8/128',  '8GB',   '128GB', 'Excellent',  '', 3, 'low_stock',  75000,  90000,  '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 3, 0, NULL, FALSE, '26f4240a-ff01-4e56-aba0-f54c233ec7ef'),
  ('Samsung Galaxy A54',      'Samsung','Galaxy A54',         '8/128',  '8GB',   '128GB', 'Good',       '', 4, 'in_stock',   55000,  68000,  '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 4, 0, NULL, FALSE, '585cd6d3-2932-49c8-9d5c-836d613a7fed'),
  ('Xiaomi Redmi Note 13',    'Xiaomi','Redmi Note 13',       '8/256',  '8GB',   '256GB', 'Good',       '', 4, 'in_stock',   45000,  58000,  '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 4, 0, NULL, FALSE, '19ef1727-dfab-4d84-af89-b55ca9c524fc'),
  ('Xiaomi Redmi 12',         'Xiaomi','Redmi 12',            '6/128',  '6GB',   '128GB', 'Very Good',  '', 3, 'low_stock',  28000,  38000,  '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 3, 0, NULL, FALSE, '03839b3d-b833-4c50-ad78-b1447e8b0905');

-- Guard 2: exactly 8/8 committed for the canonical keys AND total = 8, else
-- force ROLLBACK. Two independent checks: (a) all 8 canonical source_keys are
-- present, (b) the whole inventory_items table contains exactly 8 rows (guards
-- against a concurrent insert slipping between Guard 1 and the INSERT).
DO $$
DECLARE v_keys integer;
DECLARE v_total integer;
BEGIN
  SELECT count(*) INTO v_keys
  FROM public.inventory_items
  WHERE source_key IN (
    '5cd016dd-d233-4502-93aa-dfa16ddd168f','dd304e72-4ed3-456b-99cc-4fcef6986ccd',
    'b9f47a46-38ba-49f1-8323-70ac783c59ea','89cd5d97-603a-4b16-89b3-898e3acb6f4e',
    '26f4240a-ff01-4e56-aba0-f54c233ec7ef','585cd6d3-2932-49c8-9d5c-836d613a7fed',
    '19ef1727-dfab-4d84-af89-b55ca9c524fc','03839b3d-b833-4c50-ad78-b1447e8b0905');

  SELECT count(*) INTO v_total FROM public.inventory_items;

  IF v_keys <> 8 OR v_total <> 8 THEN
    RAISE EXCEPTION 'backfill failed: %/8 canonical rows, total rows = % — aborting', v_keys, v_total;
  END IF;
END $$;

COMMIT;
