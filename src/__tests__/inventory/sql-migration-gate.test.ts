import { describe, expect, it } from 'vitest';
import applySql from '../../../supabase/inventory-central/01-inventory-apply.sql?raw';
import rollbackSql from '../../../supabase/inventory-central/02-inventory-rollback.sql?raw';
import evidenceSql from '../../../supabase/inventory-central/03-pre-apply-evidence.sql?raw';
import verifySql from '../../../supabase/inventory-central/04-post-apply-verify.sql?raw';

const MIGRATIONS = import.meta.glob('../../../supabase/migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const migration19 = Object.entries(MIGRATIONS).find(([key]) =>
  key.includes('00019_inventory_central.sql'),
)?.[1] as string;

function basename(key: string): string {
  return key.split('/').pop() ?? key;
}

function numericPrefix(name: string): number | null {
  const m = name.match(/^(\d+)_/);
  return m ? Number(m[1]) : null;
}

function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function bodyFrom(sql: string): string {
  const lines = sql.split('\n');
  const firstNonComment = lines.findIndex((line) => !line.trimStart().startsWith('--'));
  return lines.slice(firstNonComment === -1 ? 0 : firstNonComment).join('\n');
}

function createFunctionSigs(sql: string): Map<string, number> {
  const sigs = new Map<string, number>();
  const re = /create or replace function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1]!;
    const args = m[2] ?? '';
    sigs.set(name, args.split(',').filter((s) => s.trim().length > 0).length);
  }
  return sigs;
}

