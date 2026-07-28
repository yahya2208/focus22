# FOCUS Layout Primitives — Developer Guide

Phase-2B.1 — Layout Foundation

## Quick Start

```tsx
import { Screen, Stack, HStack, Grid, Spacer, Divider, Section, Container } from '../design-system/layout';
```

## Components

### `<Screen>`

Root wrapper for every consumer screen. Replaces the ad-hoc `<nav>` pattern.

```tsx
<Screen>
  <ScreenHeader title="Home" />
  {/* scrollable content */}
</Screen>

<Screen scroll={false}>
  {/* fixed layout (game, overlay) */}
</Screen>

<Screen bottomPad="80px">
  {/* content behind a fixed bottom nav bar */}
</Screen>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `scroll` | `boolean` | `true` | Enable vertical scrolling |
| `maxWidth` | `string` | `480px` | Content max-width |
| `padding` | `string` | `20px` | Horizontal padding |
| `bottomPad` | `string` | — | Extra bottom padding for fixed elements |
| `background` | `string` | `colors.bg` | Override background color |

**What it provides:**
- `<main>` semantics (accessibility)
- `min-height: 100dvh` (full viewport)
- `env(safe-area-inset-*)` padding (notch, home indicator)
- Centered `max-width: 480px` container
- `overflow-y: auto` with `-webkit-overflow-scrolling: touch`

---

### `<Container>`

Centered content wrapper with max-width. Use inside Screen for narrower content.

```tsx
<Container maxWidth="320px" padding="12px">
  <p>Narrow content</p>
</Container>
```

---

### `<Stack>` / `<VStack>`

Vertical flex layout with gap.

```tsx
<Stack gap="lg">
  <Card>Item 1</Card>
  <Card>Item 2</Card>
</Stack>

<Stack gap="md" align="center">
  <Button>Save</Button>
</Stack>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `gap` | `SpacingToken` | `md` (12px) | Gap between items |
| `align` | `AlignType` | `stretch` | Horizontal alignment |
| `justify` | `JustifyType` | `flex-start` | Vertical justification |
| `wrap` | `boolean` | `false` | Enable flex wrap |

---

### `<HStack>`

Horizontal flex layout with gap.

```tsx
<HStack gap="sm" align="center">
  <Icon />
  <Text>Name</Text>
  <Spacer />
  <Chevron />
</HStack>
```

Same props as Stack, but `direction: row` and `align` defaults to `center`.

---

### `<Grid>`

CSS Grid with configurable columns.

```tsx
<Grid columns={2} gap="md">
  <Card>Stat 1</Card>
  <Card>Stat 2</Card>
</Grid>

<Grid minColumnWidth="140px" gap="sm">
  <Badge>A</Badge>
  <Badge>B</Badge>
  <Badge>C</Badge>
</Grid>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `number` | `2` | Fixed number of columns |
| `gap` | `SpacingToken` | `md` (12px) | Column gap |
| `rowGap` | `SpacingToken` | same as gap | Row gap override |
| `minColumnWidth` | `string` | — | Auto-fill with min column width |

---

### `<Spacer>`

Pushes adjacent elements apart in a flex container.

```tsx
<HStack>
  <Text>Left</Text>
  <Spacer />
  <Text>Right</Text>
</HStack>

<Spacer size="lg" /> {/* fixed vertical space */}
```

---

### `<Divider>`

Visual separation line.

```tsx
<Divider />
<Divider inset="lg" />
<Divider vertical height="24px" />
```

---

### `<Section>`

Content grouping with optional title.

```tsx
<Section title="Performance">
  <Card>...</Card>
</Section>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | — | Section heading (uppercase, muted) |
| `gap` | `SpacingToken` | `sm` | Gap between title and content |
| `marginTop` | `SpacingToken` | `xl` | Top margin |

---

## Migration Guide

### Before (hardcoded)

```tsx
<nav style={{
  padding: '1.5rem 1.25rem',
  maxWidth: '480px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
}}>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
    <div style={{ padding: '1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.04)' }}>
      ...
    </div>
  </div>
</nav>
```

### After (layout primitives)

```tsx
<Screen>
  <Stack gap="lg">
    <Grid columns={2} gap="md">
      <Card>...</Card>
    </Grid>
  </Stack>
</Screen>
```

### What changed

| Before | After |
|--------|-------|
| `<nav>` | `<Screen>` (provides `<main>` semantics, safe area, scrolling) |
| `padding: '1.5rem 1.25rem'` | Screen's `padding` prop (default: 20px) |
| `maxWidth: '480px'` | Screen's `maxWidth` prop (default: 480px) |
| `display: flex; flexDirection: column; gap: X` | `<Stack gap="X">` |
| `display: grid; gridTemplateColumns: '1fr 1fr'` | `<Grid columns={2}>` |
| `<div style={{ height: '1rem' }} />` | `<Spacer size="sm" />` |
| `<div style={{ borderBottom: '1px solid ...' }}>` | `<Divider />` |
| Hardcoded `6rem` bottom padding | `<Screen bottomPad="6rem">` |

---

## Rules for Developers

1. **Every screen must use `<Screen>`** — no exceptions
2. **Never use `<nav>`** for non-navigation content — use `<main>` (Screen provides this)
3. **Use `<Stack>` instead of manual flex column** — eliminates 3-line pattern
4. **Use `<Grid>` instead of manual gridTemplateColumns** — eliminates string interpolation
5. **Use `<Divider />` instead of border-bottom divs** — consistent line weight and color
6. **Use `<Spacer />` instead of empty divs** — semantic, accessible
7. **Use `<Section title="...">` instead of manual heading + margin** — consistent typography
8. **All spacing must use tokens** — no hardcoded `px`, `rem`, or `em` values
