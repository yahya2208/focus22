-- ============================================================================
-- 00078  Delivery Operating System — LOCATION FOUNDATION
-- ----------------------------------------------------------------------------
-- Type: Additive (new columns, two new tables, new admin-only RPCs, one new
-- admin-only maintenance RPC). No published function is replaced; no existing
-- policy is altered; no existing pilot/NON-pilot data is rewritten.
--
-- Source of truth: GATE 1 architecture (migration sequence 00078 "Location
-- foundation", §4 / §13 / §17). This gate is deliberately narrow: it builds the
-- secure, production-safe GEOGRAPHIC DATABASE FOUNDATION ONLY. Order lifecycle
-- hardening, order_status_history, assignment changes, Realtime, maps/routing,
-- GPS browser tracking and account provisioning belong to later gates and are
-- NOT touched here.
--
-- Scope (Location Foundation):
--   1. `stores.latitude` / `stores.longitude`  — static PICKUP point (nullable).
--   2. `neighborhoods.center_lat` / `center_lng` — default map focus (nullable).
--   3. `orders.latitude` / `orders.longitude` — customer DELIVERY DESTINATION,
--      nullable (legacy orders have no coords). Courier GPS is NEVER stored on
--      orders (no courier_latitude/longitude/heading/speed columns here).
--   4. `pilot_couriers.is_online` / `pilot_couriers.last_online_at` — courier
--      availability header state. `is_online = true` is NOT evidence of fresh
--      GPS; GPS freshness is a separate concept (recorded_at/ingested_at).
--   5. `pilot_courier_locations` — append-only location HISTORY (device fix per
--      accepted report). Bounded by the 7-day retention policy (§8 below).
--   6. `pilot_courier_locations_latest` — ONE current row per courier (PK = 
--      user_id), UPSERTed in place; the broadcast/ "last known location" source.
--   7. Admin config RPCs — the only authorised way to set static coordinates:
--        * pilot_admin_set_store_location(store_id, latitude, longitude)
--        * pilot_admin_set_neighborhood_center(neighborhood_id, lat, lng)
--   8. Retention — explicit, manually-runnable (NOT auto-scheduled this phase):
--        * pilot_admin_purge_old_courier_locations(cutoff DEFAULT '7 days')
--      deletes ONLY old `pilot_courier_locations` history rows. It never touches
--      orders, courier memberships, or the latest-location row.
--   9. Coordinate validation — impossible coordinates are REJECTED by DB-level
--      CHECK constraints (no silent clamping, no fabrication):
--        latitude  ∈ [-90,  90]
--        longitude ∈ [-180, 180]
--       plus non-negative accuracy/speed and heading in (-1..360). NULL passes
--       every CHECK (nullable static/destination columns stay nullable).
--
-- Change boundaries honoured:
--   * Canonical order statuses, assignment fields, and every existing RPC
--     (00065/00068/00069/00070) are UNTOUCHED — lifecycle hardening is GATE 3.
--   * Realtime (postgres_changes, ALTER PUBLICATION, .channel()) is NOT started
--     — Realtime is a later gate. `orders` stays OUT of supabase_realtime.
--   * No map/routing dependencies, no browser GPS, no service-role usage, no
--     RBAC change, no telemetry change, no ROLE_PERMISSIONS/CAPABILITY_MAP.
--   * `pilot_courier_locations*` RLS is defence-in-depth: ADMIN-only direct
--     access this gate. Normal clients get NO write grant and NO anon/customer
--     read policy — customer access to raw courier GPS is FORBIDDEN by design.
--     Ingestion/read RPCs (pilot_report_location, pilot_latest_courier_locations)
--     and the read-ONLY realtime policies arrive in later gates (00080+).
--   * All admin machinery follows the 00065/00068/00070 patterns: fn_admin_uid()
--     re-checked inside every function, SECURITY DEFINER, SET search_path = '',
--     REVOKE ALL + GRANT EXECUTE TO authenticated.
--   * Unrelated work (settings/BI/ads/catalog/untracked 00064) is untouched.
--
-- Rollback:
--   * DROP COLUMN IF EXISTS latitude/longitude ON orders, stores; center_lat/
--     center_lng ON neighborhoods; is_online/last_online_at ON pilot_couriers.
--   * DROP TABLE public.pilot_courier_locations_latest; DROP TABLE
--     public.pilot_courier_locations (drops their indexes + RLS + policies).
--   * DROP FUNCTION pilot_admin_set_store_location(uuid, numeric, numeric);
--     DROP FUNCTION pilot_admin_set_neighborhood_center(uuid, numeric, numeric);
--     DROP FUNCTION pilot_admin_purge_old_courier_locations(interval).
--   Since everything here is additive and no existing object is redefined,
--   revert restores the exact 00077 state with no history loss.
-- ============================================================================


-- ============================================================================
-- 1) stores.latitude / stores.longitude — static courier PICKUP point
-- ============================================================================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.stores'::regclass AND conname = 'stores_latitude_range'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_latitude_range CHECK (latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.stores'::regclass AND conname = 'stores_longitude_range'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_longitude_range CHECK (longitude BETWEEN -180 AND 180);
  END IF;
