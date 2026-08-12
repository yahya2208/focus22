-- ============================================================================
-- FOCUS — CATALOG CENTRAL (GATE 1 — SCHEMA APPLY)
--
-- Type: Additive (CREATE TABLE / INDEX / POLICY / FUNCTION only)
-- Status: GATE 1 APPLY — authorized by owner (GATE 1 approved with conditions;
--         amendment: catalog_models gains series TEXT NULL + release_year
--         INTEGER NULL for faithful import of the runtime JSON).
--
-- SCOPE (owner mandate)
--   * Create ONLY: catalog_models, catalog_variants, catalog_variant_history,
--     their indexes / constraints / RLS policies / RPCs.
--   * NO seed (that is GATE 2 / 02-catalog-seed-runtime.sql).
--   * NO inventory_items modification (verified pre- and post- by owner).
--   * NO GATE 3 (normalization) / NO GATE 4 (variant linking).
--   * Additivity-guarded: fails if any catalog object already exists.
--
-- DECISIONS LOCKED (owner, GATE 1 + GATE 2)
--   * RAM stored as ram_mb INTEGER (0.25GB=256, 0.5GB=512).
--   * Storage stored as storage_gb INTEGER (1024 = 1TB in DB).
--   * Canonical ID = deterministic business identity:
--       model id  = modelIdFor(brandId, slug(name)) + MODEL_ID_OVERRIDES
--       variant id = variantIdFor = FNV-1a-32(brand|model|ram|storage|region)
--                    rendered in base-36 (matches src/catalog/canonical.ts).
--   * region TEXT NULL | source_type single TEXT | status known/unverified...
--   * Public read = SELECT only (policy-filtered). Writes = SECURITY DEFINER
--     RPCs gated on public.users.role IN ('admin','super_admin').
--
-- HOW IT RUNS (project hardening, per phase-2c-schema-apply-plan.md)
--   Run as `postgres` in the Supabase SQL Editor inside a single transaction:
--     BEGIN;
--     <this file>
--     COMMIT;
--   with ON_ERROR_STOP = 1 so any mid-file failure rolls back cleanly.
--   No CREATE INDEX CONCURRENTLY -> transaction wrapper is safe.
--   Roll back with 01-catalog-schema-rollback.sql.
-- ============================================================================

-- ============================================================================
-- 0) ADDITIVITY GUARD — fail closed if any catalog object already exists.
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.catalog_models') IS NOT NULL THEN
    RAISE EXCEPTION 'GATE1 FAIL: catalog_models already exists (not additive)';
  END IF;
  IF to_regclass('public.catalog_variants') IS NOT NULL THEN
    RAISE EXCEPTION 'GATE1 FAIL: catalog_variants already exists (not additive)';
  END IF;
  IF to_regclass('public.catalog_variant_history') IS NOT NULL THEN
    RAISE EXCEPTION 'GATE1 FAIL: catalog_variant_history already exists (not additive)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'catalog\_%') THEN
    RAISE EXCEPTION 'GATE1 FAIL: an existing catalog_* function was found (not additive)';
  END IF;
END $$;

-- ============================================================================
-- 1) TABLES
-- ============================================================================

