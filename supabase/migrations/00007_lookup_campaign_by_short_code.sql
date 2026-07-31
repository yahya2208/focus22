-- Migration: Lookup campaign by short code (pre-auth QR flow)
-- Secure, least-privilege RPC so an anonymous guest can resolve an active
-- campaign from its Base62 short code WITHOUT any direct table access.
-- Exposes only: id, short_code, name, is_active.

-- Guard: abort if duplicate active short_codes already exist.
-- The partial unique index below CANNOT be created while duplicates remain.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.campaigns
    WHERE is_active = true
    GROUP BY short_code
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active short_codes exist in campaigns; cannot create unique index';
  END IF;
END $$;

-- Partial unique index: only ACTIVE campaigns must have unique codes.
-- Archived/inactive campaigns may reuse codes.
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_short_code_active_unique
  ON public.campaigns (short_code)
  WHERE is_active = true;

-- Least-privilege RPC: returns the single active campaign matching p_code.
-- No LIMIT 1: with the unique index this always returns 0 or 1 rows;
-- a duplicate would surface as an error instead of being silently hidden.
CREATE OR REPLACE FUNCTION public.lookup_campaign_by_short_code(p_code TEXT)
RETURNS TABLE (
  id UUID,
  short_code TEXT,
  name TEXT,
  is_active BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, short_code, name, is_active
  FROM public.campaigns
  WHERE short_code = TRIM(p_code)
    AND is_active = true;
$$;

REVOKE ALL ON FUNCTION public.lookup_campaign_by_short_code(TEXT) FROM PUBLIC;
-- The QR flow always calls this RPC with an anonymous user's JWT
-- (role = authenticated), so grant to BOTH anon and authenticated explicitly.
GRANT EXECUTE ON FUNCTION public.lookup_campaign_by_short_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_campaign_by_short_code(TEXT) TO authenticated;

COMMENT ON FUNCTION public.lookup_campaign_by_short_code(TEXT) IS
  'Used by QR flow. Contract verified by behavior tests in data-service.';
