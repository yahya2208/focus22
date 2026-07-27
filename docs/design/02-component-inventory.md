# 02 — Component Inventory & Architecture

> Generated 2026-07-28 | Phase-1B Audit | FOCUS v3

---

## 1. Component Hierarchy

```
App
├── ErrorBoundary (500px max-width, system-ui fallback)
├── AuthProvider (Supabase auth state)
│   └── PersistenceProvider (Supabase persistence, inline scoring)
│       ├── SettingsProvider (localStorage pub/sub)
│       │   └── ThemeProvider
│       │       └── TranslationProvider
│       │           └── ScreenMap (22 screens)
│       └── ProtectedRoute (auth gate)
└── HtmlSync (meta theme-color, localStorage listener)
```

## 2. Shared Components (5)

| Component | File | Props | Variants | Sizes |
|-----------|------|-------|----------|-------|
| `Button` | `src/components/shared/Button.tsx` | `variant`, `size`, `loading`, `disabled`, `onClick`, `children` | `primary`, `secondary`, `danger`, `ghost` | `sm`, `md`, `lg`, `xl` |
| `Card` | `src/components/shared/Card.tsx` | `children`, `style` | None | None |
| `ProgressRing` | `src/components/shared/ProgressRing.tsx` | `progress`, `size`, `strokeWidth`, `color` | None | number (px) |
| `ProtectedRoute` | `src/components/shared/ProtectedRoute.tsx` | `allowedRoles` | None | None |
| `HomeMenu` | `src/components/navigation/HomeMenu.tsx` | None | None | None |

**Issues**:
- Only `Button` has variant/size props — no consistent component API
- No `forwardRef` on any component
- No `className` prop support (100% inline styles)
- No composition patterns (e.g., `Card.Header`, `Card.Body`)

## 3. Design System Components (3)

| Component | File | Purpose |
|-----------|------|---------|
| `ThemeProvider` | `src/design-system/use-theme.tsx` | Theme context + provider |
| `useTheme` | `src/design-system/use-theme.tsx` | Theme hook (context-based) |
| `ThemeId` type | `src/design-system/use-theme.tsx` | Type union for theme IDs |

**Issue**: Theme system is split across two files (`use-theme.tsx` and `useThemeColors.ts`) with overlapping concerns. `THEME_IDS` was duplicated (now removed in Phase-1A).

## 4. Inline Style Architecture

### Scale

| Metric | Value |
|--------|-------|
| Total `style={{` occurrences | ~830 |
| Files with inline styles | 46 |
| Average per file | ~18 |
| Most inline styles | `CoachScreen.tsx` (114) |
| Fewest inline styles | `ProgressRing.tsx` (2) |

### Duplicated Style Objects

| Pattern | Files | Occurrences |
|---------|-------|-------------|
| `STATUS_COLORS` map | 2 | `CampaignDetailView`, `CampaignsDashboard` |
| `btnPrimary` style | 4 | `CampaignsDashboard`, `CampaignWizard`, `PrintCenter`, `QRDesigner` |
| `btnSmall` style | 3 | `CampaignDetailView`, `CampaignsDashboard`, `PrintCenter` |
| `inputStyle` | 2 | `CampaignWizard`, `QRDesigner` |
| Card container (`#12121a` bg + `#1e1e2e` border + 12px radius) | 30+ | All research console dashboards |

**Issue**: ~30+ identical card container style objects exist across research console pages. Zero shared style utilities.

## 5. Performance Patterns

| Pattern | Count | Notes |
|---------|-------|-------|
| `useMemo` | 30 | Scattered across 15 files |
| `React.memo` | 0 | No component-level memoization |
| `React.lazy` | 0 | No code splitting |
| `forwardRef` | 0 | No ref forwarding |
| `useCallback` | ~5 | Rare |

**Issue**: All components are eagerly loaded. No lazy loading for infrequently used screens (research console, phone services, achievements).

## 6. Key Architectural Observations

1. **100% inline styles** — No CSS files, no CSS modules, no Tailwind, no styled-components
2. **No design system** — Components are ad-hoc, not composable
3. **No shared style utilities** — Each component reinvents spacing, colors, transitions
4. **Two theme systems** — `useThemeColors.ts` (canonical, 30+ tokens) vs `use-theme.tsx` (simpler, 3 tokens)
5. **No component library** — Only 5 shared components, all minimal
6. **No composition** — Components don't follow compound component patterns
7. **No responsive components** — All fixed 480px max-width
