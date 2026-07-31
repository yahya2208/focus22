# System Overview

## What is FOCUS?

FOCUS is a cognitive measurement platform built specifically for **phone resellers in Algeria**. It combines a **reaction-time game** (the "lamp test") with a full-featured **phone catalog operating system**, **repair order management**, **business intelligence dashboards**, **research analytics console**, and **sticker studio** — all in a single Progressive Web App.

The core idea: consumers play a short focus/reaction game on a store's device, which acts as both an engagement tool and a data collection mechanism. Store owners then use the collected data (reaction times, device profiles, browsing behavior) to drive sales intelligence, repair workflows, and marketing campaigns.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | React 19.1 | UI rendering, component architecture |
| **Language** | TypeScript 5.8 | Type safety, editor tooling |
| **Build Tool** | Vite 6.3 | Fast dev server, optimized production builds |
| **State** | React Context + useReducer | Global navigation/app state (no Redux) |
| **Database** | Supabase (PostgreSQL) | Auth, live sessions, persistence, analytics |
| **Storage** | localStorage | Offline-first data, settings, game history |
| **Styling** | Inline styles + theme tokens | Dynamic theming (7 themes), no CSS-in-JS library |
| **i18n** | Custom provider | Arabic (primary), English, Turkish, French |
| **Charts** | Raw SVG | No chart library — all visualizations hand-drawn |
| **Testing** | Vitest + Testing Library | Unit tests |
| **Linting** | ESLint 9 + TypeScript-ESLint | Code quality |
| **Package** | pnpm | Monorepo-ready workspace |

## Target Users

1. **Phone Resellers (Store Owners)** — Primary customers. Use the game to attract foot traffic, catalog phones for trade-in/sale, manage repairs, and get business intelligence.
2. **Consumers (Game Players)** — Walk into a store, play the lamp game, get a "focus score." Their device is profiled and cataloged during the process.
3. **Researchers** — Access the Research Console to analyze session data, device trends, campaign effectiveness, and conversion funnels.
4. **Repair Technicians** — Use the Repair OS to manage repair orders, track couriers, communicate via WhatsApp.
5. **Store Admins** — Manage the store, view BI dashboards, configure campaigns.

## Key Capabilities

- **Lamp Reaction Game** — 7-round reaction time measurement with calibration, fatigue detection, consistency analysis, and scientific scoring (A–F grade).
- **Catalog Operating System** — 18 phone brands with JSON-based model data, variant generation, multilingual alias engine, and a 3-step cascade selector (Brand → Series → Model).
- **Repair OS** — Full repair order lifecycle (request → quote → diagnosis → repair → delivery), courier tracking, WhatsApp integration, photo uploads, QR code tracking.
- **Business Intelligence Center** — 20 dashboards including Inventory Intelligence, Customer Intelligence, Campaign Intelligence, Smart Offers, AI Assistant, CEO Mode, Trade Prices, Rule Engine, and Data Quality.
- **Research Console** — 22 dashboard pages for scientific analysis: device dashboard, catalog health, conversion intelligence, campaign analytics, live dashboard, exchange engine, data quality engine, journey intelligence, analytics health.
- **Sticker Studio** — Design, print, and scan sticker labels for phone inventory management.
- **Offline Queue** — When Supabase is unavailable, operations are queued in localStorage with exponential backoff retry.
- **QR Campaigns** — Short-code and query-parameter based campaign tracking. Deep link parsing for referral flows.
- **Multi-language** — Full Arabic, English, Turkish, and partial French support with RTL layout.
