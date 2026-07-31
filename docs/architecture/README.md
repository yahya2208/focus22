# FOCUS — Architecture Documentation

This directory contains comprehensive architecture documentation for the FOCUS project. It is intended for **new developers joining the project** to understand the system design, codebase organization, and key architectural decisions.

## Documents

| # | Document | Description |
|---|----------|-------------|
| 01 | [System Overview](./01-system-overview.md) | What FOCUS is, tech stack, target users, key capabilities |
| 02 | [Folder Structure](./02-folder-structure.md) | Full directory listing with explanations of every directory |
| 03 | [Navigation](./03-navigation.md) | Dispatch-based navigation, screen map, research console sub-routes |
| 04 | [Event System](./04-event-system.md) | Domain event publisher, telemetry service, event types, gamification |
| 05 | [Session Lifecycle](./05-session-lifecycle.md) | Game flow: consent → calibration → countdown → game → results |
| 06 | [Catalog OS](./06-catalog-os.md) | 18 brand JSON files, alias engine, search, cascade selector, pricing |
| 07 | [Repair Engine](./07-repair-engine.md) | Repair order lifecycle, WhatsApp integration, courier tracking, QR codes |
| 08 | [Business Intelligence](./08-business-intelligence.md) | 20 BI dashboards, action center, AI assistant, rule engine |
| 09 | [Research Console](./09-research-console.md) | 22 research dashboards, live sessions, scientific analysis |
| 10 | [Data Flow](./10-data-flow.md) | localStorage → Supabase → Context, offline queue, sync strategy |
| 11 | [State Management](./11-state-management.md) | Context + useReducer pattern, settings, auth, theme, i18n |
| 12 | [Supabase](./12-supabase.md) | Database schema, persistence provider, live sessions, auth |
| 13 | [Local Storage](./13-local-storage.md) | Every localStorage key, data patterns, migration strategy |
| 14 | [Performance](./14-performance.md) | Bundle optimization, lazy loading, known issues, guidelines |
| 15 | [Coding Guidelines](./15-coding-guidelines.md) | Rules for contributing: TypeScript, i18n, theme, memo, cleanup |

## Project Component Map

```
App
├── Home
├── Game (lazy)                               ─ 7-round reaction time test
│   ├── Lamp Game Engine (core/engine/)        ─ reaction, consistency, fatigue, scoring
│   ├── Calibration                           ─ display lag, input lag, refresh rate
│   └── Results                               ─ A-F grade with breakdown
├── Repair
│   ├── Request (lazy)                        ─ Create repair request
│   ├── Tracking (lazy)                       ─ Track repair by code
│   ├── Admin Dashboard (lazy)                ─ Manage all repairs
│   └── Courier (lazy)                        ─ Courier job management
├── Catalog OS
│   ├── Cascade Selector (split into 8+)      ─ Brand → Series → Model
│   │   ├── BrandList                         ─ 18 brand cards
│   │   ├── SeriesList                        ─ Filtered series for brand
│   │   ├── ModelList                         ─ Models with variants
│   │   └── VariantSelector                   ─ RAM/storage picker
│   └── Variant Selector                      ─ Price + condition options
├── Catalog Inventory (split into 8)          ─ Stock management CRUD
├── Business Intelligence (lazy)              ─ 20 tabbed dashboards
│   ├── Treasure Mode                         ─ Entry hub
│   ├── Command Center                        ─ Today's metrics
│   ├── Customer Intelligence                 ─ Per-customer profiles
│   ├── Campaign Intelligence                 ─ Campaign ROI
│   ├── Action Center (13 modules)            ─ Offers, prices, inventory, AI
│   └── Data Quality                          ─ Catalog health score
├── Research Console (lazy, protected)        ─ 22 tabbed dashboards
│   ├── Overview                              ─ KPI summary
│   ├── Live Dashboard                        ─ Active sessions (5s polling)
│   ├── Scientific                            ─ Reaction time distributions
│   ├── Campaigns                             ─ Campaign tracking
│   ├── Journey Explorer                      ─ User journey analysis
│   ├── Exchange Engine                       ─ Trade-in analysis
│   ├── Catalog Health                        ─ Data quality scoring
│   └── System Dashboard                      ─ System status
└── Sticker Studio
    ├── Studio                                ─ Design sticker labels
    ├── Analytics                             ─ Sticker usage stats
    └── Scan Handler                          ─ QR code scanner for stickers
```

## Component Size & Status

| Component | Lines After Split | Status | Key Files |
|-----------|------------------|--------|-----------|
| `CatalogInventoryScreen` | ~150 (split into 8) | Complete | `screens/inventory/CatalogInventoryScreen.tsx` |
| `CatalogCascadeSelector` | ~180 (split into 8+) | Complete | `components/catalog/` |
| `GameScreen` | ~600 | Active | `screens/game/GameScreen.tsx` |
| `BusinessIntelligenceCenter` | ~358 | Active | `business-intelligence/BusinessIntelligenceCenter.tsx` |
| `ResearchConsole` | ~185 | Active | `research-console/ResearchConsole.tsx` |
| `HomeScreen` | ~200+ | Active | `screens/home/HomeScreen.tsx` |
| `RepairEngine` | ~423 | Active | `services/repair/repair-engine.ts` |
| `AliasEngine` | ~345 | Complete | `services/alias-engine.ts` |
| `PersistenceProvider` | ~453 | Active | `core/supabase/PersistenceProvider.tsx` |
| `InventoryService` | ~517 | Active | `services/inventory-service.ts` |
| `PriceMemory` | ~563 | Complete | `services/price-memory.ts` |
| `PricingIntelligence` | ~514 | Active | `services/pricing-intelligence.ts` |
| `DataService` | ~702 | Active | `core/supabase/data-service.ts` |
| `CatalogQuality` | ~456 | Active | `services/catalog-quality.ts` |
| `WhatsAppService` | ~128 | Complete | `services/whatsapp-service.ts` |
| `CoachEngine` | 16 files | Active | `ai/coach/` |

## Quick Start for Developers

1. **Read these docs in order** — start with 01-system-overview for context
2. **Understand the session flow** (doc 05) — it's the core user experience
3. **Explore the catalog system** (doc 06) — the largest domain model
4. **Check coding guidelines** (doc 15) before writing code
5. **Run the linter**: `pnpm lint`
6. **Run type check**: `pnpm typecheck`
7. **Run tests**: `pnpm test`

## Key Files to Know

| File | Lines | Why It Matters |
|------|-------|----------------|
| `src/App.tsx` | 253 | App root — providers, screen map, navigation dispatch |
| `src/store/navigation.tsx` | 164 | Global state, reducer, ScreenName type |
| `src/core/session/service.ts` | 118 | Session lifecycle (start, complete, abandon) |
| `src/core/telemetry/index.ts` | 186 | Event tracking and batching |
| `src/core/supabase/PersistenceProvider.tsx` | 453 | Session persistence and sync |
| `src/catalog/loader.ts` | 234 | Catalog index and search engine |
| `src/services/alias-engine.ts` | 345 | Multilingual phone model alias resolution |
| `src/core/events/index.ts` | 107 | Internal pub-sub event system |
| `src/core/engine/scoring.ts` | 60 | Focus score calculation (A-F grading) |
| `src/core/offline/index.ts` | 233 | Offline queue, sync manager, conflict resolution |
