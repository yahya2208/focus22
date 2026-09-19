// ============================================================================
// create-pilot-account — SECURE server-side creation of a NEW Supabase Auth
// identity and its controlled provisioning as a PENDING pilot membership.
//
// GATE 8B Step 1. This Edge Function is the ONLY component that holds the
// service-role credential. The browser never possesses it.
//
// SECURITY MODEL (server-side, independent of any frontend):
//   * Caller must present a valid Supabase Auth JWT (Authorization header).
//   * The function verifies the caller is a REAL admin (role admin/super_admin)
//     using getUser(token) + a service-role read of public.users.role.
//   * Anonymous / ordinary authenticated callers are rejected (401/403).
//   * JWT-level verify_jwt=true is ALSO enforced at the gateway (config.toml).
//   * Only the intended provisioning RPC is invoked — the database enforces the
//     membership + audit-ledger invariant. This function NEVER inserts directly
//     into pilot membership tables.
//   * No permanent Admin-chosen password is ever accepted or handled. New
//     identities are created via the INVITE flow (user sets their own password).
//   * Compensation may delete ONLY the Auth identity created by THIS request.
//
// HARD BOUNDARIES (per GATE 8B Step 1):
//   * Never activates / approves a membership (PENDING only).
//   * Never suspends / revokes / deactivates.
//   * No readiness / pilot-start / GPS / maps / ETA.
//   * Not callable anonymously; not callable by ordinary users.
//
// Invocation: POST https://<proj>.supabase.co/functions/v1/create-pilot-account
//   Headers: Authorization: Bearer <caller JWT> (must be an Admin)
//   Body:    { role: 'operator'|'courier', email, display_name?, store_id, reason? }
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const ADMIN_ROLES = ["admin", "super_admin"];
const ALLOWED_ROLES = ["operator", "courier"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// Minimal but sufficient email shape guard (full validation is Auth's job).
function isPlausibleEmail(value: unknown): boolean {
  return typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

function isUuid(value: unknown): boolean {
  return typeof value === "string" &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

Deno.serve(async (req: Request) => {
  // 0) CORS preflight — browser invocation. The Supabase gateway forwards
  //    OPTIONS to the function, so the function itself must answer it.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 1) Method + method-only guard.
  if (req.method !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED" });
  }

  // 2) Authenticate the caller.
  const authHeader = req.headers.get("Authorization") ?? "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return json(401, { error: "UNAUTHENTICATED" });
  }
  const token = tokenMatch[1];

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { error: "SERVER_MISCONFIGURED" });
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the JWT against Auth and recover the caller's identity.
  const { data: callerAuth, error: callerErr } = await service.auth.getUser(token);
  if (callerErr || !callerAuth?.user) {
    return json(401, { error: "UNAUTHENTICATED" });
  }
  const callerUid = callerAuth.user.id;
  if (!callerUid) {
    return json(401, { error: "UNAUTHENTICATED" });
  }

  // 3) AUTHORIZE — must be a real admin (independent of the frontend).
  const { data: roleRow, error: roleErr } = await service
    .from("users")
    .select("role")
    .eq("id", callerUid)
    .maybeSingle();
  if (roleErr || !roleRow || !ADMIN_ROLES.includes(roleRow.role as string)) {
    return json(403, { error: "PERMISSION_DENIED" });
  }
  const adminUid: string = callerUid;

  // 4) Parse + validate the input contract.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "ARGUMENTS_INVALID" });
  }

  const role = body.role as string;
  const emailRaw = body.email;
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  const storeId = body.store_id;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : "";

  if (!ALLOWED_ROLES.includes(role)) {
    return json(400, { error: "ARGUMENTS_INVALID" });
  }
  if (!isPlausibleEmail(emailRaw)) {
    return json(400, { error: "ARGUMENTS_INVALID" });
  }
  if (!isUuid(storeId)) {
    return json(400, { error: "ARGUMENTS_INVALID" });
  }
  // Never accept a permanent Admin-chosen password (invite flow only).
  if (body.password !== undefined || body.temporary_password !== undefined) {
    return json(400, { error: "PASSWORD_NOT_ALLOWED" });
  }

  const email = (emailRaw as string).trim().toLowerCase();
  const userMeta: Record<string, string> = {};
  if (displayName) userMeta.display_name = displayName;
  userMeta.pilot_role = role;

  // 5) DUPLICATE / EXISTING-IDENTITY handling.
  //    public.users mirrors auth.users (00002 trigger), so an existing email in
  //    users == an existing real Auth identity — we REUSE it, never recreate.
  const { data: existingUsers } = await service
    .from("users")
    .select("id, email, role")
    .eq("email", email)
    .limit(1);

  let targetUid: string | null = null;
  let createdAuth = false;

  if (existingUsers && existingUsers.length > 0) {
    // Existing Auth identity -> link + provision (never recreate).
    targetUid = existingUsers[0]!.id as string;
  } else {
    // 6) NEW Auth identity — server-side, via the INVITE flow (user sets own
    //    password; no permanent Admin password, no plaintext storage).
    const { data: inviteData, error: inviteErr } = await service.auth.admin
      .inviteUserByEmail(email, {
        data: userMeta,
      });
    if (inviteErr) {
      // Duplicate at the Auth layer despite absence in users mirror: report.
      return json(409, { error: "EMAIL_EXISTS", detail: inviteErr.message });
    }
    createdAuth = true;
    const invitedUid = inviteData?.user?.id ?? null;

    if (invitedUid) {
      targetUid = invitedUid as string;
    } else {
      // Some backends do not echo the user; resolve via the mirror chain.
      const { data: createdUsers } = await service
        .from("users")
        .select("id")
        .eq("email", email)
        .limit(1);
      targetUid = createdUsers && createdUsers.length > 0 ? (createdUsers[0]!.id as string) : null;
    }

    if (!targetUid) {
      return json(500, { error: "PROVISIONING_PENDING_REVIEW" });
    }
  }

  // 7) Controlled provisioning -> PENDING membership.
  //    The DB RPC re-enforces: pending-only, ledger, duplicates, role conflicts.
  const { data: provData, error: provErr } = await service.rpc(
    "pilot_provision_new_membership",
    {
      p_role: role,
      p_store_id: storeId,
      p_user_id: targetUid,
      p_actor_user_id: adminUid,
      p_reason: reason || "provisioned (new auth identity)",
    },
  );

  if (provErr) {
    // 8) COMPENSATION: if we created this Auth identity in THIS request and the
    //    membership provisioning failed, delete ONLY that identity so no
    //    uncontrolled orphaned pilot identity is left behind.
    if (createdAuth && targetUid) {
      await service.auth.admin.deleteUser(targetUid);
    }
    const code = (provErr as { code?: string }).code;
    if (code === "P0002" || /TRANSITION_NOT_ALLOWED|ROLE_CONFLICT/i.test(provErr.message)) {
      return json(409, { error: "MEMBERSHIP_CONFLICT", detail: provErr.message });
    }
    return json(500, { error: "MEMBERSHIP_PROVISION_FAILED", detail: provErr.message });
  }

  // 9) Success — membership is PENDING; ADMIN APPROVAL is still required.
  return json(200, {
    ok: true,
    auth_created: createdAuth,
    user_id: targetUid,
    email,
    role,
    status: provData?.status ?? "pending",
    next: "admin_approval_required",
  });
});