END;
$$;

-- No indexes added: the columns are config data (written by admin RPC, read by
-- PK/NN lookups). A lat/lng predicate scan is not a query pattern at this phase.

-- ============================================================================
-- 2) neighborhoods.center_lat / center_lng — default map focus
-- ============================================================================
ALTER TABLE public.neighborhoods
  ADD COLUMN IF NOT EXISTS center_lat double precision,
  ADD COLUMN IF NOT EXISTS center_lng double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.neighborhoods'::regclass AND conname = 'neighborhoods_center_lat_range'
  ) THEN
    ALTER TABLE public.neighborhoods
      ADD CONSTRAINT neighborhoods_center_lat_range CHECK (center_lat BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.neighborhoods'::regclass AND conname = 'neighborhoods_center_lng_range'
  ) THEN
    ALTER TABLE public.neighborhoods
      ADD CONSTRAINT neighborhoods_center_lng_range CHECK (center_lng BETWEEN -180 AND 180);
  END IF;
END;
$$;

-- ============================================================================
-- 3) orders.latitude / orders.longitude — the order's DELIVERY DESTINATION
--    Nullable: legacy orders (incl. today's 3 legacy pending orders) keep NULL.
--    Courier GPS does NOT belong on orders (GATE 1 §4) — no courier_* columns.
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_latitude_range'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_latitude_range CHECK (latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_longitude_range'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_longitude_range CHECK (longitude BETWEEN -180 AND 180);
  END IF;
END;
$$;

-- Orders are already admin/operator-read only (00050/00065 RLS + RPCs); adding
-- nullable destination coords does not open a new read or write path. The
-- destination is read later through pilot_order_detail (role-scoped) — GATE 3.

-- ============================================================================
-- 4) pilot_couriers.is_online / last_online_at — availability state
-- ============================================================================
ALTER TABLE public.pilot_couriers
  ADD COLUMN IF NOT EXISTS is_online     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_online_at timestamptz;

-- is_online defaults FALSE for existing memberships (a courier is offline until
-- explicitly toggled on). last_online_at stays NULL until the first availability
-- / location report. Neither field implies GPS freshness.

-- ============================================================================
-- 5) pilot_courier_locations — append-only location HISTORY
--    One row per ACCEPTED device fix. Bounded by the 7-day retention policy.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pilot_courier_locations (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  store_id    uuid REFERENCES public.stores(id)           ON DELETE SET NULL,
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL,
  accuracy_m  double precision,
  heading_deg smallint,
  speed_mps   double precision,
  recorded_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilot_courier_locations_latitude_range
    CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT pilot_courier_locations_longitude_range
    CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT pilot_courier_locations_accuracy_nonnegative
    CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  CONSTRAINT pilot_courier_locations_heading_range
    CHECK (heading_deg IS NULL OR (heading_deg >= -1 AND heading_deg <= 360)),
  CONSTRAINT pilot_courier_locations_speed_nonnegative
    CHECK (speed_mps IS NULL OR speed_mps >= 0),
  CONSTRAINT pilot_courier_locations_recorded_at_future
    CHECK (recorded_at <= now() + interval '1 hour')
);

-- Index: courier history by courier + device time. Supports the courier's own
-- history, admin "last positions for courier", retention tracing and the
-- realtime-scoped queries (later gates). Establishes the physical clustering
-- order for the (user_id, recorded_at DESC) scan pattern.
CREATE INDEX IF NOT EXISTS idx_pilot_courier_locations_user_time
  ON public.pilot_courier_locations (user_id, recorded_at DESC);

-- Index: courier history by store + device time. Supports store-scoped
-- operational views (operator: "my store's couriers over time") and realtime
-- store-scope filters (later gates).
CREATE INDEX IF NOT EXISTS idx_pilot_courier_locations_store_time
  ON public.pilot_courier_locations (store_id, recorded_at DESC);

-- No index on ingested_at: the 7-day purge scans a small (< ~90k rows/courier
-- day/100 couriers ≈ 6M rows) append table; a bounded seq-scan per admin run is
-- cheaper than maintaining a third index here. Documented, not speculative.

-- ============================================================================
-- 6) pilot_courier_locations_latest — ONE current row per courier
--    PK = user_id => the "one row per courier" invariant is DB-enforced.
--    Realtime broadcast source + "last known location" (GATE 8/10).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pilot_courier_locations_latest (
  user_id     uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  store_id    uuid REFERENCES public.stores(id)           ON DELETE SET NULL,
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL,
  accuracy_m  double precision,
  heading_deg smallint,
  speed_mps   double precision,
  recorded_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilot_courier_locations_latest_latitude_range
    CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT pilot_courier_locations_latest_longitude_range
    CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT pilot_courier_locations_latest_accuracy_nonnegative
    CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  CONSTRAINT pilot_courier_locations_latest_heading_range
    CHECK (heading_deg IS NULL OR (heading_deg >= -1 AND heading_deg <= 360)),
  CONSTRAINT pilot_courier_locations_latest_speed_nonnegative
    CHECK (speed_mps IS NULL OR speed_mps >= 0),
  CONSTRAINT pilot_courier_locations_latest_recorded_at_future
    CHECK (recorded_at <= now() + interval '1 hour')
);

