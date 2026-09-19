/**
 * GATE 2 — LOCATION FOUNDATION (migration 00078).
 * Offline structural proofs (no live DB), mirroring the pilot-migration-gate
 * and pilot-security-scale conventions:
 *   Coordinates   — DB-level range checks reject impossible coords; no clamping.
 *   NULL compat   — legacy orders/stores/neighborhoods without coords stay valid.
 *   Courier loc   — history table + latest table with enforced 1-row-per-courier.
 *   Security      — RLS on both tables, admin-only direct access, no anon, no
 *                   customer GPS read, no USING(true), no write grants.
 *   Retention     — explicit, manually-runnable 7-day purge (admin-gated).
 *   Regression    — lifecycle/realtime/assignment/RBAC/telemetry untouched.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M78 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00078_location_foundation.sql'), 'utf-8');

// CODE = executable SQL only (comment prose documents boundaries; assertions
// about what the migration does must read code, not prose).
const CODE = M78.replace(/^\s*--.*$/gm, '').trim();
// TOP = top-level statements only (RPC bodies are compiled, not executed, at
// apply time — their UPDATE/DELETE are the authorized runtime config/
// maintenance paths, NOT migration-time data rewrites).
const FN_BLOCKS = [...M78.matchAll(/CREATE OR REPLACE FUNCTION public\.[\s\S]*?\n\$\$;/g)].map((m) => m[0]);
const TOP = FN_BLOCKS.reduce((acc, b) => acc.replace(b, ''), CODE);
// Comment-less text of one function body.
const FN = (name: string): string => {
  const start = M78.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in 00078`).toBeGreaterThan(-1);
  const tail = M78.slice(start);
  const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\.|\nGRANT EXECUTE ON FUNCTION public\./);
  return end === -1 ? tail : tail.slice(0, end);
};
// The full CREATE TABLE block for a table name.
const TBL = (name: string): string =>
  (M78.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name}\\s\\([\\s\\S]*?\\);`))?.[0] ?? '');

describe('Coordinates — DB-level validation, no clamping, no fabrication', () => {
  it('every coordinate column carries a range CHECK constraint in 00078', () => {
    const expected = [
      ['stores_latitude_range', 'latitude BETWEEN -90 AND 90'] as const,
      ['stores_longitude_range', 'longitude BETWEEN -180 AND 180'] as const,
      ['neighborhoods_center_lat_range', 'center_lat BETWEEN -90 AND 90'] as const,
      ['neighborhoods_center_lng_range', 'center_lng BETWEEN -180 AND 180'] as const,
      ['orders_latitude_range', 'latitude BETWEEN -90 AND 90'] as const,
      ['orders_longitude_range', 'longitude BETWEEN -180 AND 180'] as const,
      ['pilot_courier_locations_latitude_range', 'latitude BETWEEN -90 AND 90'] as const,
      ['pilot_courier_locations_longitude_range', 'longitude BETWEEN -180 AND 180'] as const,
      ['pilot_courier_locations_latest_latitude_range', 'latitude BETWEEN -90 AND 90'] as const,
      ['pilot_courier_locations_latest_longitude_range', 'longitude BETWEEN -180 AND 180'] as const,
    ];
    for (const [name, expr] of expected) {
      expect(M78, name).toContain(name);
      expect(M78, name).toContain(`CHECK (${expr})`);
    }
  });

  it('rejects out-of-range latitudes/longitudes (no silent clamp, no fabrication)', () => {
    expect(M78).toContain('latitude BETWEEN -90 AND 90');
    expect(M78).toContain('longitude BETWEEN -180 AND 180');
    // No clamping helpers anywhere in the migration.
    expect(M78).not.toMatch(/GREATEST\(\s*[^)]*\b(latitude|longitude)/);
    expect(M78).not.toMatch(/LEAST\(\s*[^)]*\b(latitude|longitude)/);
    // No migration-time data writes: no top-level INSERT/UPDATE/DELETE statement.
    expect(TOP).not.toMatch(/^\s*(INSERT INTO|UPDATE\s+\w+|DELETE\s+FROM)/gm);
    // No numeric lattice for coordinates is hard-coded into any data row.
    expect(M78).not.toMatch(/'(latitude|longitude|center_lat|center_lng)',\s*-?\d+(\.\d+)?\s*,/);
  });

  it('non-coordinate metric fields are also bounded (accuracy/speed non-negative, heading -1..360)', () => {
    for (const t of ['pilot_courier_locations', 'pilot_courier_locations_latest']) {
      const block = TBL(t);
      expect(block).toContain('accuracy_m IS NULL OR accuracy_m >= 0');
      expect(block).toContain('heading_deg IS NULL OR (heading_deg >= -1 AND heading_deg <= 360)');
      expect(block).toContain('speed_mps IS NULL OR speed_mps >= 0');
    }
  });
});

describe('NULL compatibility — existing pilot data stays valid with no coords', () => {
  it('orders/stores/neighborhoods coordinate columns are nullable (no NOT NULL, no DEFAULT)', () => {
    for (const col of ['latitude', 'longitude', 'center_lat', 'center_lng']) {
      expect(M78, col).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\s+double precision(?!\\s+NOT NULL)`));
    }
    expect(M78).not.toMatch(/ADD COLUMN IF NOT EXISTS\s+(latitude|longitude|center_lat|center_lng)[^,;]+\bDEFAULT\b/);
    // The destination/static coordinate columns must allow NULL rows (legacy data).
    expect(M78).not.toMatch(/ADD COLUMN IF NOT EXISTS\s+(latitude|longitude|center_lat|center_lng)\s+double precision\s+NOT NULL/);
  });

  it('does NOT rewrite existing rows (legacy 3-pending/1-delivered orders untouched)', () => {
    expect(TOP).not.toMatch(/^\s*(INSERT INTO|UPDATE\s+\w+|DELETE\s+FROM)/gm);
    expect(CODE).not.toMatch(/ALTER TABLE public\.(orders|stores|neighborhoods)\s+ALTER COLUMN/);
    expect(CODE).not.toMatch(/DROP COLUMN/);
    // All writes in the file live inside the three admin RPC bodies only.
    for (const t of ['orders', 'stores', 'neighborhoods']) {
      expect(TOP, t).not.toMatch(/UPDATE PUBLIC|UPDATE public\./);
    }
  });

  it('is_online defaults FALSE and last_online_at starts NULL (offline until toggled)', () => {
    expect(M78).toMatch(/ADD COLUMN IF NOT EXISTS is_online\s+boolean NOT NULL DEFAULT false/);
    expect(M78).toMatch(/ADD COLUMN IF NOT EXISTS last_online_at\s+timestamptz(?!\s+NOT NULL)/);
    // Fresh GPS is a separate concept from online state (documented in the file).
    expect(M78).not.toMatch(/is_online\s*=\s*true\b[^;]*GENERATED|is_online GENERATED/);
  });

  it('orders gains destination coords only — courier GPS never lands on orders', () => {
    expect(CODE).not.toMatch(/courier_latitude|courier_longitude|courier_heading|courier_speed/);
  });
});

describe('Courier location model — history + enforced 1-row-per-courier latest', () => {
  it('pilot_courier_locations is an append history table (identity PK, required device time)', () => {
    const block = TBL('pilot_courier_locations');
    expect(block).toMatch(/id\s+bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY/);
    expect(block).toMatch(/user_id\s+uuid NOT NULL REFERENCES public\.users\(id\)/);
    expect(block).toMatch(/store_id\s+uuid REFERENCES public\.stores\(id\)/);
    expect(block).toMatch(/latitude\s+double precision NOT NULL/);
    expect(block).toMatch(/longitude\s+double precision NOT NULL/);
    expect(block).toMatch(/recorded_at\s+timestamptz NOT NULL/);
    expect(block).toContain("ingested_at timestamptz NOT NULL DEFAULT now()");
    // Device timestamp != server timestamp; obvious future rejected at the DB.
    expect(block).toContain("recorded_at <= now() + interval '1 hour'");
  });

  it('pilot_courier_locations_latest enforces one current row per courier via PK', () => {
    const block = TBL('pilot_courier_locations_latest');
    expect(block).toMatch(/user_id\s+uuid PRIMARY KEY REFERENCES public\.users\(id\)/);
    expect(block).toContain("ingested_at timestamptz NOT NULL DEFAULT now()");
    // NOT a history table: no identity/serial id — a fixed 1-per-courier projection.
    expect(block).not.toMatch(/GENERATED ALWAYS AS IDENTITY/);
    expect(block).not.toMatch(/created_at/);
  });

  it('both tables reject invalid coordinates at the database layer', () => {
    for (const t of ['pilot_courier_locations', 'pilot_courier_locations_latest']) {
      const block = TBL(t);
      expect(block).toBeTruthy();
      expect((block.match(/BETWEEN -90 AND 90/g) ?? []).length).toBe(1);
      expect((block.match(/BETWEEN -180 AND 180/g) ?? []).length).toBe(1);
    }
  });

  it('latest is a fixed-size projection (UPSERT target) — cannot grow unboundedly', () => {
    const block = TBL('pilot_courier_locations_latest');
    // The ONLY key on the latest table is the user_id PK — no unbounded growth.
    expect(block).not.toMatch(/GENERATED ALWAYS AS IDENTITY|CREATE SEQUENCE|bigint/);
    // Exactly two indexes exist, both on the HISTORY table (never the latest).
    const indexes = CODE.match(/CREATE INDEX IF NOT EXISTS\s+(\w+)/g) ?? [];
    expect(indexes).toEqual([
      'CREATE INDEX IF NOT EXISTS idx_pilot_courier_locations_user_time',
      'CREATE INDEX IF NOT EXISTS idx_pilot_courier_locations_store_time',
    ]);
    expect(CODE).not.toMatch(/CREATE INDEX IF NOT EXISTS [^;]*_latest/);
  });
});

describe('Security — location tables are not publicly writable/readable', () => {
  const NEW_TABLES = ['pilot_courier_locations', 'pilot_courier_locations_latest'];

  it('enables RLS on both new tables', () => {
    for (const t of NEW_TABLES) {
      expect(M78).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(M78).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
    }
  });

  it('creates exactly the two ADMIN-ONLY policies, each re-checking fn_admin_uid()', () => {
    const policies = (M78.match(/CREATE POLICY "[\s\S]*?;/g) ?? []);
    expect(policies).toHaveLength(2);
    expect(M78).toContain('"Admin manage courier location history"');
    expect(M78).toContain('"Admin manage courier locations latest"');
    for (const p of policies) {
      expect(p).toContain('FOR ALL TO authenticated');
      expect(p).toContain('USING (public.fn_admin_uid() IS NOT NULL)');
      expect(p).toContain('WITH CHECK (public.fn_admin_uid() IS NOT NULL)');
    }
  });

  it('offers no anonymous write/read path and no broad USING(true) policy', () => {
    expect(CODE).not.toMatch(/FOR (ALL|INSERT|UPDATE|DELETE) TO anon/);
    expect(CODE).not.toMatch(/FOR SELECT TO anon/);
    expect(CODE).not.toMatch(/USING \((TRUE|true)\)/);
    // No self/operator/customer SELECT policy on raw courier GPS this gate.
    expect(CODE).not.toMatch(/read own location|read own courier|Courier read own/);
    expect(CODE).not.toMatch(/customer/i);
  });

  it('grants are SELECT-only to authenticated (no direct INSERT/UPDATE/DELETE)', () => {
    const grant = M78.split('GRANT SELECT ON public.pilot_courier_locations,')[1] ?? '';
    expect(grant).toContain('public.pilot_courier_locations_latest');
    expect(grant).toContain('TO authenticated;');
    for (const t of NEW_TABLES) {
      expect(M78).not.toMatch(new RegExp(`GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*ON public\\.${t}`));
      expect(M78).not.toMatch(new RegExp(`GRANT [^;]*ON public\\.${t}\\s*TO anon`));
    }
  });

  it('never uses or mentions a service-role/client secret', () => {
    expect(CODE).not.toMatch(/service_role|service-role|service role/i);
    expect(CODE).not.toMatch(/VITE_.*KEY|service_?role_key/i);
  });
});

describe('Security — new RPCs are admin-gated SECURITY DEFINER with fixed search_path', () => {
  const RPCs = [
    'pilot_admin_set_store_location',
    'pilot_admin_set_neighborhood_center',
    'pilot_admin_purge_old_courier_locations',
  ] as const;

  it('defines exactly the 3 new functions (no redefinition of lifecycle/order RPCs)', () => {
    const created = (M78.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g) ?? []).map((m) =>
      m.replace('CREATE OR REPLACE FUNCTION public.', ''),
    );
    expect(created).toEqual([...RPCs]);
  });

  it('every new RPC is SECURITY DEFINER, fixes search_path, and re-checks fn_admin_uid()', () => {
    for (const r of RPCs) {
      const block = FN(r);
      expect(block).toContain('SECURITY DEFINER');
      expect(block).toContain("SET search_path = ''");
      expect(block).toContain('fn_admin_uid()');
      expect(block).toContain("RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501'");
    }
  });

  it('location-config RPCs reject impossible coordinates with COORDINATES_INVALID', () => {
    for (const r of ['pilot_admin_set_store_location', 'pilot_admin_set_neighborhood_center']) {
      const block = FN(r);
      expect(block).toContain('p_latitude < -90 OR p_latitude > 90');
      expect(block).toContain('p_longitude < -180 OR p_longitude > 180');
      expect(block).toContain("RAISE EXCEPTION 'COORDINATES_INVALID' USING ERRCODE = '22023'");
    }
  });

  it('keeps the double grant contract (REVOKE ALL + GRANT EXECUTE) for every new RPC', () => {
    for (const r of RPCs) {
      expect(M78, r).toContain(`REVOKE ALL ON FUNCTION public.${r}(`);
      expect(M78, r).toContain(`GRANT EXECUTE ON FUNCTION public.${r}(`);
    }
  });
});

describe('Retention — explicit 7-day policy, manually runnable, not auto-scheduled', () => {
  it('provides the documented operational purge with 7-day default', () => {
    const block = FN('pilot_admin_purge_old_courier_locations');
    expect(block).toContain("p_cutoff interval DEFAULT '7 days'");
    expect(block).toContain('DELETE FROM public.pilot_courier_locations');
    expect(block).toContain('ingested_at < (now() - p_cutoff)');
    // Safety rails prevent wiping everything at once.
    expect(block).toContain("p_cutoff < interval '1 day'");
    expect(block).toContain("p_cutoff > interval '365 days'");
  });

  it('purge deletes ONLY old location HISTORY — never orders/couriers/latest', () => {
    const body = FN('pilot_admin_purge_old_courier_locations').replace(/^\s*--.*$/gm, '');
    expect(body).not.toMatch(/DELETE FROM public\.orders/);
    expect(body).not.toMatch(/DELETE FROM public\.pilot_couriers(?!_location)/);
    expect(body).not.toMatch(/DELETE FROM public\.pilot_courier_locations_latest/);
    expect(body).toMatch(/DELETE FROM public\.pilot_courier_locations\s*\n\s*WHERE ingested_at < \(now\(\) - p_cutoff\)/);
  });

  it('never auto-schedules anything (no pg_cron, no procedure runner)', () => {
    expect(M78).not.toMatch(/pg_cron|cron\.schedule|CREATE EXTENSION/);
  });
});

describe('Regression — GATE 2 scope boundaries held', () => {
  it('does NOT touch order lifecycle, assignment, or history', () => {
    expect(CODE).not.toMatch(/order_status_history/);
    expect(CODE).not.toMatch(/pilot_assert_transition/);
    expect(CODE).not.toMatch(/pilot_order_set_status|pilot_courier_set_status|pilot_order_accept/);
    expect(CODE).not.toMatch(/ADD COLUMN IF NOT EXISTS courier_user_id/);
  });

  it('does NOT start Realtime (no publication changes, no postgres_changes)', () => {
    expect(CODE).not.toMatch(/ALTER PUBLICATION|supabase_realtime/i);
    expect(CODE).not.toMatch(/postgres_changes|\.channel\(/);
  });

  it('does NOT modify RBAC, telemetry, or existing RLS policies', () => {
    expect(CODE).not.toMatch(/ROLE_PERMISSIONS|ROLE_CAPABILITY_MAP/);
    expect(CODE).not.toMatch(/ALTER TABLE public\.(users|roles|telemetry_)/);
    expect(CODE).not.toMatch(/record_telemetry_event/);
    expect((CODE.match(/DROP POLICY IF EXISTS/g) ?? []).length).toBe(2); // only its own 2
    expect(CODE).not.toMatch(/DROP POLICY IF EXISTS "Public read|DROP POLICY IF EXISTS "Staff/);
  });

  it('documented rollback is complete and mirrors every object created', () => {
    expect(M78).toMatch(/-- Rollback:/);
    for (const obj of [
      'DROP COLUMN IF EXISTS latitude/longitude ON orders',
      'center_lat/',
      'DROP TABLE public.pilot_courier_locations_latest',
      'DROP TABLE public.pilot_courier_locations',
      'pilot_admin_set_store_location',
      'pilot_admin_set_neighborhood_center',
      'pilot_admin_purge_old_courier_locations',
    ]) {
      expect(M78, obj).toContain(obj);
    }
  });
});