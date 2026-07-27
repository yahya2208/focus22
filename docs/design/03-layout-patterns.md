# 03 — Layout Patterns

> Generated 2026-07-28 | Phase-1B Audit | FOCUS v3

---

## 1. Container Pattern

### Primary Pattern (22 screens)

```typescript
style={{
  maxWidth: '480px',
  margin: '0 auto',
  padding: '0 1rem',
  // ...screen-specific styles
}}
```

**Used by**: HomeScreen, SettingsScreen, ResultsScreen, AchievementsScreen, AboutScreen, CalibrationScreen, CoachScreen, ConsentScreen, HistoryScreen, IntroScreen, LibraryScreen, PhoneServicesScreen, RegisterScreen, ShareScreen, PreGameMessageScreen, LoginScreen, AdminSetupScreen (×3), AccessDeniedScreen, LandingScreen

### Exceptions

| Screen | maxWidth | Reason |
|--------|----------|--------|
| `ErrorBoundary` | 500px | Error page slightly wider |
| `GameIntroScreen` | 340px | Narrower for intro content |
| `CampaignWizard` | 520px | Modal overlay, wider form |
| `CampaignDetailView` | 200px | QR image constraint |
| `QRDesigner` | 100% | Full-width image |

**Issue**: Every screen independently declares the same 480px container. No shared `Container` component or layout utility.

## 2. Full-Screen Patterns

| Pattern | Files | Usage |
|---------|-------|-------|
| `position: 'fixed'`, `inset: 0` | 5 | GameScreen, CountdownScreen, GameIntroScreen, CampaignWizard (modal), ResearchLayout (drawer) |
| `minHeight: '100vh'` | 4 | ResearchLayout, LandingScreen, ResearchConsole, QRDesigner |
| `minHeight: '100dvh'` | 1 | HomeScreen only |
| `height: '100vh'` | 2 | ErrorBoundary, ResearchLayout drawer |

**Issue**: Mixed `100vh` and `100dvh` — only HomeScreen uses dynamic viewport units. The rest will have mobile browser chrome issues.

## 3. Grid Layouts

### Responsive Grid (research console only)

```typescript
display: 'grid',
gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
gap: '1rem'
```

Used in: DevicesDashboard, LiveDashboard, OverviewDashboard, ScientificDashboard, SurveysDashboard, SystemDashboard, UsersDashboard

### Fixed Grids

| Columns | Files |
|---------|-------|
| `1fr 1fr` (2-col) | HomeScreen, ResultsScreen, all research dashboards, AcquisitionDashboard, CampaignAnalytics |
| `1fr 1fr 1fr` (3-col) | AchievementsScreen, CoachScreen |
| `repeat(3, 1fr)` | CampaignWizard, PrintCenter, QRDesigner |
| `2fr 1fr` (asymmetric) | CampaignDetailView |

## 4. Flex Layouts

### Dominant Pattern

```typescript
display: 'flex',
flexDirection: 'column',
gap: '0.75rem' // or '1rem'
```

~40+ occurrences. The universal vertical stacking pattern.

### Header Row Pattern

```typescript
display: 'flex',
justifyContent: 'space-between',
alignItems: 'center'
```

~15+ occurrences. Used for screen headers, stat rows, label-value pairs.

### Centering Pattern

```typescript
display: 'flex',
justifyContent: 'center',
alignItems: 'center'
```

~10+ occurrences. Score rings, loading states, empty states.

## 5. Positioning

| Position | Count | Files |
|----------|-------|-------|
| `fixed` | 6 | GameScreen (3), CountdownScreen, GameIntroScreen, CampaignWizard, ResearchLayout (2) |
| `sticky` | 0 | None |
| `absolute` | ~5 | GameScreen elements, progress bars |

## 6. Z-Index Scale

| Value | Layer | Files |
|-------|-------|-------|
| `1` | Content | CoachScreen |
| `5-10` | Game elements | GameScreen |
| `20` | Game interaction | GameScreen |
| `90` | Mobile drawer overlay | ResearchLayout |
| `100` | Sidebar | ResearchLayout |
| `200` | Modal overlay | CampaignWizard |

**Issue**: Z-index is ad-hoc, not tokenized. Only 2 files use z-index > 1 (game + research console).

## 7. Summary

| Characteristic | Assessment |
|----------------|------------|
| Layout system | None — 100% inline styles |
| Container consistency | Good (480px universal) but duplicated |
| Responsive | None (except research console) |
| Grid usage | Limited to research console + some screens |
| Flex usage | Dominant, consistent vertical stacking |
| Z-index management | Ad-hoc, minimal |
| Overflow handling | Not audited (no CSS files) |
