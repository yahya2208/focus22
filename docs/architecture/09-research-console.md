# Research Console

The Research Console (`src/research-console/`) is a scientific analytics dashboard system for researchers to analyze session data, device trends, campaign effectiveness, and conversion patterns. It is role-gated (requires `researcher` role).

## Architecture

```
src/research-console/
├── ResearchConsole.tsx       — Main tabbed shell (22 dashboards)
├── layout/                   — Layout components for the console
├── components/               — Shared research components
│   ├── charts/               — Reusable chart components (SVG-based)
│   ├── ExportUtils.ts        — Data export utilities
│   ├── FunnelChart.tsx       — Conversion funnel visualization
│   └── HeatmapChart.tsx      — Activity heatmap
└── pages/                    — 18 dashboard page directories
    ├── overview/             — OverviewDashboard: summary KPIs
    ├── acquisition/          — AcquisitionDashboard: user acquisition
    ├── scientific/           — ScientificDashboard: scientific analysis
    ├── users/                — UsersDashboard: user management
    ├── sessions/             — SessionsDashboard: session browsing/filtering
    ├── devices/              — DevicesDashboard: device profiling
    ├── surveys/              — SurveysDashboard: survey data
    ├── campaigns/            — CampaignsDashboard: campaign tracking
    ├── live/                 — LiveDashboard: real-time active sessions
    ├── system/               — SystemDashboard: system health
    ├── journey/              — JourneyExplorer: user journey analysis
    ├── health/               — AnalyticsHealth: data quality metrics
    ├── conversion/           — ConversionIntelligence: conversion funnels
    ├── comparator/           — FunnelComparator: compare funnel segments
    ├── intelligence/         — JourneyIntelligence: behavioral intelligence
    ├── insights/             — BusinessInsights: business insights
    ├── exchange/             — PhoneExchangeEngine: exchange rate analysis
    └── catalog/              — CatalogHealth: catalog data quality
```

## Dashboard List

| Dashboard ID | Component | Purpose |
|-------------|-----------|---------|
| `overview` | OverviewDashboard | High-level KPIs: total sessions, users, devices, surveys |
| `acquisition` | AcquisitionDashboard | User acquisition sources, growth trends |
| `scientific` | ScientificDashboard | Reaction time distributions, statistical analysis |
| `users` | UsersDashboard | User profiles, roles, activity |
| `sessions` | SessionsDashboard | Browse/filter/search all game sessions |
| `devices` | DevicesDashboard | Device specs, OS/browser breakdown |
| `surveys` | SurveysDashboard | Survey response data and analysis |
| `campaigns` | CampaignsDashboard | Campaign performance tracking |
| `journey` | JourneyExplorer | Individual user journey reconstruction |
| `health` | AnalyticsHealth | Data completeness, consistency metrics |
| `conversion` | ConversionIntelligence | Funnel analysis, drop-off points |
| `comparator` | FunnelComparator | Segment comparison (e.g., mobile vs desktop) |
| `intelligence` | JourneyIntelligence | Behavioral pattern detection |
| `insights` | BusinessInsights | Revenue, profit, and business metric analysis |
| `exchange` | PhoneExchangeEngine | Phone trade-in value analysis |
| `inventory` | CatalogInventoryScreen | Inventory overview (reused from screens/) |
| `catalog-health` | CatalogHealth | Catalog data quality scoring (0–100) |
| `variant-coverage` | VariantCoverageScreen | Variant data completeness |
| `inventory-health` | InventoryHealthScreen | Inventory data health metrics |
| `price-memory` | PriceMemoryCard | Price history and trends |
| `live` | LiveDashboard | Real-time active session monitoring |
| `system` | SystemDashboard | System status, error logs |

## Permissions

Role-based access via `createPermissionGuard()` in `src/core/research/permissions.ts`:

| Role | Access |
|------|--------|
| `super_admin` | All dashboards |
| `research_admin` | All dashboards |
| `analyst` | Most dashboards (limited admin features) |
| `viewer` | Read-only dashboards |

Each dashboard is mapped to a resource, and each resource is checked against the user's role for `read` permission.

## Live Dashboard (`src/core/supabase/live-sessions.ts`)

The Live Dashboard polls active sessions from Supabase every 5 seconds:

```typescript
interface LiveSession {
  sessionId: string;
  userId: string | null;
  userName: string;
  status: 'running' | 'paused';
  startedAt: number;
  elapsed: number;
  device: string;
  platform: string;
  os: string;
  browser: string;
  deviceDetails: DeviceDetails | null;
  currentRound: number;
  totalRounds: number;
  pluginId: string;
  lastActivityAt: number | null;
}
```

Uses Supabase Realtime (`postgres_changes` subscription) for push updates, with polling as fallback. Cleans up subscriptions when the dashboard is unmounted.

## Research API (`src/core/research/`)

The research layer provides data access for the console:

| Module | Purpose |
|--------|---------|
| `api.ts` | Research-specific data fetching (sessions, users, devices, surveys) |
| `api-supabase.ts` | Supabase-optimized research queries |
| `charts.ts` | Chart data builders (distributions, histograms, scatter plots) |
| `cohort.ts` | Cohort analysis (user retention, weekly cohorts) |
| `export.ts` | Data export (CSV/JSON download) |
| `filters.ts` | Advanced filtering (date range, device, campaign, score range) |
| `permissions.ts` | Research role permissions |
| `types.ts` | Shared research types |

## Scientific Analysis

The Scientific section leverages `src/core/scientific/constants.ts` for:
- Reaction time expected ranges (min/max)
- Scoring weights (RT 40%, consistency 35%, fatigue 25%)
- Grade thresholds (A ≥85, B ≥70, etc.)

And `src/core/scientific/validation/` for:
- Data quality checks
- Outlier detection thresholds
- Session validity rules
