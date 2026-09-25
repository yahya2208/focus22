# PRODUCTION APPROVAL RECONCILIATION (read-only; no execution, no changes)
Date: 2026-09-25. HEAD = origin/main = `bfd17f3`. Full-suite OOM is a LOCAL
sandbox resource limit (native worker crash under parallel load); it is NOT a
code failure and must not be read as CI signal. No GitHub Actions evidence is
available from this environment — CI is UNKNOWN throughout, never claimed.

## 1. Executive summary
- 00115/00116/00117: files reviewed, coherent, dispositive pre/post checks
  defined; Production application state UNCONFIRMED (no execution path here).
- 00118: reviewed; ONE real finding (send-then-log race, §5) to fix before apply.
- Produce data: last recorded probe (0 veg / 5 phone links / 2 baladi) is STALE
  the moment anyone writes; re-probe before any write.
- Invite chain: policy HOLD stands on evidence (see §7).
- Nothing in this round was applied, committed, or pushed.

## 2. Actual Production state table
| Item | Status | Provenance |
|---|---|---|
| 00113 decrement | UNCONFIRMED | P1 apply was user-executed; no receipt ever returned |
| 00115 link RPC | UNCONFIRMED | file reviewed; no apply observed |
| 00116 fruit CHECK | UNCONFIRMED | file reviewed; no apply observed |
| 00117 prefs cols+RPCs | APPLIED_AND_VERIFIED* | *user-reported probe (cols present, RPCs DEFINER/authenticated-only). Independent re-verification impossible from here |
| 00118 tables | NOT_APPLIED | file exists untracked-as-new; no apply authorized |
| 10 veg rows/links | UNCONFIRMED | last probe 0/0/5 predates all write approvals; user execution unknown |
| بلدي rows | UNCONFIRMED (assumed unchanged — zero authorized writes reference them) | no evidence of change |
| 00088/00089/00110 | NOT_APPLIED (policy HOLD) | absence probes + header evidence |

## 3. Migration-by-migration evidence
- **00113** (`ad19cfab…`, 246 lines): additive CREATE OR REPLACE settle + grants + DO guard. Deps (00102 body, numeric qtys, audit trigger, catalog_ref convention) all live. Reapply assessment: N/A (first apply unconfirmed — treat as pending, never "reapply").
- **00115** (`7c342476…`, 85 lines): 1 RPC + grants + DO guard. Deps stores/inventory_items/fn_admin_uid live. Idempotent. Safe order: any.
- **00116** (`cd6822e8…`, 45 lines): CHECK drop+re-add with 'fruit'. Widening validates trivially. Safe order: any.
- **00117** (`5580b1cf…`, 167 lines): 2 cols IF NOT EXISTS + 3 RPCs + grants. Deps live. Safe order: any.
- Reapplying 00115–00117 if already applied: SAFE (all statements idempotent).

## 4. Produce data verification
No fresh evidence available (read-only round; no execution path). MANDATORY
re-probe (Block 1 queries from the apply pack) immediately before any write:
expect veg_rows=10, veg_dupes=0, veg_links=10, phone_links=5, baladi unchanged.
Do NOT assume the earlier 0/0/5 snapshot still holds.

## 5. 00118 security review
- Ownership/RLS: owner-only FOR ALL (authenticated); anon fully revoked;
  push_log has NO client grants at all. **PASS.**
- Endpoint uniqueness: UNIQUE(endpoint) — cross-user hijack impossible. **PASS.**
- Revocation: revoked_at honored by sender query; lazy 410-marking. **PASS.**
- push_log PK(order_id, endpoint): duplicate ROWS impossible. **PASS.**
- **FINDING (must fix pre-apply): concurrent double-send race.** The Edge
  sends FIRST and logs AFTER with no pre-check, so two concurrent webhook
  deliveries for one order can both send before either logs. Sequential
  retries are absorbed (first completes logging first), but true concurrency
  is not. Fix: `SELECT`-for-prior-log → skip-if-present before each send
  (advisory lock for perfection; pre-check suffices for webhook-retry reality).
