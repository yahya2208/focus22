-- ============================================================================
-- FOCUS — CATALOG → INVENTORY BRIDGE (00025)
--
-- Type: Additive (CREATE FUNCTION only)
--
-- PURPOSE
--   Expose approved catalog models + variants for the Inventory "Add" flow.
--   Any model approved in catalog_models with at least one known/verified
--   variant becomes available in the Inventory model selector automatically.
--
-- RPC: catalog_approved_models_for_inventory()
--   Returns approved active models grouped by brand in CatalogBrand[] shape
--   (matching src/catalog/types.ts exactly) so the client can merge with the
--   static JSON catalog without transformation.
--
-- SECURITY
--   - SECURITY DEFINER (runs as owner)
--   - STABLE (read-only, cacheable per-transaction)
--   - REVOKE ALL FROM PUBLIC + REVOKE FROM anon + GRANT TO authenticated
--   - Matches pattern of catalog_export_snapshot() (17-catalog-p2-snapshot-rpc.sql)
--
-- SAFETY
--   - No inventory_items changes
--   - No catalog_models / catalog_variants modifications
--   - Purely read-only
--   - Idempotent (CREATE OR REPLACE)
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.catalog_approved_models_for_inventory();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_approved_models_for_inventory()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'brand',   cb.display_name,
          'aliases', COALESCE(cb.aliases, '{}'),
          'models',  (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'model',        cm.name,
                'series',       COALESCE(cm.series, ''),
                'variants',     (
                  SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                      'storage', CASE
                        WHEN cv.storage_gb >= 1024
                          THEN (cv.storage_gb / 1024)::text || 'T'
                        ELSE cv.storage_gb::text
                      END,
                      'ram',     CASE
                        WHEN cv.ram_mb >= 1024
                          THEN (cv.ram_mb / 1024)::text
                        ELSE ROUND((cv.ram_mb::numeric / 1024), 2)::text
                      END
                    )
                    ORDER BY cv.ram_mb, cv.storage_gb
                  ), '[]'::jsonb)
                  FROM public.catalog_variants cv
                  WHERE cv.model_id = cm.id
                    AND cv.status IN ('known', 'verified')
                ),
                'modelNumbers', COALESCE(cm.model_numbers, '{}'),
                'releaseYear',  cm.release_year,
                'series',       COALESCE(cm.series, '')
              )
              ORDER BY cm.name
            ), '[]'::jsonb)
            FROM public.catalog_models cm
            WHERE cm.brand_id = cb.slug
              AND cm.approval_status = 'approved'
              AND cm.status = 'active'
          )
        )
        ORDER BY cb.display_name
      )
      FROM public.catalog_brands cb
      WHERE EXISTS (
        SELECT 1 FROM public.catalog_models cm
        WHERE cm.brand_id = cb.slug
          AND cm.approval_status = 'approved'
          AND cm.status = 'active'
      )
    ),
    '[]'::jsonb
  );
$$;

-- ── Security grants ─────────────────────────────────────────────────────────
-- Matches pattern of catalog_export_snapshot() (authenticated-only read).

REVOKE ALL
  ON FUNCTION public.catalog_approved_models_for_inventory()
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.catalog_approved_models_for_inventory()
  FROM anon;

GRANT EXECUTE
  ON FUNCTION public.catalog_approved_models_for_inventory()
  TO authenticated;
