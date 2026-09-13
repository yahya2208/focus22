// ============================================================================
// pilot-invite — GATE 1B server-authoritative invitation lifecycle handler.
//
// Relationship to create-pilot-account (FROZEN — never modified):
//   * pilot-invite is a NEW sibling function for invitation SEND / RESEND and
//     consumes the SAME provision RPC (pilot_provision_new_membership).
//   * It has NO delete power: it never removes an Auth identity, ever
//     (Gate 1B no-delete rule).
//
// SECURITY MODEL:
//   * Caller must present a valid Supabase Auth JWT and be a REAL admin
//     (users.role IN ('admin','super_admin')) — same model as create-pilot-account.
//   * JWT-level verify_jwt=true is ALSO enforced at the gateway (config.toml).
//   * ALL classification / lifecycle decisions are server-side via
//     service_role-only RPCs; the DB is the single source of truth.
//
// ORDERING (approved Final Plan): reserve FIRST (row exists before any email),
// THEN the Auth op; 'SENT' is set only AFTER Auth confirms dispatch. Failure
// leaves the SAME PENDING row + FAILED event (determinate vs indeterminate).
//
// SAFE RESPONSES: only { ok, code } — NEVER user_id, invitation_id, tokens,
// links, emails, avatars or any secret. The browser never needs them.
//
// NO-DELETE: existing identities are never recreated or deleted. New identities
// created by this request that fail later steps remain as diagnosable
// PENDING/orphan rows (kept, never auto-deleted) per the approved plan.
//
// IDENTITY_LINK_FAILED RECOVERY (approved): if bind fails after a CONFIRMED
// dispatch, the identity stays and the row stays PENDING (no delete). A later
// retry of the same request reuses the SAME invitation (reserve never creates
// a new row) and — because THAT attempt's dispatch is confirmed — re-runs bind
// while the row is still user_id NULL, then mark_sent. Identity existence alone
// is never treated as dispatch success ("may have sent" stays indeterminate).
//
// Invocation: POST https://<proj>.supabase.co/functions/v1/pilot-invite
//   Headers: Authorization: Bearer <admin JWT>
//   Body:    { action?: 'send'|'resend', role, email, store_id,
//              display_name?, reason? }
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const ADMIN_ROLES = ["admin", "super_admin"];
const ALLOWED_ROLES = ["operator", "courier"];
const AUTH_TIMEOUT_MS = 10_000;

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

function isPlausibleEmail(value: unknown): boolean {
  return typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

function isUuid(value: unknown): boolean {
  return typeof value === "string" &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

type AuthAttempt =
  | { kind: "ok"; value: unknown }
  | { kind: "timeout" }
  | { kind: "error"; error: { status?: number; message?: string } };

async function invokeWithTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
): Promise<AuthAttempt> {
  let timer: number | undefined;
  const timeoutP = new Promise<AuthAttempt>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), ms);
  });
  try {
    const value = await Promise.race([fn(), timeoutP]);
    if (timer) clearTimeout(timer);
    return value as AuthAttempt;
  } catch (e) {
    if (timer) clearTimeout(timer);
    const err = e as { status?: number; message?: string };
    return { kind: "error", error: { status: err?.status, message: err?.message } };
  }
}

type Optionals = Record<string, unknown>;
const firstStr = (v: unknown): string =>
  typeof v === "string" ? (v as string).trim() : "";

