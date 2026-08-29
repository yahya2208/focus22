# Generic Marketplace Catalog — Architecture Review

> Status: **DISCOVERY ONLY** — no code, no migration. This report must be
> approved by the user before any implementation begins.
>
> Scope: Evolve the current Marketplace (PHONE | CAR | PROPERTY only) into a
> scalable Marketplace that can support **any new category** (🥬 الخضر / fresh
> produce → طماطم tomatoes, بطاطا potatoes, بصل onions — then groceries,
> clothes, electronics, home goods, etc.) **without hard-coding a new
> category into the core each time**.
>
> Baseline: frozen commit `a934c0e` ("feat(marketplace): full listing-to-order
> marketplace baseline"). This report is read-only against that baseline.

---

## 1. CURRENT STATE — how the Marketplace works today

### 1.1 The single physical store

There is **one unified physical store** for every saleable thing:

```
inventory_items
  ├─ category      TEXT NOT NULL DEFAULT 'phone'   (CHECK: phone|car|property)
  ├─ price_period  TEXT NOT NULL DEFAULT 'sale'    (CHECK: sale|monthly)
  ├─ sell_price    numeric                         (money lives here ONLY)
  ├─ quantity      integer                         (stock)
  ├─ model_id/brand/model/color/code/warranty/city/description
  ├─ images        → inventory_images.child table (id-keyed, shared path)
  └─ status/is_published/price_period  (visibility gate)
```

- Migration `00035_listing_category_core.sql` turned `inventory_items` into the
  unified Listing store. All current rows are `phone` (default is semantically
  exact; Fast-default → no row rewrite).
- `category` is the **domain discriminator**. `price_period` is the neutral
  pricing unit; money is never duplicated.
- Phones keep the **legacy** path (`v_public_inventory`, phone SKU partial
  unique index). Car/property ride a **new neutral** path
  (`v_public_listings` / `listing_*` RPCs).

### 1.2 Domain vs Navigation Category (the two orthogonal concepts)

| Concept | Where | Meaning | Example |
|---|---|---|---|
| **Domain** | `inventory_items.category` | the physical kind of an item + its schema/detail table | `car`, `property`, `phone` |
| **Navigation category** | `public.categories` (00050) | DB-driven navigation/pages, hierarchy, theme, delivery flag | `fresh-market` → `vegetables` |

Products are **bound** to navigation categories through
`category_products` membership rows (migration 00051):

```
category_products (category_id, product_id → inventory_items.id, sort_order,
                   is_featured, is_active)
  UNIQUE (category_id, product_id)
```

This is already **correct and domain-agnostic** — a navigation category can
hold members of any domain. There is **no hard-coding of domains inside the
category layer**. This is the strong foundation the recommendation builds on.

### 1.3 The detail-path architecture (car/property precedent)

The car/property pattern is the template a generic product must follow:

```
inventory_items (core: brand, model, price, quantity, category, ...)
  ├─ FK 1:1 ──┬─ car_details       (PK = inventory_items.id, ON DELETE CASCADE)
  │           └─ property_details  (PK = inventory_items.id, RLS deny-all)
  │
  └─ v_public_listings ── flat flattened view, prefixed columns
                          (phone_*, car_*, property_*), images[], price,
                          price_period, visibility gate:
                          is_published AND quantity>0 AND
                          status NOT IN (archived,discontinued,deleted)
```

Write path (00038): `listing_create` → validates category → normalizes a jsonb
detail payload (`listing_car_payload` / `listing_property_payload`) → inserts
core + child atomically. `listing_assert_publishable` is the "no incomplete
listing goes live" completeness gate. Read path: `listing_search(category, …)`
over `v_public_listings` only, with per-category filter whitelists.

### 1.4 The full product journey (traced)

```
Admin                                 Customer
─────                                 ────────
CategoryProductsPanel / CatalogInventoryScreen
  → createListing() [listing_create RPC]         → inventory_items + child
  → InventoryService.updateImages()              → inventory_images
  → setListingPublished()                        → is_published=TRUE
                                                  → v_public_listings (identity = id)
Admin: category_products_admin_assign()          → category_products (bind to 🥬)
                                                  → CategoryScreen (members)
                                                  → ListingDetailsScreen (details)
                                                  → CartContext (catalogRef=id)
                                                  → CheckoutScreen / OrderForm
                                                  → delivery_create_order (00052)
```

### 1.5 What survives a new category untouched

- **Images** — `inventory_images` is id-keyed; any domain attached via
  `InventoryService.updateImages()` appears in `v_public_listings.images`.
  One gallery system. (00037 / `src/services/inventory-central-service.ts`)
- **Cart/order authority** — `delivery_create_order` (00052) resolves any
  `catalog_ref` against `v_public_listings` (published, in-stock), clamps
  quantity to availability, rejects only `price_period='monthly'` as
  `ITEM_NOT_ORDERABLE`. **Domain-agnostic** — zero SQL change for a new domain.
- **Navigation** — `categories` + `category_products` (00050/00051) are fully
  DB-driven; `CategoryNav.tsx` has no domain concept.
- **Cart & Checkout** line building uses `catalog_ref = inventory_items.id` —
  structurally domain-agnostic.

---

## 2. BLOCKER — can a "tomato" (250 DA / kg, stock 100, image, description,
   published) be created today?

