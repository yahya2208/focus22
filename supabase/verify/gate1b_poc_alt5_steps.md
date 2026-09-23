# GATE 1B — ALTERNATIVE 5 — PoC BROWSER/API STEPS
# Run these BETWEEN Phase 3 and Phase 6 of gate1b_poc_alt5_poc.sql
# ============================================================================
#
# WHAT THIS PROVES:
#   Test A: Acceptance via signup confirmation (no InvitedAt) → ACCEPTED only
#   Test B: Same acceptance + real password → PASSWORD_SET + COMPLETED
#
# PREREQUISITES:
#   - Phase 3 SQL completed successfully (both users created, invitations bound+sent)
#   - You have the store_id, inv_a, inv_b, uid_a, uid_b values from Phase 3 output
#   - Dashboard access to Staging project
# ============================================================================

## STEP 4: GENERATE CONFIRMATION LINKS (one for each identity)
##
## Why signup (not invite)?
##   - admin.generateLink({type:'invite'}) sets InvitedAt → temp password at acceptance → POISON
##   - admin.generateLink({type:'signup'}) does NOT set InvitedAt → Confirm() only → CLEAN
##
## Option A — Dashboard API Playground:
##   1. Dashboard → Settings → API → Copy "service_role" key (secret)
##   2. Dashboard → API → open any endpoint → change to POST
##   3. URL: https://<project>.supabase.co/auth/v1/admin/generate_link
##   4. Headers: apikey: <service_role>, Authorization: Bearer <service_role>
##   5. Body (for A):
##      {"type":"signup","email":"<email_a>","redirect_to":"http://localhost:5173"}
##   6. Copy "action_link" from response
##   7. Repeat for email_b
##
## Option B — curl (run in terminal, DO NOT paste keys in chat):
##   curl -s -X POST 'https://<project>.supabase.co/auth/v1/admin/generate_link' \
##     -H 'apikey: <SERVICE_ROLE_KEY>' \
##     -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
##     -H 'Content-Type: application/json' \
##     -d '{"type":"signup","email":"<email_a>","redirect_to":"http://localhost:5173"}' \
##   | python3 -c "import sys,json; print(json.load(sys.stdin)['action_link'])"
##
## Option C — Dashboard "Resend email confirmation":
##   1. Dashboard → Auth → Users → find test user
##   2. Click the user → "Send confirmation email"
##   3. Check the inbox for the test email → copy the link
##   (Requires a real deliverable email address)


## STEP 5A: ACCEPT TEST A (browser — no password set)
##
## 1. Open the action_link for email_a in a browser
## 2. GoTrue processes the signup verification:
##    - signupVerify() is called
##    - user.HasPassword() = false (encrypted_password is empty)
##    - user.InvitedAt = nil (admin.createUser + generateLink('signup') don't set it)
##    - Condition: !HasPassword() && InvitedAt != nil → FALSE → NO temp password
##    - Confirm() fires → email_confirmed_at set → pilot_on_auth_confirmed trigger fires
##    - ACCEPTED event recorded
##    - Encrypted_password remains EMPTY
##
## 3. Verify the browser shows a redirect (or GoTrue response page)
## 4. DO NOT set any password for this identity
## 5. Move to Phase 6 SQL to verify Test A results


## STEP 5B: ACCEPT TEST B + SET PASSWORD (browser)
##
## 1. Open the action_link for email_b in a browser
## 2. Same GoTrue flow as 5A:
##    - Confirm() fires → ACCEPTED recorded
##    - Encrypted_password still EMPTY
##
## 3. NOW SET A REAL PASSWORD via one of:
##
##    Option 1 — Dashboard:
##      Dashboard → Auth → Users → find test user B
##      → Set password (any strong password, e.g. "TestPoc2026!")
##
##    Option 2 — InviteSetupScreen (if running app):
##      Login via magic link → app routes to invite-setup → set password
##
##    Option 3 — API:
##      POST /auth/v1/admin/users/<uid_b>
##      Headers: apikey + Authorization: Bearer <service_role>
##      Body: {"password":"TestPoc2026!"}
##
## 4. When password is set:
##    - GoTrue UPDATEs encrypted_password: '' → non-empty
##    - pilot_on_auth_password_set trigger fires → PASSWORD_SET recorded
##    - pilot_invitation_advance runs → COMPLETED (both accepted_at + password_set_at set)
##
## 5. Move to Phase 6 SQL to verify Test B results


## EXPECTED RESULTS (for report):
##
## TEST A (no password):
##   invitation.status      = 'ACCEPTED'
##   invitation.accepted_at = NOT NULL (timestamp)
##   invitation.password_set_at = NULL
##   invitation.completed_at = NULL
##   event ledger: RESERVED → IDENTITY_LINKED → RESEND_REQUESTED → SENT → ACCEPTED
##   (NO PASSWORD_SET event, NO COMPLETED event)
##   auth.users.encrypted_password = '' (empty)
##
## TEST B (with password):
##   invitation.status      = 'COMPLETED'
##   invitation.accepted_at = NOT NULL
##   invitation.password_set_at = NOT NULL
##   invitation.completed_at = NOT NULL
##   event ledger: RESERVED → IDENTITY_LINKED → RESEND_REQUESTED → SENT → ACCEPTED → PASSWORD_SET → COMPLETED
##   auth.users.encrypted_password = non-empty (bcrypt hash)


## DECISION CRITERIA:
##   If BOTH tests match expectations → ALTERNATIVE 5 IS PROVEN ON STAGING
##   If either test fails → STOP, report "BLOCKED — alternative 5 not proven"
##   Do NOT proceed to patch or migration regardless of outcome
