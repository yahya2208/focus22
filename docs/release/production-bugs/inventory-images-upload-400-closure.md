# FOCUS — Production Bug: `inventory-images` Storage Upload 400 "Unauthorized" — CLOSURE REPORT

- **Date:** 2026-08-11
- **Status:** **CLOSED / PASS**
- **File:** `docs/release/production-bugs/inventory-images-upload-400-closure.md`

---

## 1. Root Cause

- The Storage **INSERT** and **UPDATE** policies ("Staff upload inventory-images" / "Staff update inventory-images") queried **directly** from `public.inventory_items`.
- `authenticated` has **no SELECT** privilege on `inventory_items`.
- This produced a `permission denied` error inside **policy evaluation**, which Supabase Storage surfaced as **HTTP 400 Unauthorized** on every inventory image upload.

## 2. Production Fix

- Created `public.inventory_can_upload_image(text)`:
  - `SECURITY DEFINER`
  - `STABLE`
  - `SET search_path = public`
  - `EXECUTE` granted to **`authenticated` only**
  - `PUBLIC` EXECUTE = **false**
- Replaced the direct `inventory_items` subquery with the helper in **INSERT** and **UPDATE** policies only:
  - `public.inventory_can_upload_image(split_part(name, '/', 1))`
- All other policy conditions (`bucket_id`, admin check via `public.users`) remain unchanged.

## 3. Verification (read-only)

| Check | Result |
|---|---|
| 4.1 helper | **PASS** |
| 4.1 privileges | **PASS** |
| 4.2 INSERT policy | **PASS** |
| 4.2 UPDATE policy | **PASS** |
| 4.3 `inventory_items` privileges | **PASS** (0 grants to `authenticated`) |
| 4.3 `inventory_items` RLS | **PASS** (RLS = true) |
| 4.4 bucket | **PASS** |

## 4. Live Production Evidence

**Storage upload:**

```
POST /storage/v1/object/inventory-images/{inventory_id}/{uuid}.jpg
HTTP 200 OK
```

**Storage object returned:**

```
Id:  37264aac-8595-4212-bc1c-c3fb1551a9ab
Key: inventory-images/fafb9fc7-bdae-490e-aee8-46355131e0cc/773035f4-366d-4f3b-8c7e-7866ceca6993.jpg
```

**RPC:**

```
inventory_add_image → HTTP 200 OK
```

**`inventory_images`:**

```
row created successfully with matching inventory_id/path.
```

## 5. Scope Preservation

The fix did **not** change:
- `inventory_items` privileges
- `inventory_items` RLS
- bucket settings
- `inventory_add_image()`
- frontend
- upload path
- `service_role`
- any other table or policy

## 6. Closure

```
CLOSED / PASS
Production upload verified successfully.
```

---

### Execution constraints

- No additional SQL.
- No frontend changes.
- No new migration.
- No rollback.
- No other changes.
