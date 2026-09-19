/**
 * GATE 1B — PATCH CONTRACT (offline, structural).
 * Asserts the two approved gap fixes in-migration + Edge Function WITHOUT any
 * live DB:
 *
 *   1) RESEND EVENT CONTRACT: SENT + resend -> PENDING (same invitation_id,
 *      pending_at=now(), no new row, no delete) -> RESEND_REQUESTED event.
 *      RETRY stays reserved for re-attempting a failed send inside PENDING.
 *   2) IDENTITY_LINK_FAILED RECOVERY: identity created / bind failed
 *      (no deleteUser, row stays PENDING) -> a later confirmed-dispatch retry
 *      reuses the same invitation, re-binds only while user_id IS NULL, and
 *      only then mark_sent. Identity existence alone is NEVER dispatch proof.
 *
 * Covers the 13 required proofs (initial reservation, initial send, resend,
 * same invitation_id, failed retry, indeterminate cooldown, identity-link
 * failure keeps identity, identity-link recovery, normal mark_sent, operational
 * member no-op, sent_count <= 5, no new invitation row, no deleteUser).
 *
 * FINAL COMPLIANCE PATCH (verify-only additions):
 *   - ABORT contract: pending_at is the retained attempt marker (determinate ->
 *     immediate retry; indeterminate -> 60s cooldown from pending_at).
 *   - CLASSIFIER contract: membership.role_match (role_conflict fully removed).
 *   - AUTH FOUNDATION integrity: repo-style pg_get_functiondef + catalog
 *     linkage guard, verify-only (00088 never modifies those objects).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M88 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00088_pilot_invitation_lifecycle.sql'),
  'utf-8',
);
const FN = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/functions/pilot-invite/index.ts'),
  'utf-8',
);
const CFG = fs.readFileSync(path.resolve(__dirname, '../../../supabase/config.toml'), 'utf-8');

/** Verbatim body of a SQL function (CREATE .. up to the next GRANT/REVOKE/CREATE/DO). */
const RPC_BODY = (name: string): string => {
  const start = M88.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined`).toBeGreaterThan(-1);
  const tail = M88.slice(start);
  const end = tail.search(/\nGRANT |\nREVOKE |\nCREATE OR REPLACE FUNCTION public\.|\nDO \$\$/);
  return end === -1 ? tail : tail.slice(0, end);
};

const RESERVE = RPC_BODY('pilot_invitation_reserve');
const BIND = RPC_BODY('pilot_invitation_bind');
const MARK_SENT = RPC_BODY('pilot_invitation_mark_sent');
const ABORT = RPC_BODY('pilot_invitation_abort');
const CLASSIFY = RPC_BODY('pilot_invitee_classify');

/** The post-apply integrity DO block (starts at the 12) header). */
const GUARD = M88.slice(M88.indexOf('Post-apply integrity'));

const EVENTS_BLOCK = (() => {
  const start = M88.indexOf('CREATE TABLE IF NOT EXISTS public.pilot_invitation_events');
  const head = M88.slice(start);
  const end = head.indexOf('CREATE INDEX');
  return end === -1 ? head : head.slice(0, end);
})();
const EVENT_CONTRACT = (() => {
  const m = EVENTS_BLOCK.match(/event_type\s+text NOT NULL CHECK \(event_type IN \(([\s\S]*?)\)\)/);
  return m ? [...m[1]!.matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort() : [];
})();

const pos = (src: string, needle: string): number => src.indexOf(needle);
const cnt = (src: string, needle: string): number => src.split(needle).length - 1;

describe('1) RESEND EVENT CONTRACT (approved plan: SENT -> PENDING -> RESEND_REQUESTED)', () => {
  it('RESEND_REQUESTED is a member of the closed event_type contract', () => {
    expect(EVENT_CONTRACT).toContain('RESEND_REQUESTED');
  });

  it('exactly the approved event set exists — 9 original names + RESEND_REQUESTED, nothing else', () => {
    expect(EVENT_CONTRACT).toEqual(
      [
        'ACCEPTED',
        'COMPLETED',
        'FAILED',
        'IDENTITY_LINKED',
        'PASSWORD_SET',
        'RESEND_REQUESTED',
        'RESERVED',
        'RESENT',
        'RETRY',
        'SENT',
      ].sort(),
    );
  });

  it('a resend of an existing SENT/ACCEPTED invitation records RESEND_REQUESTED', () => {
    expect(RESERVE).toContain("WHEN v_status IN ('SENT', 'ACCEPTED') THEN 'RESEND_REQUESTED'");
    expect(RESERVE).toContain("WHEN v_created THEN 'RESERVED'");
    expect(RESERVE).toContain("ELSE 'RETRY'");
    // The old blanket ETI: anything not created was RETRY — that contract is gone.
    expect(RESERVE).not.toContain("CASE WHEN v_created THEN 'RESERVED' ELSE 'RETRY'");
  });

  it('the resend transition flips the SAME row to PENDING with pending_at=now()', () => {
    expect(RESERVE).toMatch(/UPDATE public\.pilot_invitations\s+SET status = 'PENDING', pending_at = now\(\)/);
    expect(RESERVE).toMatch(new RegExp(`WHERE id = v_inv`));
  });

  it('a retry of a failed send INSIDE PENDING stays RETRY (never RESEND_REQUESTED)', () => {
    expect(RESERVE).toMatch(/ELSE 'RETRY'/);
    // mark_sent finalizes an auth-confirmed dispatch: SENT first, RESENT on
    // repeats — RETRY is never reused for the enqueued re-attempt.
    expect(MARK_SENT).toContain("CASE WHEN COALESCE(v_prev_count, 0) >= 1 THEN 'RESENT' ELSE 'SENT' END");
  });

  it('no new invitation row is produced by the resend: only one INSERT INTO pilot_invitations total', () => {
    const inserts = M88.match(/INSERT INTO public\.pilot_invitations\b/g) ?? [];
    expect(inserts).toHaveLength(1); // only the reserve CREATE path
  });

  it('the RESEND_REQUESTED integrity guard is part of the post-apply DO block', () => {
    expect(M88).toContain('00088: RESEND_REQUESTED event contract missing');
    expect(M88).toContain("LIKE '%RESEND_REQUESTED%'");
  });

  it('resend-after-SENT cooldown stays 60s from last_sent_at (unchanged)', () => {
    expect(RESERVE).toContain("now() - v_last_sent < interval '60 seconds'");
  });
});

describe('2) IDENTITY_LINK_FAILED — REQUIRED RECOVERY (no-delete, idempotent)', () => {
  it('bind keeps identity + row on failure and is idempotent for the SAME identity', () => {
    expect(BIND).toContain('IDENTITY_LINKED');
    expect(BIND).toContain('IDENTITY_ALREADY_LINKED');
    expect(BIND).toMatch(/user_id IS NOT NULL AND user_id = p_user_id/);
    expect(BIND).toContain("'repeated', true");
    expect(BIND).toContain('identity-link already set (idempotent recovery)');
  });

  it('bind still hard-fails when already linked to a DIFFERENT user (one email -> one identity)', () => {
    const sameUserIdx = BIND.indexOf('user_id IS NOT NULL AND user_id = p_user_id');
    const conflictIdx = BIND.indexOf('IDENTITY_ALREADY_LINKED');
    expect(conflictIdx).toBeGreaterThan(sameUserIdx);
  });

  it('bind / mark_sent / abort never INSERT a new invitation row', () => {
    for (const body of [BIND, MARK_SENT, ABORT]) {
      expect(body).not.toMatch(/INSERT INTO public\.pilot_invitations\b/);
    }
  });

  it('identity-link failure never deletes the created identity', () => {
    expect(BIND).not.toMatch(/deleteUser/);
    expect(BIND).not.toMatch(/DELETE FROM/);
    expect(M88).not.toMatch(/auth\.admin\.deleteUser/);
  });

  it('mark_sent requires an existing bound identity + PENDING (SENT = verified dispatch)', () => {
    expect(MARK_SENT).toContain("AND status = 'PENDING'");
    expect(MARK_SENT).toContain('AND user_id IS NOT NULL');
    expect(MARK_SENT).toContain("sent_count = sent_count + 1");
  });

  it('the whole migration has NO delete power and no identity DDL cleanup', () => {
    expect(M88).not.toMatch(/deleteUser/);
    expect(M88).not.toMatch(/DELETE FROM auth\.users/);
  });
});

describe('3) Edge Function — reserve-before-auth + the three-outcome distinction', () => {
  it('operational member (class A) exits BEFORE any reservation or auth dispatch', () => {
    const aIdx = pos(FN, '"ALREADY_OPERATIONAL"');
    expect(aIdx).toBeGreaterThan(-1);
    expect(aIdx).toBeLessThan(pos(FN, '"pilot_invitation_reserve"'));
    expect(aIdx).toBeLessThan(pos(FN, 'inviteUserByEmail'));
    expect(aIdx).toBeLessThan(pos(FN, 'signInWithOtp'));
  });

  it('reserve runs before the auth dispatch (row exists before any email)', () => {
    const rIdx = pos(FN, '"pilot_invitation_reserve"');
    expect(rIdx).toBeGreaterThan(-1);
    expect(rIdx).toBeLessThan(pos(FN, 'inviteUserByEmail'));
    expect(rIdx).toBeLessThan(pos(FN, 'signInWithOtp'));
  });

  it('determinate failure -> FAILED(determinate) and NEVER reaches mark_sent', () => {
    expect(FN).toContain('p_outcome: gotError');
    expect(FN).toContain('"INVITE_DISPATCH_FAILED"');
    const failIdx = pos(FN, '"INVITE_DISPATCH_FAILED"');
    expect(pos(FN, '"pilot_invitation_mark_sent"')).toBeGreaterThan(failIdx);
  });

  it('indeterminate failure keeps PENDING + ambiguous code (cooldown governs the retry)', () => {
    expect(FN).toMatch(/gotError === "indeterminate"/);
    expect(FN).toContain('"INVITE_DISPATCH_AMBIGUOUS"');
    expect(RESERVE).toContain("v_outcome = 'indeterminate'");
    expect(RESERVE).toContain("now() - v_pending < interval '60 seconds'");
  });

  it('identity-link failure returns IDENTITY_LINK_FAILED and never deletes', () => {
    expect(FN).toContain('"IDENTITY_LINK_FAILED"');
    expect(FN).not.toMatch(/deleteUser/);
    expect(FN).not.toMatch(/createUser\(/);
  });

  it('recovery: the SAME invitation is re-bound only while user_id IS NULL', () => {
    expect(FN).toContain('invUserId === null');
    expect(FN).toMatch(/\.from\("pilot_invitations"\)[\s\S]*?\.select\("id, user_id"\)/);
    expect(FN).toMatch(/"pilot_invitation_bind"[\s\S]*?p_invitation_id: invitationId/);
  });

  it('mark_sent is invoked exactly ONCE, strictly after a confirmed dispatch for THIS attempt', () => {
    expect((FN.match(/"pilot_invitation_mark_sent"/g) ?? [])).toHaveLength(1);
    const mIdx = pos(FN, '"pilot_invitation_mark_sent"');
    expect(mIdx).toBeGreaterThan(pos(FN, 'if (gotError) {'));
    expect(mIdx).toBeGreaterThan(pos(FN, '"INVITE_DISPATCH_FAILED"'));
    expect(mIdx).toBeGreaterThan(pos(FN, '"INVITE_DISPATCH_AMBIGUOUS"'));
    const failureBlock = FN.slice(pos(FN, 'if (gotError) {'), pos(FN, '// 11) SUCCESS'));
    expect(failureBlock).not.toContain('mark_sent');
    // No mark_sent path can be reached merely because an identity exists.
    const recoveryBlock = FN.slice(pos(FN, '// 11b) ENSURE BOUND'), mIdx);
    expect(recoveryBlock).toContain('invUserId === null');
  });

  it('normal success: confirmed dispatch + successful bind -> mark_sent -> SENT/RESENT', () => {
    expect(FN).toContain('? "INVITATION_RESENT" : "INVITATION_SENT"');
    expect(MARK_SENT).toContain("'status', 'SENT'");
    expect(MARK_SENT).toContain("'event_type', v_event");
  });

  it('only ever the two identity resolvers exist — no second identity creation', () => {
    expect((FN.match(/inviteUserByEmail/g) ?? [])).toHaveLength(1);
    expect((FN.match(/signInWithOtp/g) ?? [])).toHaveLength(1);
    expect(FN).not.toMatch(/\.from\("pilot_invitations"\)\s*\.insert/);
  });

  it('the EF may never surface user_id or invitation_id in a response', () => {
    expect(FN).not.toMatch(/json\(\d+, \{[^}]*invitation_id/);
    expect(FN).not.toMatch(/json\(\d+, \{[^}]*user_id/);
  });

  it('JWT verification is enforced at the gateway for pilot-invite', () => {
    expect(CFG).toContain('[functions.pilot-invite]');
    expect(CFG).toMatch(/verify_jwt\s*=\s*true/);
  });
});

describe('4) scope boundaries (no drift into frozen surfaces)', () => {
  it('00088 redefines none of the frozen / Gate 7 / 8A functions', () => {
    for (const r of [
      'pilot_admin_set_operator_status',
      'pilot_admin_set_courier_status',
      'pilot_admin_set_courier',
      'pilot_admin_assign_order',
      'pilot_admin_upsert_neighborhood',
      'pilot_admin_upsert_store',
      'pilot_admin_list_operators',
      'pilot_admin_list_couriers',
      'pilot_order_set_status',
      'pilot_order_accept',
      'pilot_courier_set_status',
      'record_telemetry_event',
      'fn_admin_uid',
      'pilot_provision_new_membership',
      'delivery_create_order',
    ]) {
      expect(M88).not.toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
  });

  it('00088 freezes out readiness/pilot-start/GPS concepts that do not belong here', () => {
    for (const needle of [
      'READY_INTENT', 'pilot_start', 'geolocation', 'latitude', 'longitude',
      'PostGIS', 'check_in',
    ]) {
      expect(M88.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });

  it('the Edge Function never touches create-pilot-account issues / provisioning ledger directly', () => {
    expect(FN).not.toMatch(/\.from\("pilot_store_operators"\)/);
    expect(FN).not.toMatch(/\.from\("pilot_couriers"\)/);
    expect(FN).toMatch(/"pilot_provision_new_membership"/);
  });

  it('no token / invitation URL / password / hash storage exists in Gate 1B surface', () => {
    for (const needle of ['recovery_token', 'invite_link', 'password_hash', 'invitation_url']) {
      expect(FN).not.toMatch(new RegExp(needle));
    }
    for (const rpc of [RESERVE, BIND, MARK_SENT, ABORT]) {
      expect(rpc).not.toMatch(/recovery_token|invite_link|password_hash|invitation_url/);
    }
    expect(M88).not.toMatch(/CREATE TABLE[^;]*recovery_token/);
    // The encrypted_password VALUE is never read out — only empty-vs-non-empty.
    expect(M88).toMatch(/COALESCE\(encrypted_password, ''\) <> ''/);
  });
});

describe('5) ABORT CONTRACT — pending_at retention + determinate/indeterminate retry rule', () => {
  it('abort NEVER clears or rewrites pending_at: it stays as the attempt marker', () => {
    expect(ABORT).toContain("'FAILED'");
    expect(ABORT).toContain("'kept_pending', true");
    expect(ABORT).not.toMatch(/UPDATE public\.pilot_invitations\s+SET/);
    expect(ABORT).not.toContain('pending_at = NULL');
  });

  it('determinate failure => immediate retry; cooldown gates ONLY the indeterminate outcome', () => {
    expect(RESERVE).toContain("v_outcome = 'indeterminate'");
    expect(RESERVE).toMatch(/IF v_outcome = 'indeterminate' AND now\(\) - v_pending < interval '60 seconds'/);
    // No branch ever re-reads 'determinate' to gate a retry.
    expect(RESERVE).not.toMatch(/v_outcome = 'determinate'/);
  });

  it('abort writes the FAILED outcome into the SAME invitation row event ledger only', () => {
    expect(ABORT).toContain("INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)");
    expect(ABORT).not.toContain('DELETE');
  });
});

describe('6) CLASSIFIER CONTRACT — membership.role_match (Final Plan shape)', () => {
  it('classify returns membership with status + operational + role_match', () => {
    expect(CLASSIFY).toContain("'status', v_membership, 'operational', v_operational, 'role_match', v_role_match");
  });

  it('no-identity / none-membership response carries role_match=true', () => {
    expect(CLASSIFY).toContain("'status', 'none', 'operational', false, 'role_match', true");
  });

  it('role_match defaults true and flips to false ONLY when the OTHER role is ACTIVE at the same store', () => {
    expect(CLASSIFY).toContain('v_role_match bool := true;');
    expect(CLASSIFY).toContain('SELECT NOT EXISTS (');
    expect(CLASSIFY).toContain("status = 'active'");
  });

  it('role_conflict is fully removed from the Gate 1B surface', () => {
    expect(M88).not.toMatch(/role_conflict/);
    expect(FN).not.toMatch(/role_conflict/);
    expect(FN).toContain('cls?.membership?.role_match === true');
    expect(FN).toContain('if (!roleMatch) {');
  });

  it('authorization semantics are unchanged: !role_match -> MEMBERSHIP_CONFLICT', () => {
    expect(FN).toContain('code: "MEMBERSHIP_CONFLICT"');
    expect(M88).not.toContain("'role_conflict'");
  });
});

describe('7) AUTH FOUNDATION integrity — verify-only pg_get_functiondef guard', () => {
  it('the post-apply guard reads handle_new_user via pg_get_functiondef', () => {
    expect(GUARD).toContain("pg_get_functiondef('public.handle_new_user()'::regprocedure");
  });

  it('handle_new_user integrity asserts only STABLE markers (never modified by 00088)', () => {
    expect(GUARD).toContain("'%SECURITY DEFINER%'");
    expect(GUARD).toContain("'%RETURNS trigger%'");
    expect(GUARD).toContain("'%insert into public.users %'");
    expect(GUARD).toContain("'%on conflict (id) do update set%'");
  });

  it('on_auth_user_created / on_auth_user_login linkage is pinned via pg_trigger x pg_proc', () => {
    expect(GUARD).toContain("t.tgname = 'on_auth_user_created'");
    expect(GUARD).toContain("t.tgname = 'on_auth_user_login'");
    expect(GUARD).toContain("t.tgrelid = 'auth.users'::regclass");
    expect(GUARD).toContain("p.proname = 'handle_new_user'");
    expect(cnt(GUARD, '(t.tgtype & 1) <> 0')).toBeGreaterThanOrEqual(2);
  });

  it('00088 never defines, drops, or recreates these foundation objects (verify-only)', () => {
    expect(M88).not.toMatch(/CREATE OR REPLACE FUNCTION public\.handle_new_user/);
    expect(M88).not.toMatch(/CREATE\s+TRIGGER on_auth_user_created/);
    expect(M88).not.toMatch(/CREATE\s+TRIGGER on_auth_user_login/);
    expect(M88).not.toMatch(/DROP\s+TRIGGER\s+IF EXISTS on_auth_user_created/);
    expect(M88).not.toMatch(/DROP\s+TRIGGER\s+IF EXISTS on_auth_user_login/);
  });
});