**NO.** The path stops at the write RPC and the schema boundary. Pinpointed:

### 2.1 Write path rejects it (first hard stop)

`listing_create` (`00038`, `supabase/migrations/00038_listing_rpcs.sql:342-366`):

```plpgsql
IF p_category = 'phone' THEN
  RAISE EXCEPTION 'phones must use the legacy inventory_add_item flow';
ELSIF p_category NOT IN ('car','property') THEN
  RAISE EXCEPTION 'unknown category "%": use car|property', p_category;  -- ← tomato dies here
END IF;

-- quantity pinned to exactly 1 for car/property
IF p_quantity IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'quantity must be exactly 1 ...';  -- ← tomato diez here too (needs stock 100)
END IF;
```

There is **no generic/`vegetable`/`grocery` write path at all** — neither
`listing_create` nor any legacy RPC.

### 2.2 Schema boundary (second hard stop)

- `inventory_items_category_check CHECK (category IN ('phone','car','property'))`
  (`00035_listing_category_core.sql:58-61`) — cannot store any other value.
- `price_period CHECK ('sale','monthly')` — fine (produce is `sale`), not a
  blocker itself.
- **No unit/quantity-per-unit concept.** `quantity` is a *whole fungible count*
  (phones); cars/properties are pinned to exactly 1. There is **no
  unit column** (`kg / liter / dozen / piece`) nor a "price per kg" semantic.
  This is the **single largest genuine gap** for "طماطم 250دج/كغ، مخزون 100كغ".

### 2.3 Downstream surfaces assume only three domains

Even if a generic row somehow existed, every read/display surface is wired to
exactly three:

- `ListingCategory = 'phone' | 'car' | 'property'` (`src/domains/listings/types.ts:18`)
- `mapPublicListingRow` throws for a category with no detail branch
  (`src/services/listing-service.ts:207-230`) — a new domain with no branch
  would throw / fall through.
- `CategoryScreen` splits members by hard-coded domain:
  `domain==='phone'` OR `domain==='car'||'property'`
  (`src/screens/categories/CategoryScreen.tsx:186-204`) — a `vegetable` member
  would **silently vanish** from the category page.
- Hard-coded label/emoji maps: `PublicListingCard.tsx:34-35,88`
  (`category==='car' ? '🚗' : '🏠'`), `ListingDetailsScreen.tsx:94-99`.
- `fetchMyListings`/`assertKnownListingCategory` reject any category but
  car/property (`src/services/listing-service.ts:409-421`,
  `src/domains/listings/adminBoard.ts:26-30`).

### 2.4 Summarized blocker

> A new domain is blocked at three gates: **(1)** the DB CHECK constraint on
> `inventory_items.category`, **(2)** the `listing_create` / ownership RPC
> whitelist (car|property only) + quantity-pin-to-1, and **(3)** six TypeScript
> unions and several UI maps hard-coded to `'phone' | 'car' | 'property'`.
> In addition, **there is no `unit` (kg/liter/…) concept**, which tomatoes need.
> Cart, checkout, images, navigation categories, and order authority (00052)
> are already domain-agnostic and need **no** structural change.

---

## 3. OPTIONS — three ways to model a generic category

### OPTION A — Extend `inventory_items` into a "Generic Product / Listing Store"
(one table, many detail tables, category-check widened)

- Keep `inventory_items` as the single store. Widen the `category` CHECK to a
  growing set (`phone|car|property|vegetable|grocery|clothes|…`), add
  `vegetable_details` etc. for each new domain (or one shared
  `product_details` table), extend `v_public_listings` with prefixed columns,
  extend the `listing_*` RPCs' whitelist per category.

