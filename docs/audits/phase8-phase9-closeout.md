# FOCUS — Phase 8 & Phase 9 Closeout Record (Verified)

- **Status:** COMPLETE / CLOSED
- **Date:** 2026-09-03
- **Owner verification:** performed live in Supabase SQL Editor (owner role).

---

## Phase 8 — Telemetry Wiring (CLOSED / VERIFIED)

Delivery: Reaction Light funnel (P0), TTT-multiplayer funnel, auth funnel, plus additive
migration `00061` and corrective ACL migration `00062`.

### 00061 — additive telemetry events (applied)
- Comparison-only review vs 00057/00058 passed (byte-equivalent except the 16 additive
  domain/allowlist branches). Migration applied via SQL Editor as instructed.

### 00062 — analytics anon ACL fix (APPLIED — supersedes any prior "unapplied" note)
Migration `00062_telemetry_analytics_anon_acl_fix.sql` was applied live to
`public.get_telemetry_analytics(timestamptz,timestamptz,text,text,text,text)`.

Verified live result:

```text
analytics_anon          = false
analytics_authenticated = true
```

Current `proacl` (verified, no `anon=X` present):

```text
{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

Final ACL matrix (as designed):

- `record_telemetry_event(jsonb)`: anon=true, authenticated=true
- `get_telemetry_analytics(...)`: anon=false, authenticated=true

**Phase 8 = CLOSED / VERIFIED.**

---

## Phase 9 — Full User Action Telemetry Coverage (CLOSED / VERIFIED)

- Repository audit completed.
- Existing telemetry mapped (navigation/`screen_view`, categories, products/showroom,
  marketplace/order funnel, ads, games, auth, search).
- Missing meaningful action identified: `product_image_view` (real fullscreen image-viewer
  interaction in the product-details gallery, previously untracked).
- Implemented: `product_image_view` wired at fullscreen-open + explicit image-selection
  (dot/thumbnail) in `PhoneGallery` and `ProductImageGallery`, with canonical `entityId`
  passed from `ProductDetailsScreen`; deduped per product+index.
- No DB migration needed — `product_image_view` was already declared client-side and
  already allowed server-side in 00057 (domain `product`, allowlist `['index']`).
- Tests: new `t4-4-phase9-product-image.test.ts` → **9/9 PASS**; telemetry suite **152/152
  PASS**; full suite **3281 passed / 3 failed (all pre-existing, unchanged)**.
- TypeScript PASS; Build PASS; Privacy review PASS; no new regressions; no
  security/RBAC/game-contract changes.
- Deferred events documented (duplicate-placeholder/no-real-action/sensitive).

**Phase 9 = CLOSED / VERIFIED.** (No telemetry added merely to inflate event count.)

---

## Next Phase — Admin Control Center (Settings)

Separate phase: move manageable operational settings into the Admin Control Center using the
existing `app_settings` / Settings Control Center architecture (no parallel settings system).
Discovery-pass only — no code/migration changes until the Admin Settings Inventory Report is
reviewed. See the accompanying inventory report.
