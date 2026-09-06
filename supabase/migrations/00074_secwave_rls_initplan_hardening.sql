-- ============================================================================
-- 00074 SECURITY HARDENING WAVE — WORKSTREAM E: RLS auth_rls_initplan hardening
--
-- Wraps auth.uid()/auth.role()/auth.jwt()/auth.email() calls inside public RLS
-- policies with (select ...) initplans so they are evaluated once per query
-- instead of once per row (Supabase documented fix for lint 0003_auth_rls_initplan).
--
-- SAFETY: purely mechanical, semantically-equivalent transform. For every policy
-- the permissive / roles / cmd / USING / WITH CHECK segments are reproduced
-- VERBATIM except for the wrapper. Each pair is DROP POLICY IF EXISTS + CREATE
-- POLICY (transactional DDL -> internally atomic under --single-transaction;
-- no gap is observable by any other session). Generated fresh from production
-- pg_policies; coverage 39/39 vs the Gate-1 lint list.
-- ============================================================================

-- NOTE: CREATE OR REPLACE POLICY is rejected by this instance (syntax error),
-- so we emit the universally-supported DROP + CREATE pair instead.

DROP POLICY IF EXISTS "Staff manage ads" ON public.ads;
CREATE POLICY "Staff manage ads" ON public.ads AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff read all ads" ON public.ads;
CREATE POLICY "Staff read all ads" ON public.ads AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Authenticated users insert own analytics events" ON public.analytics_events;
CREATE POLICY "Authenticated users insert own analytics events" ON public.analytics_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id IS NULL) OR (user_id = (select auth.uid()))));

DROP POLICY IF EXISTS "Users read own analytics events" ON public.analytics_events;
CREATE POLICY "Users read own analytics events" ON public.analytics_events AS PERMISSIVE FOR SELECT TO authenticated USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Authenticated insert calibrations" ON public.calibrations;
CREATE POLICY "Authenticated insert calibrations" ON public.calibrations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users manage own calibrations" ON public.calibrations;
CREATE POLICY "Users manage own calibrations" ON public.calibrations AS PERMISSIVE FOR ALL TO authenticated USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own calibrations" ON public.calibrations;
CREATE POLICY "Users read own calibrations" ON public.calibrations AS PERMISSIVE FOR SELECT TO authenticated USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Staff manage categories" ON public.categories;
CREATE POLICY "Staff manage categories" ON public.categories AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff read all categories" ON public.categories;
CREATE POLICY "Staff read all categories" ON public.categories AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff manage category memberships" ON public.category_products;
CREATE POLICY "Staff manage category memberships" ON public.category_products AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff read all category memberships" ON public.category_products;
CREATE POLICY "Staff read all category memberships" ON public.category_products AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "cc_user_read_own" ON public.challenge_claims;
CREATE POLICY "cc_user_read_own" ON public.challenge_claims AS PERMISSIVE FOR SELECT TO public USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "cs_user_read_own" ON public.challenge_submissions;
CREATE POLICY "cs_user_read_own" ON public.challenge_submissions AS PERMISSIVE FOR SELECT TO public USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Staff manage delivery fees" ON public.delivery_fees;
CREATE POLICY "Staff manage delivery fees" ON public.delivery_fees AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff manage delivery zones" ON public.delivery_zones;
CREATE POLICY "Staff manage delivery zones" ON public.delivery_zones AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff read all delivery zones" ON public.delivery_zones;
CREATE POLICY "Staff read all delivery zones" ON public.delivery_zones AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Authenticated insert devices" ON public.devices;
CREATE POLICY "Authenticated insert devices" ON public.devices AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users manage own devices" ON public.devices;
CREATE POLICY "Users manage own devices" ON public.devices AS PERMISSIVE FOR ALL TO authenticated USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own devices" ON public.devices;
CREATE POLICY "Users read own devices" ON public.devices AS PERMISSIVE FOR SELECT TO authenticated USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Staff read inventory movements" ON public.inventory_movements;
CREATE POLICY "Staff read inventory movements" ON public.inventory_movements AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'researcher'::text]))))));

DROP POLICY IF EXISTS "Staff manage order items" ON public.order_items;
CREATE POLICY "Staff manage order items" ON public.order_items AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff read order items" ON public.order_items;
CREATE POLICY "Staff read order items" ON public.order_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (orders o
     JOIN users u ON ((u.id = (select auth.uid()))))
  WHERE ((o.id = order_items.order_id) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff manage orders" ON public.orders;
CREATE POLICY "Staff manage orders" ON public.orders AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff read orders" ON public.orders;
CREATE POLICY "Staff read orders" ON public.orders AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff read search events" ON public.phone_search_events;
CREATE POLICY "Staff read search events" ON public.phone_search_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'researcher'::text]))))));

DROP POLICY IF EXISTS "Staff read search selections" ON public.phone_search_selections;
CREATE POLICY "Staff read search selections" ON public.phone_search_selections AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'researcher'::text]))))));

DROP POLICY IF EXISTS "Staff read view events" ON public.phone_view_events;
CREATE POLICY "Staff read view events" ON public.phone_view_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'researcher'::text]))))));

DROP POLICY IF EXISTS "Courier read own membership" ON public.pilot_couriers;
CREATE POLICY "Courier read own membership" ON public.pilot_couriers AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Operator read own membership" ON public.pilot_store_operators;
CREATE POLICY "Operator read own membership" ON public.pilot_store_operators AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Staff read placement history" ON public.placement_history;
CREATE POLICY "Staff read placement history" ON public.placement_history AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'researcher'::text]))))));

DROP POLICY IF EXISTS "Staff write placement history" ON public.placement_history;
CREATE POLICY "Staff write placement history" ON public.placement_history AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Staff manage placements" ON public.placements;
CREATE POLICY "Staff manage placements" ON public.placements AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "Authenticated read qr codes" ON public.qr_codes;
CREATE POLICY "Authenticated read qr codes" ON public.qr_codes AS PERMISSIVE FOR SELECT TO authenticated USING (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users manage own sessions" ON public.sessions;
CREATE POLICY "Users manage own sessions" ON public.sessions AS PERMISSIVE FOR ALL TO authenticated USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own sessions" ON public.sessions;
CREATE POLICY "Users read own sessions" ON public.sessions AS PERMISSIVE FOR SELECT TO authenticated USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Authenticated insert surveys" ON public.surveys;
CREATE POLICY "Authenticated insert surveys" ON public.surveys AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users manage own surveys" ON public.surveys;
CREATE POLICY "Users manage own surveys" ON public.surveys AS PERMISSIVE FOR ALL TO authenticated USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own surveys" ON public.surveys;
CREATE POLICY "Users read own surveys" ON public.surveys AS PERMISSIVE FOR SELECT TO authenticated USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own profile" ON public.users;
CREATE POLICY "Users read own profile" ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING ((id = (select auth.uid())));

-- END 00074
