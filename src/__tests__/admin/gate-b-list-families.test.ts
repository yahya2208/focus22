/**
 * GATE B — pilot_admin_list_families guard + projection (00122).
 *
 * Static contract on the migration text (?raw pattern) plus the consumer
 * contract for adminListFamilies(): the RPC keeps its name/zero-args, gains
 * an in-function admin gate, and returns exactly the five columns the
 * Command Center reads. Pins the migration — touches no database.
 */
import { describe, expect, it, vi } from 'vitest';
import migration122 from '../../../supabase/migrations/00122_gate_b_admin_list_families_guard.sql?raw';

function functionBody(): string {
  const start = migration122.indexOf(
    'CREATE OR REPLACE FUNCTION public.pilot_admin_list_families()',
  );
  const end = migration122.indexOf('$$;', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration122.slice(start, end);
}

describe('GATE B — admin authorization inside the function (T1/T2)', () => {
  it('T1: admin gate uses the canonical fn_admin_uid idiom', () => {
    expect(functionBody()).toContain('public.fn_admin_uid() IS NOT NULL');
  });

  it('T2: non-admin callers receive zero rows (deny-by-empty, LANGUAGE sql)', () => {
    const body = functionBody();
    // No procedural raise is possible in LANGUAGE sql; the WHERE gate is the
    // enforcement point — a NULL fn_admin_uid() matches nothing.
    expect(body).toMatch(/WHERE\s+public\.fn_admin_uid\(\)\s+IS\s+NOT\s+NULL/);
  });

  it('does not resurrect the dead pilot_admin_require helper', () => {
    expect(functionBody()).not.toContain('pilot_admin_require');
  });
});

describe('GATE B — projection narrowed to consumer columns (T3/T4)', () => {
  it('T3: return type is exactly the five consumed columns', () => {
    expect(functionBody()).toMatch(
      /RETURNS TABLE\s*\(\s*id\s+uuid,\s*name\s+text,\s*name_ar\s+text,\s*slug\s+text,\s*status\s+text\s*\)/,
    );
    expect(functionBody()).toMatch(
      /SELECT\s+fg\.id,\s*fg\.name,\s*fg\.name_ar,\s*fg\.slug,\s*fg\.status/,
    );
  });

  it('T4: no PII or timestamp column can leave through this path', () => {
    const body = functionBody();
    for (const col of [
      'contact_name',
      'contact_phone',
      'contact_address',
      'contact_notes',
      'preferred_delivery_time',
      'veg_notes',
      'description',
      'created_at',
      'updated_at',
    ]) {
      expect(body).not.toContain(col);
    }
    expect(body).not.toContain('fg.*');
    expect(body).not.toContain('SETOF public.family_groups');
  });
});

describe('GATE B — security properties preserved (T6)', () => {
  it('LANGUAGE sql, STABLE, SECURITY DEFINER, pinned search_path', () => {
    const body = functionBody();
    expect(body).toContain('LANGUAGE sql');
    expect(body).toContain('STABLE');
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toMatch(/SET\s+search_path\s*=\s*''/);
  });

  it('intended ACL: authenticated only — no anon, no PUBLIC', () => {
    expect(migration122).toContain(
      'GRANT EXECUTE ON FUNCTION public.pilot_admin_list_families() TO authenticated',
    );
    expect(migration122).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.pilot_admin_list_families\(\)[^;]*TO\s+(anon|PUBLIC)/,
    );
  });

  it('redefines nothing else and touches no historical migration surface', () => {
    const creates = migration122.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    expect(creates.length).toBe(1);
  });
});

describe('GATE B — existing consumer contract intact (T5)', () => {
  it('adminListFamilies still calls the same RPC name with no args', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ id: 'f1', name: 'Al-Rayan', name_ar: 'الريان', slug: 'al-rayan', status: 'active' }],
      error: null,
    }));
    vi.doMock('../../core/supabase/client', () => ({
      getSupabaseClient: () => ({ rpc }),
    }));
    const { adminListFamilies } = await import('../../services/neighborhood-service');
    const rows = await adminListFamilies();
    expect(rpc).toHaveBeenCalledWith('pilot_admin_list_families', {});
    expect(rows[0]).toMatchObject({ id: 'f1', name: 'Al-Rayan', slug: 'al-rayan', status: 'active' });
    vi.doUnmock('../../core/supabase/client');
  });
});
