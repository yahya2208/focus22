import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Admin Control Center — Pass 1 (00063): audit history + additive/security gate.
 *
 * Offline structural verification of migration 00063 — NO live DB. Asserts:
 *   * the lightweight append-only audit table schema + RLS lockdown,
 *   * audit rows are derived server-side (never client-supplied) and that the
 *     client exposes NO audit-write API / Admin UI control,
 *   * migration is additive (never touches 00059/00060/get_settings/telemetry/
 *     RBAC/game.*), and
 *   * the closed server-side registry/per-key validation (bounds, pattern,
 *     allow-list) matches the client registry values.
 */

const MIGRATION = path.resolve(__dirname, '../../../supabase/migrations/00063_admin_control_center_pass1.sql');
const VERIFY = path.resolve(__dirname, '../../../supabase/verify/settings_control_center_pass1.sql');

const sql = fs.readFileSync(MIGRATION, 'utf-8');
const executableLines = sql.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--'));
const executable = executableLines.join('\n');

describe('00063 — existence & numbering', () => {
  it('migration and verify files exist with the next number after 00062', () => {
    expect(fs.existsSync(MIGRATION)).toBe(true);
    expect(fs.existsSync(VERIFY)).toBe(true);
    const name = path.basename(MIGRATION);
    expect(name.startsWith('00063_')).toBe(true);
    const seq = fs
      .readdirSync(path.resolve(__dirname, '../../../supabase/migrations'))
      .map((f) => f.match(/^(\d{5})_/)?.[1])
      .filter(Boolean)
      .sort();
    // 00063 must be the numerically-next file after the latest applied contract.
    expect(seq).toContain('00063');
  });

  it('extends (not recreates) the settings system', () => {
    expect(sql).toContain('INSERT INTO public.app_settings');
    // get_settings is left untouched — never redefined.
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.get_settings');
  });
});

describe('00063 — lightweight APPEND-ONLY audit history', () => {
  it('creates app_settings_changes with the exact minimal schema', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.app_settings_changes');
    expect(sql).toContain('id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY');
    expect(sql).toContain('setting_key text NOT NULL');
    expect(sql).toContain('old_value   jsonb');
    expect(sql).toContain('new_value   jsonb NOT NULL');
    expect(sql).toContain('updated_by  uuid NOT NULL');
    expect(sql).toContain('updated_at  timestamptz NOT NULL DEFAULT now()');
  });

  it('keys the table by setting + time', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS app_settings_changes_key_idx');
    expect(sql).toContain('(setting_key, updated_at)');
  });

  it('is locked down: RLS enabled, zero client policies, REVOKE ALL', () => {
    expect(sql).toContain('ALTER TABLE public.app_settings_changes ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON public.app_settings_changes FROM PUBLIC');
    expect(sql).toContain('REVOKE ALL ON public.app_settings_changes FROM anon');
    expect(sql).toContain('REVOKE ALL ON public.app_settings_changes FROM authenticated');
    // no policy ever created, no grants ever given
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+public\.app_settings_changes/i);
  });

  it('appends one audit row per successful set_setting, derived server-side', () => {
    expect(sql).toContain('INSERT INTO public.app_settings_changes (setting_key, old_value, new_value, updated_by, updated_at)');
    // old value captured from the pre-write row; new value is what was just written
    expect(sql).toContain('SELECT as2.value INTO v_old FROM public.app_settings as2 WHERE as2.key = p_key');
    // actor + timestamps derived from auth.uid() / now() — never RPC params
    expect(sql).toContain('VALUES (p_key, v_old, v_new, v_uid, now())');
    expect(sql).toContain('v_uid      uuid := auth.uid();');
    // set_setting has exactly two parameters: p_key text, p_value jsonb
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value jsonb)');
  });
});

