-- ============================================================================
-- CR-00007 · campaigns anon direct-grant — ROLLBACK
-- ----------------------------------------------------------------------------
-- Restores EXACTLY the privileges removed by the apply script, based on the
-- Round-2 LIVE pre-apply evidence (no guessing):
--   anon on public.campaigns: SELECT, INSERT, UPDATE, DELETE, REFERENCES,
--                             TRIGGER, TRUNCATE   (no GRANT OPTION)
--
-- Guard (fail-closed): fails if anon already has any privilege on
-- public.campaigns (nothing to roll back; prevents a duplicate grant).
-- Single-application, fail-closed. No silent fallback.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_anon_sel BOOLEAN;
BEGIN
  SELECT has_table_privilege('anon', 'campaigns', 'SELECT') INTO v_anon_sel;

  IF v_anon_sel IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ABORT: anon already has privileges on public.campaigns; nothing to roll back.';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON public.campaigns TO anon;

COMMIT;

-- ============================================================================
-- Post-rollback confirmation (read-only). Expected: anon → all TRUE.
-- ============================================================================
SELECT 'anon' AS role_name,
       has_table_privilege('anon', 'campaigns', 'SELECT')  AS can_select,
       has_table_privilege('anon', 'campaigns', 'INSERT')  AS can_insert,
       has_table_privilege('anon', 'campaigns', 'UPDATE')  AS can_update,
       has_table_privilege('anon', 'campaigns', 'DELETE')  AS can_delete,
       has_table_privilege('anon', 'campaigns', 'REFERENCES') AS can_references,
       has_table_privilege('anon', 'campaigns', 'TRIGGER') AS can_trigger,
       has_table_privilege('anon', 'campaigns', 'TRUNCATE') AS can_truncate;
