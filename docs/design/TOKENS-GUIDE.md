# FOCUS Design Tokens — Developer Guide

> Phase-2A.6 | Generated 2026-07-28
>
> This document explains how to use the design token system in FOCUS components.

---

## Quick Start

```tsx
import { useTokens } from '../design-system/useTokens';

function MyComponent() {
  const { colors, semantic, radius, spacing, fontSize, fontWeight, duration, easing } = useTokens();

  return (
    <div style={{
      background: semantic.surfaceRaised,
      borderRadius: radius.lg,
      padding: spacing.xl,
      color: colors.text,
      fontSize: fontSize.body,
      transition: `background ${duration.fast} ${easing.standard}`,
    }}>
      Hello World
    </div>
  );
}
```

---

## Token Categories

### 1. Colors (`colors`)

Raw palette values per theme. Use when you need a specific color.

```tsx
const { colors } = useTokens();

// Backgrounds
colors.bg              // Page background (never #000000)
colors.bgSurface       // Card/panel background
colors.bgSurfaceHover  // Interactive hover state
colors.bgInput         // Input field background
colors.bgOverlay       // Modal/drawer overlay

// Text
colors.text            // Primary text (headings, values)
colors.textSecondary   // Supporting text (labels, descriptions)
colors.textMuted       // Tertiary text (timestamps, footnotes)

// Accent (brand identity — varies per theme)
colors.accent          // Primary action, active states
colors.accentLight     // Lighter accent variant
colors.accentMuted     // Accent background tint

// Borders
colors.border          // Default border color
colors.borderFocus     // Focus ring color

// Status
colors.success         // Positive outcomes
colors.successMuted    // Success background tint
colors.warning         // Caution
colors.warningMuted    // Warning background tint
colors.danger          // Errors, destructive actions
colors.dangerMuted     // Danger background tint
colors.info            // Informational
colors.infoMuted       // Info background tint

// Depth
colors.shadow          // Drop shadow color
colors.glass           // Glassmorphism background
colors.glassBorder     // Glassmorphism border
colors.overlay         // Backdrop overlay
```

### 2. Semantic Colors (`semantic`)

Role-based aliases. Use when you want intent, not specific values.

```tsx
const { semantic } = useTokens();

// Surface hierarchy
semantic.surfaceBase      // Page background
semantic.surfaceRaised    // Cards, panels
semantic.surfaceOverlay   // Modals, drawers

// Interactive states
semantic.interactiveDefault  // Default button/link color
semantic.interactiveHover    // Hover state
semantic.interactiveActive   // Pressed state
semantic.interactiveDisabled // Disabled state

// Focus
semantic.focusRing        // Focus outline color
semantic.focusRingOffset  // Focus outline offset color

// Status (semantic)
semantic.statusSuccess       // Success color
semantic.statusSuccessMuted  // Success background
semantic.statusWarning       // Warning color
semantic.statusWarningMuted  // Warning background
semantic.statusDanger        // Danger color
semantic.statusDangerMuted   // Danger background
semantic.statusInfo          // Info color
semantic.statusInfoMuted     // Info background
```

### 3. Border Radius (`radius`)

```tsx
const { radius } = useTokens();

radius.xs      // 4px  — badges, small indicators
radius.sm      // 8px  — inputs, small buttons
radius.md      // 12px — default card radius
radius.lg      // 16px — buttons, interactive cards
radius.xl      // 20px — large cards, modals, hero CTAs
radius.pill    // 9999px — pills, badges, tags
radius.circle  // 50%  — circular elements
```

### 4. Shadows (`shadows`)

```tsx
const { shadows } = useTokens();

shadows.none    // No shadow — default for most elements
shadows.sm      // Subtle — cards, inputs
shadows.md      // Medium — elevated cards, dropdowns
shadows.lg      // Strong — modals, overlays
shadows.focus   // Focus ring glow
```

### 5. Borders (`borders`)

```tsx
const { borders } = useTokens();

borders.none    // No border
borders.default // Subtle separation (1px)
borders.strong  // Emphasis, active states (1px)
borders.focus   // Interactive focus ring (2px)
borders.input   // Form field border (1px)
borders.card    // Container border (1px)
```

### 6. Spacing (`spacing`)

All values on a 4px grid.

