# Design Tokens Reference

All design tokens live in `src/design-system/` and are accessible via `import { ... } from '../../design-system'`.

---

## Colors (`colors.ts`)

### Raw Palette (`ColorTokens`)

| Token | Purpose | When to Use | When NOT to Use |
|-------|---------|-------------|-----------------|
| `bg` | Page background | Root `<Screen>`, `<Page>` background | Inside cards, surfaces (use `bgSurface` instead) |
| `bgSurface` | Card/surface background | `Card`, `Section`, raised containers | Page background |
| `bgSurfaceHover` | Surface hover state | Button hover, card hover, interactive rows | Static backgrounds |
| `bgInput` | Input field background | `Input`, `Textarea`, `SearchBox` fields | Non-interactive surfaces |
| `bgOverlay` | Backdrop overlay | Modal/Drawer/BottomSheet backdrop | Interactive elements |
| `text` | Primary text color | Body text, headings, labels | Secondary text, muted text |
| `textSecondary` | Secondary text | Subheadings, descriptions, metadata | Primary content |
| `textMuted` | Muted text | Placeholders, disabled text, timestamps | Readable body copy |
| `accent` | Brand accent | Primary actions, active tabs, highlights | Destructive actions, success states |
| `accentLight` | Accent highlight | Hover states, accent backgrounds | Primary accent text |
| `accentMuted` | Accent background | Accent-tinted surface backgrounds, badges | Text or interactive elements |
| `border` | Subtle border | Card borders, dividers, input borders | Focus rings, strong emphasis borders |
| `borderFocus` | Focus ring | `:focus-visible` rings on inputs, buttons | Default borders |
| `success` | Success color | Success badges, positive metrics | Warnings, errors, info |
| `successMuted` | Success background | Success toast bg, success badge bg | Text |
| `warning` | Warning color | Warning badges, caution metrics | Success, error, info |
| `warningMuted` | Warning background | Warning toast bg, warning badge bg | Text |
| `danger` | Danger color | Error badges, destructive buttons, alerts | Success states |
| `dangerMuted` | Danger background | Error toast bg, error badge bg | Text |
| `info` | Info color | Info badges, neutral notifications | Warnings, errors |
| `infoMuted` | Info background | Info toast bg, info badge bg | Text |
| `shadow` | Drop shadow | `box-shadow` on cards, modals, dropdowns | Text shadows |
| `glass` | Glass background | Glassmorphism surfaces | Solid surfaces |
| `glassBorder` | Glass border | Glassmorphism borders | Solid borders |
| `overlay` | Scrim overlay | Modal/Drawer/BottomSheet backdrop | Interactive elements |

### Role-Based Colors (`ColorRoles`)

Use these instead of raw palette colors for semantic clarity.

| Group | Token | Maps From | When to Use |
|-------|-------|-----------|-------------|
| `text` | `.primary` | `text` | All readable body copy, headings |
| `text` | `.secondary` | `textSecondary` | Metadata, descriptions, subtitles |
| `text` | `.inverse` | `bg` | Text on dark/colored backgrounds |
| `text` | `.muted` | `textMuted` | Placeholders, disabled, timestamps |
| `surface` | `.default` | `bgSurface` | Card and container backgrounds |
| `surface` | `.hover` | `bgSurfaceHover` | Interactive surface hover state |
| `surface` | `.active` | `bgSurfaceHover` | Interactive surface active/pressed |
| `surface` | `.disabled` | `textMuted` | Disabled surface indicator |
| `action` | `.primary` | `accent` | Primary CTA buttons, active links |
| `action` | `.secondary` | `accentLight` | Secondary actions, hover states |
| `action` | `.danger` | `danger` | Destructive actions, delete buttons |
| `status` | `.success` | `success` | Positive metrics, success indicators |
| `status` | `.warning` | `warning` | Caution states, pending indicators |
| `status` | `.error` | `danger` | Error states, failure indicators |
| `status` | `.info` | `info` | Neutral info indicators, help text |
| `border` | `.default` | `border` | All standard borders, dividers |
| `border` | `.subtle` | `borderFocus` | Lighter borders, focus-adjacent dividers |
| `focus` | `.default` | `borderFocus` | Focus rings on interactive elements |
| `overlay` | `.default` | `overlay` | Modal/drawer scrim backdrops |

### Access Pattern

```tsx
// ❌ Avoid: raw palette in components
<div style={{ color: colors.text, background: colors.bgSurface }}>

// ✅ Prefer: role-based colors
<div style={{ color: roles.text.primary, background: roles.surface.default }}>
```

---

## Spacing (`spacing.ts`)

