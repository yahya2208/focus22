-- ============================================================================
-- 00118  PUSH SUBSCRIPTIONS + PUSH LOG (Web Push closed-app coverage).
-- ----------------------------------------------------------------------------
-- Additive ONLY: 2 new tables + RLS, no changes to any existing object.
-- push_subscriptions: one row per (user, endpoint); owner-managed.
-- push_log: idempotency record UNIQUE(order_id, endpoint) so webhook retries
-- and multi-device fan-out never duplicate-send.
-- Endpoint URLs are bearer-capable: RLS restricts rows to their owner;
-- the sender Edge Function uses service_role server-side (established
-- pilot-invite pattern) and never returns endpoints to any client.
-- NOT applied to any DB by this file alone.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (endpoint)
);

CREATE TABLE IF NOT EXISTS public.push_log (
  order_id  uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  endpoint  text NOT NULL,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;

-- Owner manages own subscriptions; NOBODY reads push_log client-side
-- (sender-only table; no SELECT grant to any client role).
DROP POLICY IF EXISTS "owner manage push subscriptions" ON public.push_subscriptions;
CREATE POLICY "owner manage push subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.push_subscriptions FROM anon;
REVOKE ALL ON public.push_log FROM anon, authenticated;

-- ============================================================================
-- Post-checks.
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.push_subscriptions') IS NULL THEN
    RAISE EXCEPTION '00118: push_subscriptions missing';
  END IF;
  IF to_regclass('public.push_log') IS NULL THEN
    RAISE EXCEPTION '00118: push_log missing';
  END IF;
END;
$$;