-- 1.1) catalog_models — one row per canonical phone model.
--      canonical_id = modelIdFor(brand_id, slug(name)), MODEL_ID_OVERRIDES applied.
--      series / release_year added by owner amendment (faithful import, no loss).
CREATE TABLE public.catalog_models (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id  text NOT NULL UNIQUE,
  brand_id      text NOT NULL,
  name          text NOT NULL,
  series        text NULL,
  release_year  integer NULL,
  model_numbers text[] NOT NULL DEFAULT '{}',
  aliases       text[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'active'
                CONSTRAINT catalog_models_status_check
                CHECK (status IN ('active','archived')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.catalog_models IS 'Canonical phone models (GATE 1). Seed in GATE 2.';
COMMENT ON COLUMN public.catalog_models.canonical_id IS 'Deterministic business identity: modelIdFor(brand_id, name) with MODEL_ID_OVERRIDES.';
COMMENT ON COLUMN public.catalog_models.series IS 'Series from runtime catalog JSON (faithful import).';
COMMENT ON COLUMN public.catalog_models.release_year IS 'Release year from runtime catalog JSON (faithful import).';

-- 1.2) catalog_variants — one row per (model, ram, storage[, region]) config.
--      ram_mb INTEGER (0.25GB=256, 0.5GB=512). storage_gb INTEGER (1024=1TB).
--      canonical_variant_id = FNV-1a-32 base-36 of brand|model|ram|storage|region.
CREATE TABLE public.catalog_variants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_variant_id  text NOT NULL UNIQUE,
  model_id              uuid NOT NULL
                        REFERENCES public.catalog_models (id) ON DELETE RESTRICT,
  ram_mb                integer NOT NULL
                        CONSTRAINT catalog_variants_ram_mb_check CHECK (ram_mb > 0),
  storage_gb            integer NOT NULL
                        CONSTRAINT catalog_variants_storage_gb_check CHECK (storage_gb > 0),
  region                text NULL,
  status                text NOT NULL DEFAULT 'unverified'
                        CONSTRAINT catalog_variants_status_check
                        CHECK (status IN ('unverified','known','verified','archived')),
  source_type           text NOT NULL
                        CONSTRAINT catalog_variants_source_type_check
                        CHECK (source_type IN
                          ('GOLDEN_CATALOG','RUNTIME_CATALOG','ADMIN_MANUAL',
                           'INVENTORY_OBSERVED','EXTERNAL')),
  verified_by           uuid NULL REFERENCES public.users (id),
  verified_at           timestamptz NULL,
  created_by            uuid NULL REFERENCES public.users (id),
  notes                 text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.catalog_variants IS 'Canonical variants (RAM/Storage configs). Seed in GATE 2.';
COMMENT ON COLUMN public.catalog_variants.canonical_variant_id IS 'Deterministic identity: variantIdFor(brandId, modelId, ram, storage, region).';
COMMENT ON COLUMN public.catalog_variants.ram_mb IS 'RAM in MB. 256=0.25GB, 512=0.5GB, 6144=6GB...';
COMMENT ON COLUMN public.catalog_variants.storage_gb IS 'Storage in GB. 1024=1TB, 2048=2TB.';
COMMENT ON COLUMN public.catalog_variants.source_type IS 'Provenance kind: GOLDEN_CATALOG|RUNTIME_CATALOG|ADMIN_MANUAL|INVENTORY_OBSERVED|EXTERNAL.';

-- 1.3) catalog_variant_history — append-only audit trail of variant lifecycle.
CREATE TABLE public.catalog_variant_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id    uuid NOT NULL
                REFERENCES public.catalog_variants (id) ON DELETE CASCADE,
  action        text NOT NULL
                CONSTRAINT catalog_variant_history_action_check
                CHECK (action IN ('CREATE','UPDATE','VERIFY','ARCHIVE','RESTORE')),
  before        jsonb NULL,
  after         jsonb NULL,
  actor_user_id uuid NULL REFERENCES public.users (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_variant_history IS 'Append-only audit trail; written only by admin RPCs.';

-- ============================================================================
-- 2) INDEXES
-- ============================================================================

-- catalog_models
CREATE UNIQUE INDEX catalog_models_brand_name_uidx
  ON public.catalog_models (brand_id, name);
CREATE INDEX catalog_models_brand_id_idx
  ON public.catalog_models (brand_id);
CREATE INDEX catalog_models_model_numbers_gin
  ON public.catalog_models USING gin (model_numbers);

-- catalog_variants — spec uniqueness handles the NULL-region case via two
-- partial unique indexes (NULLs are distinct in btree, so a single unique
-- index would wrongly allow two NULL-region rows).
CREATE INDEX catalog_variants_model_id_idx
  ON public.catalog_variants (model_id);
CREATE INDEX catalog_variants_status_idx
  ON public.catalog_variants (status);
CREATE INDEX catalog_variants_source_type_idx
  ON public.catalog_variants (source_type);
CREATE UNIQUE INDEX catalog_variants_spec_noregion_uidx
  ON public.catalog_variants (model_id, ram_mb, storage_gb)
  WHERE region IS NULL;
CREATE UNIQUE INDEX catalog_variants_spec_region_uidx
  ON public.catalog_variants (model_id, ram_mb, storage_gb, region)
  WHERE region IS NOT NULL;

-- catalog_variant_history
CREATE INDEX catalog_variant_history_variant_created_idx
  ON public.catalog_variant_history (variant_id, created_at DESC);
CREATE INDEX catalog_variant_history_action_idx
  ON public.catalog_variant_history (action);

-- ============================================================================
-- 3) ROW LEVEL SECURITY + POLICIES
--    Public: SELECT only, policy-filtered (active models; known/verified
--    variants). History: no policy (admin RPC only). No write policies at all.
-- ============================================================================
ALTER TABLE public.catalog_models        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_variants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_variant_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalog models public read"
  ON public.catalog_models
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

