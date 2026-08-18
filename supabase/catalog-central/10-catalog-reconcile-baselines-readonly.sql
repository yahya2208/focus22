-- ============================================================================
-- FOCUS — CATALOG CENTRAL (10 — GOLDEN→RUNTIME RECONCILIATION: READ-ONLY BASELINES + EXPORT)
--
-- STRICTLY READ-ONLY. SELECT statements ONLY. No INSERT/UPDATE/DELETE/TRUNCATE/
-- ALTER/CREATE/DROP/GRANT/REVOKE/MERGE/SELECT FOR UPDATE/DO/function-with-
-- side-effects. Nothing here mutates any DB state.
--
-- Purpose (phase CATALOG-GC-R1 discovery):
--   (A) Re-assert the Gate 05 baselines BEFORE the Golden reconciliation report
--       is accepted (runtime=866, identity=0 mismatches, inventory=17 with the
--       exact verified fingerprint).
--   (B) Export the authoritative Runtime Catalog inventory (866 rows) as the
--       DB-side evidence for report part B (id, canonical_id, brand_id, name,
--       series, release_year, model_numbers, aliases, status).
--
-- HOW TO RUN: paste the WHOLE script into the Supabase SQL editor as `postgres`,
-- run once. Each SELECT produces its own Result Grid.
-- Then SAVE Grid #5 (runtime export, 866 rows) as CSV/JSON to:
--   catalog-audit/runtime-catalog-export-2026-08-13.csv
-- ============================================================================

-- (1) RUNTIME CATALOG count — MUST be 866.
SELECT count(*) AS runtime_models
FROM public.catalog_models;

-- (2) Identity proof — MUST be 0 (Gate 05 re-assert: catalog_model_id == canonical_id).
SELECT count(*) AS identity_mismatches
FROM public.catalog_models
WHERE public.catalog_model_id(brand_id, name) <> canonical_id;

-- (3) INVENTORY baseline — MUST be 17 rows (count) with the verified fingerprint.
SELECT count(*) AS inventory_rows
FROM public.inventory_items;

SELECT count(*)  AS inventory_count,
       md5(string_agg(
         id::text||'|'||coalesce(source_key,'')||'|'||coalesce(model_id,'')
         ||'|'||coalesce(quantity,0)::text||'|'||coalesce(status,'')
         ||'|'||coalesce(is_published,false)::text, ',' ORDER BY id)) AS inventory_fingerprint
FROM public.inventory_items;
-- EXPECTED fingerprint: 1c5d9b8a117a93f03335e7296abddec1 (verified Gate 05).

-- (4) Golden-side count sanity (informational only, matches discovery script):
--     models present per brand in the DB runtime catalog.
SELECT brand_id, count(*) AS models
FROM public.catalog_models
GROUP BY brand_id
ORDER BY brand_id;

-- (5) RUNTIME CATALOG EXPORT — part B of the reconciliation (866 rows).
--     SAVE THIS GRID as CSV/JSON -> catalog-audit/runtime-catalog-export-2026-08-13.csv
SELECT id,
       canonical_id,
       brand_id,
       name,
       series,
       release_year,
       model_numbers,
       aliases,
       status
FROM public.catalog_models
ORDER BY canonical_id;

-- ============================================================================
-- END of READ-ONLY baselines + export. No DB change performed.
-- ============================================================================
