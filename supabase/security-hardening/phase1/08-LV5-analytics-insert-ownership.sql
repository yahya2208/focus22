-- Type: Hardening (Phase 1 · LV-5 · item 8)
-- Notes: Closes the unauthenticated analytics_events INSERT path. Evidence (2026-08-02):
--   (a) Broad INSERT policy proven: "Anyone can insert analytics events"
--       (INSERT, roles={public}, with_check=true) — any caller (even anonymous,
--       no session) may write unlimited events into analytics_events (Database DoS
--       vector, unauthenticated). This violates the acceptance criterion:
--       thousands of events in analytics_events are constrained.
--   (b) Live data (2026-08-02): 8863 total / 443 with user_id / 8420 NULL
--       user_id (~95%). The app's telemetry path inserts WITHOUT user_id
--       (src/core/telemetry/index.ts trackEvent -> user_id: event.userId ?? undefined;
--       no setUserId/setContext callers in production code). Strict ownership
--       (user_id = auth.uid()) would therefore BREAK ~95% of real inserts.
--   (c) Decision (Option B, documented): keep NULL inserts for telemetry, require
--       an authenticated session, and forbid cross-user attribution:
--       policy TO authenticated WITH CHECK ((user_id IS NULL) OR (user_id = auth.uid())).
--       -> blocks anonymous writers (a bot now needs an account);
--       -> blocks cross-user user_id (a caller cannot attribute events to someone else);
--       -> preserves the NULL telemetry path (authenticated session, no user_id).
--       Volume / rate-limiting for authenticated spammers is a Phase 2 item
--       (roadmap: Rate Limit / Quota — deferred by design decision).
--   (d) Read-side policies are untouched: "Researchers read all analytics events"
--       (is_research_role()) and "Users read own analytics events" (auth.uid()=user_id)
--       remain exactly as item 2 defined them.
--   (e) Insert respects NOT NULL constraints: event_type, event_data (jsonb),
--       created_at are required (structure snapshot 2026-08-02); user_id,
--       session_id, device_id, user_agent, campaign_id are nullable.
-- Reference: docs/security/remediation-roadmap.md (Phase 1, LV-5) +
--            docs/security/production-security-audit.md (LV-5).
-- Apply via Supabase SQL Editor (owner role) on Production. Idempotent.

drop policy if exists "Anyone can insert analytics events" on public.analytics_events;

create policy "Authenticated users insert own analytics events"
on public.analytics_events
for insert
to authenticated
with check ((user_id is null) or (user_id = auth.uid()));