CREATE POLICY "Catalog variants public read"
  ON public.catalog_variants
  FOR SELECT TO anon, authenticated
  USING (status IN ('known','verified'));

-- GRANTS: SELECT only to anon/authenticated on the two readable tables.
REVOKE ALL ON public.catalog_models        FROM anon, authenticated;
REVOKE ALL ON public.catalog_variants      FROM anon, authenticated;
REVOKE ALL ON public.catalog_variant_history FROM anon, authenticated;

GRANT SELECT ON public.catalog_models   TO anon, authenticated;
GRANT SELECT ON public.catalog_variants TO anon, authenticated;

-- ============================================================================
-- 4) CANONICAL IDENTITY HELPERS
--    Exact port of src/catalog/canonical.ts (stableHash = FNV-1a 32-bit,
--    h.toString(36)) + toCanonicalRam / toCanonicalStorage label rules.
--    Not exposed to any role (internal, used by admin RPCs).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_fnv1a_hash(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_h      bigint := 2166136261;                 -- 0x811c9dc5
  v_i      integer;
  v_len    integer;
  v_out    text := '';
  v_rem    integer;
  v_digits constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
BEGIN
  IF p_input IS NULL THEN
    RETURN NULL;
  END IF;
  v_len := length(p_input);
  FOR v_i IN 1..v_len LOOP
    v_h := v_h # ascii(substr(p_input, v_i, 1)); -- XOR byte (ASCII identity strings)
    v_h := (v_h * 16777619) & 4294967295;        -- imul(0x01000193) masked to 32-bit
  END LOOP;
  IF v_h = 0 THEN
    RETURN '0';
  END IF;
  WHILE v_h > 0 LOOP
    v_rem := (v_h % 36)::int;
    v_out := substr(v_digits, v_rem + 1, 1) || v_out;
    v_h := v_h / 36;
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_ram_label(p_ram_mb integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_ram_mb IS NULL OR p_ram_mb <= 0 THEN
    RETURN NULL;
  END IF;
  IF p_ram_mb % 1024 = 0 THEN
    RETURN (p_ram_mb / 1024)::text || 'GB';      -- 6144 -> '6GB'
  END IF;
  IF p_ram_mb = 256 THEN RETURN '0.25GB'; END IF;
  IF p_ram_mb = 512 THEN RETURN '0.5GB';  END IF;
  RETURN (p_ram_mb / 1024.0)::text || 'GB';      -- future-proof, e.g. 1536 -> '1.5GB'
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_storage_label(p_storage_gb integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_storage_gb IS NULL OR p_storage_gb <= 0 THEN
    RETURN NULL;
  END IF;
  IF p_storage_gb = 1024 THEN RETURN '1TB'; END IF;
  IF p_storage_gb = 2048 THEN RETURN '2TB'; END IF;
  RETURN p_storage_gb::text || 'GB';
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_variant_id(
  p_brand_id     text,
  p_model_id     text,
  p_ram_mb       integer,
  p_storage_gb   integer,
  p_region       text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN public.catalog_fnv1a_hash(
    p_brand_id || '|' || p_model_id || '|'
    || public.catalog_ram_label(p_ram_mb) || '|'
    || public.catalog_storage_label(p_storage_gb) || '|'
    || COALESCE(p_region, '')
  );
END;
$$;

-- Internal helpers: not callable by any role.
REVOKE ALL ON FUNCTION public.catalog_fnv1a_hash(text)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_ram_label(integer)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_storage_label(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_variant_id(text, text, integer, integer, text) FROM PUBLIC;

-- ============================================================================
-- 5) IDENTITY SELF-TEST — proves the SQL hash reproduces the verified seed
--    pipeline (which matches the FNV-1a published vectors + canonical.ts).
--    Expected values come from the fail-closed GATE 2 seed file (already
--    independently verified). Any mismatch aborts the apply.
-- ============================================================================
DO $$
BEGIN
  IF public.catalog_variant_id('vivo', 'vivo-x50', 8192, 128, NULL) <> 'wgkc1q' THEN
    RAISE EXCEPTION 'GATE1 SELF-TEST FAIL: vivo-x50 8/128 variant id mismatch (%)',
      public.catalog_variant_id('vivo','vivo-x50',8192,128,NULL);
  END IF;
  IF public.catalog_variant_id('honor', 'honor-x50', 8192, 128, NULL) <> '193500m' THEN
    RAISE EXCEPTION 'GATE1 SELF-TEST FAIL: honor-x50 8/128 variant id mismatch (%)',
      public.catalog_variant_id('honor','honor-x50',8192,128,NULL);
  END IF;
  IF public.catalog_variant_id('honor', 'honor-x50', 12288, 512, NULL) <> 'w3hcu6' THEN
    RAISE EXCEPTION 'GATE1 SELF-TEST FAIL: honor-x50 12/512 variant id mismatch (%)',
      public.catalog_variant_id('honor','honor-x50',12288,512,NULL);
  END IF;
  IF public.catalog_variant_id('apple', 'apple-iphone-1st-gen', 256, 4, NULL) <> 'dg03pw' THEN
    RAISE EXCEPTION 'GATE1 SELF-TEST FAIL: iphone-1st-gen 0.25GB/4GB variant id mismatch (%)',
      public.catalog_variant_id('apple','apple-iphone-1st-gen',256,4,NULL);
  END IF;
  IF public.catalog_ram_label(256) <> '0.25GB' OR public.catalog_ram_label(512) <> '0.5GB'
     OR public.catalog_ram_label(6144) <> '6GB' OR public.catalog_storage_label(1024) <> '1TB'
     OR public.catalog_storage_label(128) <> '128GB' THEN
    RAISE EXCEPTION 'GATE1 SELF-TEST FAIL: ram/storage label mismatch';
  END IF;
  RAISE NOTICE 'GATE1 IDENTITY SELF-TEST PASS (SQL hash == verified seed pipeline)';
END $$;

-- ============================================================================
-- 6) SECURITY DEFINER RPCs — the ONLY write path.
--    Every RPC: (1) checks admin via public.users.role IN ('admin','super_admin'),
--    (2) validates input, (3) is atomic, (4) records history where applicable.
--    EXECUTE is REVOKED from PUBLIC and granted explicitly (defense in depth).
-- ============================================================================

-- 6.0) Role check helper (mirrors inventory_is_admin).
CREATE OR REPLACE FUNCTION public.catalog_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin','super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.catalog_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_is_admin() TO authenticated;

-- 6.1) Brand-aware variant lookup (D3 fix). Resolves a model by EXPLICIT
--      brand + name — never by name alone — so Vivo X50 (8/128 only) and
--      Honor X50 (8/128, 8/256, 12/512) can never be mixed.
CREATE OR REPLACE FUNCTION public.catalog_get_model_variants(
  p_brand_id    text,
  p_model_name  text
)
RETURNS SETOF public.catalog_variants
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_brand_id IS NULL OR btrim(p_brand_id) = ''
     OR p_model_name IS NULL OR btrim(p_model_name) = '' THEN
    RAISE EXCEPTION 'brand_id and model_name are required'
      USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT cv.*
    FROM public.catalog_variants cv
    JOIN public.catalog_models cm ON cm.id = cv.model_id
    WHERE cm.brand_id = btrim(p_brand_id)
      AND lower(cm.name) = lower(btrim(p_model_name))
      AND cv.status IN ('known','verified')
    ORDER BY cv.storage_gb ASC, cv.ram_mb ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_get_model_variants(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_get_model_variants(text, text) TO anon, authenticated;

-- 6.2) Resolve a model by explicit brand + name.
CREATE OR REPLACE FUNCTION public.catalog_resolve_model(
  p_brand_id    text,
  p_model_name  text
)
RETURNS public.catalog_models
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.catalog_models;
BEGIN
  SELECT cm.* INTO v_row
  FROM public.catalog_models cm
  WHERE cm.brand_id = btrim(p_brand_id)
    AND lower(cm.name) = lower(btrim(p_model_name))
    AND cm.status = 'active'
  LIMIT 1;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_resolve_model(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_resolve_model(text, text) TO anon, authenticated;

-- 6.3) Admin: create a variant (atomic; history CREATE recorded).
CREATE OR REPLACE FUNCTION public.catalog_create_variant(
  p_model_canonical_id text,
  p_ram_mb             integer,
  p_storage_gb         integer,
  p_region             text DEFAULT NULL,
  p_source_type        text DEFAULT 'ADMIN_MANUAL',
  p_notes              text DEFAULT NULL,
  p_verified           boolean DEFAULT false
)
RETURNS public.catalog_variants
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_model public.catalog_models;
  v_row   public.catalog_variants;
  v_status text := 'unverified';
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  IF p_ram_mb IS NULL OR p_ram_mb <= 0 THEN
    RAISE EXCEPTION 'ram_mb must be a positive integer'
      USING ERRCODE = '22023';
  END IF;
  IF p_storage_gb IS NULL OR p_storage_gb <= 0 THEN
    RAISE EXCEPTION 'storage_gb must be a positive integer'
      USING ERRCODE = '22023';
  END IF;
  IF p_source_type IS NULL OR p_source_type NOT IN
     ('GOLDEN_CATALOG','RUNTIME_CATALOG','ADMIN_MANUAL','INVENTORY_OBSERVED','EXTERNAL') THEN
    RAISE EXCEPTION 'invalid source_type: %', p_source_type
      USING ERRCODE = '22023';
  END IF;

  SELECT cm.* INTO v_model
  FROM public.catalog_models cm
  WHERE cm.canonical_id = p_model_canonical_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'model not found: %', p_model_canonical_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_verified THEN
    v_status := 'verified';
  END IF;

  INSERT INTO public.catalog_variants (
    canonical_variant_id, model_id, ram_mb, storage_gb, region, status,
    source_type, verified_by, verified_at, created_by, notes
  ) VALUES (
    public.catalog_variant_id(v_model.brand_id, v_model.canonical_id,
                              p_ram_mb, p_storage_gb, p_region),
    v_model.id, p_ram_mb, p_storage_gb, p_region, v_status,
    p_source_type,
    CASE WHEN p_verified THEN auth.uid() ELSE NULL END,
    CASE WHEN p_verified THEN now() ELSE NULL END,
    auth.uid(), p_notes
  )
  RETURNING * INTO v_row;

  INSERT INTO public.catalog_variant_history (variant_id, action, after, actor_user_id)
  VALUES (v_row.id, 'CREATE', to_jsonb(v_row), auth.uid());

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_create_variant(text, integer, integer, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_create_variant(text, integer, integer, text, text, text, boolean) TO authenticated;

-- 6.4) Admin: verify a variant.
CREATE OR REPLACE FUNCTION public.catalog_verify_variant(
  p_canonical_variant_id text,
  p_verified_at          timestamptz DEFAULT now()
)
RETURNS public.catalog_variants
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row    public.catalog_variants;
  v_before jsonb;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  SELECT cv.* INTO v_row
  FROM public.catalog_variants cv
  WHERE cv.canonical_variant_id = p_canonical_variant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'variant not found: %', p_canonical_variant_id
      USING ERRCODE = 'P0002';
  END IF;
  v_before := to_jsonb(v_row);
  UPDATE public.catalog_variants
  SET status      = 'verified',
      verified_by = auth.uid(),
      verified_at = COALESCE(p_verified_at, now()),
      updated_at  = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;
  INSERT INTO public.catalog_variant_history (variant_id, action, before, after, actor_user_id)
  VALUES (v_row.id, 'VERIFY', v_before, to_jsonb(v_row), auth.uid());
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_verify_variant(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_verify_variant(text, timestamptz) TO authenticated;

-- 6.5) Admin: archive a variant (never deletes).
CREATE OR REPLACE FUNCTION public.catalog_archive_variant(
  p_canonical_variant_id text,
  p_notes                text DEFAULT NULL
)
RETURNS public.catalog_variants
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row    public.catalog_variants;
  v_before jsonb;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  SELECT cv.* INTO v_row
  FROM public.catalog_variants cv
  WHERE cv.canonical_variant_id = p_canonical_variant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'variant not found: %', p_canonical_variant_id
      USING ERRCODE = 'P0002';
  END IF;
  v_before := to_jsonb(v_row);
  UPDATE public.catalog_variants
  SET status     = 'archived',
      updated_at = now(),
      notes      = COALESCE(p_notes, v_row.notes)
  WHERE id = v_row.id
  RETURNING * INTO v_row;
  INSERT INTO public.catalog_variant_history (variant_id, action, before, after, actor_user_id)
  VALUES (v_row.id, 'ARCHIVE', v_before, to_jsonb(v_row), auth.uid());
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_archive_variant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_archive_variant(text, text) TO authenticated;

-- 6.6) Admin: full variant listing (bypasses public RLS filter).
CREATE OR REPLACE FUNCTION public.catalog_admin_list_variants(p_status text DEFAULT NULL)
RETURNS SETOF public.catalog_variants
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR btrim(p_status) = '' THEN
    RETURN QUERY SELECT cv.* FROM public.catalog_variants cv ORDER BY cv.created_at DESC;
  END IF;
  RETURN QUERY SELECT cv.* FROM public.catalog_variants cv
    WHERE cv.status = p_status ORDER BY cv.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_admin_list_variants(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_admin_list_variants(text) TO authenticated;

-- 6.7) Admin: variant history (append-only trail).
--      NOTE: function name differs from the table (catalog_variant_history) to
--      avoid a schema collision — hence catalog_get_variant_history.
CREATE OR REPLACE FUNCTION public.catalog_get_variant_history(p_canonical_variant_id text)
RETURNS SETOF public.catalog_variant_history
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT h.*
    FROM public.catalog_variant_history h
    JOIN public.catalog_variants v ON v.id = h.variant_id
    WHERE v.canonical_variant_id = p_canonical_variant_id
    ORDER BY h.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_get_variant_history(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_get_variant_history(text) TO authenticated;

-- 6.8) Admin: reconciliation report (counts; seed completeness; inventory
--      untouched proof). Informational — never raises, never modifies.
CREATE OR REPLACE FUNCTION public.catalog_reconciliation_report()
RETURNS TABLE (metric text, value bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT 'models'::text, (SELECT count(*)::bigint FROM public.catalog_models)
  UNION ALL SELECT 'variants', (SELECT count(*)::bigint FROM public.catalog_variants)
  UNION ALL SELECT 'distinct model canonical ids', (SELECT count(DISTINCT canonical_id)::bigint FROM public.catalog_models)
  UNION ALL SELECT 'distinct variant canonical ids', (SELECT count(DISTINCT canonical_variant_id)::bigint FROM public.catalog_variants)
  UNION ALL SELECT 'storage_gb=1024 variants', (SELECT count(*)::bigint FROM public.catalog_variants WHERE storage_gb = 1024)
  UNION ALL SELECT 'variant_history rows', (SELECT count(*)::bigint FROM public.catalog_variant_history)
  UNION ALL SELECT 'seed_complete (866 models / 1816 variants)', CASE
    WHEN (SELECT count(*) FROM public.catalog_models) = 866
     AND (SELECT count(*) FROM public.catalog_variants) = 1816 THEN 1 ELSE 0 END
  UNION ALL SELECT 'inventory_items rows', (SELECT count(*)::bigint FROM public.inventory_items);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_reconciliation_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_reconciliation_report() TO authenticated;

-- ============================================================================
-- DONE — GATE 1 catalog schema apply (additive).
--   Verify with 04-catalog-gate1-verify.sql.
--   Roll back with 01-catalog-schema-rollback.sql.
--   Do NOT run 02-catalog-seed-runtime.sql (GATE 2) without a new owner GO.
-- ============================================================================