### Numeric Scale

```ts
spacingNumeric['0']  → '0px'
spacingNumeric['4']  → '4px'
spacingNumeric['8']  → '8px'
spacingNumeric['16'] → '16px'
// ... up to '96px'
```

### Semantic Aliases

| Token | Value | When to Use |
|-------|-------|-------------|
| `xs` | `4px` | Icon gaps, tight inline spacing |
| `sm` | `8px` | Compact gaps, small button padding |
| `md` | `12px` | Card internal spacing, input padding |
| `lg` | `16px` | Standard card padding, section gaps |
| `xl` | `20px` | Large card padding, section spacing |
| `2xl` | `24px` | Section gaps, modal padding |
| `3xl` | `32px` | Large section gaps, page sections |
| `4xl` | `40px` | Page-level spacing |
| `5xl` | `48px` | Hero spacing, page top padding |

### Usage Rules

- Always use spacing tokens — never hardcode `padding: 13`.
- Use semantic aliases (`spacing.lg`) in components.
- Use numeric scale (`spacingNumeric['20']`) for precise alignment.

```tsx
// ✅ Correct
<div style={{ padding: spacing.lg, gap: spacing.sm }}>

// ❌ Wrong
<div style={{ padding: 16, gap: 8 }}>
```

---

## Radius (`radius.ts`)

| Token | Value | When to Use |
|-------|-------|-------------|
| `none` | `0px` | Sharp corners, tables, lists |
| `xs` | `4px` | Badges, small indicators, checkboxes |
| `sm` | `8px` | Inputs, small buttons, chips |
| `md` | `12px` | Default card radius, dialogs |
| `lg` | `16px` | Primary buttons, interactive cards |
| `xl` | `20px` | Large cards, modals, hero CTAs |
| `2xl` | `24px` | Extra-large containers, sheets |
| `pill` | `9999px` | Pills, tags, small badges |
| `circle` | `50%` | Avatars, icon rings, profile photos |

---

## Shadows & Elevation (`shadows.ts`)

### Raw Shadows

| Token | When to Use |
|-------|-------------|
| `none` | Default — most non-elevated elements |
| `xs` | Subtle depth — flat cards in grid |
| `sm` | Cards, inputs with slight elevation |
| `md` | Raised cards, dropdowns, popovers |
| `lg` | Modals, dialogs, sidebars |
| `xl` | Floating elements, FABs |
| `glass` | Glassmorphism surfaces |
| `floating` | Floating action buttons, tooltips |
| `modal` | Highest modal layer, full-screen dialogs |
| `focus` | Focus ring glow on interactive elements |

### Semantic Elevation

| Token | Maps To | When to Use |
|-------|---------|-------------|
| `elevation.card` | `sm` | Standard card surfaces |
| `elevation.dropdown` | `md` | Dropdowns, popovers, menus |
| `elevation.dialog` | `lg` | Dialogs, modals, side panels |
| `elevation.floating` | `xl` | FABs, floating toolbars |
| `elevation.tooltip` | `md` | Tooltips, small popups |

```tsx
// ✅ Semantic elevation
<div style={{ boxShadow: elevation.card }}>

// ❌ Raw shadow (less semantic)
<div style={{ boxShadow: shadows.sm }}>
```

---

## Typography (`typography.ts`)

### Variants

| Variant | fontSize | fontWeight | lineHeight | letterSpacing | When to Use |
|---------|----------|------------|------------|---------------|-------------|
| `display` | 2rem | 700 | 1.2 | -0.02em | Hero numbers, score rings |
| `h1` | 1.375rem | 700 | 1.2 | -0.02em | Screen titles |
| `h2` | 1.125rem | 600 | 1.2 | 0 | Section headings |
| `h3` | 1rem | 600 | 1.2 | 0 | Card titles, subsection headings |
| `title` | 0.9375rem | 500 | 1.5 | 0 | Item titles, card headers |
| `subtitle` | 0.8125rem | 400 | 1.5 | 0 | Subtitles, descriptions |
| `body` | 0.875rem | 400 | 1.5 | 0 | Default body text |
| `bodySmall` | 0.8125rem | 400 | 1.5 | 0 | Compact body, secondary info |
| `label` | 0.75rem | 500 | 1.5 | 0.05em | Input labels, form field labels |
| `caption` | 0.6875rem | 400 | 1.5 | 0 | Timestamps, footnotes, fine print |
| `button` | 0.8125rem | 600 | 1.5 | 0.05em | Button text, interactive labels |
| `overline` | 0.625rem | 500 | 1.5 | 0.1em | Section headers, uppercase labels |
| `stat` | 1.125rem | 700 | 1.2 | 0 | Stat values, numbers in cards |
| `mono` | 0.8125rem | 400 | 1.5 | 0 | Code, QR output, technical data |

