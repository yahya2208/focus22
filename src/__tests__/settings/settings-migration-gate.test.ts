import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Phase 7 — offline structural verification of migration 00059
 * (app_settings + get_settings + set_setting). No live DB: asserts the
 * server-side contract, security invariants, validation, and that it stays
 * purely additive (never touches 00057/00058/telemetry/ROLE_PERMISSIONS).
 */

const MIGRATION = path.resolve(__dirname, '../../../supabase/migrations/00059_settings_control_center.sql');
const VERIFY = path.resolve(__dirname, '../../../supabase/verify/settings_control_center.sql');

const sql = fs.readFileSync(MIGRATION, 'utf-8');
const lower = sql.toLowerCase();

describe('00059 settings control center — existence & numbering', () => {
  it('migration and verify files exist', () => {
    expect(fs.existsSync(MIGRATION)).toBe(true);
    expect(fs.existsSync(VERIFY)).toBe(true);
  });

  it('defines public.app_settings with the minimal schema', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.app_settings');
    for (const col of ['key', 'value', 'category', 'type', 'updated_by', 'updated_at']) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain('key        text PRIMARY KEY');
  });

  it('defines get_settings() and set_setting(text, jsonb)', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_settings()');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value jsonb)');
  });
});

describe('00059 — security contract', () => {
  it('both RPCs are SECURITY DEFINER with hardened search_path', () => {
    expect(lower).toContain('security definer');
    expect(sql).toContain("SET search_path = ''");
  });

  it('RPCs authorize INSIDE against public.users.role', () => {
    expect(sql).toContain('FROM public.users u WHERE u.id = v_uid');
    // get_settings allows admin/super_admin/researcher readers
    expect(sql).toContain("v_role NOT IN ('admin', 'super_admin', 'researcher')");
    expect(sql).toContain("RETURN jsonb_build_object('error', 'UNAUTHORIZED')");
  });

  it('set_setting restricts WRITERS to admin/super_admin ONLY (FORBIDDEN otherwise)', () => {
    // writers are admin/super_admin only; get_settings allows researcher readers
    expect(sql).toContain("v_role NOT IN ('admin', 'super_admin')");
    expect(sql).toContain("RETURN jsonb_build_object('error', 'FORBIDDEN')");
    // the get_settings authorizer includes researcher; the set authorizer does not
    const getBlock = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_settings()'), sql.indexOf('CREATE OR REPLACE FUNCTION public.set_setting'));
    const setBlock = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.set_setting'));
    expect(getBlock).toContain("('admin', 'super_admin', 'researcher')");
    expect(setBlock).toContain("('admin', 'super_admin')");
    // set_setting's authorization must NOT grant researcher write: assert the only
    // role list in the set authorizer is (admin, super_admin).
    const roleChecks = setBlock.match(/NOT IN \('[^']+'(?:, '[^']+')*\)/g) ?? [];
    for (const check of roleChecks) {
      expect(check).not.toContain('researcher');
    }
  });

  it('rejects anonymous callers (auth.uid() IS NULL)', () => {
    expect(sql).toContain('IF v_uid IS NULL THEN');
    expect(sql).toContain("RETURN jsonb_build_object('error', 'UNAUTHORIZED')");
  });

  it('enables RLS and never grants direct table access', () => {
    expect(sql).toContain('ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON public.app_settings FROM anon');
    expect(sql).toContain('REVOKE ALL ON public.app_settings FROM authenticated');
    expect(sql).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+public\.app_settings/i);
    expect(sql).not.toContain('CREATE POLICY');
  });

  it('grants RPC EXECUTE to authenticated, never anon', () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_settings\(\) TO authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_setting\(text, jsonb\) TO authenticated;/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_settings() FROM PUBLIC');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.set_setting(text, jsonb) FROM PUBLIC');
    expect(sql).not.toMatch(/TO anon/);
  });

  it('does not modify 00057 / 00058 / telemetry / RBAC / frozen migrations', () => {
    // must not REDEFINE or DROP the existing telemetry functions
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.record_telemetry_event');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.get_telemetry_analytics');
    // no executable DROP/ALTER/POLICY statements (rollback notes in comments are fine)
    const executableLines = sql.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--'));
    for (const line of executableLines) {
      expect(line).not.toMatch(/^(DROP|ALTER TABLE public\.telemetry_events|CREATE POLICY)/);
    }
    // must not read/write the telemetry_events table
    expect(sql).not.toContain('FROM public.telemetry_events');
    expect(sql).not.toContain('INTO public.telemetry_events');
    expect(sql).not.toContain('UPDATE public.telemetry_events');
    // no RBAC changes (checked on executable lines only — comments reference them)
    expect(executableLines.join('\n')).not.toContain('ROLE_CAPABILITY_MAP');
    expect(executableLines.join('\n')).not.toContain('ROLE_PERMISSIONS');
  });
});