```tsx
const { spacing } = useTokens();

spacing.xs    // 4px  — tight gaps, icon margins
spacing.sm    // 8px  — compact gaps, inline spacing
spacing.md    // 12px — card internal spacing
spacing.lg    // 16px — standard spacing
spacing.xl    // 20px — section spacing
spacing['2xl'] // 24px — section gaps
spacing['3xl'] // 32px — large section gaps
spacing['4xl'] // 40px — page-level spacing
spacing['5xl'] // 48px — hero spacing
```

### 7. Typography

```tsx
const { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing } = useTokens();

// Font family
fontFamily.sans        // 'IBM Plex Sans', system-ui, ...
fontFamily.sansArabic  // 'IBM Plex Sans Arabic', ...
fontFamily.mono        // 'IBM Plex Mono', ...

// Font sizes
fontSize.display   // 2rem (32px) — score rings, hero numbers
fontSize.h1        // 1.375rem (22px) — screen titles
fontSize.h2        // 1.125rem (18px) — section headings
fontSize.body      // 0.875rem (14px) — body text
fontSize.label     // 0.75rem (12px) — card labels
fontSize.caption   // 0.6875rem (11px) — timestamps
fontSize.overline  // 0.625rem (10px) — section headers
fontSize.stat      // 1.125rem (18px) — stat values

// Font weights
fontWeight.regular    // 400
fontWeight.medium     // 500
fontWeight.semibold   // 600
fontWeight.bold       // 700
fontWeight.extrabold  // 800

// Line heights
lineHeight.tight    // 1.2 — headlines
lineHeight.normal   // 1.5 — body text
lineHeight.relaxed  // 1.6 — long-form text

// Letter spacing
letterSpacing.tight   // -0.02em — headlines
letterSpacing.normal  // 0 — body text
letterSpacing.wide    // 0.05em — labels
letterSpacing.wider   // 0.1em — section headers
```

### 8. Motion

```tsx
const { duration, easing } = useTokens();

// Durations (max 300ms for non-game)
duration.instant  // 100ms — background changes, focus
duration.fast     // 150ms — hover, button press
duration.normal   // 200ms — transitions
duration.slow     // 300ms — page transitions, max non-game

// Easing curves
easing.standard  // cubic-bezier(0.4, 0, 0.2, 1) — default
easing.smooth    // cubic-bezier(0.22, 1, 0.36, 1) — reveals
easing.bounce    // cubic-bezier(0.34, 1.56, 0.64, 1) — celebrations
```

### 9. Blur

```tsx
const { blur } = useTokens();

blur.none  // 0px — no blur
blur.sm    // 8px — subtle depth
blur.md    // 12px — standard glass
blur.lg    // 20px — modals, overlays
```

### 10. Z-Index

```tsx
const { zIndex } = useTokens();

zIndex.base      // 0 — default layer
zIndex.raised    // 10 — elevated cards
zIndex.dropdown  // 100 — dropdowns, popovers
zIndex.sticky    // 200 — sticky headers
zIndex.overlay   // 300 — backdrop overlays
zIndex.modal     // 400 — modals, dialogs
zIndex.toast     // 500 — toast notifications
zIndex.tooltip   // 600 — tooltips
zIndex.game      // 700 — game UI elements
```

### 11. Layout

```tsx
const { layout } = useTokens();

layout.containerMax          // '480px' — consumer screen max-width
layout.containerPadding     // '20px' — consumer screen padding
layout.sidebarExpanded      // '240px' — research console sidebar
layout.sidebarCollapsed     // '60px' — collapsed sidebar
layout.sidebarDrawer        // '260px' — mobile drawer
layout.headerHeightMobile   // '56px'
layout.headerHeightDesktop  // '64px'
layout.touchTarget          // '44px' — minimum touch target
```

---

## Usage Patterns

### Pattern 1: Simple Card

```tsx
const { colors, radius, spacing, fontSize, fontWeight } = useTokens();

<div style={{
  background: colors.bgSurface,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.lg,
  padding: spacing.xl,
}}>
  <h3 style={{
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
    color: colors.text,
    margin: 0,
  }}>
    Title
  </h3>
</div>
```

### Pattern 2: Interactive Button