**Pros**
- Reuses the entire proven listing path (write RPC, view, presenters,
  filter schemas, admin board) — the car/property precedent scales.
- Identity stays `inventory_items.id` → `catalog_ref` keeps working with zero
  cart/order changes.
- Least new surface area; strongest consistency (one store, one authority).

**Cons**
- Each new category still needs *some* code: a `listing_<cat>_payload`
  normalizer, a `v_public_listings` projection, a presenter, a filter schema.
  Adding a brand-new *shape* (e.g. clothes-size / electronic-wattage) means a
  new detail table + payload. Not zero-code, but each add is mechanical.
- The central `category` CHECK must be widened on every addition (migration),
  and every typed union (`ListingCategory`, `CartDomain`, …) grows.

### OPTION B — New "Generic Products" layer keeping Phone/Car/Property intact

- A **separate** generic store (e.g. `product_catalog` table) for simple,
  unit-based, high-stock items (tomatoes, groceries), leave
  `inventory_items` + listing path untouched and dedicated to big-ticket
  categories.

**Pros**
- Zero risk to Phones/Cars/Property — completely isolated schema.
- The generic store can have exactly the right unit/stock model (kg, stock).
- Simple items don't pay for car/property complexity.

**Cons**
- **Second product system** → two identity spaces, two image paths (or a fork),
  and `catalog_ref` becomes ambiguous (which id space does an order line point
  to?). **This breaks migration 00052's single authoritative resolution** which
  resolves `catalog_ref` against `v_public_listings` only — a second store
  would need a parallel order-resolution branch.
- Duplicates the entire admin/public/cart wiring a second time.
- Violates the "no second gallery system, one store, one authority" goals.

### OPTION C — Fully generic "Attribute + Value" (EAV / jsonb attributes) model

- Store all domains in `inventory_items` (Option A shape) but put
  **domain-specific fields in a `jsonb attributes` column** instead of
  dedicated detail tables; one generic presenter; category → schema
  registry decides which attributes/units apply.

**Pros**
- Maximum flexibility; a new domain = new JSON attribute set, no new table,
  no new columns — the literal "zero-core-code" ideal.

**Cons**
- Loses type safety, CHECK-enforced validation, and indexable columns;
  fragile against typos; harder for the server-authoritative points to
  validate (00052/00038 rely on strict per-category normalization).
- Contradicts the existing house style (strict per-category payload
  normalizers + dedicated detail tables with deny-all RLS, already proven and
  tested for car/property).
- `listing_search` filtering over jsonb is clumsier than over typed columns.

### Option comparison (least migration risk × scalability)

| Criterion | A (extend store) | B (2nd system) | C (EAV/jsonb) |
|---|---|---|---|
| Reuses proven listing path | ✅ | ❌ (duplicates) | 🟡 partial |
| Keeps one authority / cart order | ✅ | ❌ (breaks 00052) | ✅ |
| New domain cost (compatible) | 🟡 small+mechanical | high | ✅ lowest |
| Type safety / validation | ✅ strong | ✅ | ❌ weak |
| Risk to existing Phones/Cars | 🟢 low (additive) | 🟢 none | 🟡 medium |
| Unit (kg/liter) support | ✅ (add unit) | ✅ | 🟡 in jsonb |

---

## 4. RECOMMENDED ARCHITECTURE

**OPTION A — Extend the unified Listing Store**, applied as category-driven,
mechanical additive migrations. Rationale: it reuses the already-tested
car/property path (presenters, RPCs, `catalog_ref` authority), keeps **one
store and one server-authoritative order resolution** (00052), and keeps
Phones/Cars/Property byte-compatible. **No hard-coding of `vegetable` in the
core** — a new category is added by (a) a DB row in `public.categories`,
(b) one small additive migration, and (c) a mechanical presenter/payload
registration.

### The Domain ↔ Category separation (no `if category === 'vegetable'`)

The existing `inventory_items.category` is the **domain** (schema/kind). The
navigation category (🥬 → الخضر → vegetables) is **already a separate,
DB-driven concept**. We keep them separate and drive behavior by the domain
discriminator through a **registry**, never by string-checks scattered in
component logic.

### 4.1 A generic "product-ish" (unit-quantity) category — the recommended first add

Introduce one new domain **`produce`** (or `grocery`) that covers kg/liter/
dozen/piece goods. It becomes the reference implementation for future simple
categories.

#### Unit & pricing — where they live

