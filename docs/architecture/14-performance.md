# Performance

FOCUS has undergone several performance optimization passes. This document tracks the current state and known issues.

## Current Performance State

### Bundle Size Management

| Strategy | Count | Details |
|----------|-------|---------|
| **Memo'd components** | ~55 | `React.memo()` wrapped components to prevent unnecessary re-renders |
| **Lazy-loaded screens** | 12 | `React.lazy()` + dynamic `import()` for heavy screens |
| **Dead files removed** | 9 | Unused components and utilities removed in cleanup pass |

### Lazy-Loaded Screens

These screens are loaded on demand and not included in the initial bundle:

- `HomeScreen`
- `GameScreen`
- `ResultsScreen`
- `CoachScreen`
- `PhoneServicesScreen`
- `RepairRequestScreen`
- `RepairTrackingScreen`
- `RepairAdminDashboard`
- `RepairCourierScreen`
- `RepairCustomerHistory`
- `StickerAnalyticsScreen`
- `BusinessIntelligenceCenter`

### Direct-Import Screens (Fast Initial Render)

These 15 screens are directly imported for instant rendering:
`LibraryScreen`, `IntroScreen`, `CalibrationScreen`, `CountdownScreen`, `GameIntroScreen`, `HistoryScreen`, `SettingsScreen`, `AboutScreen`, `LandingScreen`, `ShareScreen`, `RegisterScreen`, `ConsentScreen`, `PreGameMessageScreen`, `LoginScreen`, `AdminSetupScreen`, `AccessDeniedScreen`, `AchievementsScreen`, `StickerStudioScreen`, `StickerScanHandler`, `RepairHomeScreen`, `RepairDiagnosticsScreen`, `ResearchConsole`

### Code Quality

- **`useThemeStyles` for shared styles** — `src/hooks/useThemeStyles.ts` provides 15 memoized common style objects (flexCenter, card, badge, input, grid2, grid3, etc.) that are reused across components, reducing inline style object creation.
- **`console.log` wrapped in DEV guards** — All development logging is guarded by `if (import.meta.env.DEV)`. No console.log in production.
- **Memory audit clean** — Event listeners from `subscribe()` calls are properly cleaned up in `useEffect` return functions. Interval timers are cleared on unmount.

## Known Issues

### 1. Large Components Previously Split

Several components were too large and have been split into sub-components:

| Original Component | Sub-components |
|-------------------|----------------|
| `CatalogInventoryScreen` | 8 sub-components |
| `CatalogCascadeSelector` | Split into `BrandList`, `SeriesList`, `ModelList` + 5 more |

**Status**: Most splits are complete. Some remaining large files exist in the BI dashboards that could benefit from further decomposition.

### 2. Inline Styles Still In Progress

The project uses **inline styles exclusively** — no CSS modules, no styled-components, no Tailwind. While this works for the dynamic theming system, it has downsides:

- **No dead style elimination** — unused styles can't be detected
- **Style duplication** — similar style objects are defined in multiple components
- **Bundle size** — style objects add to the JavaScript bundle
- **No CSS caching** — styles are re-parsed on every render

**Mitigation**: `useThemeStyles()` provides shared style objects, but not all components use it consistently.

**Remaing work**: ~30-40% of component styles still use ad-hoc inline objects instead of `useThemeStyles()`.

### 3. Chart Rendering

All charts are hand-drawn SVG (no charting library). This means:
- Each chart type required custom implementation
- No out-of-the-box optimizations (e.g., canvas rendering for large datasets)
- SVG DOM nodes can grow large for datasets with many data points

**Mitigation**: Charts are used sparingly — the BI Center and Research Console use them, but core screens do not.

### 4. localStorage I/O

Frequent reads/writes to localStorage for inventory, price memory, and popularity tracking can be a performance bottleneck on low-end devices common in the target market.

**Mitigation**: Services batch writes (e.g., price memory caps at 10,000 entries, inventory timeline at 5,000). Read operations include try-catch and default to empty arrays on failure.

## Optimization Guidelines

When contributing, follow these performance rules:

1. **Use `React.memo()`** for any component that receives props and re-renders frequently
2. **Lazy load** any screen that is not needed for initial render
3. **Prefer `useThemeStyles()`** over creating inline style objects
4. **Guard DEV logs**: `if (import.meta.env.DEV) console.log(...)`
5. **Clean up effects**: Always return cleanup functions for intervals, listeners, and subscriptions
6. **Avoid large re-renders**: Split large lists into components, use keys correctly
7. **Minimize localStorage writes**: Batch writes where possible, use append patterns
8. **Avoid unnecessary state**: Use local `useState` for UI state, not global context

## Bundle Analysis

Dependencies are minimal:
- **React 19.1** + **React DOM 19.1** — UI framework
- **@supabase/supabase-js 2.110** — Database client (tree-shakeable)
- **qrcode 1.5.4** — QR code generation (only imported in sticker/referral screens)

No chart libraries, no CSS libraries, no state management libraries, no routing libraries. This keeps the baseline bundle small.
