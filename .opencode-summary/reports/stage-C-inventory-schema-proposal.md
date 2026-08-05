# Stage C — Supabase Inventory Design (REVISED — approval to draft migration only)

Date: 2026-08-05
Status: **Design revised with mandatory conditions. Migration draft created for review
ONLY. No SQL has been executed and none will be without explicit approval.**

## Mandatory conditions incorporated (user-approved)
1. **Single unified data source**: all screens (showroom, inventory, buy, sell,
   exchange) read AND write the same `inventory_items` table. No LocalStorage and
   no parallel data source in production. LocalStorage is retired as a source;
   at most an offline read fallback, never written in production.
2. **Full CRUD**: add / edit / hide (soft delete) / restore / archive / publish.
   Every change writes an audit row with `created_by`/`updated_by` + timestamp.
3. **Prices**: `buy_price` = management only; `sell_price` = customer-visible.
   `buy_price` is **never granted** to the `authenticated`/`anon` roles at the
   column level, so it cannot be reached via the table API or any query by
   unauthorized users. Full reads go exclusively through a SECURITY DEFINER RPC
   that checks `public.users.role`.
4. **Images**: multiple per item; cover image; ordering; delete & replace; stored
   in the `inventory-images` Storage bucket, linked by `inventory_images`.
   UUID filenames only. Public bucket read; write restricted to admin/super_admin.
5. **Phone fields (from day one)**: brand, model, condition (new/used), description,
   color, storage, quantity, availability status, publish status, prices.
6. **Realtime**: `inventory_items` (+ images) added to the `supabase_realtime`
   publication so admin edits appear instantly on the site without redeploy.
7. **Migration**: this file is written for review only; execution happens only after
   explicit approval of the reviewed file.

## Role matrix (final)
| App role (users.role) | inventory_items SELECT | buy_price / quantity | INSERT/UPDATE | DELETE |
|---|---|---|---|---|
| guest / user | public columns, published rows | ❌ | ❌ | ❌ |
| researcher | public columns via REST; full via RPC | ✅ read-only (analytics) | ❌ | ❌ |
| admin | public columns via REST; full via RPC | ✅ | ✅ | ❌ (no DELETE policy/grant) |
| super_admin | same as admin | ✅ | ✅ | ❌ via API (maintenance-only outside UI) |

Hide = `is_published=false` and/or `status='archived'`; item remains in DB; admin can
restore/edit/republish. Hard delete is never reachable from the API (no DELETE grant,
no DELETE policy) — reserved for out-of-band maintenance after backup.

## Objects in `00014_inventory_tables.sql` (additive, idempotent)
- `public.inventory_items` (all fields above; `UNIQUE (model_id, variant, condition, color)`).
- `public.inventory_images` (`inventory_id` FK CASCADE, `path`, `position`, `is_cover`,
  partial unique index enforcing one cover per item).
- `public.inventory_movements` (audit: `action`, `before`/`after` JSONB, `created_by`, `created_at`).
- Trigger `set_inventory_updated` (BEFORE UPDATE → `updated_at`, `updated_by=auth.uid()`).
- Trigger `audit_inventory_change` (SECURITY DEFINER; AFTER INSERT/UPDATE →
  semantic action `created|published|hidden|archived|restored|price_updated|stock_added|stock_removed|status_changed|updated` with field-level JSONB diff).
- RLS policies (public read / staff write / staff movements read), column-level grants,
  `GRANT INSERT, UPDATE` (no DELETE grant).
- SECURITY DEFINER RPC `inventory_management_list()` (role-checked; returns full rows
  incl. buy_price for researcher/admin/super_admin; empty set otherwise).
- Storage bucket `inventory-images` (public) + objects policies (write = admin/super_admin).
- `supabase_realtime` publication membership for items + images (guarded, idempotent).

## Rollback
`DROP TABLE public.inventory_movements; DROP TABLE public.inventory_images;
DROP TABLE public.inventory_items;` then remove bucket + policies.

## Next step
Draft `supabase/migrations/00014_inventory_tables.sql` and hand it over for full
review. No execution until approved.