- **Money** stays in the single `sell_price` column (never duplicated).
- **`price_period`** stays `'sale'` (produce is a one-off). `'monthly'`
  remains the property-rent-only unit.
- **NEW: a `unit` column** on `inventory_items`
  (`'piece' | 'kg' | 'liter' | 'dozen' | 'bag' | …`, nullable; NULL ⇒ legacy
  domains that don't price by unit — phone/car/property unaffected).
- **Quantity** becomes the *on-hand stock in that unit*. For `produce`
  `quantity=100` means 100 kg of tomatoes (the customer buys a fractional or
  whole `quantity` line capped by stock at order time, exactly like 00052
  does today with the integer clamp).
- The **unit label** (`دج/كغ`) is rendered by the category's *presenter* (the
  persisted value on the DB row) — not hard-coded in components.

> Design note: a fractional quantity per order line (e.g. 1.5 kg) would need
> `order_items.quantity` to become `numeric` and the 00052 clamp to handle
> decimals. The **simplest safe first version** keeps integer whole-units
> (1 kg, 2 kg) so `order_items.quantity` stays `integer` and 00052's clamp is
> unchanged — recommended to avoid touching the order-authority contract.

#### Detail table (per-domain, mirrors car/property precedent)

```
produce_details
  id           uuid PK → inventory_items.id  (ON DELETE CASCADE)
  origin       text      -- origin/grade (e.g. "M'Sila")
  grade        text      -- A / B / organic / …
  unit         text NOT NULL -- kg | liter | dozen | piece | bag (mirrors core for search)
  -- (any other produce attributes you want, e.g. harvest_date)
```

Could equally be a shared `product_details(id, origin, grade, unit)` used by
multiple simple domains. **Recommend a single shared `product_details` for all
unit-based simple categories** to avoid table sprawl — new categories then
need no detail table at all.

#### Attribute registry (not `if`-statements)

Model the per-domain surface as **declarative registries** already in the code:

- `LISTING_FILTER_SCHEMAS` (`src/domains/listings/filterSchemas.ts`) — a new
  `produce` entry.
- `listing_payload_normalizers` map on the DB side — a
  `listing_product_payload(jsonb)` validation/normalization function
  (mirrors `listing_car_payload`).
- `ListingPresenter` registry (`src/domains/listings/presenters/registry.ts`)
  — one `produce.ts` presenter registered in `adminRegister.ts`.
- The DB `category` CHECK + `v_public_listings` projection extend in the
  migration; `listing_create`/`listing_update_*`/`listing_search` whitelists
  add the new category.

**The UI picks a form/board/presenter by looking up these registries keyed by
`category`** — adding a category means registering one entry in each, not
touching `CategoryScreen`, `PublicListingCard`, `ListingDetailsScreen`, etc.

---

## 5. DATABASE DESIGN (proposed migration list — NOT executed)

> All proposed. Apply in order as `postgres` in the Supabase SQL Editor (the
> house model from 00040/00050-00052: additive, postgres-owned, with
> preflight + post-check + verification SQL in-file).

### M-1 `00053_produce_domain.sql`

- `ALTER TABLE inventory_items ADD COLUMN unit text NULL;`
  (NULL for legacy domains; `'sale'` units are piece-only implicitly).
- Widen `inventory_items_category_check` to
  `CHECK (category IN ('phone','car','property','produce'))` —
  **DROP+re-ADD** the constraint (documented, additive-equivalent to 00035's
  constraint swap).
- `CREATE TABLE produce_details (id uuid PK → inventory_items.id
  ON DELETE CASCADE, origin text DEFAULT '', grade text DEFAULT '',
  unit text NOT NULL, ...)` with deny-all RLS (mirror 00036 pattern).
- Extend `v_public_listings` with `produce_origin`,
  `produce_grade`, and expose the `unit` column (CREATE OR REPLACE VIEW,
  keep column list stable).
- Add `idx_inventory_items_category_published` coverage is already there;
  add `idx_produce_unit` if filtering by unit is wanted.

### M-2 `00054_listing_rpcs_produce.sql`

- `listing_product_payload(jsonb)` — validate/normalize
  `{origin, grade, unit}`; unit must be one of `piece|kg|liter|dozen|bag`.
- Extend `listing_create` / `listing_update_core` / `listing_update_details`
  to accept `'produce'`: **relax the quantity-pin** so produce allows
  `quantity >= 1` (whole units), keep car/property pinned to 1.
- Extend `listing_assert_publishable` for `produce`
  (sell_price + city + valid unit).