- order_id FK → orders CASCADE; endpoint TEXT unlinked (by design — log
  survives subscription churn). **PASS.**
- Edge field match: user_id/endpoint/p256dh/auth all selected and used. **PASS.**
- Anon insert-for-other: blocked by REVOKE + WITH CHECK + UNIQUE. **PASS.**
- Browser service-role: none anywhere. **PASS.**
- **BLOCKER: fix the send-then-log order before applying 00118.**

## 6. Web Push deployment checklist
- Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORDER_PUSH_WEBHOOK_SECRET,
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (Edge secrets only).
- Webhook auth: `x-webhook-secret` header check → 401 otherwise. **Present.**
- Recipients: users.role admin/super_admin + active operators of
  order.store_id, resolved server-side. **Present, correct scope.**
- Webhook payload: DB row record (id/store_id/total/created_at). **OK.**
- Push payload: order_id/store_id/total/target only. **Minimal, PASS.**
- Idempotency: UNIQUE log + upsert ignoreDuplicates — PLUS the §5 fix.
- 410/404: revoked_at marking. **Present.** Other failures: per-endpoint
  try/catch, counted, non-fatal. **Present.**
- Awaiting: Edge does NOT await out-of-band work beyond sends; webhook
  timeout risk is bounded by per-endpoint try/catch, but a 100-store fan-out
  could approach Edge time limits — cap batch + return early pattern
  recommended in the same fix.
- Safe test: invoke Edge with wrong secret (expect 401), then with a test
  order_id and zero subscriptions (expect NO_SUBSCRIPTIONS, zero sends).
  Never test against real endpoints first.

## 7. Invitation policy blockers (00088 HOLD stands)
- Header restriction: "repo-only artifact. Applied only to Staging
  (wpthryqflsfamjbtvjoa) by the operator; never applied to production."
  (00088:61-62). Overriding needs explicit owner policy decision, not a gate.
- Trigger privilege: DROP/CREATE TRIGGER ON auth.users (00088:817-818,
  871-872) — Auth-schema mutation, sensitive by nature; applier privilege
  must be proven, and trigger behavior (REMINDER: fires on EVERY user
  confirmation/password-set) must be accepted for Production auth traffic.
- Actual Production state: invitation tables/RPCs absent (all probes).
- Staging-only evidence: header + commit message "[git-only, no DB]".
- No bypass proposed; 00110 stays chained behind 00088.

## 8. Owner approval queue (dependency order)
1. Re-probe produce state (Block 1). 2. Insert rows + links (user SQL).
3. Apply 00115 → verify. 4. Apply 00116 → verify. 5. Apply 00117 → verify
   (if user probe from §2 needs re-confirmation, fold it here). 6. Fix Edge
   send-then-log (§5) → then apply 00118 → verify. 7. Renames (guarded,
   count=1 each). 8. VAPID + Edge deploy + webhook + secrets. 9. Invite
   policy decision (separate). 10. 00113 apply-confirm (separate).

## 9. SQL requiring approval (labeled blocks)
- BLOCK-A (precheck): Block-1 probe queries (apply-pack §1a). 
- BLOCK-B (seed): 10-row guarded INSERT (apply-pack §1b).
- BLOCK-C (links): guarded per-row link INSERTs (apply-pack §1c).
- BLOCK-D/E/F: 00115, 00116, 00117 file pastes verbatim (SHAs in §3).
- BLOCK-G (00118): file paste verbatim ONLY AFTER the §5 code fix + re-review.
- BLOCK-H (renames): 3 guarded UPDATEs with count=1 prechecks.
- BLOCK-I (final verification): Block-5 queries.

## 10. Must NOT be rerun
- Anything already verified live without change (00117 probe, 00112 21/21,
  contact/account RPC checks) — re-running wastes nothing but proves nothing.
- The full local suite for gate purposes (sandbox OOM makes it non-decisive;
  rely on targeted suites + tsc + build + CI).
- Re-applying any idempotent migration "just in case" without a symptom.
