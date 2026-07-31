# Folder Structure

```
src/
├── ai/coach/                 — AI Coaching Engine
│   ├── engine.ts             Core analysis engine for per-session stats
│   ├── analysis.ts           Statistical analysis (mean, median, percentiles)
│   ├── comparative.ts        Compare sessions over time
│   ├── confidence.ts         Confidence interval calculations
│   ├── explainability.ts     Human-readable explanations of scores
│   ├── goals.ts              User goal tracking and progress
│   ├── insights.ts           Natural-language insight generation
│   ├── learning.ts           Learning pattern detection
│   ├── passport.ts           "Focus Passport" — aggregate user profile
│   ├── personality.ts        User personality traits from gameplay
│   ├── recommendations.ts    Actionable recommendations
│   ├── reports.ts            PDF-style report generation
│   ├── research-tagging.ts   Research metadata tagging
│   ├── trends.ts             Long-term trend analysis
│   └── types.ts              Shared types for coaching domain
│
├── business-intelligence/    — BI Center (shop owner dashboards)
│   ├── BusinessIntelligenceCenter.tsx  — Tabbed dashboard shell (20 tabs)
│   ├── actions/              — Action Center modules
│   │   ├── SmartOfferEngine.tsx, TradePriceEngine.tsx, InventoryIntelligence.tsx
│   │   ├── AIAssistant.tsx, StaffPerformance.tsx, NotificationCenter.tsx
│   │   ├── OpportunityScoring.tsx, CEOMode.tsx, RuleEngine.tsx
│   │   ├── AIFeedbackLoop.tsx, RecommendationEngine.tsx
│   │   └── types.ts, ActionCard.tsx, ConfidenceBadge.tsx
│   ├── pages/                — Full-page dashboards
│   │   ├── CommandCenter.tsx, CustomerIntelligence.tsx
│   │   ├── DeviceIntelligenceBI.tsx, CampaignIntelligenceBI.tsx
│   │   └── CommerceIntelligenceBI.tsx
│   ├── api.ts, data-source.ts, metrics.ts  — Data layer
│   ├── types.ts, store/      — BI-specific types and state
│   ├── QualityDashboard.tsx, DataQualityEngine.tsx
│   └── DemoBadge.tsx
│
├── catalog/                  — Catalog Operating System
│   ├── brands/               — 18 JSON brand files (samsung.json, apple.json, etc.)
│   ├── loader.ts             — Catalog index builder, search engine, cascade query functions
│   ├── types.ts              — CatalogBrand, CatalogModel, CatalogVariant, SearchResult
│   └── index.ts              — Public API re-exports
│
├── components/               — Shared React components
│   ├── catalog/              — Phone catalog UI (brand list, model selector, variant picker)
│   ├── forms/                — Form components (inputs, buttons, selects)
│   ├── inventory/            — Inventory table, stock cards
│   ├── layout/               — AppHeader.tsx, AppShell.tsx (app chrome)
│   ├── navigation/           — HomeMenu.tsx (main navigation grid)
│   ├── repair/               — Repair status badges, timeline viewer
│   ├── research/             — Research console shared components
│   ├── shared/               — ErrorBoundary, ProtectedRoute, LoadingSpinner
│   └── stickers/             — Sticker preview, print layout UI
│
├── core/                     — Core Engine (framework-agnostic logic)
│   ├── analytics/            — Event type definitions and tracking client
│   ├── auth/                 — AuthProvider, role/permission system
│   ├── calibration/          — Device calibration (display lag, input lag, refresh rate)
│   ├── calibration-cache/    — Cached calibration profiles
│   ├── config/               — AppSettings (theme, language, motion preferences)
│   ├── device/               — Device profiling (browser, OS, screen, CPU, memory)
│   ├── engine/               — Game engine
│   │   ├── reaction.ts       — Reaction time measurement
│   │   ├── scoring.ts        — Focus score calculation (A–F grading)
│   │   ├── consistency.ts    — Consistency analysis (outlier detection)
│   │   └── fatigue.ts        — Fatigue detection algorithm
│   ├── events/               — Event publisher/subscriber (pub-sub system)
│   ├── gamification/         — Achievements system, daily challenges
│   ├── history/              — Session history loading/saving
│   ├── measurement/          — Raw measurement capture
│   ├── offline/              — Offline queue, sync manager, conflict resolution
│   ├── qr/                   — QR code generation, deep link parsing, campaign tracking
│   ├── repository/           — Data repository pattern
│   ├── research/             — Research API, filters, cohorts, chart builders, permissions
│   ├── scientific/           — Scientific constants, validation rules
│   ├── session/              — Session lifecycle (create, complete, abandon, transition)
│   ├── storage/              — localStorage repository helpers
│   ├── supabase/             — Supabase client, data service, live sessions, persistence
│   └── telemetry/            — Telemetry service (event batching, Supabase flush)
│
├── data/                     — Static data files
│   ├── phone-catalog.ts      — Legacy phone catalog (brand + model list)
│   ├── phone-database.ts     — Comprehensive phone database
│   ├── phone-variants.ts     — RAM/storage variant data
│   └── wisdom-database.ts    — Wisdom/sayings database
│
├── database/                 — Seed and verification scripts
│   ├── seed-catalog.ts       — Catalog seeder (pushes brands/models to Supabase)
│   ├── verify-catalog.ts     — Catalog verification checks
│   └── golden-audit.ts       — Golden data audit
│
├── design-system/            — Design tokens and layout primitives
│   ├── tokens.ts             — Color tokens, spacing, typography
│   ├── use-theme.tsx         — Theme provider (7 themes)
│   ├── useTokens.ts          — Hook for accessing design tokens
│   └── layout/               — Stack, HStack layout components
│
├── hooks/                    — Custom React hooks
│   ├── useSettings.tsx       — Settings state + Context provider
│   ├── useThemeColors.ts     — Current theme color values
│   ├── useThemeStyles.ts     — Memoized common style objects (cards, buttons, grids)
│   ├── useThemeSync.ts       — Syncs theme to DOM attributes
│   └── useTranslation.tsx    — i18n hook + Translation provider
│
├── i18n/                     — Internationalization
│   ├── translations/         — en.ts, ar.ts, tr.ts, fr.ts
│   ├── types.ts              — Translation key types
│   └── index.ts              — i18n engine
│
├── research-console/         — Research Dashboard System
│   ├── ResearchConsole.tsx   — Tabbed shell (22 dashboards)
│   ├── pages/                — 18 dashboard page directories
│   │   ├── overview/, acquisition/, scientific/, sessions/, users/
│   │   ├── devices/, surveys/, campaigns/, journey/, health/
│   │   ├── conversion/, comparator/, intelligence/, insights/
│   │   ├── exchange/, live/, system/, catalog/
│   ├── components/           — Charts (FunnelChart, HeatmapChart, ExportUtils)
│   └── layout/               — ResearchConsole layout components
│
├── screens/                  — All app screens
│   ├── about/, achievements/, auth/, calibration/, coach/
│   ├── consent/, countdown/, game-intro/, game/, history/
│   ├── home/, intro/, inventory/, landing/, library/
│   ├── message/, phone-services/, register/, research/
│   ├── results/, settings/, share/
│   ├── repair/               — 7 repair screens (Home, Request, Tracking, Admin, Courier, CustomerHistory, Diagnostics)
│   └── stickers/             — 3 sticker screens (Studio, Analytics, ScanHandler)
│
├── services/                 — Business logic services
│   ├── alias-engine.ts       — Multilingual alias generation + search (Arabic/English)
│   ├── brand-rules.ts        — Brand-specific rules (series detection, tier, patterns)
│   ├── catalog-quality.ts    — Catalog health scoring and quality checks
│   ├── catalog-service.ts    — High-level catalog search with popularity ranking
│   ├── customer-memory.ts    — Customer recognition and history
│   ├── device-ledger.ts      — Device ownership tracking
│   ├── inventory-service.ts  — Stock management (CRUD, timeline, movements, transactions)
│   ├── popularity-engine.ts  — Phone popularity scoring (searches, selections, purchases)
│   ├── price-memory.ts       — Price history, trends, alerts, learning insights
│   ├── pricing-intelligence.ts — Suggested buy/sell prices, profit analysis
│   ├── repair/               — Repair engine, database, types, WhatsApp integration, BI
│   ├── sticker/              — Sticker engine, database, layout, analytics, types
│   ├── variant-verification.ts — Variant data integrity verification
│   ├── whatsapp-service.ts   — WhatsApp deep link builder (buy/sell/exchange/repair)
│   └── whatsapp-message.ts   — Message template helpers
│
└── store/                    — State management
    ├── navigation.tsx        — AppState, NavigationAction, useReducer, AppProvider
    └── (app state)           — Global app context
```

## Key Design Principles

1. **Framework-agnostic core** — The `core/` directory has zero React imports. All game logic, calibration, session management, and event systems are pure TypeScript.
2. **Services for orchestration** — `services/` bridges the core engine with the UI layer. Each service handles a business domain (inventory, pricing, repair, catalog).
3. **Screens are thin** — Screens compose components and call services/hooks; they rarely contain significant business logic.
4. **Catalog is JSON-first** — Brand data lives in `catalog/brands/*.json`, not in a database. The loader builds an in-memory index with token-based search.