- Extend `listing_search` category whitelist + `produce` filter whitelist
  (e.g. `origin`, `grade`, `unit`) + query-match over `produce_origin`.

### M-3 (optional) `00055_catalog_ref_unit.sql` — ONLY if fractional units are wanted

- `ALTER TABLE order_items ALTER COLUMN quantity TYPE numeric;`
- Extend 00052's clamp to decimal. **Defer unless fractional units (1.5 kg)
  are a hard requirement — non-fractional needs no change to the order
  contract.**

> **No migration is executed now.** This is the proposed list for approval.

---

## 6. FRONTEND DESIGN

### 6.1 Widen the domain unions (mechanical)

Add `'produce'` (and future values) to the six unions:

- `ListingCategory` (`src/domains/listings/types.ts:18`)
- `CartDomain` + CartLine/CartLineInput `category` (`src/core/cart/CartContext.tsx:13,23,39`)
- `ShowroomCategory` (`src/hooks/useShowroomState.ts:12`)
- `CategoryProductDomain` (`src/core/categories/membership.ts:10`)
- `CategoryFilter` + board shape (`src/components/inventory/listings/ListingCategoryFilter.tsx:4`, `src/domains/listings/adminBoard.ts:19`)
- `InventoryRecord.category` (`src/services/inventory-service.ts:84`)

Because several are already shared/neutralizing, consolidate the master union
by importing from `domains/listings` rather than re-declaring per module
(reduces future churn to one file).

### 6.2 Registries instead of hard-coded branches

- New `presenters/produce.ts` + register in `adminRegister.ts` + Arabic labels
  in `labels.ts`.
- New `VEGETABLE_FILTER_SCHEMA` (name it `PRODUCE_FILTER_SCHEMA`) in
  `filterSchemas.ts`.
- Replace `PublicListingCard` label/emoji map
  (`PublicListingCard.tsx:34-35,88`) with **registry/DB-driven** category
  label+icon (categories table already carries `icon` + bilingual names —
  derive from the navigation category when available, fall back to presenter).
- Replace `ListingDetailsScreen`'s `categoryKey` map +
  `orderable = category==='car'` (`ListingDetailsScreen.tsx:94-110`) with a
  presenter-driven `isOrderable(listing)` + i18n label lookup. **Produce
  (`sale`, in-stock) becomes orderable** — add to cart + quick-buy.
- `CategoryScreen` domain split (`CategoryScreen.tsx:186-204`): replace
  phone-vs-listing binary with **"is this a phone domain?"** else route the
  member through `getPublicListing` + `toPublicCardModel` for ALL non-phone
  domains (so produce, car, property all render via the listing card path).
  Add a `produce` branch in the domain filter of `CategoryProductsPanel`
  (`DOMAIN_FILTERS`), `AdminListingsBoard`, `CatalogInventoryScreen`, and
  `ListingCategoryTabs`.

### 6.3 Admin UX (exactly the requested flow, reusable for any category)

```
Admin → Categories → 🥬 الخضر (vegetables)
  → + Add Product → form: Name, Price/unit (دج/كغ), Unit (كغ),
                     Stock (100), Images (existing uploader), Description,
                     Publish ✓, Assign to vegetables category
```

- A `ProduceListingForm` mirrors `CarListingForm`/`PropertyListingForm`
  (same `createListing` + `InventoryService.updateImages` pattern).
- The form is **record-driven from the category's schema** (unit dropdown
  options from the deployed registry), so a future category gets the same
  form shape with its own fields — a new category does not need a new form
  component unless it has a genuinely new field shape.

### 6.4 Cart / Checkout / Order

- **No structural change**: `cart.addLine({ domain:'produce', category:'produce',
  catalogRef: id, quantity, stock, pricePeriod:'sale' })` flows through the
  existing cart + checkout + `delivery_create_order`.
- `displayUnitPrice` stays display-only; server (00052) recomputes
  authoritatively.
- Unit label surfaces on the line/card via the presenter (`دج/كغ`).

---

## 7. COMPATIBILITY

