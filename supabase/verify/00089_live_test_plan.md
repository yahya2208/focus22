# 00089 — LIVE STAGING TEST PLAN (GATE 1B PASSWORD_SET SIGNAL)

PREPARATION ONLY. NOT EXECUTED. Every step below is gated behind explicit
approval (config flip -> migration -> live proof). All operations target
Staging `wpthryqflsfamjbtvjoa`. Production is forbidden until Staging PASS.
No existing identity is reused: `manouniyahya00@gmail.com`,
`frpyahya27@gmail.com`, staging admin and all operational accounts are BANNED
from this plan.

## Objectives (single sentence each, verifiable)
1. Prove the acceptance path (event A) MUST NOT produce `user_updated_password`,
   MUST NOT set `password_set_at`, MUST NOT reach COMPLETED.
2. Prove the Explicit Password Set (InviteSetup `setAccountPassword`) MUST emit
   `user_updated_password` in `auth.audit_log_entries`, MUST set
   `password_set_at`, and MUST complete the invitation via
   `pilot_invitation_advance`.
3. Prove idempotency: re-running advance / replaying the same signal MUST NOT
   duplicate COMPLETED events.

## Preconditions (operator-confirmed, not assumed)
- [ ] Staging auth config `AUDIT_LOG_DISABLE_POSTGRES` is currently `true`
      AND `hook_send_email_enabled = false` (operator).
- [ ] Proposal approved: flip `AUDIT_LOG_DISABLE_POSTGRES` -> `false` on
      Staging ONLY (Dashboard/Management API) BEFORE running 00089.
- [ ] 00089 migration prepared and preflight (`00089_preflight.sql`) PASSED.

## Steps (in order)
1. PREFLIGHT (read-only): record current audit_log_entries count (expect 0),
   pilot_invitations snapshot by status, presence of `pilot_on_auth_password_set`
   trigger, absence of `pilot_on_audit_password_updated`.
2. CONFIG FLIP (approved once): `AUDIT_LOG_DISABLE_POSTGRES=false` on Staging.
   Verify via Management API read-back (no other config changed; send-email
   hook remains disabled).
3. Create ONE new test identity through the existing admin invite flow
   (`pilot-invite` EF / admin tool) — email `pilot.signal.probe@<domain>`.
   Do NOT create the auth user manually; the flow must be the real one.
4. ACCEPTANCE: operator clicks the invite link in a fresh browser/profile
   (no prior sessions). Assert at once (read-only):
   - auth.audit_log_entries: NO row with action='user_updated_password',
     exactly one 'user_signedup' for the user.
   - pilot_invitations: status=ACCEPTED, accepted_at NOT NULL,
     password_set_at IS NULL.
   - events: ACCEPTED present, PASSWORD_SET absent, COMPLETED absent.
5. EXPLICIT PASSWORD SET: in InviteSetup, choose and submit a strong password
   (real `setAccountPassword` / `updateUser({password})` path). Assert:
   - auth.audit_log_entries: exactly ONE new row with
     action='user_updated_password', payload->>'actor_id' = the user uuid,
     payload has no password/hash/token.
   - pilot_invitations: status=COMPLETED, password_set_at NOT NULL,
     completed_at NOT NULL.
   - events order: ... ACCEPTED -> PASSWORD_SET -> COMPLETED (no duplicates).
6. IDEMPOTENCY (read-only): re-run `pilot_invitation_advance(<id>)` in a
   transaction that you ROLLBACK, or simply re-scan events: COMPLETED count
   for this invitation must remain 1. A duplicate audit insert (replayed)
   must not create a second PASSWORD_SET/COMPLETED.
7. CONTROLS: confirm admin password write path (admin tool) for ANY account
   produces NO 'user_updated_password' (read-only scan) — regression against
   the false-signal family.

## Exit criteria
- All assertions above PASS on Staging -> report `STATUS: PASS` and request the
  Production-readiness decision (still gated; Production untouched).
- Any assertion FAILS -> run `00089_rollback_plan.sql`, report Blocked with the
  failing query appended, do not proceed.