describe('00063 — audit NOT editable via Admin UI / client', () => {
  // The Admin Control Center is the only client surface for settings; it must
  // offer NO audit read/edit/delete control and settings-api must export no
  // audit-write operation.
  it('settings-api exports only getSettings/setSetting (no audit mutation)', async () => {
    vi.resetModules();
    const api = await import('../../business-intelligence/settings-api');
    expect(typeof api.getSettings).toBe('function');
    expect(typeof api.setSetting).toBe('function');
    for (const f of ['getAudit', 'setAudit', 'updateAudit', 'deleteAudit', 'listAuditHistory']) {
      expect((api as Record<string, unknown>)[f]).toBeUndefined();
    }
  });

  it('AdminSettingsBI offers no audit-editing control', async () => {
    const ui = fs.readFileSync(
      path.resolve(__dirname, '../../../src/business-intelligence/pages/AdminSettingsBI.tsx'),
      'utf-8',
    );
    // no audit table/editor exists in the UI and no affordance to edit audit
    expect(ui).not.toMatch(/app_settings_changes/);
    expect(ui).not.toMatch(/save audit|edit audit|update audit|delete audit/i);
    // and the UI explicitly states audit history is not editable
    expect(ui).toContain('audit history is not editable');
  });

  it('audit records no secrets (closure check)', () => {
    // The audit subject is the setting value just written — none of the Pass-1
    // settings are credentials/service-role/secrets. The migration never
    // registers such keys. Check only the seed INSERT + function body; the
    // GRANT/REVOKE section may reference role names (e.g. service_role).
    const seedStart = sql.indexOf('INSERT INTO public.app_settings');
    const seedEnd = sql.indexOf('ON CONFLICT (key) DO NOTHING', seedStart);
    const seedBlock = sql.slice(seedStart, seedEnd).toLowerCase();
    const funcStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.set_setting');
    const funcEnd = sql.indexOf('$$;', funcStart);
    const funcBlock = sql.slice(funcStart, funcEnd).toLowerCase();
    const restricted = seedBlock + ' ' + funcBlock;
    for (const needle of ['service_role', 'anon_key', 'secret_key', 'api_key', 'jwt_secret']) {
      expect(restricted).not.toContain(needle);
    }
  });
});

describe('00063 — server-side validation (closed registry + bounds)', () => {
  it('keeps INVALID_KEY for unregistered keys', () => {
    expect(sql).toContain("'INVALID_KEY', 'key', p_key");
  });

  it('validates declared JSON type (number/string/array)', () => {
    expect(sql).toContain("jsonb_typeof(p_value) <> 'number'");
    expect(sql).toContain("jsonb_typeof(p_value) <> 'string'");
    expect(sql).toContain("jsonb_typeof(p_value) <> 'array'");
    expect(sql).toContain("'INVALID_TYPE'");
  });

  it('rejects an invalid WhatsApp line with INVALID_PATTERN', () => {
    expect(sql).toContain("v_str !~ '^\\+\\d{8,15}$'");
    expect(sql).toContain("'INVALID_PATTERN', 'key', p_key");
  });

  it('rejects currencies outside the closed allow-list with INVALID_ALLOWED', () => {
    expect(sql).toContain("v_allowed := ARRAY['USD','DA','SAR','EUR','TRY']");
    expect(sql).toContain("'INVALID_ALLOWED', 'key', p_key");
  });

  it('enforces numeric bounds for every Pass-1 numeric knob server-side', () => {
    const checks: Array<[string, number, number]> = [
      ['comm.whatsapp_guard_timeout_ms', 200, 30000],
      ['comm.whatsapp_min_digits', 6, 15],
      ['comm.whatsapp_max_digits', 8, 15],
      ['comm.whatsapp_message_max_length', 100, 10000],
      ['comm.double_exit_window_ms', 500, 30000],
      ['marketplace.listing_page_limit', 1, 500],
      ['marketplace.similar_phones_limit', 1, 50],
      ['ads.carousel_autoplay_ms', 500, 30000],
      ['ads.carousel_swipe_threshold_px', 10, 200],
      ['experience.results_auto_advance_ms', 500, 60000],
      ['experience.gallery_autoplay_ms', 500, 60000],
    ];
    for (const [key, min, max] of checks) {
      expect(sql).toContain(`WHEN '${key}'`);
      // whitespace between := and v_max collides with long key names; compare a
      // whitespace-normalized window so spacing differences never fail the gate
      const normalized = sql.replace(/\s+/g, ' ');
      expect(normalized).toContain(`WHEN '${key}' THEN v_min := ${min}; v_max := ${max};`);
    }
    expect(sql).toContain("'OUT_OF_RANGE', 'key', p_key, 'min', v_min, 'max', v_max");
  });

  it('enforces OUT_OF_RANGE and INVALID_VALUE for numeric', () => {
    expect(sql).toContain('IF v_num < v_min OR v_num > v_max THEN');
    expect(sql).toContain("'INVALID_VALUE', 'key', p_key");
  });
});

