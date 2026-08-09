-- ============================================================================
-- CR-00007 · campaigns anon direct-grant — ROLLBACK
-- ----------------------------------------------------------------------------
-- ⚠️  DO NOT EXECUTE — NOT APPLICABLE (2026-08-09) ⚠️
--   CR-00007 is ALREADY SATISFIED / NO-OP — HISTORICAL APPLY NOT ESTABLISHED:
--   no reliable evidence exists that the REVOKE was ever executed on LIVE, and
--   LIVE currently shows anon with NO ACL on public.campaigns. Executing the
--   old rollback NOW would RE-GRANT the full anon ACL — the exact opposite of
--   the security objective. The guard below therefore ABORTS unconditionally.
--   Retained only as the historical rollback definition for the record.
--
-- Original intent (kept for the record): restore EXACTLY the privileges the
-- apply script removed, based on the pre-apply evidence (no guessing):
--   anon on public.campaigns: SELECT, INSERT, UPDATE, DELETE, REFERENCES,
--                             TRIGGER, TRUNCATE   (no GRANT OPTION)
-- ============================================================================

BEGIN;

DO $$
BEGIN
  RAISE EXCEPTION 'ABORT: rollback NOT APPLICABLE — CR-00007 is ALREADY SATISFIED / NO-OP — HISTORICAL APPLY NOT ESTABLISHED (2026-08-09). No apply is recorded, and current LIVE already has anon with NO ACL. This rollback would RE-OPEN anon direct access; it must not run.';
END $$;

COMMIT;

-- ============================================================================
-- No confirmation query follows by design: the guard ABORTS before any GRANT.
-- Nothing is ever executed from this file. CR-00007 remains a documented NO-OP.
-- ============================================================================