function dropFunctionSigs(sql: string): Map<string, number> {
  const sigs = new Map<string, number>();
  const re = /drop function if exists public\.(\w+)\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1]!;
    const args = m[2] ?? '';
    sigs.set(name, args.split(',').filter((s) => s.trim().length > 0).length);
  }
  return sigs;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('Migration numbering', () => {
  it('zero-padded migration numbers (00001..00019) are unique', () => {
    const names = Object.keys(MIGRATIONS).map(basename);
    const nums = names
      .filter((name) => /^\d{5}_/.test(name))
      .map(numericPrefix)
      .filter((n): n is number => n !== null);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it('the only legacy non-padded files are the known 003/004 pair', () => {
    const legacy = Object.keys(MIGRATIONS)
      .map(basename)
      .filter((name) => /^\d{3}_/.test(name) && !/^\d{5}_/.test(name))
      .sort();
    expect(legacy).toEqual(['003_add_session_lifecycle.sql', '004_add_analytics_events_indexes.sql']);
  });

  it('00019 is the highest migration number and exists', () => {
    const nums = Object.keys(MIGRATIONS)
      .map(basename)
      .map(numericPrefix)
      .filter((n): n is number => n !== null);
    expect(Math.max(...nums)).toBe(19);
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00019_inventory_central.sql');
  });

  it('00019 body (after header comments) matches 01-inventory-apply.sql body', () => {
    expect(migration19).toBeDefined();
    expect(bodyFrom(migration19)).toBe(bodyFrom(applySql));
  });
});

describe('00014 exclusion', () => {
  it('00014_inventory_tables.sql is frozen but never executed/referenced by executable SQL', () => {
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00014_inventory_tables.sql');
    for (const [key, content] of Object.entries(MIGRATIONS)) {
      const name = basename(key);
      if (name === '00014_inventory_tables.sql') continue;
      expect(stripSqlComments(content), `${name} must not execute anything referencing 00014`).not.toContain(
        '00014',
      );
    }
    expect(stripSqlComments(applySql)).not.toContain('00014');
    expect(stripSqlComments(rollbackSql)).not.toContain('00014');
  });
});

describe('01-inventory-apply.sql ↔ 02-inventory-rollback.sql consistency', () => {
  it('every function created in 01 is dropped in 02 with an identical signature', () => {
    const created = createFunctionSigs(applySql);
    const dropped = dropFunctionSigs(rollbackSql);
    expect(created.size).toBeGreaterThan(0);
    expect(dropped.size).toBe(created.size);
    for (const [name, argc] of created) {
      expect(dropped.has(name), `02 must drop ${name}`).toBe(true);
      expect(dropped.get(name), `${name} argument-count mismatch between 01 and 02`).toBe(argc);
    }
    for (const name of dropped.keys()) {
      expect(created.has(name), `02 drops ${name} but 01 does not create it`).toBe(true);
    }
  });

  it('rollback order reverses apply order (tables / view / RPCs / storage)', () => {
    expect(applySql.indexOf('CREATE TABLE IF NOT EXISTS public.inventory_items')).toBeLessThan(
      applySql.indexOf('CREATE TABLE IF NOT EXISTS public.inventory_images'),
    );
    expect(applySql.indexOf('CREATE TABLE IF NOT EXISTS public.inventory_images')).toBeLessThan(
      applySql.indexOf('CREATE TABLE IF NOT EXISTS public.inventory_movements'),
    );
    expect(rollbackSql.indexOf('DROP TABLE IF EXISTS public.inventory_movements')).toBeLessThan(
      rollbackSql.indexOf('DROP TABLE IF EXISTS public.inventory_images'),
    );
    expect(rollbackSql.indexOf('DROP TABLE IF EXISTS public.inventory_images')).toBeLessThan(
      rollbackSql.indexOf('DROP TABLE IF EXISTS public.inventory_items'),
    );

    expect(applySql.indexOf('CREATE OR REPLACE VIEW public.v_public_inventory')).toBeLessThan(
      applySql.indexOf('CREATE OR REPLACE FUNCTION public.inventory_is_admin'),
    );
    expect(rollbackSql.indexOf('DROP FUNCTION IF EXISTS public.inventory_is_admin')).toBeLessThan(
      rollbackSql.indexOf('DROP VIEW IF EXISTS public.v_public_inventory'),
    );

    expect(applySql.indexOf('-- 9) Storage bucket')).toBeGreaterThan(
      applySql.indexOf('CREATE OR REPLACE FUNCTION public.inventory_add_item'),
    );
    expect(rollbackSql.indexOf("DELETE FROM storage.buckets WHERE id = 'inventory-images'")).toBeLessThan(
      rollbackSql.indexOf('DROP FUNCTION IF EXISTS public.inventory_add_item'),
    );
  });
});

describe('Phase 2C security invariants (01 / 00019)', () => {
  const files: Array<{ label: string; sql: string }> = [
    { label: '01-inventory-apply.sql', sql: applySql },
    { label: '00019_inventory_central.sql', sql: migration19 },
  ];

  for (const { label, sql } of files) {
    it(`${label}: storage write access uses CREATE POLICY with WITH CHECK, never raw storage.policies inserts`, () => {
      expect(sql).not.toContain('INSERT INTO storage.policies');
      expect(sql).not.toContain('supabase_realtime.publication');
      expect(countOccurrences(sql, 'CREATE POLICY "Staff upload inventory-images"')).toBe(1);
      expect(countOccurrences(sql, 'CREATE POLICY "Staff update inventory-images"')).toBe(1);
      expect(countOccurrences(sql, 'CREATE POLICY "Staff delete inventory-images"')).toBe(1);
      expect(sql).toContain('WITH CHECK');
    });

    it(`${label}: all storage writes and management RPCs are admin/super_admin only`, () => {
      const adminChecks = countOccurrences(sql, "u.role IN ('admin','super_admin')");
      expect(adminChecks).toBeGreaterThanOrEqual(4);
      expect(sql).toContain("name LIKE 'inventory-images/%'");
    });

    it(`${label}: inventory_add_image validates folder prefix + object existence + locks the row`, () => {
      expect(sql).toContain("p_path LIKE 'inventory-images/' || p_inventory_id::text || '/%'");
      expect(sql).toContain('storage.objects');
      expect(sql).toContain('FOR UPDATE');
      expect(sql).toContain("RAISE EXCEPTION 'object % does not exist in inventory-images bucket'");
    });

    it(`${label}: stock RPCs refuse archived/discontinued/deleted rows`, () => {
      const guards = countOccurrences(sql, "status NOT IN ('archived','discontinued','deleted')");
      expect(guards).toBeGreaterThanOrEqual(3);
    });

    it(`${label}: EXECUTE is revoked from PUBLIC for all 14 inventory functions`, () => {
      const revokes = countOccurrences(sql, 'REVOKE ALL ON FUNCTION');
      expect(revokes).toBe(14);
    });

    it(`${label}: realtime uses guarded ALTER PUBLICATION, not raw internal-table inserts`, () => {
      expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items');
      expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_images');
    });

    it(`${label}: UUID generation is consistent via gen_random_uuid()`, () => {
      expect(sql).not.toContain('uuid_generate_v4');
      expect(countOccurrences(sql, 'gen_random_uuid()')).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('02-inventory-rollback.sql (G1/G2/G3)', () => {
  it('deletes storage objects before dropping the bucket — no orphans (G1)', () => {
    const objectsDelete = rollbackSql.indexOf("DELETE FROM storage.objects WHERE bucket_id = 'inventory-images'");
    const bucketDrop = rollbackSql.indexOf("DELETE FROM storage.buckets WHERE id = 'inventory-images'");
    expect(objectsDelete).toBeGreaterThan(-1);
    expect(bucketDrop).toBeGreaterThan(objectsDelete);
  });

  it('storage policy names match the final names created in 01 (G2/H12)', () => {
    for (const name of [
      'Public read inventory-images',
      'Staff upload inventory-images',
      'Staff update inventory-images',
      'Staff delete inventory-images',
    ]) {
      expect(applySql, `01 must create policy "${name}"`).toContain(`CREATE POLICY "${name}"`);
      expect(rollbackSql, `02 must drop policy "${name}"`).toContain(
        `DROP POLICY IF EXISTS "${name}" ON storage.objects`,
      );
    }
  });

  it('warns that rollback erases central data (G3)', () => {
    expect(rollbackSql).toContain('ERASES central data');
  });
});

describe('03-pre-apply-evidence.sql (E1/E2/E3)', () => {
  it('proves table absence with to_regclass, never queries non-existent tables (E1)', () => {
    expect(countOccurrences(evidenceSql, 'to_regclass')).toBeGreaterThanOrEqual(4);
    expect(evidenceSql).not.toMatch(/FROM\s+public\.inventory_(items|images|movements)/);
  });

  it('checks functions, bucket, storage policies, publication, uuid generator, users.id (E2)', () => {
    expect(evidenceSql).toContain("p.proname LIKE 'inventory_%'");
    expect(evidenceSql).toContain("storage.buckets WHERE id = 'inventory-images'");
    expect(evidenceSql).toContain('pg_policies');
    expect(evidenceSql).toContain('pg_publication_tables');
    expect(evidenceSql).toContain("pubname = 'supabase_realtime'");
    expect(evidenceSql).toContain("p.proname = 'gen_random_uuid'");
    expect(evidenceSql).toContain("table_name = 'users' AND column_name = 'id'");
  });

  it('proves at least one admin/super_admin exists before apply (E3)', () => {
    expect(evidenceSql).toContain("role IN ('admin','super_admin')");
  });
});

describe('04-post-apply-verify.sql (G4/G5/G6)', () => {
  it('checks the admin baseline via public.users, not auth.uid() (G4)', () => {
    expect(verifySql).toContain("FROM public.users WHERE role IN ('admin','super_admin')");
    expect(verifySql).not.toContain('auth.uid()');
  });

  it('verifies storage policies and absence of PUBLIC EXECUTE (G5)', () => {
    expect(verifySql).toContain("'Staff upload inventory-images'");
    expect(verifySql).toContain("'Staff update inventory-images'");
    expect(verifySql).toContain("'Staff delete inventory-images'");
    expect(verifySql).toContain('14_no_public_exec');
  });

  it('pins the exact RPC count to 14 and the realtime contract (G6)', () => {
    expect(verifySql).toContain('EXACTLY 14 functions');
    expect(verifySql).toContain("proname LIKE 'inventory_%'");
    expect(verifySql).toContain("'10_no_inventory_central_pub'");
    expect(verifySql).toContain("'15_realtime_tables'");
    expect(verifySql).toContain('pg_publication_tables');
  });
});

describe('H13 ownership model', () => {
  it('management list enforces admin-only via the single authorization gate inventory_is_admin()', () => {
    const mgmtStart = applySql.indexOf('CREATE OR REPLACE FUNCTION public.inventory_management_list');
    const mgmtEnd = applySql.indexOf('GRANT EXECUTE ON FUNCTION public.inventory_management_list');
    const mgmt = applySql.slice(mgmtStart, mgmtEnd);
    expect(mgmt).toContain('IF NOT public.inventory_is_admin() THEN');
    expect(mgmt).not.toContain('researcher');

    const adminStart = applySql.indexOf('CREATE OR REPLACE FUNCTION public.inventory_is_admin');
    const adminEnd = applySql.indexOf('GRANT EXECUTE ON FUNCTION public.inventory_is_admin');
    const adminGate = applySql.slice(adminStart, adminEnd);
    expect(adminGate).toContain("u.role IN ('admin','super_admin')");
    expect(adminGate).not.toContain('researcher');

    const movementsStart = applySql.indexOf('CREATE POLICY "Staff read inventory movements"');
    const movementsEnd = applySql.indexOf('REVOKE ALL ON public.inventory_items');
    const movementsPolicy = applySql.slice(movementsStart, movementsEnd);
    expect(movementsPolicy).toContain("u.role IN ('admin','super_admin','researcher')");
  });
});
