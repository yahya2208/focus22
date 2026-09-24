-- ============================================================================
-- 00116  FRUIT CATEGORY (CHECK widen, additive-only).
-- ----------------------------------------------------------------------------
-- Admits 'fruit' alongside the existing category values so fruit catalog rows
-- can be created with the same inventory_items contracts (numeric quantities,
-- unit rules, sell_unit derivation, publishing gate) as produce.
-- Semantically additive: every existing row ('phone|car|property|produce')
-- remains valid. No backfill, no data writes, no RPC/RLS/policy changes.
-- Artwork/UI for fruit kinds arrives in a follow-up gate (unknown keys fall
-- back to the seedling placeholder by contract — never a crash).
-- NOT applied to any DB by this file alone.
-- ============================================================================

ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_category_check;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_category_check
  CHECK (category IN ('phone', 'car', 'property', 'produce', 'fruit'));

-- ============================================================================
-- Post-checks.
-- ============================================================================
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.inventory_items'::regclass
     AND conname = 'inventory_items_category_check';
  IF v_def IS NULL OR v_def NOT LIKE '%fruit%' THEN
    RAISE EXCEPTION '00116: fruit category value missing';
  END IF;
  FOR v_def IN
    SELECT unnest(ARRAY['phone', 'car', 'property', 'produce'])
  LOOP
    IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid = 'public.inventory_items'::regclass
           AND conname = 'inventory_items_category_check') NOT LIKE '%' || v_def || '%' THEN
      RAISE EXCEPTION '00116: legacy category value lost: %', v_def;
    END IF;
  END LOOP;
END;
$$;