```tsx
// ✅ Use composite variant
<span style={{ ...typography.body }}>

// ❌ Don't compose manually
<span style={{ fontSize: fontSize.body, fontWeight: fontWeight.regular }}>
```

---

## Borders (`shadows.ts`)

| Token | Width | Style | When to Use |
|-------|-------|-------|-------------|
| `none` | — | — | No border |
| `default` | 1px | solid | Subtle card/container separation |
| `strong` | 1px | solid | Emphasis borders, active states |
| `focus` | 2px | solid | Focus rings on inputs, buttons |
| `input` | 1px | solid | Form field borders |
| `card` | 1px | solid | Default card container border |

---

## Motion (`motion.ts`)

| Token | Duration | Easing | When to Use |
|-------|----------|--------|-------------|
| `fast` | 150ms | standard | Button press, hover, focus transitions |
| `normal` | 200ms | standard | Default transitions, toggle switches |
| `slow` | 300ms | smooth | Page transitions, card reveals, modals |
| `bounce` | 300ms | bounce | Celebrations, achievements (rare) |
| `easeIn` | 200ms | ease-in | Elements entering the screen |
| `easeOut` | 200ms | ease-out | Elements leaving the screen |

---

## Breakpoints (`breakpoints.ts`)

| Breakpoint | Min Width | Target |
|------------|-----------|--------|
| `mobile` | 0px | Phones |
| `tablet` | 768px | Tablets, large phones in landscape |
| `laptop` | 1024px | Laptops, small desktops |
| `desktop` | 1280px | Standard desktops |
| `wide` | 1440px | Large screens, ultrawide |

### Responsive Hooks

```tsx
import { useIsMobile, useIsTablet, useIsDesktop, useUp, useDown, useBetween } from '../../design-system/responsive';

function MyComponent() {
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const isTabletOrLarger = useUp('tablet');
  const isOnlyMobile = useDown('mobile');
  const isTabletOnly = useBetween('tablet', 'laptop');
}
```

---

## Z-Index (`z-index.ts`)

| Token | Value | When to Use |
|-------|-------|-------------|
| `base` | 0 | Default layer |
| `raised` | 10 | Elevated cards, sticky section headers |
| `dropdown` | 100 | Dropdowns, popovers, autocomplete |
| `sticky` | 200 | Sticky headers, sticky columns |
| `overlay` | 300 | Backdrop overlays, drawer scrims |
| `modal` | 400 | Modals, dialogs, bottom sheets |
| `toast` | 500 | Toast notifications, snackbars |
| `tooltip` | 600 | Tooltips, small popups |
| `game` | 700 | Game UI elements (if applicable) |

---

## Opacity (`opacity.ts`)

| Token | Value | When to Use |
|-------|-------|-------------|
| `disabled` | `0.4` | Disabled buttons, inputs, controls |
| `hover` | `0.08` | Hover state overlay on interactive elements |
| `pressed` | `0.12` | Active/pressed state overlay |
| `overlay` | `0.6` | Modal/drawer scrim backdrop |
| `glass` | `0.04` | Glassmorphism subtle surface tint |

---

## Quick Reference

```tsx
// Colors
const { colors } = useTokens();
const roles = buildColorRoles(colors);

// Spacing
<div style={{ padding: spacing.lg, gap: spacing.sm }}>

// Radius
<div style={{ borderRadius: radius.lg }}>

// Typography
<span style={{ ...typography.body }}>

// Shadow (prefer semantic)
<div style={{ boxShadow: elevation.card }}>

// Border
<div style={{ border: borders.default }}>

// Motion
<div style={{ transition: motion.fast }}>

// Z-Index
<div style={{ zIndex: zIndex.modal }}>

// Opacity
<button style={{ opacity: opacity.disabled }} disabled>

// Responsive
const isMobile = useIsMobile();
```

---

## Migration Guide

### Step 1: Replace hardcoded values with tokens
```diff
- padding: 16
+ padding: spacing.lg
```

### Step 2: Replace inline styles with semantic roles
```diff
- style={{ color: '#fff', background: colors.bgSurface }}
+ style={{ color: roles.text.primary, background: roles.surface.default }}
```

### Step 3: Use composite typography variants
```diff
- style={{ fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5 }}
+ style={{ ...typography.body }}
```

### Step 4: Use semantic elevation
```diff
- style={{ boxShadow: shadows.sm }}
+ style={{ boxShadow: elevation.card }}
```
