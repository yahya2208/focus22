// order-push — Web Push sender (G-N3 closed-app coverage + settlement events).
//
// Trigger A (unchanged): Supabase DB Webhook on public.orders INSERT
// (post-commit only). Staff-only recipients, event 'order_created'.
// The order/settlement/inventory transaction never depends on this function:
// webhook delivery is fire-and-forget from the DB side, and every step below
// is failure-isolated per endpoint.
//
// Trigger B (settlement decisions): authenticated client call AFTER a
// committed settle/cancel result. The client invokes ONLY after receiving
// success; push is best-effort courtesy — the durable record is order
// status + timeline (visible in My Orders / Command Center on next open).
// Browser closure between settle success and this call means no push;
// that loss is accepted by design (see reliability note below).
//
// Flow: verify caller (webhook secret OR user JWT) → load order row
// (service role = authoritative figures, never client-supplied money) →
// resolve recipients (staff always; + customer for settle events) → load
// live push_subscriptions → claim-first per (order_id, endpoint, event)
// (PK race absorbs concurrent retries) → send minimal payload → release
// claim on transient failure, keep it on 410 revocation.
//
// Secrets (Edge secrets, NEVER in git/client): WEBHOOK_SECRET,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:).
// Payload is minimal: order/store/event + display figures. Details load
// post-open under the viewer's own session.