| Concern | Status with Option A |
|---|---|
| Phones | Unaffected — `category` CHECK widened additively; phone path + SKU index + `v_public_inventory` untouched. `unit` NULL for phones. |
| Cars | `quantity` still pinned to 1; `price_period='sale'` enforced; presenters unchanged. |
| Property | `property_details`/rent-monthly handling unchanged; produce never enters property surfaces. |
| Cart | `catalog_ref` identity preserved; existing `CartDomain` values continue to work. |
| Checkout / Order | `delivery_create_order` (00052) already resolves any `catalog_ref` against `v_public_listings`; `sale`+in-stock produce resolves with zero change. Only `monthly` is rejected — correct. |
| Delivery | Zones/fees/estimate untouched; produce categories already carry `delivery_available`. |
| Public listing view | `v_public_listings` projection extended additively; car/property columns unchanged. |
| Category system | `categories`/`category_products` already domain-agnostic — fully reused. |
| Images | One shared `inventory_images` gallery; reuse confirmed. |
| Existing tests | 00052 order-authority, cart, checkout, delivery tests all reference existing domains; additive changes must keep them green. |

**Data safety:** all proposed migrations are **additive** (new column w/
NULL default, new table, REPLACE of functions with wider—never narrower—
behaviour, constraint re-add preserving existing rows). No table rewrite,
no data migration, no destructive change.

---

## 8. MIGRATIONS (proposed list only — no execution)

| # | File | Action | Risk |
|---|---|---|---|
| M-1 | `supabase/migrations/00053_produce_domain.sql` | `unit` column; widen category CHECK; `produce_details`; extend `v_public_listings`; indexes | Low (additive) |
| M-2 | `supabase/migrations/00054_listing_rpcs_produce.sql` | `listing_product_payload`; extend create/update/search/publishable for produce; relax quantity-pin for produce only | Low (wider whitelists) |
| M-3 | `supabase/migrations/00055_...` (optional) | order_items.quantity → numeric IF fractional units required | Medium (touches 00052) |

Each follows the house pattern: `BEGIN`, preflight `DO` block, DDL/functions,
grants/revokes, post-check `DO`, `COMMIT`, commented verification + rollback.

---

## 9. TEST PLAN

1. **DB contract tests** (as existing `inventory sql-migration-gate`/verify
   scripts):
   - `listing_create('produce','Farm','Tomato',250,'sale',…,100,FALSE,{origin,grade,unit:'kg'})`
     succeeds; quantity>1 allowed for produce.
   - Car/property still reject `quantity != 1`.
   - `listing_create('produce',…)` with invalid unit / missing sell_price /
     empty city on publish → raised.
   - Phone rejection preserved.
   - `listing_search('produce',{unit:'kg'})` returns published+in-stock only,
     never drafts; new columns projected.
   - `v_public_listings`/`v_public_inventory` counts for existing domains
     unchanged after migration.
2. **Order authority (00052)**: produce with `sale`+stock>0 → order
   succeeds with authoritative price/quantity; unresolved ref →
   `ITEM_NOT_FOUND`; `monthly` → `ITEM_NOT_ORDERABLE`; quantity clamped to
   stock.
3. **Unit tests (vitest)**: extend
   `src/__tests__/listings`, cart, checkout, categories product tests:
   - `toPublicCardModel`/presenter for produce renders `دج/كغ` + unit.
   - Cart line domain/produce round-trip + merge.
   - Checkout builds `catalog_ref` correctly.
   - `CategoryScreen` renders produce members (not silently dropped).
4. **Admin UX**: create & publish a tomato from
   Admin → Categories → الخضر; assign to vegetables; verify it appears on the
   vegetables category page and in `CatalogInventoryScreen` board.
5. **i18n**: `listings.produce.*`, showroom labels, unit strings in
   en/ar/fr/tr.
6. **E2E smoke**: add tomato to cart → checkout → order created with
   authoritative price; delivery estimate unchanged.
7. **Regression**: full suite (3003 tests) + `tsc --noEmit` + `vite build`
   green; `qr-routing` pre-existing flake noted separately.

---

## 10. OPEN DECISIONS (need user input before implementation)

1. **Domain name for the first generic category**: `produce`, `grocery`, or
   `vegetable`? (Recommend `produce` for the detail schema; navigation
   category remains `vegetables` under `fresh-market`.)
2. **Fractional units (1.5 kg) now, or whole-units only (1 kg, 2 kg)?**
   Whole-units keeps 00052/order_items untouched (M-3 deferred). Recommend
   whole-units first.
3. **Shared `product_details` vs per-domain tables** for future simple
   categories. Recommend a single shared table.
4. **Where the unit/icon/label of a domain is resolved**: from the navigation
   category (DB `icon` + bilingual names) or from the listing presenter.
   Recommend navigation-category-first with presenter fallback.
5. **Confirm** that category `vegetables` (slug `vegetables`) under
   `fresh-market` is the initial 🥬 target and its products are
   delivery-enabled.
