// order-push — NEW_ORDER Web Push sender (G-N3, closed-app coverage).
//
// Trigger: Supabase DB Webhook on public.orders INSERT (post-commit only).
// The order/settlement/inventory transaction never depends on this function:
// webhook delivery is fire-and-forget from the DB side, and every step below
// is failure-isolated per endpoint.
//
// Flow: verify webhook secret → load order row → resolve recipients
// (users.role admin/super_admin + operators of order.store_id) → load their
// live push_subscriptions → send minimal payload per endpoint → record
// push_log (UNIQUE(order_id, endpoint) absorbs retries/fan-out dupes) →
// mark 410/expired endpoints revoked.
//
// Secrets (Edge secrets, NEVER in git/client): WEBHOOK_SECRET,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:).
// Payload is minimal: order/store/total + navigation target. Details load
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
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return json(401, { ok: false, code: "BAD_WEBHOOK_SECRET" });
  }

  let body: { record?: { id?: unknown; store_id?: unknown; total?: unknown; created_at?: unknown } };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: "BAD_PAYLOAD" });
  }
  const orderId = body?.record?.id;
  const storeId = body?.record?.store_id ?? null;
  if (!isUuid(orderId)) return json(200, { ok: true, code: "IGNORED_NON_ORDER" });

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Recipients, server-side only: admins + operators of this store.
  const { data: admins } = await service.from("users").select("id").in("role", ["admin", "super_admin"]);
  let operatorIds: string[] = [];
  if (typeof storeId === "string" && isUuid(storeId)) {
    const { data: ops } = await service
      .from("pilot_store_operators").select("user_id").eq("store_id", storeId).eq("status", "active");
    operatorIds = (ops ?? []).map((r) => (r as { user_id: string }).user_id).filter((v) => typeof v === "string");
  }
  const recipientIds = [...new Set([...(admins ?? []).map((r) => (r as { id: string }).id), ...operatorIds)];
  if (recipientIds.length === 0) return json(200, { ok: true, code: "NO_RECIPIENTS", order_id: orderId });

  const { data: subs } = await service
    .from("push_subscriptions").select("user_id, endpoint, p256dh, auth")
    .in("user_id", recipientIds)
    .is("revoked_at", null);
  if (!subs || subs.length === 0) return json(200, { ok: true, code: "NO_SUBSCRIPTIONS", order_id: orderId });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const payload = JSON.stringify({
    order_id: orderId,
    store_id: typeof storeId === "string" ? storeId : null,
    total: typeof body.record?.total === "number" ? body.record.total : null,
    target: "pilot-store-ops",
  });

  let sent = 0;
  for (const s of subs as { user_id: string; endpoint: string; p256dh: string; auth: string }[]) {
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
        await service.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("endpoint", s.endpoint);
      }
    }
    // Idempotency record: retries and multi-device fan-out collapse here.
    await service.from("push_log").upsert(
      { order_id: orderId, endpoint: s.endpoint },
      { onConflict: "order_id,endpoint", ignoreDuplicates: true },
    );
  }

  return json(200, { ok: true, code: "PUSH_FANOUT", order_id: orderId, sent });
});
