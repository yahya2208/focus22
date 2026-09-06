-- ============================================================================
-- 00072 SECURITY HARDENING WAVE — WORKSTREAM A: _gcr3_preapply_models exposure
--
-- public._gcr3_preapply_models (id uuid, canonical_id text) is the GC-R3
-- reconciliation snapshot (id/canonical_id pairs from catalog_models). It is
-- created by the catalog-gc-r3 build-apply package, used by service-role
-- reconciliation, and dropped after apply. It is NOT an app-facing table.
--
-- Closing the exposure:
--   * ENABLE ROW LEVEL SECURITY (no policies)          -> lint rls_disabled_in_public
--   * REVOKE ALL anon/authenticated (privilege deny)   -> no client read/write
--   * ADD PRIMARY KEY (id)                             -> lint no_primary_key; dedup
--   * GRANT ALL to service_role (already has it;       -> preserve internal
--     explicit for the record)                           reconciliation contract
--
-- owner postgres still bypasses RLS (no FORCE) so a direct postgres-connection
-- GC run (if any) can still reconcile; service_role has BYPASSRLS.
-- ============================================================================

ALTER TABLE public._gcr3_preapply_models ENABLE ROW LEVEL SECURITY;

ALTER TABLE public._gcr3_preapply_models ADD PRIMARY KEY (id);

REVOKE ALL ON public._gcr3_preapply_models FROM anon;
REVOKE ALL ON public._gcr3_preapply_models FROM authenticated;

GRANT ALL ON public._gcr3_preapply_models TO service_role;

-- END 00072