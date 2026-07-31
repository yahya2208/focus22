# Catalog Operating System

The Catalog OS is FOCUS's phone model reference system — a comprehensive, offline-first catalog of 18 major phone brands with variant generation, multilingual alias resolution, and a cascade selector UI.

## Architecture

### Data Layer: 18 JSON Brand Files

```
src/catalog/brands/
├── samsung.json
├── apple.json
├── xiaomi.json
├── honor.json
├── huawei.json
├── oppo.json
├── vivo.json
├── realme.json
├── oneplus.json
├── motorola.json
├── google.json
├── nothing.json
├── sony.json
├── asus.json
├── nokia.json
├── infinix.json
├── tecno.json
└── zte.json
```

Each JSON file follows the `CatalogBrand` type:

```typescript
interface CatalogBrand {
  brand: string;          // "Samsung"
  aliases: string[];      // ["سامسونج", "Sam", ...]
  models: CatalogModel[];
}

interface CatalogModel {
  model: string;          // "Galaxy S24 Ultra"
  variants: CatalogVariant[];  // [{ storage: "256", ram: "12" }, ...]
  modelNumbers: string[]; // ["SM-S928B", "SM-S928U"]
  releaseYear: number;
  series: string;         // "Galaxy S"
}

interface CatalogVariant {
  storage: string;
  ram: string;
}
```

### Index Building (`src/catalog/loader.ts`)

The loader builds a `CatalogIndex` with four indexes:

| Index | Key | Value | Purpose |
|-------|-----|-------|---------|
| `brandIndex` | normalized brand name | `CatalogBrand` | O(1) brand lookup |
| `modelNumberIndex` | normalized model number | `{ brand, model }` | Model number search (e.g., "SM-S928B") |
| `aliasIndex` | normalized alias | `string[]` (brand names) | Arabic/alternate name resolution |
| `tokenIndex` | individual word tokens | `{ brand, model }[]` | Token-based model search |

### Search Engine

**`search(query)`** — Full text search returning up to 20 `SearchResult` items:
- Tokenizes the query
- Matches against model name tokens
- Scores by match quality (exact > token > alias)
- Model number matches get score 1.0
- Sorts by score descending

**`searchProgressive(query)`** — Returns separate lists of matched brands, series, and models for the step-by-step cascade UI.

**`searchBrand(query)`** — Searches brands by name or alias only.

### Alias Engine (`src/services/alias-engine.ts`)

A sophisticated multilingual alias system with 345 lines of custom logic:

- **Brand aliases**: Arabic-to-English mapping (`سامسونج` → `Samsung`, `ابل` → `Apple`, `ايفون` → `iPhone`)
- **Digit normalization**: Arabic-Indic digits (`٠١٢٣`) → Latin digits
- **Model alias generation**: For each model, generates up to 30+ alias variants:
  - `brand + model`, `brandmodel` (concatenated)
  - Arabic brand + model
  - Stripped common words (Pro, Max, Plus, Ultra, Lite, SE, FE, Mini, Neo)
  - Initials (e.g., "S24" from "Galaxy S24")
  - Brand-series-aware aliases via `generateBrandAliases()`
  - Pattern-based code aliases (`SM-S928B` → code search)
- **Token search**: Scored token matching against brand words, model words, and model numbers
- **Deduplication**: Seen-set prevents duplicate results

### 3-Step Cascade Selector

The catalog UI uses a progressive disclosure pattern:

```
Step 1: Select Brand → 18 brands displayed as cards
Step 2: Select Series → Filtered series list (e.g., "Galaxy S", "Galaxy A", "Galaxy Z")
Step 3: Select Model → Model list with variant options
```

Each step filters the next using:
- `getSeries(brandName)` → series list
- `getModelsBySeries(brandName, series)` → models with variants

### Price System (`src/services/price-memory.ts`)

Tracks buy/sell/exchange prices for every phone variant + condition:

- **Price Memory**: Stores `PriceEvent[]` in localStorage (key: `price_memory_v1`) with brand, model, RAM, storage, condition, operation (buy/sell/exchange), price, profit, margin, daysToSell
- **Price Summary**: Calculates last/avg/high/low prices for any phone identity
- **Learning Insights**: Generates natural-language Arabic summaries ("عادة تشتري بين 50000 و 70000 د.ج")
- **Price Alerts**: Warns when proposed buy/sell prices deviate from historical ranges (danger >20% over, warning > usual range)
- **Price History**: Consumer-facing price history for catalog items with trend detection (up/down/stable)

### Pricing Intelligence (`src/services/pricing-intelligence.ts`)

More advanced pricing with:
- Suggested buy/sell prices based on historical data and brand tier
- Expected profit and margin calculations
- Confidence scoring (high/medium/low/none)
- Inventory turnover estimates
- Warning generation for unusual prices

### Popularity Engine (`src/services/popularity-engine.ts`)

Tracks phone popularity via events (search, select, purchase, exchange, whatsapp, recommend):
- Weighted scoring per event type
- Trend detection (rising/stable/declining)
- localStorage-backed (keys: `popularity_events`, `popularity_scores`)

### Inventory Integration (`src/services/inventory-service.ts`)

Links catalog items to stock management:
- `InventoryRecord` stores: modelId, brand, model, variant, RAM, storage, condition, quantity, status, buyPrice, sellPrice
- Full movement tracking with timeline events
- Status auto-calculation: `in_stock` (>3), `low_stock` (1-3), `out_of_stock` (0)
- Complete transaction history with audit trail
- All data in localStorage (keys: `catalog_inventory`, `inventory_timeline_v3`, etc.)

### Catalog Quality (`src/services/catalog-quality.ts`)

Automated quality scoring of the catalog data:
- Checks for missing aliases, missing variants, duplicate variants, incomplete brands, unused models, illogical variants, missing prices, no inventory movement
- Generates a `CatalogQualityReport` with score (0–100)
- Used by the Research Console's Catalog Health dashboard

### Services Layer (`src/services/catalog-service.ts`)

High-level service that combines alias engine, popularity engine, and variant data:
- `searchCatalog(query)` — alias search with popularity ranking
- `resolveModel(input)` — resolves any input string to a canonical `{ brand, model }` using alias engine, direct lookup, or fallback search
- `getSuggestedVariants(model)` — returns RAM/storage variants
- Used by all screens that need phone model lookup (repair, inventory, phone-services)