Deno.serve(async (req: Request) => {
  // 0) CORS preflight — the Supabase gateway forwards OPTIONS to the function.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED" });
  }

  // 2) Authenticate the caller.
  const authHeader = req.headers.get("Authorization") ?? "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return json(401, { error: "NOT_AUTHORIZED" });
  }
  const token = tokenMatch[1];

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { error: "SERVER_MISCONFIGURED" });
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerAuth, error: callerErr } = await service.auth.getUser(token);
  if (callerErr || !callerAuth?.user) {
    return json(401, { error: "NOT_AUTHORIZED" });
  }
  const adminUid = callerAuth.user.id;
  if (!adminUid) {
    return json(401, { error: "NOT_AUTHORIZED" });
  }

  // 3) AUTHORIZE — real admin only (independent of the frontend).
  const { data: roleRow, error: roleErr } = await service
    .from("users")
    .select("role")
    .eq("id", adminUid)
    .maybeSingle();
  if (roleErr || !roleRow || !ADMIN_ROLES.includes(roleRow.role as string)) {
    return json(403, { error: "NOT_AUTHORIZED" });
  }

  // 4) Parse + validate the input contract.
  let body: Optionals;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "ARGUMENTS_INVALID" });
  }

  const action = firstStr(body.action) === "resend" ? "resend" : "send";
  const role = firstStr(body.role);
  const emailRaw = firstStr(body.email);
  const storeId = firstStr(body.store_id);
  const displayName = firstStr(body.display_name);
  const reason = firstStr(body.reason).slice(0, 200);

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

  const email = emailRaw.trim().toLowerCase();
  const userMeta: Record<string, string> = {};
  if (displayName) userMeta.display_name = displayName;
  userMeta.pilot_role = role;

  // 5) Store must exist (canonical FK guard before any reservation).
  const { data: storeRow, error: storeErr } = await service
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr || !storeRow) {
    return json(409, { error: "STORE_NOT_FOUND" });
  }

  // 6) CLASSIFY — server-side A..E (the DB is the only source of truth).
  const { data: cls, error: classifyErr } = await service.rpc(
    "pilot_invitee_classify",
    { p_email: email, p_member_kind: role, p_store_id: storeId },
  );
  if (classifyErr) {
    return json(500, { error: "CLASSIFY_FAILED", detail: classifyErr.message });
  }
  const classification = cls?.classification as string;
  const membershipStatus = (cls?.membership?.status ?? "none") as string;
  const roleMatch = cls?.membership?.role_match === true;
  const exists = cls?.exists === true;
  const userId = (typeof cls?.user_id === "string" ? cls.user_id : null) as string | null;

  // 7) Classification-determined early exits.
  if (classification === "A") {
    // Operational member: fully protected — NO invite, NO resend, NO write.
    console.log(`[pilot-invite] action=${action} class=A email_flow=blocked`);
    return json(200, { ok: false, code: "ALREADY_OPERATIONAL" });
  }
  if (!roleMatch) {
    return json(409, { ok: false, code: "MEMBERSHIP_CONFLICT" });
  }
  if (classification === "B") {
    // Existing confirmed + password: credentials already exist -> provision the
    // membership if missing, but never dispatch an invitation email.
    if (membershipStatus === "none") {
      if (!userId) {
        return json(500, { ok: false, code: "CLASSIFY_INCONSISTENT" });
      }
      const { error: provErr } = await service.rpc(
        "pilot_provision_new_membership",
        {
          p_role: role,
          p_store_id: storeId,
          p_user_id: userId,
          p_actor_user_id: adminUid,
          p_reason: reason || "pilot invitation (existing confirmed identity)",
        },
      );
      if (provErr) {
        const code = (provErr as { code?: string }).code;
        if (code === "P0002" || /TRANSITION_NOT_ALLOWED|ROLE_CONFLICT/i.test(provErr.message)) {
          return json(409, { ok: false, code: "MEMBERSHIP_CONFLICT" });
        }
        return json(500, { ok: false, code: "MEMBERSHIP_PROVISION_FAILED" });
      }
    }
    console.log(`[pilot-invite] action=${action} class=B email_flow=skipped`);
    return json(200, { ok: true, code: "INVITATION_NOT_REQUIRED" });
  }

  // 8) Channel decision (approved Final Plan §1/§5):
  //      C (confirmed, credential-less) -> magic_link — existing identity, never recreated.
  //      D (existing, unconfirmed)      -> invite     — existing identity, never recreated.
  //      E (no identity)                -> invite     — NEW identity (invite flow only).
  const channel = classification === "C" ? "magic_link" : "invite";

  // 9) RESERVE FIRST — the lifecycle row must exist before any email can go out.
  if (action === "resend") {
    // The row must already exist and not be COMPLETED.
    const { data: existingRow } = await service
      .from("pilot_invitations")
      .select("id, status")
      .eq("invite_email", email)
      .eq("store_id", storeId)
      .eq("member_kind", role)
      .maybeSingle();
    if (!existingRow) {
      return json(400, { ok: false, code: "INVITATION_NOT_FOUND" });
    }
    if (existingRow.status === "COMPLETED") {
      return json(409, { ok: false, code: "INVITATION_COMPLETED" });
    }
  }

  const reserveResult = await service.rpc(
    exists && userId
      ? "pilot_invitation_reserve"
      : "pilot_invitation_reserve_by_email",
    exists && userId
      ? {
          p_email: email,
          p_user_id: userId,
          p_store_id: storeId,
          p_member_kind: role,
          p_channel: channel,
        }
      : {
          p_email: email,
          p_store_id: storeId,
          p_member_kind: role,
          p_channel: channel,
        },
  );

  if (reserveResult.error) {
    return json(500, { ok: false, code: "RESERVATION_FAILED" });
  }
  const reservation = reserveResult.data as {
    ok?: boolean;
    code?: string;
    invitation_id?: string;
  } | null;
  if (!reservation?.ok) {
    const code = reservation?.code ?? "RESERVATION_FAILED";
    const status = code === "COOLDOWN_ACTIVE" ? 429 : 409;
    return json(status, { ok: false, code });
  }
  const invitationId = reservation.invitation_id ?? null;
  if (!invitationId) {
    return json(500, { ok: false, code: "RESERVATION_INCONSISTENT" });
  }

  // 10) THE AUTH OP — the ONLY step that can dispatch an email (10s bound).
  const attempt = await invokeWithTimeout(
    () =>
      channel === "magic_link"
        ? service.auth.signInWithOtp({ email, options: { data: userMeta } })
        : service.auth.admin.inviteUserByEmail(email, { data: userMeta }),
    AUTH_TIMEOUT_MS,
  );

  let gotError: "determinate" | "indeterminate" | null = null;
  if (attempt.kind === "timeout") {
    gotError = "indeterminate"; // unknown whether the email dispatched
  } else if (attempt.kind === "error") {
    const status = attempt.error.status ?? 0;
    gotError = status >= 500 || status === 0 ? "indeterminate" : "determinate";
  }

  if (gotError) {
    // Failure: same row stays PENDING + FAILED event; nothing is deleted.
    await service.rpc("pilot_invitation_abort", {
      p_invitation_id: invitationId,
      p_outcome: gotError,
      p_reason: reason || (gotError === "indeterminate" ? "auth outcome unknown" : "auth rejected dispatch"),
    });
    console.log(`[pilot-invite] action=${action} outcome=${gotError} class=${classification}`);
    if (gotError === "indeterminate") {
      return json(502, { ok: false, code: "INVITE_DISPATCH_AMBIGUOUS" });
    }
    return json(409, { ok: false, code: "INVITE_DISPATCH_FAILED" });
  }

  // 11) SUCCESS — finalize dispatch. 'SENT' now means Auth confirmed it.
  const attemptValue = attempt.value as {
    data?: Optionals; // supabase-js shapes: { data: { user?: ... } }
  };

  // Resolve the identity for the invitation:
  //   - classes C/D: classify already found the EXISTING identity (never
  //     recreated) -> boundUserId = userId.
  //   - class E: the identity was just created by THIS request -> resolve it
  //     from the invite response, or via the canonical users mirror.
  let boundUserId = userId;
  if (!exists) {
    const invitedUser = attemptValue.data?.user as { id?: string } | undefined;
    let createdUid: string | null =
      typeof invitedUser?.id === "string" ? invitedUser.id : null;
    if (!createdUid) {
      const { data: mirrorUsers } = await service
        .from("users")
        .select("id")
        .eq("email", email)
        .limit(1);
      const row = mirrorUsers?.[0];
      createdUid = row && typeof row.id === "string" ? row.id : null;
    }
    if (!createdUid) {
      // The identity exists but could not be resolved -> ambiguous outcome.
      await service.rpc("pilot_invitation_abort", {
        p_invitation_id: invitationId,
        p_outcome: "indeterminate",
        p_reason: "identity created but not resolvable",
      });
      return json(502, { ok: false, code: "INVITE_DISPATCH_AMBIGUOUS" });
    }
    boundUserId = createdUid;
  }

  // 11b) ENSURE BOUND — IDENTITY_LINK_FAILED recovery. A class E row is
  // email-keyed (user_id NULL) until the first successful bind; a prior bind
  // failure leaves it NULL while the identity already exists. On this retry the
  // SAME invitation is reused (reserve never re-creates a row) and, because
  // THIS attempt's dispatch is confirmed, we re-run bind whenever the row is
  // still unbound. We NEVER create a second identity or a second invitation and
  // NEVER delete anything. mark_sent below runs ONLY in this confirmed-dispatch
  // branch — an existing identity by itself is never treated as dispatch proof.
  if (boundUserId) {
    const { data: invRow } = await service
      .from("pilot_invitations")
      .select("id, user_id")
      .eq("id", invitationId)
      .maybeSingle();
    const invUserId =
      invRow && typeof invRow.user_id === "string" ? invRow.user_id : null;
    if (invUserId === null) {
      const { error: bindErr } = await service.rpc("pilot_invitation_bind", {
        p_invitation_id: invitationId,
        p_user_id: boundUserId,
        p_email: email,
      });
      if (bindErr) {
        // Dispatch CONFIRMED for this attempt but the link failed again: keep
        // the identity and the PENDING row fully diagnosable (NO delete, no
        // second invitation) — a later retry re-binds and finalizes.
        console.log(`[pilot-invite] bind-failed code=${(bindErr as { code?: string }).code}`);
        return json(502, { ok: false, code: "IDENTITY_LINK_FAILED" });
      }
    }
  }

  // 11c) mark_sent — finalize THIS confirmed dispatch on the SAME invitation.
  const sent = await service.rpc("pilot_invitation_mark_sent", {
    p_invitation_id: invitationId,
  });
  if (sent.error) {
    // Auth dispatched, but the DB finalization failed: identity kept, row kept
    // (still PENDING); manual diagnosis + retry. Never a delete.
    console.log(`[pilot-invite] mark_sent-failed code=${(sent.error as { code?: string }).code}`);
    return json(502, { ok: false, code: "INVITATION_FINALIZE_FAILED" });
  }
  const sentData = sent.data as { event_type?: string } | null;
  const isResent = sentData?.event_type === "RESENT";

  // 12) Membership: provision ONLY when missing (idempotent, re-runnable).
  if (membershipStatus === "none" && boundUserId) {
    const { error: provErr } = await service.rpc(
      "pilot_provision_new_membership",
      {
        p_role: role,
        p_store_id: storeId,
        p_user_id: boundUserId,
        p_actor_user_id: adminUid,
        p_reason: reason || "pilot invitation (new/activatable identity)",
      },
    );
    if (provErr) {
      // Sent + provisioned-later is safe: the membership is pending-only and
      // this RPC is idempotent, so a later send/re-trigger can recover it.
      console.log(`[pilot-invite] provision-deferred code=${(provErr as { code?: string }).code}`);
    }
  }

  console.log(`[pilot-invite] action=${action} class=${classification} result=dispatched`);
  return json(200, {
    ok: true,
    code: isResent ? "INVITATION_RESENT" : "INVITATION_SENT",
  });
});