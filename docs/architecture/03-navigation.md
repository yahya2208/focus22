# Navigation System

## Architecture

FOCUS uses a **dispatch-based navigation** pattern — there is no router library (no React Router, no TanStack Router). Navigation is managed entirely through a `useReducer` in `src/store/navigation.tsx`.

### Core Concepts

1. **`AppState`** — Global state object holding `screen` (current route), `currentScreen`, `selectedGame`, `calibrationProfile`, `currentSession`, `results`, `sessions[]`, `isQrFlow`, and `campaignId`.
2. **`NavigationAction`** — A discriminated union type. The key action is `{ type: 'NAVIGATE', screen: ScreenName }`.
3. **`ScreenName`** — A string literal union of 33 screen names (`'home'`, `'game'`, `'repair-request'`, `'sticker-studio'`, etc.).
4. **`AppProvider`** — Wraps the app with `NavigationContext.Provider`, exposing `state` and `dispatch`.

### Navigation Flow

```
User Action → dispatch({ type: 'NAVIGATE', screen: 'game' })
  → navigationReducer updates state.screen + state.currentScreen
  → ScreenRouter reads currentScreen → renders matching component from screens map
  → Suspense fallback for lazy-loaded screens
```

### Screen Map (in src/App.tsx)

All screens are registered in a `Record<ScreenName, React.ComponentType>`:

```typescript
const screens: Record<ScreenName, React.ComponentType> = {
  home: HomeScreen,           // lazy
  library: LibraryScreen,     // direct
  intro: IntroScreen,         // direct
  calibration: CalibrationScreen, // direct
  countdown: CountdownScreen, // direct
  game: GameScreen,           // lazy
  'game-intro': GameIntroScreen, // direct
  results: ResultsScreen,     // lazy
  history: HistoryScreen,     // direct
  settings: SettingsScreen,   // direct
  // ... 33 total
};
```

**Direct imports** (15 screens) — small/critical screens loaded at startup. These include calibration, countdown, consent, settings, history, repair home, and sticker studio.

**Lazy imports** (12 screens) — loaded on demand via `React.lazy()` + dynamic `import()`. These include game, results, coach, business-intelligence, repair-request, repair-tracking, repair-admin, repair-courier, repair-customer-history, sticker-analytics, phone-services.

### Protection / Guards

The `ScreenRouter` applies `ProtectedRoute` for restricted screens:

| Screen | Required Role |
|--------|--------------|
| `research` | `researcher` |
| `business-intelligence` | `researcher` |
| `repair-admin` | `admin` |
| `repair-courier` | `admin` |
| `repair-customer-history` | `admin` |

### Research Console Sub-Routes

The Research Console (`research-console/ResearchConsole.tsx`) is itself a single screen registered as `'research'`, but internally it manages 22 sub-pages via local `useState<DashboardId>`:

```
Overview, Acquisition, Scientific, Users, Sessions, Devices,
Surveys, Campaigns, Live, System, Journey, Health,
Conversion, Comparator, Intelligence, Insights, Exchange,
Inventory, Catalog Health, Variant Coverage, Inventory Health, Price Memory
```

Each sub-page is rendered from a `dashboardComponents` record:
```typescript
const dashboardComponents: Record<DashboardId, React.FC> = {
  overview: OverviewDashboard,
  acquisition: AcquisitionDashboard,
  // ...
};
```
Permission-based filtering uses a `createPermissionGuard()` that checks the user's `researchRole` against a resource map.

### Business Intelligence Sub-Routes

Similarly, the BI Center manages 20 sub-pages internally:
```
Treasure Mode, Command Center, Customer Intelligence, Device Intelligence,
Campaign Intelligence, Commerce Intelligence, Action Center, Smart Offers,
Trade Prices, Inventory, Staff, Alerts, AI Assistant, Scoring,
Competitive, CEO Mode, Recommendations, AI Feedback, Rule Engine, Data Quality
```

### Deep Link / QR Flow

`InitialRoute` component (in `App.tsx`) intercepts the first render to check for:
1. **Short code URLs** — `/c/XXXXXX` → looks up campaign by short code
2. **Query parameter deep links** — `?campaign=...&referral=...` → parsed by `parseDeepLinkFromCurrentUrl()`

If a campaign is detected, `dispatch({ type: 'START_QR_FLOW' })` resets state and navigates directly to `'game-intro'`.

### Stack Navigation Pattern

FOCUS doesn't maintain a navigation stack. Each `NAVIGATE` action replaces the screen entirely. However, the following pattern emulates stack-like behavior:

- `RESET` action returns to initial state (`'home'`)
- QR flow uses `START_QR_FLOW` which resets state and sets `isQrFlow: true`
- Back navigation is manual (buttons in each screen dispatch `NAVIGATE` to `'home'`)
