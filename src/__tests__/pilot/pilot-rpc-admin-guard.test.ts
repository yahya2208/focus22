/**
 * Neighborhood Pilot — admin-only RPC guard contract (STOP-1 + STOP-4).
 *
 * STOP-1: public.pilot_admin_list_neighborhoods() was created in 00065 as
 * LANGUAGE sql SECURITY DEFINER with no admin check and EXECUTE granted to
 * `authenticated`. With no FORCE ROW LEVEL SECURITY anywhere in the schema,
 * SECURITY DEFINER bypassed RLS and returned inactive/archived neighborhoods
 * to any signed-in non-admin. 00119 re-creates the same function with the
 * fn_admin_uid() guard used by every other pilot_admin_* function.
 *
 * STOP-4: pilot-security-scale.test.ts only inspected CREATE POLICY blocks,
 * never SECURITY DEFINER function bodies — which is exactly why two of the
 * thirty-one pilot_admin_* functions shipped unguarded and no test noticed.
 * The structural suite below closes that blind spot for the whole family.
 *
 * These are offline structural proofs. No SQL is executed and no production
 * database, RPC, or Edge Function is contacted.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');
const M119 = path.join(MIGRATIONS_DIR, '00119_pilot_admin_list_neighborhoods_guard.sql');

/** The one function re-defined by 00119 — the only object that may change. */
const GUARDED = 'pilot_admin_list_neighborhoods';

/**
 * Documented, explicitly-approved exceptions to "every pilot_admin_* must
 * refuse non-admins". Deliberately narrow: adding a name here is a visible,
 * reviewable act, and STOP-4 asserts the list never grows on its own.
 *
 * pilot_admin_list_families — STOP-2, OUT OF SCOPE for this gate. It is the
 * other unguarded pilot_admin_* function, but it is NOT a copy-paste defect:
 * PilotStoreOpsScreen calls it from the operator (non-admin) workspace to
 * label order rows with family names. Guarding it before that caller is
 * migrated would silently break the operator view. It must be closed by its
 * own ordered Gate A (frontend move) then Gate B (guard) pair. Every other
 * pilot_admin_* function must already refuse non-admins.
 */
const DOCUMENTED_EXCEPTIONS: Readonly<Record<string, string>> = Object.freeze({
  pilot_admin_list_families: 'STOP-2: non-admin operator caller in PilotStoreOpsScreen; closed by Gate A then Gate B',
});

interface FunctionDefinition {
  readonly name: string;
  readonly file: string;
  readonly body: string;
}

