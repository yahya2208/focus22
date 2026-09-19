/**
 * GATE 8B Step 1 — SECURE NEW-AUTH PILOT PROVISIONING (00083 + Edge Function).
 * Offline, structural: asserts the owner-only provisioning RPC and the
 * `create-pilot-account` Edge Function close the GATE 8A Option-B gap WITHOUT
 * reopening GATE 7 (00080/00081/00082), without bypassing the membership
 * ledger/state machine, without service-role leakage to the browser, and
 * without readiness/pilot-start.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M83 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00083_pilot_provision_new_membership.sql'),
  'utf-8',
);
const FN = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/functions/create-pilot-account/index.ts'),
  'utf-8',
);
const CFG = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/config.toml'),
  'utf-8',
);

const M80 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00080_admin_assignment.sql'), 'utf-8');
const M81 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00081_pilot_account_provisioning.sql'), 'utf-8');
const M82 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00082_operational_orders_realtime.sql'), 'utf-8');

// Extract a function definition (verbatim text between CREATE and the next
// GRANT/REVOKE/CREATE/DO boundary) — mirrors existing pilot test conventions.
const RPC_BODY = (sql: string, name: string): string => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined`).toBeGreaterThan(-1);
  const tail = sql.slice(start);
  const end = tail.search(/\nGRANT |\nREVOKE |\nCREATE OR REPLACE FUNCTION public\.|\nDO \$\$/);
  return (end === -1 ? tail : tail.slice(0, end));
};

describe('00083 — scope & boundary (GATE 7 untouched)', () => {
  it('adds the provisioning RPC without touching GATE 7 migrations', () => {
    expect(M83).toContain('CREATE OR REPLACE FUNCTION public.pilot_provision_new_membership');
    // No order/lifecycle/assignment/admin-RPC redefinition, no telemetry/RBAC.
    for (const r of [
      'pilot_admin_set_operator_status',
      'pilot_admin_set_courier_status',
      'pilot_admin_assign_order',
      'pilot_courier_set_status',
      'pilot_order_set_status',
      'record_telemetry_event',
      'fn_admin_uid',
    ]) {
      expect(M83).not.toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
  });

  it('never introduces readiness / pilot-start / GPS concepts', () => {
    for (const needle of [
      'operational_ready', 'READY_INTENT', 'store_ready', 'courier_ready',
      'pilot_ready', 'pilot_start', 'check_in', 'geofence',
      'latitude', 'longitude', 'geolocation', 'PostGIS',
    ]) {
      expect(M83.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });

  it('does not recreate the membership ledgers or the audit ledger', () => {
    expect(M83).not.toContain('CREATE TABLE IF NOT EXISTS public.pilot_store_operators');
    expect(M83).not.toContain('CREATE TABLE IF NOT EXISTS public.pilot_couriers');
    expect(M83).not.toContain('CREATE TABLE IF NOT EXISTS public.pilot_membership_history');
    expect(M83).not.toContain('CREATE TABLE public.pilot_store_operators');
    expect(M83).not.toContain('CREATE TABLE public.pilot_couriers');
  });
});

describe('00083 — owner-only provisioning RPC', () => {
  const RPC = RPC_BODY(M83, 'pilot_provision_new_membership');

  it('is SECURITY DEFINER with a fixed empty search_path', () => {
    expect(RPC).toContain('SECURITY DEFINER');
    expect(RPC).toContain("SET search_path = ''");
  });

  it('has the exact minimal input contract (role, store, user, actor, reason)', () => {
    expect(RPC).toContain('p_role        text');
    expect(RPC).toContain('p_store_id    uuid');
    expect(RPC).toContain('p_user_id     uuid');
    expect(RPC).toContain('p_actor_user_id uuid');
    expect(RPC).toContain('p_reason      text DEFAULT');
  });

  it('accepts ONLY operator|courier role', () => {
    expect(RPC).toContain('NOT IN (\'operator\', \'courier\')');
    expect(RPC).toMatch(/ARGUMENTS_INVALID/);
  });

  it('creates memberships ONLY as pending — never active', () => {
    expect(RPC).toMatch(/INSERT INTO public\.pilot_store_operators \(store_id, user_id, status\)\s+VALUES \(p_store_id, p_user_id, 'pending'\);/);
    expect(RPC).toMatch(/INSERT INTO public\.pilot_couriers \(user_id, store_id, status\)\s+VALUES \(p_user_id, p_store_id, 'pending'\);/);
    expect(RPC).not.toMatch(/VALUES \(p_store_id, p_user_id, 'active'\)/);
    expect(RPC).not.toMatch(/VALUES \(p_user_id, p_store_id, 'active'\)/);
    // No literal 'active' may be written to either membership table by this RPC.
    expect(RPC).not.toMatch(/pilot_store_operators[^;]*'active'/g);
    const memberInserts = RPC.match(/INSERT INTO public\.(pilot_store_operators|pilot_couriers)/g) ?? [];
    expect(memberInserts.length).toBe(2);
  });

  it('writes the audit event via the EXISTING ledger helper (atomic, same tx)', () => {
    expect(RPC).toContain('PERFORM public.pilot_write_membership_event(');
    expect(RPC).toContain("'pending', p_actor_user_id");
    expect(RPC).not.toContain('INSERT INTO public.pilot_membership_history');
  });

  it('rejects existing active/suspended/inactive memberships deterministically', () => {
    expect(RPC).toContain('TRANSITION_NOT_ALLOWED');
    expect(RPC).toContain('IF v_existing = \'pending\' THEN');
    expect(RPC).toContain("'status', 'pending', 'event_type', 'noop', 'created', false");
  });

  it('is idempotent for an existing pending membership (no duplicate, no ledger on noop)', () => {
    expect(RPC).toContain("v_existing = 'pending'");
    expect(RPC).toContain("'event_type', 'noop'");
  });

  it('enforces the operator/courier role conflict at the same store', () => {
    expect(RPC).toContain("v_old = 'active'");
    expect(RPC).toContain('ROLE_CONFLICT');
  });

  it('requires the actor to be a REAL admin (audit integrity, defense-in-depth)', () => {
    expect(RPC).toContain("u.role IN ('admin', 'super_admin')");
    expect(RPC).toContain('PERMISSION_DENIED');
  });

  it('rejects dangling store references', () => {
    expect(RPC).toContain('STORE_NOT_FOUND');
  });
});

describe('00083 — EXECUTE boundary (service_role ONLY)', () => {
  it('grants EXECUTE to service_role', () => {
    expect(M83).toMatch(/GRANT EXECUTE ON FUNCTION public\.pilot_provision_new_membership[\s\S]*?TO service_role;/);
  });

  it('explicitly revokes PUBLIC, anon, authenticated (and service_role before grant)', () => {
    expect(M83).toContain('REVOKE ALL ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM PUBLIC;');
    for (const who of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      expect(M83).toContain(`REVOKE EXECUTE ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM ${who};`);
    }
    // The provisioning RPC is granted to service_role ONLY — authenticated /
    // anon must never receive EXECUTE on it.
    const grantIdx = M83.indexOf('GRANT EXECUTE ON FUNCTION public.pilot_provision_new_membership');
    expect(grantIdx).toBeGreaterThan(-1);
    const grantLine = M83.slice(grantIdx, M83.indexOf(';', grantIdx) + 1);
    expect(grantLine).toContain('TO service_role');
    expect(grantLine).not.toContain('authenticated');
    expect(grantLine).not.toContain('anon');
  });

  it('runs a post-apply integrity gate (loud fail on drift)', () => {
    expect(M83).toContain('INTEGRITY_PROVISION_AUDIT_MISSING');
    expect(M83).toContain('INTEGRITY_PROVISION_NOT_PENDING');
    expect(M83).toContain('INTEGRITY_PROVISION_EXISTING_REJECT_MISSING');
    expect(M83).toContain('INTEGRITY_PROVISION_ADMIN_ACTOR_MISSING');
    expect(M83).toContain('INTEGRITY_PROVISION_SERVICE_ROLE_EXECUTE_MISSING');
    expect(M83).toContain('INTEGRITY_PROVISION_AUTHENTICATED_EXECUTE_OPEN');
    expect(M83).toContain('INTEGRITY_PROVISION_ANON_EXECUTE_OPEN');
    expect(M83).toContain('INTEGRITY_PROVISION_LEDGER_WRITE_OPEN');
  });
});

describe('Edge Function — create-pilot-account', () => {
  it('holds the service-role credential ONLY in the server environment', () => {
    expect(FN).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(FN).not.toMatch(/const [A-Z_]*(SERVICE|SECRET|KEY|ROLE)[A-Z_]*\s*=\s*["'][^"']+["']\s*;?/);
    // No hardcoded JWT/secret literal anywhere in the function source.
    expect(FN).not.toMatch(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
    // The service-role credential is never serialized into a Response.
    expect(FN).not.toMatch(/JSON\.stringify\([^)]*SERVICE_ROLE_KEY/);
    expect(FN).not.toMatch(/SERVICE_ROLE_KEY[^;]*new Response/);
  });

  it('never places the service-role credential in client-facing code', () => {
    // The function is the ONLY holder; there must be no Vite-exposed env for it.
    expect(CFG).not.toContain('SERVICE_ROLE');
    expect(CFG).not.toContain('service_role');
  });

  it('independently authorizes the caller as a REAL admin before doing work', () => {
    expect(FN).toContain('auth.getUser(');
    expect(FN).toMatch(/\.from\("users"\)[\s\S]*?\.select\("role"\)/);
    expect(FN).toContain('ADMIN_ROLES.includes(roleRow.role');
    expect(FN).toContain('PERMISSION_DENIED');
    expect(FN).toContain('UNAUTHENTICATED');
  });

  it('rejects anonymous and ordinary authenticated callers', () => {
    expect(FN).toContain('401');
    expect(FN).toContain('403');
    expect(FN).toContain('UNAUTHENTICATED');
    // No bypass branch that skips the admin check.
    expect(FN).not.toMatch(/if\s*\([^)]*\)\s*\{\s*return json\(200/);
  });

  it('creates NEW identities ONLY via the server-side invite flow — no password accepted', () => {
    expect(FN).toContain('inviteUserByEmail(');
    expect(FN).toContain('PASSWORD_NOT_ALLOWED');
    expect(FN).not.toMatch(/password\s*:\s*/);
    expect(FN).not.toMatch(/createUser\([^)]*password/i);
  });

  it('never directly inserts into pilot membership tables — DB RPC is the only writer', () => {
    expect(FN).not.toMatch(/\.from\("pilot_store_operators"\)/);
    expect(FN).not.toMatch(/\.from\("pilot_couriers"\)/);
    expect(FN).toMatch(/\.rpc\(\s*"pilot_provision_new_membership"\s*,\s*\{/);
    expect(FN).toContain('p_actor_user_id: adminUid');
  });

  it('reuses an EXISTING auth identity instead of recreating it (duplicate handling)', () => {
    expect(FN).toContain('.eq("email", email)');
    expect(FN).toContain('existingUsers');
  });

  it('compensates by deleting ONLY the Auth identity created by this request', () => {
    expect(FN).toContain('createdAuth');
    expect(FN).toContain('deleteUser(targetUid)');
    expect(FN).toContain('if (createdAuth && targetUid)');
  });

  it('never activates a membership and never implements readiness/pilot-start', () => {
    expect(FN).toContain('admin_approval_required');
    for (const needle of [
      'operational_ready', 'READY_INTENT', 'store_ready', 'courier_ready',
      'pilot_ready', 'pilot_start', 'geolocation', 'navigator.geolocation',
    ]) {
      expect(FN.toLowerCase()).not.toContain(needle.toLowerCase());
    }
    expect(FN).not.toContain("p_admin_set_operator_status");
    expect(FN).not.toContain("p_admin_set_courier_status");
  });

  it('enforces JWT verification at the gateway too (verify_jwt = true)', () => {
    expect(CFG).toContain('[functions.create-pilot-account]');
    expect(CFG).toMatch(/verify_jwt\s*=\s*true/);
  });
});

describe('Regression — GATE 7 migrations unchanged', () => {
  it('00080 still ships the admin assignment surface', () => {
    expect(M80).toContain('pilot_admin_assign_order');
    expect(M80).not.toContain('pilot_provision_new_membership');
  });
  it('00081 still ships provisioning + leadership and never create-ed a membership RPC of 00083', () => {
    expect(M81).toContain('pilot_admin_find_users');
    expect(M81).toContain('pilot_membership_history');
    expect(M81).not.toContain('pilot_provision_new_membership');
  });
  it('00082 still ships operational realtime', () => {
    expect(M82).toContain('order_status_history');
  });
  it('00083 does not alter any GATE 7 file byte-layout (no CREATE OR REPLACE on 00080/81/82 objects)', () => {
    expect(M83).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(pilot_admin|pilot_order_|pilot_courier_|record_telemetry)/);
  });
});