```tsx
const { semantic, radius, spacing, fontSize, fontWeight, duration, easing } = useTokens();

<button style={{
  background: semantic.interactiveDefault,
  color: '#ffffff',
  borderRadius: radius.lg,
  padding: `${spacing.sm} ${spacing.xl}`,
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold,
  border: 'none',
  cursor: 'pointer',
  transition: `all ${duration.fast} ${easing.standard}`,
}}>
  Click me
</button>
```

### Pattern 3: Status Badge

```tsx
const { colors, radius, spacing, fontSize, fontWeight } = useTokens();

<span style={{
  background: colors.successMuted,
  color: colors.success,
  borderRadius: radius.pill,
  padding: `${spacing.xs} ${spacing.sm}`,
  fontSize: fontSize.caption,
  fontWeight: fontWeight.semibold,
}}>
  Success
</span>
```

### Pattern 4: Focus Ring

```tsx
const { colors, radius } = useTokens();

<style>{`
  .focusable:focus-visible {
    outline: 2px solid ${colors.borderFocus};
    outline-offset: 2px;
  }
`}</style>
```

### Pattern 5: Transition

```tsx
const { duration, easing } = useTokens();

<div style={{
  transition: `transform ${duration.fast} ${easing.standard}`,
}}>
  Hover me
</div>
```

---

## Migration Guide: Replacing Hardcoded Values

### Before (hardcoded)

```tsx
<div style={{
  background: '#12121a',
  border: '1px solid #1e1e2e',
  borderRadius: '12px',
  padding: '1rem',
  color: '#f0f0f0',
  fontSize: '0.85rem',
}}>
```

### After (tokens)

```tsx
const { colors, radius, spacing, fontSize } = useTokens();

<div style={{
  background: colors.bgSurface,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  padding: spacing.xl,
  color: colors.text,
  fontSize: fontSize.body,
}}>
```

### Quick Reference: What Replaces What

| Hardcoded Value | Token |
|----------------|-------|
| `#0a0a12` | `colors.bg` |
| `#12121a` | `colors.bgSurface` |
| `#1e1e2e` | `colors.border` |
| `#f0f0f0` | `colors.text` |
| `#a8a8c0` | `colors.textSecondary` |
| `#00e4b8` | `colors.accent` |
| `12px` (radius) | `radius.md` |
| `16px` (radius) | `radius.lg` |
| `20px` (radius) | `radius.xl` |
| `0.5rem` (8px) | `spacing.sm` |
| `0.75rem` (12px) | `spacing.md` |
| `1rem` (16px) | `spacing.lg` |
| `1.25rem` (20px) | `spacing.xl` |
| `0.85rem` | `fontSize.body` |
| `0.75rem` | `fontSize.label` |
| `0.65rem` | `fontSize.overline` |
| `1.2rem` (bold) | `fontSize.stat` |
| `font-weight: 800` | `fontWeight: fontWeight.extrabold` |
| `transition: all 0.2s` | `transition: \`all ${duration.normal} ${easing.standard}\`` |

---

## Naming Convention

### Token Names

- **Colors**: `colors.{category}` — e.g., `colors.accent`, `colors.bgSurface`
- **Semantic**: `semantic.{role}` — e.g., `semantic.surfaceRaised`, `semantic.statusSuccess`
- **Static**: `{category}.{size}` — e.g., `radius.lg`, `spacing.xl`, `fontSize.body`

### CSS Custom Properties (Future)

If we move to CSS custom properties later, the naming will follow:

```
--color-bg
--color-bg-surface
--color-accent
--radius-lg
--spacing-xl
--font-size-body
--duration-fast
--easing-standard
```

---

## Rules for Developers

1. **Never hardcode colors.** Always use `colors.*` or `semantic.*`.
2. **Never hardcode spacing.** Always use `spacing.*`.
3. **Never hardcode radius.** Always use `radius.*`.
4. **Never use font sizes outside the scale.** Use `fontSize.*`.
5. **Never exceed 300ms animation** (except game).
6. **Never use `#000000` or `#050505`** as background.
7. **Always use CSS Logical Properties** for RTL support.
8. **Always include `data-testid`** on interactive components.
9. **Always handle loading, empty, and error states** on data-fetching screens.
10. **Run `pnpm lint && pnpm test && pnpm build`** before every PR.