/** Migration filenames are the replay order; the numeric prefix decides. */
function migrationOrder(file: string): number {
  const match = /^(\d+)/.exec(file);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function readMigration(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
}

/**
 * Drop whole-line `--` comments so "forbidden statement" assertions inspect
 * executable SQL only. Same normalisation the 00071 contract gate applies,
 * so a migration may freely *discuss* grants and revokes in its header.
 */
function executableSql(file: string): string {
  return readMigration(file).replace(/^\s*--.*$/gm, '');
}

/**
 * Every CREATE OR REPLACE of a public.pilot_admin_* function, keyed by name so
 * that the LAST definition in replay order wins — mirroring how Postgres
 * actually resolves a body once all migrations have run. Without this step a
 * guard added by a later migration would be invisible next to the original
 * 00065 body.
 */
function collectAdminFunctions(): Map<string, FunctionDefinition> {
  const latest = new Map<string, FunctionDefinition>();
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => migrationOrder(a) - migrationOrder(b));

  for (const file of files) {
    const sql = readMigration(file);
    const pattern = /CREATE OR REPLACE FUNCTION public\.(pilot_admin_[a-z_]+)\s*\(/g;
    for (let m = pattern.exec(sql); m !== null; m = pattern.exec(sql)) {
      const name = m[1];
      if (name === undefined) continue;
      const open = sql.indexOf('$$', m.index);
      if (open === -1) continue;
      const close = sql.indexOf('$$', open + 2);
      if (close === -1) continue;
      latest.set(name, { name, file, body: sql.slice(m.index, close + 2) });
    }
  }
  return latest;
}

/**
 * A refusal counts only when the body BOTH resolves admin identity AND raises
 * a permission failure on the non-admin path. Checking for a single literal
 * would miss a function that authorizes differently, and would also accept a
 * body that merely mentions the helper without refusing anything.
 */
function adminGuardMechanism(body: string): string | null {
  const identity =
    /public\.fn_admin_uid\(\)/.test(body)
      ? 'fn_admin_uid()'
      : /public\.pilot_admin_require\(\)/.test(body)
        ? 'pilot_admin_require()'
        : /has_super_admin|role\s+IN\s*\(\s*'admin'\s*,\s*'super_admin'\s*\)/.test(body)
          ? 'role lookup'
          : null;
  if (identity === null) return null;

  const refuses =
    /RAISE EXCEPTION 'PERMISSION_DENIED'[\s\S]*?ERRCODE = '42501'/.test(body) ||
    /ERRCODE = '42501'[\s\S]*?RAISE EXCEPTION 'PERMISSION_DENIED'/.test(body);
  if (!refuses) return null;

  return identity;
}

const ADMIN_FUNCTIONS = collectAdminFunctions();

describe('STOP-1 — migration 00119 redefines exactly one function, in place', () => {
  const sql = fs.readFileSync(M119, 'utf-8');

  it('uses CREATE OR REPLACE and never drops the function', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.pilot_admin_list_neighborhoods\(\)/);
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
  });

  it('keeps the empty signature and the SETOF public.neighborhoods return type', () => {
    const signature = /CREATE OR REPLACE FUNCTION public\.pilot_admin_list_neighborhoods\(\)\s*\nRETURNS\s+SETOF public\.neighborhoods/.test(sql);
    expect(signature).toBe(true);
  });

  it('keeps SECURITY DEFINER, STABLE and search_path = \'\'', () => {
    expect(sql).toMatch(/LANGUAGE plpgsql/);
    expect(sql).toMatch(/STABLE/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toContain("SET search_path = ''");
  });

  it('adds the fn_admin_uid() admin guard', () => {
    expect(sql).toContain('public.fn_admin_uid()');
    expect(sql).toMatch(/DECLARE\s+v_uid uuid := public\.fn_admin_uid\(\);/);
    expect(sql).toMatch(/IF v_uid IS NULL THEN/);
  });

  it('raises PERMISSION_DENIED with SQLSTATE 42501', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';/);
  });

  it('preserves the original query and its ORDER BY n.name ASC', () => {
    expect(sql).toMatch(/RETURN QUERY\s*\n\s*SELECT n\.\*\s*\n\s*FROM public\.neighborhoods n/);
    expect(sql).toMatch(/ORDER BY n\.name ASC;/);
  });

  it('defines no other function and touches no other object kind', () => {
    const definitions = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    expect(definitions).toHaveLength(1);

    // Forbidden-statement checks run against executable SQL, comments aside.
    const body = executableSql('00119_pilot_admin_list_neighborhoods_guard.sql');
    expect(body).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.(?!pilot_admin_list_neighborhoods\b)/);
    expect(body).not.toMatch(/ALTER TABLE/i);
    expect(body).not.toMatch(/CREATE POLICY/i);
    expect(body).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(body).not.toMatch(/ALTER FUNCTION/i);
    expect(body).not.toMatch(/\bGRANT\b|\bREVOKE\b/i);
    expect(body).not.toMatch(/CREATE TRIGGER/i);
    expect(body).not.toMatch(/DROP\s+FUNCTION/i);
    expect(body).not.toMatch(/\\i\b/);
  });

  it('leaves the historical migrations 00065 and 00071 untouched', () => {
    const m65 = readMigration('00065_neighborhood_store_pilot.sql');
    const m71 = readMigration('00071_anon_execute_hardening.sql');
    // 00065 still carries its original unguarded body — history is not rewritten.
    expect(m65).toMatch(
      /CREATE OR REPLACE FUNCTION public\.pilot_admin_list_neighborhoods\(\)[\s\S]*?LANGUAGE sql[\s\S]*?SELECT n\.\* FROM public\.neighborhoods n ORDER BY n\.name ASC/,
    );
    // 00071 remains a revoke-only file and still revokes both anon grants.
    expect(m71).not.toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(m71).toMatch(/REVOKE EXECUTE ON FUNCTION public\.pilot_admin_list_neighborhoods\(\) FROM anon;/);
    expect(m71).toMatch(/REVOKE EXECUTE ON FUNCTION public\.pilot_admin_list_families\(\) FROM anon;/);
  });
});