describe('00059 — server-side validation (closed registry + bounds)', () => {
  it('rejects unregistered keys in set_setting', () => {
    expect(sql).toContain("RETURN jsonb_build_object('error', 'INVALID_KEY'");
  });

  it('rejects non-numeric values', () => {
    expect(sql).toContain("jsonb_typeof(p_value) <> 'number'");
    expect(sql).toContain("'error', 'INVALID_TYPE'");
  });

  it('rejects non-finite values', () => {
    expect(sql).toContain('INVALID_VALUE');
  });

  it('enforces numeric bounds server-side and rejects out-of-range', () => {
    expect(sql).toContain('OUT_OF_RANGE');
    expect(sql).toContain('v_num < v_min OR v_num > v_max');
    // cache cap is bounded to avoid memory exhaustion
    expect(sql).toContain("WHEN 'cache.max_entries'");
    expect(sql).toContain('v_max := 100000');
  });

  it('seeds defaults so the registry and table never diverge', () => {
    expect(lower).toContain('jsonb_build_object');
    expect(sql).toContain("'game.rounds'");
    expect(sql).toContain("'inventory.overstock_multiplier'");
    expect(sql).toContain("'cache.max_entries'");
    expect(sql).toContain('ON CONFLICT (key) DO NOTHING');
  });

  it('sets updated_by/updated_at server-side (never client-supplied)', () => {
    // updated_by is derived from auth.uid() via v_uid; timestamp from now()
    expect(sql).toContain('v_uid      uuid := auth.uid();');
    expect(sql).toContain('VALUES (v_meta.key, jsonb_build_object(\'value\', v_num), v_meta.category, v_meta.type, v_uid, now())');
    // the client never passes updated_by/updated_at as RPC params
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value jsonb)');
  });
});

describe('00059 — audit trail', () => {
  it('keeps updated_by / updated_at columns, derived server-side', () => {
    expect(sql).toContain('updated_by uuid');
    expect(sql).toContain('updated_at timestamptz NOT NULL DEFAULT now()');
  });
});

describe('00059 — registered setting count matches the client registry', () => {
  it('registers exactly the SAFE settings from Phase 6 (17 keys)', () => {
    const registered = [
      'game.rounds', 'game.min_delay_ms', 'game.max_delay_ms', 'game.min_position_distance_pct',
      'offers.default_discount_percent', 'offers.default_max_usage',
      'offers.return_discount_percent', 'offers.whatsapp_discount_percent', 'offers.whatsapp_max_usage',
      'inventory.overstock_multiplier',
      'rules.inventory_low_threshold', 'rules.device_visitors_threshold',
      'rules.trade_conversion_threshold', 'rules.visitor_count_threshold',
      'rules.default_threshold', 'rules.needs_discount_visit_count',
      'cache.max_entries',
    ];
    for (const key of registered) {
      expect(sql, `migration missing registered key '${key}'`).toContain(`'${key}'`);
    }
    // Safety: it must NOT contain the vulnerability-relevant keys as editable settings.
    for (const forbidden of ['purchaseProbability', 'USE_NEW_GALLERY', 'MAX_STACK_DEPTH', 'LAMP_SIZE']) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it('verify script references table, RPCs, RLS, and grants', () => {
    const v = fs.readFileSync(VERIFY, 'utf-8');
    expect(v).toContain('app_settings');
    expect(v).toContain('get_settings');
    expect(v).toContain('set_setting');
    expect(v).toContain('relrowsecurity');
    expect(v).toContain('routine_privileges');
  });
});