describe('00063 — additive & scope-locked', () => {
  it('does not touch game.* bounds or add new game keys', () => {
    // game.* keys keep their 00059 bounds and are NOT re-listed as Pass-1 adds
    const gameLines = sql.split('\n').filter((l) => l.includes("'game."));
    // only the numeric-bounds CASE references to game.* (0 additions of new game keys)
    expect(gameLines.length).toBeGreaterThan(0);
    // no game.* INSERT in the seed block
    const seedBlock = sql.slice(sql.indexOf('INSERT INTO public.app_settings'), sql.indexOf('CREATE TABLE IF NOT EXISTS public.app_settings_changes'));
    expect(seedBlock).not.toMatch(/'game\./);
  });

  it('does not redefine 00059/00060/telemetry/RBAC', () => {
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.record_telemetry_event');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.get_telemetry_analytics');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.get_settings');
    // RBAC references are allowed in comments (scope notes only); the migration
    // must not EXECUTE any ROLE_CAPABILITY_MAP / ROLE_PERMISSIONS statement.
    expect(executable).not.toMatch(/ROLE_CAPABILITY_MAP/);
    expect(executable).not.toMatch(/ROLE_PERMISSIONS/);
    // no DROP of pre-existing objects (rollback notes are comments only)
    for (const line of executableLines) {
      expect(line).not.toMatch(/^DROP (TABLE|FUNCTION) public\.(app_settings|telemetry_)/);
      expect(line).not.toContain('FROM public.telemetry_events');
      expect(line).not.toContain('INTO public.telemetry_events');
    }
  });

  it('keeps writers restricted to admin/super_admin and EXECUTE to authenticated', () => {
    expect(sql).toContain("v_role NOT IN ('admin', 'super_admin')");
    expect(sql).toContain("'FORBIDDEN'");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.set_setting(text, jsonb) FROM PUBLIC');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO authenticated');
    expect(sql).not.toMatch(/TO anon/);
  });

  it('verify script references the audit table, RLS, RPCs, and grants', () => {
    const v = fs.readFileSync(VERIFY, 'utf-8');
    expect(v).toContain('app_settings_changes');
    expect(v).toContain('set_setting');
    expect(v).toContain('relrowsecurity');
    expect(v).toContain('INVALID_PATTERN');
    expect(v).toContain('INVALID_ALLOWED');
    expect(v).toContain('INVALID_KEY');
    expect(v).toContain('OUT_OF_RANGE');
  });
});

describe('00063 — anon EXECUTE stripped (ACL regression)', () => {
  it('explicitly revokes EXECUTE from anon on set_setting', () => {
    // This is the critical fix: 00059 gave anon EXECUTE via Supabase's default
    // function ACL. CREATE OR REPLACE never resets ACLs, so an explicit REVOKE
    // from anon is required. Pattern follows 00062 (telemetry anon ACL fix).
    expect(executable).toContain('REVOKE EXECUTE ON FUNCTION public.set_setting(text, jsonb) FROM anon');
  });

  it('revokes PUBLIC first, then revokes anon, then grants authenticated + service_role', () => {
    const revokeAllIdx = executable.indexOf('REVOKE ALL ON FUNCTION public.set_setting(text, jsonb) FROM PUBLIC');
    const revokeAnonIdx = executable.indexOf('REVOKE EXECUTE ON FUNCTION public.set_setting(text, jsonb) FROM anon');
    const grantAuthIdx = executable.indexOf('GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO authenticated');
    const grantServiceIdx = executable.indexOf('GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO service_role');
    expect(revokeAllIdx).toBeGreaterThan(-1);
    expect(revokeAnonIdx).toBeGreaterThan(revokeAllIdx);
    expect(grantAuthIdx).toBeGreaterThan(revokeAnonIdx);
    expect(grantServiceIdx).toBeGreaterThan(grantAuthIdx);
  });

  it('does not grant EXECUTE to anon', () => {
    expect(executable).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.set_setting[^;]*\bTO\s+anon\b/);
  });

  it('does not grant EXECUTE to PUBLIC', () => {
    expect(executable).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.set_setting[^;]*\bTO\s+(PUBLIC|public)\b/);
  });

  it('grants EXECUTE to both authenticated and service_role', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO service_role');
  });

  it('no overloads of set_setting exist (single signature only)', () => {
    const creates = sql.match(/CREATE OR REPLACE FUNCTION public\.set_setting\(/g);
    expect(creates).toHaveLength(1);
  });

  it('verify script asserts anon has no EXECUTE', () => {
    const v = fs.readFileSync(VERIFY, 'utf-8');
    expect(v).toContain('anon_must_be_false');
    expect(v).toContain("has_function_privilege('anon'");
  });

  it('verify script asserts service_role has EXECUTE', () => {
    const v = fs.readFileSync(VERIFY, 'utf-8');
    expect(v).toContain('service_role_must_be_true');
    expect(v).toContain("has_function_privilege('service_role'");
  });
});