describe('STOP-4 — every admin-only pilot_admin_* refuses non-admins', () => {
  it('discovers the full pilot_admin_* inventory from the migration sources', () => {
    expect(ADMIN_FUNCTIONS.size).toBeGreaterThanOrEqual(30);
    for (const required of [
      'pilot_admin_list_neighborhoods',
      'pilot_admin_list_stores',
      'pilot_admin_list_operators',
      'pilot_admin_list_couriers',
      'pilot_admin_list_invitations',
      'pilot_admin_set_operator_status',
      'pilot_admin_set_courier_status',
      'pilot_admin_set_operational_ready',
      'pilot_admin_upsert_neighborhood',
      'pilot_admin_upsert_store',
      'pilot_admin_set_store_inventory',
      'pilot_admin_upsert_family',
      'pilot_admin_link_family',
      'pilot_admin_link_store_inventory',
      'pilot_admin_require',
      'pilot_admin_pilot_health',
      'pilot_admin_start_pilot',
      'pilot_admin_pilot_start_status',
      'pilot_admin_advance_order',
      'pilot_admin_assign_order',
      'pilot_admin_find_users',
      'pilot_admin_provision_family_member',
      'pilot_admin_list_family_members',
      'pilot_admin_deposit',
      'pilot_admin_family_ledger',
      'pilot_admin_family_preferences_get',
      'pilot_admin_set_store_location',
      'pilot_admin_set_neighborhood_center',
      'pilot_admin_purge_old_courier_locations',
    ]) {
      expect(ADMIN_FUNCTIONS.has(required), required).toBe(true);
    }
  });

  it('guards every pilot_admin_* function except the documented STOP-2 exception', () => {
    const unguarded: string[] = [];
    for (const [name, def] of ADMIN_FUNCTIONS) {
      if (name in DOCUMENTED_EXCEPTIONS) continue;
      if (adminGuardMechanism(def.body) === null) unguarded.push(`${name} (${def.file})`);
    }
    expect(unguarded).toEqual([]);
  });

  it('keeps the exception list pinned to the approved STOP-2 entry only', () => {
    expect(Object.keys(DOCUMENTED_EXCEPTIONS)).toEqual(['pilot_admin_list_families']);
    for (const [name, reason] of Object.entries(DOCUMENTED_EXCEPTIONS)) {
      expect(ADMIN_FUNCTIONS.has(name), name).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('classifies the documented exception as genuinely unguarded, not already fixed', () => {
    // Prevents the exception from becoming permanent once Gate B lands.
    const families = ADMIN_FUNCTIONS.get('pilot_admin_list_families');
    expect(families).toBeDefined();
    expect(adminGuardMechanism(families!.body)).toBeNull();
  });

  it('resolves the effective definition by replay order, so 00119 supersedes 00065', () => {
    const effective = ADMIN_FUNCTIONS.get(GUARDED);
    expect(effective).toBeDefined();
    expect(effective!.file).toBe('00119_pilot_admin_list_neighborhoods_guard.sql');
    expect(adminGuardMechanism(effective!.body)).toBe('fn_admin_uid()');
  });

  it('would have failed on the pre-00119 definition — the regression proof', () => {
    const m65 = readMigration('00065_neighborhood_store_pilot.sql');
    const start = m65.indexOf('CREATE OR REPLACE FUNCTION public.pilot_admin_list_neighborhoods()');
    expect(start).toBeGreaterThan(-1);
    const body = m65.slice(start, m65.indexOf('$$;', start) + 3);
    expect(adminGuardMechanism(body)).toBeNull();
  });

  it('declares every pilot_admin_* as SECURITY DEFINER with a pinned search_path', () => {
    for (const [name, def] of ADMIN_FUNCTIONS) {
      expect(def.body, name).toMatch(/SECURITY DEFINER/);
      expect(def.body, name).toContain("SET search_path = ''");
    }
  });
});
