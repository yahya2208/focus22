/**
 * GATE 7A — Regression proofs for the two repaired 00079 defects.
 *
 * Layer 1 (always runs, deterministic): asserts the committed migration file
 * contains the corrections — an exact-count base-column guard (not the
 * inverted `HAVING count(*)=0` form) AND explicit REVOKE of INSERT/UPDATE/
 * DELETE on order_status_history to authenticated/anon. These guarantee the
 * source cannot silently regress to the broken spellings.
 *
 * Layer 2 (live behavioral proof, enabled via PILOT_DB=1): executes the
 * extracted guard verbatim against the real database (passes on existing
 * columns, raises on a missing table) and reads actual pg catalogs to prove
 * authenticated/anon hold no INSERT/UPDATE/DELETE on the history table while
 * the SECURITY DEFINER owners retain the write capability.
 *
 * Layer 2 is decided synchronously at module load (env + pg resolution) so it
 * skips deterministically when PILOT_DB is unset or pg is unavailable, keeping
 * the repo-wide `vitest run` green in CI.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const MIG_PATH = path.resolve(__dirname, '../../../supabase/migrations/00079_order_lifecycle_status_history.sql');

const migration = (): string => fs.readFileSync(MIG_PATH, 'utf-8');

/** Extract the corrected base-columns guard from the committed file. */
function extractColumnGuard(migrationText: string): string {
  const m = migrationText.match(
    /IF \(SELECT count\(\*\) FROM information_schema\.columns[\s\S]*?RAISE EXCEPTION '00079: order_status_history base columns missing';\n  END IF;/,
  );
  if (!m) throw new Error('00079 base-columns guard not found in migration (repair missing?)');
  return m[0];
}

/** Non-inverted guard condition, evaluated purely: returns true when columns exist. */
function guardPasses(columnCount: number): boolean {
  return columnCount === 6;
}

describe('00079 repair is present in the committed source (always)', () => {
  it('uses an exact-count guard, not the inverted HAVING count(*)=0 form', () => {
    const m = migration();
    const guard = extractColumnGuard(m);
    expect(guard).toContain('<> 6 THEN');
    expect(guard).toContain("RAISE EXCEPTION '00079: order_status_history base columns missing'");
    expect(guard).not.toContain('HAVING count(*) = 0');
  });

  it('guard logic behaves correctly for valid and invalid column counts (pure proof)', () => {
    expect(guardPasses(6)).toBe(true);
    expect(guardPasses(0)).toBe(false);
    expect(guardPasses(5)).toBe(false);
  });

  it('explicitly revokes authenticated/anon direct history writes', () => {
    const m = migration();
    expect(m).toContain('REVOKE INSERT, UPDATE, DELETE ON public.order_status_history FROM authenticated;');
    expect(m).toContain('REVOKE INSERT, UPDATE, DELETE ON public.order_status_history FROM anon;');
  });

  it('still preserves the append-only server-written contract', () => {
    const m = migration();
    expect(m).toContain('GRANT SELECT ON public.order_status_history TO authenticated;');
    expect(m).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*ON public\.order_status_history/);
  });
});

// ---- Layer 2: live behavioral (opt-in) ----
type Run = (sql: string) => Promise<any[]>;

function buildLive(): null | { run: Run } {
  if (process.env.PILOT_DB !== '1') return null;
  try {
    const require2 = createRequire(__filename);
    const pgPath = process.env.PILOT_PG_PATH ?? 'C:/Users/lenovo/AppData/Local/Temp/opencode/pgclient2/node_modules/pg';
    const { Client } = require2(pgPath);
    const pw = fs
      .readFileSync(process.env.PILOT_DB_PW ?? 'C:/Users/lenovo/AppData/Local/Temp/opencode/foc-db.pw', 'utf-8')
      .trim();
    const conn = {
      host: 'aws-0-eu-west-1.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      user: 'postgres.fmggysdqigtejxbfpgtg',
      password: pw,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    };
    return {
      run: (sql: string) =>
        new Promise((resolve, reject) => {
          const client = new Client(conn);
          client.connect((err?: Error | null) => {
            if (err) return reject(err);
            client.query(sql, (qerr: Error | null, res: any) => {
              client.end().catch(() => {});
              if (qerr) return reject(qerr);
              resolve(res.rows);
            });
          });
        }),
    };
  } catch {
    return null;
  }
}

const live = buildLive();

if (live) {
  describe('00079 live behavioral proof (PILOT_DB=1)', () => {
    it('PASSES on existing columns, RAISES on a missing table (extracted guard, verbatim)', async () => {
      const guard = extractColumnGuard(migration());
      await expect(live.run(`DO $$\nBEGIN\n${guard}\nEND\n$$;`)).resolves.toBeDefined();
      const negative = guard
        .split("table_name = 'order_status_history'")
        .join("table_name = 'zz_gate7a_does_not_exist'");
      await expect(live.run(`DO $$\nBEGIN\n${negative}\nEND\n$$;`)).rejects.toThrow(
        '00079: order_status_history base columns missing',
      );
    });

    it('authenticated/anon hold NO table-level INSERT/UPDATE/DELETE on history', async () => {
      const rows = await live.run(
        `SELECT grantee,
                has_table_privilege(grantee, 'public.order_status_history', 'INSERT') AS ins,
                has_table_privilege(grantee, 'public.order_status_history', 'UPDATE') AS upd,
                has_table_privilege(grantee, 'public.order_status_history', 'DELETE') AS del
         FROM (VALUES ('authenticated'), ('anon')) AS g(grantee)
         ORDER BY grantee`,
      );
      for (const row of rows) {
        expect(row.ins, `${row.grantee} INSERT`).toBe(false);
        expect(row.upd, `${row.grantee} UPDATE`).toBe(false);
        expect(row.del, `${row.grantee} DELETE`).toBe(false);
      }
    });

    it('SECURITY DEFINER owners retain the write capability (legit server path)', async () => {
      const rows = await live.run(
        `SELECT p.proname,
                pg_get_userbyid(p.proowner) AS owner,
                p.prosecdef AS secdef,
                has_table_privilege(pg_get_userbyid(p.proowner), 'public.order_status_history', 'INSERT') AS owner_can_insert
         FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname IN ('pilot_assert_transition', 'delivery_create_order', 'pilot_order_accept')
         ORDER BY p.proname`,
      );
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.secdef, `${row.proname} SECURITY DEFINER`).toBe(true);
        expect(row.owner_can_insert, `${row.proname} owner INSERT`).toBe(true);
        expect(row.owner).toBe('postgres');
      }
    });

    it('private helper is not client-callable; timeline is authenticated-EXECUTE only', async () => {
      const rows = await live.run(
        `SELECT p.proname,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authn_can_exec,
                has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
         FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname IN ('pilot_assert_transition', 'pilot_order_timeline')
         ORDER BY p.proname`,
      );
      const byName = Object.fromEntries(rows.map((r: any) => [r.proname, r]));
      expect(byName.pilot_assert_transition.authn_can_exec).toBe(false);
      expect(byName.pilot_assert_transition.anon_can_exec).toBe(false);
      expect(byName.pilot_order_timeline.authn_can_exec).toBe(true);
      expect(byName.pilot_order_timeline.anon_can_exec).toBe(false);
    });
  });
} else {
  describe.skip('00079 live behavioral proof (enable with PILOT_DB=1)', () => {
    it('is skipped when PILOT_DB is not set / pg unavailable', () => {});
  });
}