import { createClient } from "jsr:@supabase/supabase-js@2";
// @deno-types="npm:@types/web-push"
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("ORDER_PUSH_WEBHOOK_SECRET") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:ops@example.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function isUuid(value: unknown): boolean {
  return typeof value === "string" &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !WEBHOOK_SECRET || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    return json(500, { ok: false, code: "PUSH_NOT_CONFIGURED" });
  }

  let body: {
    record?: { id?: unknown; store_id?: unknown; total?: unknown; created_at?: unknown };
    order_id?: unknown;
    event?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: "BAD_PAYLOAD" });
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // --- Caller verification: webhook secret (Trigger A) or user JWT (Trigger B).
  const isWebhook = req.headers.get("x-webhook-secret") === WEBHOOK_SECRET;
  let callerUid: string | null = null;
  let event: string = "order_created";
  if (!isWebhook) {
    const authHeader = req.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/.exec(authHeader);
    if (!match) return json(401, { ok: false, code: "BAD_CALLER" });
    const { data: userData, error: userErr } = await service.auth.getUser(match[1]);
    if (userErr || !userData?.user) return json(401, { ok: false, code: "BAD_CALLER" });
    callerUid = userData.user.id;
    const requested = body?.event;
    if (requested !== "settle_accepted" && requested !== "settle_rejected") {
      return json(400, { ok: false, code: "BAD_EVENT" });
    }
    event = requested;
  }

  const orderId = isWebhook ? body?.record?.id : body?.order_id;
  if (!isUuid(orderId)) return json(200, { ok: true, code: "IGNORED_NON_ORDER" });

  // --- Authoritative order figures (service role; never client-supplied money).
  const { data: orderRow, error: orderErr } = await service
    .from("orders")
    .select("id, store_id, total, user_id, family_id, order_number, status")
    .eq("id", orderId)
    .single();
  if (orderErr || !orderRow) return json(200, { ok: true, code: "ORDER_NOT_FOUND", order_id: orderId });
  const order = orderRow as {
    id: string; store_id: string | null; total: number; user_id: string | null;
    family_id: string | null; order_number: string; status: string;
  };
  const storeId = order.store_id;

  // --- Caller authorization for Trigger B: admin, operator of this store,
  // --- or the ordering customer. Webhook path skips this (shared secret).
  if (!isWebhook && callerUid) {
    const { data: callerRow } = await service.from("users").select("id, role").eq("id", callerUid).single();
    const callerRole = (callerRow as { role?: string } | null)?.role ?? null;
    const isStaff = callerRole === "admin" || callerRole === "super_admin";
    let isOperator = false;
    if (typeof storeId === "string" && isUuid(storeId)) {
      const { data: cop } = await service
        .from("pilot_store_operators").select("user_id").eq("store_id", storeId).eq("user_id", callerUid)
        .eq("status", "active").limit(1);
      isOperator = (cop ?? []).length > 0;
    }
    const isCustomer = typeof order.user_id === "string" && order.user_id === callerUid;
    if (!isStaff && !isOperator && !isCustomer) {
      return json(403, { ok: false, code: "PUSH_NOT_ALLOWED", order_id: orderId });
    }
  }

  // --- Recipients, server-side only. Settle events add the customer;
  // --- the order_created webhook path stays staff-only (unchanged behavior).
  const { data: admins } = await service.from("users").select("id").in("role", ["admin", "super_admin"]);
  let operatorIds: string[] = [];
  if (typeof storeId === "string" && isUuid(storeId)) {
    const { data: ops } = await service
      .from("pilot_store_operators").select("user_id").eq("store_id", storeId).eq("status", "active");
    operatorIds = (ops ?? []).map((r) => (r as { user_id: string }).user_id).filter((v) => typeof v === "string");
  }
  const recipientIds = [...new Set([...(admins ?? []).map((r) => (r as { id: string }).id), ...operatorIds])];
  if (!isWebhook && typeof order.user_id === "string") {
    recipientIds.push(order.user_id);
  }
  if (recipientIds.length === 0) return json(200, { ok: true, code: "NO_RECIPIENTS", order_id: orderId });

  // --- Authoritative settle figures for the payload (server-computed).
  let shortfall: number | null = null;
  if (event === "settle_accepted" || event === "settle_rejected") {
    if (typeof order.family_id === "string") {
      const { data: rows } = await service.from("ledger").select("amount").eq("family_id", order.family_id);
      const balance = (rows ?? []).reduce((s, r) => s + Number((r as { amount: number }).amount ?? 0), 0);
      shortfall = Math.max(Number(order.total ?? 0) - Math.max(balance, 0), 0);
    } else {
      shortfall = 0;
    }
  }

  const { data: subs } = await service
    .from("push_subscriptions").select("user_id, endpoint, p256dh, auth")
    .in("user_id", [...new Set(recipientIds)])
    .is("revoked_at", null);
  if (!subs || subs.length === 0) return json(200, { ok: true, code: "NO_SUBSCRIPTIONS", order_id: orderId });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const payload = JSON.stringify({
    order_id: orderId,
    order_number: order.order_number ?? null,
    store_id: typeof storeId === "string" ? storeId : null,
    total: typeof order.total === "number" ? order.total : null,
    event,
    shortfall,
    target: "pilot-store-ops",
  });

  let sent = 0;
  let skipped = 0;
  for (const s of subs as { user_id: string; endpoint: string; p256dh: string; auth: string }[]) {
    // Claim-first idempotency: atomically claim (order_id, endpoint, event)
    // BEFORE sending. Concurrent deliveries race on the PRIMARY KEY —
    // exactly one wins the claim and sends; losers skip. Sequential retries
    // find the prior claim and skip without resending. Distinct events never
    // collide (settle_accepted vs settle_rejected vs order_created).
    const { data: claimed, error: claimErr } = await service
      .from("push_log")
      .insert(
        { order_id: orderId, endpoint: s.endpoint, event },
        { onConflict: "order_id,endpoint,event", ignoreDuplicates: true },
      )
      .select("order_id");
    if (claimErr || !claimed || (claimed as unknown[]).length === 0) {
      skipped += 1;
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 24 * 3600 },
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Dead endpoint: keep the claim (prevents retry storms to a dead
        // address) and revoke the subscription. A future re-subscribe with
        // the same endpoint reuses the row only after manual review.
        await service.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("endpoint", s.endpoint);
      } else {
        // Transient failure: release the claim so a later retry may re-attempt.
        await service.from("push_log").delete().eq("order_id", orderId).eq("endpoint", s.endpoint).eq("event", event);
      }
    }
  }

  return json(200, { ok: true, code: "PUSH_FANOUT", order_id: orderId, event, sent, skipped });
});
