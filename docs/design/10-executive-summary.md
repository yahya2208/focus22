# 10 — Executive Summary & Top 20 Issues

> Generated 2026-07-28 | Phase-1B Audit | FOCUS v3

---

## Audit Scope

| Metric | Value |
|--------|-------|
| Files audited | 56 .tsx files |
| CSS files | 0 (100% inline styles) |
| Theme palettes | 7 (midnight, ocean, emerald, carbon, purple, sunrise, light) |
| Shared components | 5 (Button, Card, ProgressRing, ProtectedRoute, HomeMenu) |
| Screen components | 22 |
| Research console components | 12+ |
| Total inline style objects | ~830 |
| Total hardcoded colors | 390 |
| Total hardcoded radius values | 138+ |
| Total transition values | 27 |
| Total z-index values | 9 |

---

## Top 20 Issues (Ranked by Impact)

### Critical (Must Fix in Phase-2)

| # | Issue | Impact | Files Affected |
|---|-------|--------|----------------|
| 1 | **No design system** — 5 shared components, no composition, no variants | All screens | 56 |
| 2 | **390 hardcoded colors** — research console is a parallel color universe | Theme switching broken | 30+ |
| 3 | **No keyboard navigation** — 0 onKeyDown handlers, 2 tabIndex | Accessibility F | 56 |
| 4 | **No focus indicators** — 0 focus styles | Accessibility F | 56 |
| 5 | **`reducedMotion` unused** — toggle exists, nothing consumes it | Animations run unconditionally | All animated |

### High (Should Fix in Phase-2)

| # | Issue | Impact | Files Affected |
|---|-------|--------|----------------|
| 6 | **37 font sizes** — not on any scale, arbitrary micro-adjustments | Inconsistent typography | 40+ |
| 7 | **29 spacing values** — only 29% on 8px grid | Inconsistent spacing | 40+ |
| 8 | **`<nav>` misused as page wrapper** in 15 screens | Screen reader confusion | 15 |
| 9 | **`textMuted` fails WCAG AA** — 3.5:1 contrast ratio | Readability | All dark themes |
| 10 | **No responsive design** — 0 media queries, fixed 480px | Desktop experience | 22 screens |

### Medium (Should Fix in Phase-2)

| # | Issue | Impact | Files Affected |
|---|-------|--------|----------------|
| 11 | **30+ duplicate card containers** — identical inline styles | Maintenance burden | 30+ |
| 12 | **No icon library** — 15 inline SVGs, 10 emoji, no consistency | Visual inconsistency | 15 |
| 13 | **Two theme systems** — `useThemeColors.ts` vs `use-theme.tsx` | Confusion | 2 |
| 14 | **No form accessibility** — 20/29 labels lack htmlFor | Screen reader issues | 4 screens |
| 15 | **No code splitting** — all components eagerly loaded | Bundle size | All |

### Low (Phase-3+)

| # | Issue | Impact | Files Affected |
|---|-------|--------|----------------|
| 16 | **12 border-radius values** — should be 8 tokens | Slight inconsistency | 40+ |
| 17 | **15 transition values** — should be 4 tokens | Slight inconsistency | 27 |
| 18 | **No `forwardRef`** on any component | Ref forwarding blocked | 5 |
| 19 | **No `React.memo`** | Unnecessary re-renders | 56 |
| 20 | **`role="application"` on GameScreen** | Screen reader override | 1 |

---

## Design Token Summary

### Colors

| Category | Current State | Recommendation |
|----------|--------------|----------------|
| Theme colors | 7 palettes × 25 tokens | ✅ Good — keep as-is |
| Research console | 30+ hardcoded colors | ❌ Migrate to theme tokens |
| Semantic colors | Hardcoded across themes | ⚠️ Unify (danger/success/warning identical in 6 themes) |

### Typography

| Category | Current State | Recommendation |
|----------|--------------|----------------|
| Font sizes | 37 unique | ❌ Reduce to 10-12 on modular scale |
| Font weights | 7 values | ⚠️ Reduce to 4 (400, 500, 600, 800) |
| Line heights | 8 values | ⚠️ Reduce to 4 (1, 1.2, 1.5, 1.6) |
| Letter spacing | 9 values | ⚠️ Reduce to 4 (-0.02em, 0, 0.05em, 0.1em) |
| Font family | system-ui (no custom) | ⚠️ Consider Inter or SF Pro for FOCUS identity |

### Spacing

| Category | Current State | Recommendation |
|----------|--------------|----------------|
| Unique values | 29 | ❌ Reduce to 12 on 4px grid |
| On 4px grid | 50% | ❌ Target 100% |
| Most common | 0.5rem (8px), 0.75rem (12px), 1rem (16px) | ✅ Keep as core scale |

### Border Radius

| Category | Current State | Recommendation |
|----------|--------------|----------------|
| Unique values | 12 | ❌ Reduce to 8 tokens |
| Dominant | 12px, 8px | ✅ Keep as lg, md |

### Transitions

| Category | Current State | Recommendation |
|----------|--------------|----------------|
| Unique values | 15 | ❌ Reduce to 4 tokens |
| Easing curves | 3 | ✅ Keep as standard, smooth, bounce |

---

## Phase-2 Implementation Plan

### Phase-2A: Design Token System (3-5 files)
1. Create `src/design-system/tokens.ts` — all tokens defined
2. Update `useThemeColors.ts` — consume token system
3. Create `src/design-system/ThemeProvider.tsx` — unified provider
4. Migrate `use-theme.tsx` consumers to new provider
5. Wire up `reducedMotion` and `highContrast` settings

### Phase-2B: Component Library (5-8 files)
1. Create shared components: Input, Select, Modal, Badge, Tabs, Tooltip
2. Add variant/size props to existing: Button, Card, ProgressRing
3. Add `forwardRef` to all shared components
4. Create `Container` component (480px max-width)
5. Create `ScreenHeader` component

### Phase-2C: Token Migration (10-15 files)
1. Replace 30+ research console card containers with `Card` + tokens
2. Replace 4+ inline button styles with `Button` component
3. Replace 2+ inline input styles with `Input` component
4. Migrate 390 hardcoded colors to theme tokens
5. Migrate 12 border-radius values to radius tokens
6. Migrate 15 transition values to transition tokens

### Phase-2D: Accessibility (5-10 files)
1. Add `onKeyDown` to `role="button"` div
2. Add `:focus-visible` styles
3. Replace `<nav>` with `<main>` in 15 screens
4. Add `htmlFor`/`id` to CampaignWizard forms
5. Add `aria-hidden="true"` to decorative SVGs/emoji
6. Fix `textMuted` contrast ratio

### Estimated Effort

| Phase | Files Changed | New Files | Effort |
|-------|---------------|-----------|--------|
| 2A: Tokens | 3-5 | 2 | Small |
| 2B: Components | 5-8 | 6-8 | Medium |
| 2C: Migration | 10-15 | 0 | Large |
| 2D: Accessibility | 5-10 | 0 | Medium |
| **Total** | **23-38** | **8-10** | **2-3 weeks** |

---

## What's Working Well

1. **Theme system foundation** — 7 palettes with consistent token structure
2. **Consistent container width** — 480px across all consumer screens
3. **Tabular nums** — Used consistently for all numeric displays
4. **ARIA labels** — 45 instances covering most interactive elements
5. **Image alt text** — 100% coverage (6/6 images)
6. **Progress ring accessibility** — Proper aria-valuenow/min/max
7. **Countdown accessibility** — role="timer" + aria-live="assertive"
8. **Chart accessibility** — role="img" + aria-label on all 4 chart types
