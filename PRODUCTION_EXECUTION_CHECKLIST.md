# PRODUCTION EXECUTION CHECKLIST — FOCUS release
Generated read-only. No step below has been executed from here.
HEAD = origin/main = `6d4bf82`.

## A — MUST APPROVE (explicit owner approval, in order)
1. Produce data writes (10 rows + links, trial prices).
2. Apply 00115 (link RPC) — only if precheck shows absent.
3. Apply 00116 (fruit CHECK) — only if precheck shows absent.
4. Apply 00117 (preferences) — only if precheck shows absent.
5. Apply 00118 (push tables) — only after Edge reviewed + VAPID ready.
6. Model renames (3 guarded UPDATEs, count=1 each).
7. VAPID generation + Edge secrets + Edge deploy + DB webhook.
8. Invite policy (00088/00110) — SEPARATE decision, default HOLD.
9. 00113 — NO ACTION (no apply receipt exists; do not record as applied).

## B — MUST RUN IN SUPABASE (SQL Editor, each with precheck + postcheck)
### B1. Produce preflight (read-only)
```sql
SELECT 'veg_rows', count(*) FROM public.inventory_items WHERE source_key LIKE 'pilot:veg-%'
UNION ALL SELECT 'veg_dupes', count(*) FROM (SELECT source_key FROM public.inventory_items WHERE source_key LIKE 'pilot:veg-%' GROUP BY source_key HAVING count(*)>1) d
UNION ALL SELECT 'veg_links', count(*) FROM public.store_inventory si JOIN public.inventory_items ii ON ii.id=si.inventory_id WHERE si.store_id='8e1bdb04-dccc-4188-8404-a340be5325b9' AND ii.category='produce'
UNION ALL SELECT 'phone_links', count(*) FROM public.store_inventory si JOIN public.inventory_items ii ON ii.id=si.inventory_id WHERE si.store_id='8e1bdb04-dccc-4188-8404-a340be5325b9' AND ii.category <> 'produce';
```
Expected before writes: `0 / 0 / 0 / 5`. STOP if dupes>0 or phone_links≠5.
### B2. Seed (idempotent; trial prices; phones/بلدي untouched) + links (guarded INSERTs only)
See apply-pack Blocks 1b–1c (10-row VALUES + per-row link INSERTs, `ON CONFLICT DO NOTHING`, replace-RPC banned).
Postcheck: `veg_rows=10, veg_dupes=0, veg_links=10, phone_links=5`.
### B3. 00115 — precheck: `to_regprocedure('public.pilot_admin_link_store_inventory(uuid,uuid[])')` NULL = absent. Apply: file verbatim. Postcheck: present + in-file DO guard silent. Rollback: `DROP FUNCTION` (no dependents exist pre-launch).
### B4. 00116 — precheck: CHECK def lacks 'fruit'. Apply verbatim. Postcheck: five values present. Rollback: re-apply four-value CHECK (only if zero fruit rows exist).
### B5. 00117 — precheck: cols absent + 3 RPCs absent. Apply verbatim. Postcheck: nullable-text cols + DEFINER/authenticated-only RPCs. Rollback: DROP FUNCTIONs + DROP COLUMNs (only if no data written through them).
### B6. 00118 — precheck: tables absent. Apply verbatim ONLY after §G Edge review sign-off. Postcheck: tables + RLS + in-file guards.
### B7. Renames — precheck count=1 per source_key (`veg-bell-pepper→فلفلة`, `veg-hot-pepper→حرور`, `veg-lettuce→خس (سلاطة)`, category='produce'). SKIP any with count≠1. Verify after.

## C — DASHBOARD
1. Edge: deploy `order-push` (from repo file, unmodified) — AFTER B6.
2. Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORDER_PUSH_WEBHOOK_SECRET (new random), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
3. Webhook: DB webhook on `public.orders` INSERT → order-push URL + `x-webhook-secret` header — AFTER Edge live.
4. VAPID: generate off-repo (`npx web-push generate-vapid-keys`); public key → app config; private → Edge secret only.

## D — TERMINAL (owner machine)
- `npx web-push generate-vapid-keys` (record, never commit).
- `supabase functions deploy order-push` (or Dashboard deploy).
- Smoke: POST Edge with wrong secret → expect 401; with test order_id + zero subscriptions → expect NO_SUBSCRIPTIONS, zero sends.

## E — BROWSER (manual E2E)
Home → Vegetables (10 cards) → 2.5kg → cart → checkout → order → balance debit → StoreOps advance → settle → stock/movement → banner appears (admin session) → background-tab notification → push with app closed (post G-N3 infra) → Family Home (balance, saved, reorder, contact, preferences) → contact round-trip.

## F — BLOCKED (do not execute)
- 00110 / 00088 / 00089 / 00086 (policy HOLD).
- 00113 apply/record (no receipt; staging evidence is not Production evidence).
- 00109 Production seeding (staging-only by header).
- Service-role in browser; RLS bypass; public channels; anon grant changes.
- Re-applying 00115/00116/00117 if postchecks already show their effects.
