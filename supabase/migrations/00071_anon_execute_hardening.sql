-- 00071_anon_execute_hardening.sql
-- Security Gate F1 — anonymous EXECUTE hardening (REVOKE-only, additive).
--
-- SCOPE (approved 27 RPCs):
--   Restricted RPCs (authenticated/admin/operator/courier gated) that have NO
--   legitimate anonymous caller must lose the inherited Supabase default
--   anon:EXECUTE grant. Default privilege sets (pg_default_acl) are left
--   untouched; explicit per-function revokes are idempotent for fresh roles.
--
-- UNTOUCHED (approved scope boundaries):
--   - RLS / policies / SECURITY DEFINER / search_path / function bodies
--   - GRANTS to authenticated / service_role (verified still EXECUTE)
--   - default ACL / pg_default_acl / RBAC / ROLE_PERMISSIONS / telegram
--   - 00065/00068/00069/00070 migration files and their applied objects
--   - telemetry contract (record_telemetry_event stays anonymous on purpose)
--   - public browse RPCs (neighborhoods/stores/products/families) stay
--     anonymous on purpose; get_telemetry_analytics already has no anon grant.
--
-- Exact signatures extracted from the production catalog
-- (pg_get_function_identity_arguments), 33-function sweep on 2026-09-06.

-- Delivery (authenticated-only contract; guests are created at submit).
REVOKE EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) FROM anon;
-- Internal admin-uid helper (used by RLS/SECURITY DEFINER in owner context).
REVOKE EXECUTE ON FUNCTION public.fn_admin_uid() FROM anon;

-- Operator / courier / customer order RPCs (auth.uid() gated).
REVOKE EXECUTE ON FUNCTION public.pilot_my_stores() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_orders_available() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_orders_for_store(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_orders_for_courier() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_order_accept(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_order_set_status(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_courier_set_status(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_order_detail(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_order_status_for_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_reset() FROM anon;

-- Admin-only RPCs (fn_admin_uid() gated).
REVOKE EXECUTE ON FUNCTION public.pilot_admin_require() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_link_family(uuid, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_store_inventory(uuid, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_upsert_family(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_upsert_neighborhood(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_upsert_store(uuid, text, text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_families() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_neighborhoods() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_stores(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_operators(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_couriers(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_pilot_health() FROM anon;