# Business Intelligence Center

The BI Center (`src/business-intelligence/`) is a comprehensive analytics suite for phone resellers. It provides 20 tabbed dashboards covering inventory, customers, campaigns, pricing, staff, and AI-powered insights.

## Architecture

```
src/business-intelligence/
├── BusinessIntelligenceCenter.tsx  — Main tabbed shell
├── api.ts                          — API client for data fetching
├── data-source.ts                  — Data source abstraction layer
├── metrics.ts                      — Metric calculations
├── types.ts                        — Shared types (BIDashboardId, data interfaces)
├── QualityDashboard.tsx            — Data quality monitoring
├── DataQualityEngine.tsx           — Data quality engine
├── DemoBadge.tsx                   — Demo mode badge
├── pages/                          — Full-page dashboards (5)
│   ├── CommandCenter.tsx           — Today's summary, hourly distribution
│   ├── CustomerIntelligence.tsx    — Customer profiles, behavior, timeline
│   ├── DeviceIntelligenceBI.tsx    — Device specs, OS breakdown, model trends
│   ├── CampaignIntelligenceBI.tsx  — Per-campaign ROI, conversion, analytics
│   └── CommerceIntelligenceBI.tsx  — Funnel analysis, drop-off points
├── actions/                        — Action Center modules (13)
│   ├── SmartOfferEngine.tsx        — Personalized buy/sell offers
│   ├── TradePriceEngine.tsx        — Price management, profit calc
│   ├── InventoryIntelligence.tsx   — Stock level monitoring, alerts
│   ├── StaffPerformance.tsx        — Employee performance tracking
│   ├── NotificationCenter.tsx      — In-app alerts, notifications
│   ├── AIAssistant.tsx             — Arabic Q&A assistant (simulated)
│   ├── OpportunityScoring.tsx      — Visitor-to-customer scoring
│   ├── CEOMode.tsx                 — Executive summary dashboard
│   ├── RuleEngine.tsx              — IF-THEN automation rules
│   ├── AIFeedbackLoop.tsx          — AI recommendation approval tracking
│   ├── RecommendationEngine.tsx    — Evidence-based recommendations
│   ├── CompetitiveDashboard.tsx    — Branch/store comparison
│   └── types.ts, ActionCard.tsx, ConfidenceBadge.tsx
└── store/                          — BI-specific state management
```

## Available Dashboards

| ID | Dashboard | Description |
|----|-----------|-------------|
| `treasure` | Treasure Mode | Entry hub — today summary + opportunities/problems/alerts |
| `command` | Command Center | Daily visitors, players, trade requests, hourly distribution |
| `customers` | Customer Intelligence | Per-customer profiles, visit history, game scores, trade behavior |
| `devices` | Device Intelligence | OS breakdown, brand/model distribution, specs analysis |
| `campaigns` | Campaign Intelligence | Per-campaign ROI, visitors, conversion rates, AI summaries |
| `commerce` | Commerce Intelligence | Funnel analysis (visit → play → trade → WhatsApp) |
| `actions` | Action Center | Menu grid of all action modules |
| `smart-offers` | Smart Offers | Personalized offers based on visitor behavior |
| `trade-prices` | Trade Prices | Buy/sell price management, profit margin calculator |
| `inventory` | Inventory Intelligence | Stock monitoring, low stock alerts |
| `staff` | Staff Performance | Individual employee metrics, sales tracking |
| `notifications` | Notification Center | Real-time alerts |
| `ai-assistant` | AI Assistant | Natural-language Q&A (Arabic) about store analytics |
| `opportunities` | Opportunity Scoring | Visitors ranked by purchase probability |
| `competitive` | Competitive Dashboard | Multi-branch comparison |
| `ceo` | CEO Mode | Executive summary of key metrics |
| `recommendations` | Recommendations | Data-driven recommendations with confidence scores |
| `feedback` | AI Feedback Loop | History of AI recommendation approvals/rejections |
| `rules` | Rule Engine | IF-THEN automation rules |
| `quality` | Data Quality | Catalog and data health scores |

## Key Data Types

```typescript
interface TodaySummary {
  visitors: number;
  players: number;
  tradeRequests: number;
  whatsappClicks: number;
  customers: number;
  conversionRate: number;
}

interface TreasureModeData {
  opportunities: Opportunity[];
  problems: AIInsight[];
  alerts: AIInsight[];
  recommendations: AIInsight[];
  hotDevices: HotDevice[];
  todaySummary: TodaySummary;
}

interface CustomerProfile {
  userId: string;
  displayName: string;
  totalVisits: number;
  totalGames: number;
  bestFocusScore: number;
  avgFocusScore: number;
  avgReactionTime: number;
  tradeRequested: boolean;
  whatsappClickCount: number;
  timeline: TimelineEntry[];
  sessions: CustomerSession[];
}
```

## Data Sources

BI data comes from two places:

1. **localStorage** — `catalog_inventory`, `price_memory_v1`, `popularity_events`, etc.
2. **Supabase** — Sessions, users, devices, calibrations, campaigns tables via `data-service.ts`

The `api.ts` module (`createBusinessAPI()`) abstracts these sources and provides:
- `getTreasureMode()` — aggregated treasure mode data
- `getCommandCenter()` — today's command center metrics
- `getCustomerProfile(userId)` — full customer profile
- `getDeviceInsights()` — device distribution analysis
- `getCampaignInsights()` — campaign performance
- `getCommerceFunnel()` — conversion funnel stages

## Charts

All charts are rendered as **raw SVG** — no charting library is used. The `src/research-console/components/charts/` directory contains reusable chart components:

- **FunnelChart.tsx** — Conversion funnel with drop-off percentages
- **HeatmapChart.tsx** — Hourly activity heatmap

The BI Center itself uses inline SVG for progress bars, donut indicators, and trend arrows.

## AI Assistant

The AI Assistant (`actions/AIAssistant.tsx`) is a simulated Q&A system:
- Users type questions in Arabic about their store
- Predefined responses are matched by keyword or returned as a default analysis
- Covers: inventory levels, popular phones, customer behavior, campaign performance, repair stats, staff performance

## Rule Engine

The Rule Engine (`actions/RuleEngine.tsx`) allows store owners to create IF-THEN automation:
- Trigger: "Inventory drops below N" | "New customer visits N times" | "Campaign ends"
- Action: "Send WhatsApp" | "Create notification" | "Update price"
- Rules are stored in localStorage