-- No extra index: the PK (user_id) is the only lookup key — one row per courier.

-- ============================================================================
-- 7) RLS + grants — defence-in-depth, ADMIN-ONLY direct access this gate.
--    No anon policy. No customer policy (raw courier GPS to customers is
--    FORBIDDEN). No broad `USING (true)`. Normal client writes (bookseller:
--    SECURITY DEFINER RPCs in later gates) bypass RLS as the function owner;
--    RLS stops every other direct path.
-- ============================================================================
ALTER TABLE public.pilot_courier_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_courier_locations_latest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage courier location history" ON public.pilot_courier_locations;
CREATE POLICY "Admin manage courier location history"
  ON public.pilot_courier_locations FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage courier locations latest" ON public.pilot_courier_locations_latest;
CREATE POLICY "Admin manage courier locations latest"
  ON public.pilot_courier_locations_latest FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

-- Least privilege: SELECT-only grant, RLS-scoped, mirroring pilot_couriers.
-- No INSERT/UPDATE/DELETE grant => authenticate-role DML is impossible without
-- a SECURITY DEFINER RPC.
GRANT SELECT ON public.pilot_courier_locations,
                 public.pilot_courier_locations_latest TO authenticated;

-- ============================================================================
-- 8) Admin config RPCs — the ONLY authorised writes to static coordinates.
--    Every function re-checks fn_admin_uid() server-side.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_set_store_location(
  p_store_id uuid, p_latitude numeric, p_longitude numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL OR p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'COORDINATES_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.stores
    SET latitude = p_latitude::double precision,
        longitude = p_longitude::double precision,
        updated_at = now()
  WHERE id = p_store_id;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'latitude', p_latitude::double precision,
    'longitude', p_longitude::double precision
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_admin_set_neighborhood_center(
  p_neighborhood_id uuid, p_latitude numeric, p_longitude numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_neighborhood_id IS NULL OR p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'COORDINATES_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.neighborhoods n WHERE n.id = p_neighborhood_id) THEN
    RAISE EXCEPTION 'NEIGHBORHOOD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.neighborhoods
    SET center_lat = p_latitude::double precision,
        center_lng = p_longitude::double precision,
        updated_at = now()
  WHERE id = p_neighborhood_id;

  RETURN jsonb_build_object(
    'neighborhood_id', p_neighborhood_id,
    'center_lat', p_latitude::double precision,
    'center_lng', p_longitude::double precision
  );
END;
$$;

-- ============================================================================
-- 9) RETENTION — 7-day history policy, explicitly runnable, not auto-scheduled.
--    Operational mechanism (run as an admin when desired, e.g. via the SQL
--    editor or a night cron owned by a privileged role):
--      SELECT public.pilot_admin_purge_old_courier_locations('7 days');  -- default
--    Deletes ONLY old pilot_courier_locations history; never orders, never
--    courier memberships, never the latest-location row, never pilot data.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_purge_old_courier_locations(
  p_cutoff interval DEFAULT '7 days'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := public.fn_admin_uid();
  v_hits integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_cutoff IS NULL OR p_cutoff < interval '1 day' OR p_cutoff > interval '365 days' THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.pilot_courier_locations
  WHERE ingested_at < (now() - p_cutoff);
  GET DIAGNOSTICS v_hits = ROW_COUNT;

  RETURN jsonb_build_object('purged', v_hits, 'older_than', p_cutoff);
END;
$$;

-- ============================================================================
-- 10) Grants — REVOKE ALL + GRANT EXECUTE TO authenticated (least privilege).
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_store_location(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_neighborhood_center(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_purge_old_courier_locations(interval) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_set_store_location(uuid, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_set_neighborhood_center(uuid, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_purge_old_courier_locations(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_store_location(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_neighborhood_center(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_purge_old_courier_locations(interval) TO authenticated;

-- ============================================================================
-- 11) Post-checks — fail loudly if the structural contract is not met.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'latitude'
  ) THEN
    RAISE EXCEPTION '00078: stores.latitude missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'neighborhoods' AND column_name = 'center_lat'
  ) THEN
    RAISE EXCEPTION '00078: neighborhoods.center_lat missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'latitude'
  ) THEN
    RAISE EXCEPTION '00078: orders.latitude missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pilot_couriers' AND column_name = 'is_online'
  ) THEN
    RAISE EXCEPTION '00078: pilot_couriers.is_online missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
      'pilot_courier_locations', 'pilot_courier_locations_latest'
    )
  ) THEN
    RAISE EXCEPTION '00078: courier location table(s) missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN (
        'pilot_admin_set_store_location',
        'pilot_admin_set_neighborhood_center',
        'pilot_admin_purge_old_courier_locations'
      )
  ) THEN
    RAISE EXCEPTION '00078: location admin RPC(s) missing after migration';
  END IF;
END;
$$;